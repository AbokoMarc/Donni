import {AuthExpiredError, NetworkError} from '../api/errors';
import {backoffDelay} from './engine/backoff';
import {buildBatch, emptyBatch} from './engine/batch';
import {keysToInspect, planApply} from './engine/apply';
import type {ConflictChoice} from './engine/conflicts';
import {deriveSyncStatus, statusLabel} from './engine/status';
import type {SessionState, SyncStatus} from './engine/status';
import {MAX_BATCH} from './engine/types';
import type {SyncRequest, SyncResponse} from './engine/types';
import type {SyncStorage} from './SyncStorage';

export interface SyncApi {
  sync(request: SyncRequest): Promise<SyncResponse>;
}

export interface SyncSnapshot {
  status: SyncStatus;
  label: string;
  conflicts: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface SyncDeps {
  storage: SyncStorage;
  api: SyncApi;
  debounceMs?: number;
  backoff?: (attempt: number) => number;
  onSessionExpired?: () => void;
}

const MAX_CYCLES = 100;
export const WRITE_DEBOUNCE_MS = 5_000;

export class SyncService {
  private readonly deps: SyncDeps;
  private session: SessionState = 'none';
  private online = true;
  private unreachable = false;
  private syncing = false;
  private failed = false;
  private rerun = false;
  private attempts = 0;
  private conflicts = 0;
  private lastSyncedAt: string | null = null;
  private lastError: string | null = null;
  private debounceTimer: unknown = null;
  private retryTimer: unknown = null;
  private listeners = new Set<() => void>();
  private snapshot: SyncSnapshot;

  constructor(deps: SyncDeps) {
    this.deps = deps;
    this.snapshot = this.compute();
  }

  getSnapshot = (): SyncSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  async start(): Promise<void> {
    const state = await this.deps.storage.readState();
    this.lastSyncedAt = state.lastSyncedAt;
    this.conflicts = await this.deps.storage.countConflicts();
    this.emit();
  }

  setSession(session: SessionState): void {
    if (this.session === session) {
      return;
    }
    this.session = session;
    if (session !== 'active') {
      this.clearTimers();
    }
    this.emit();
    if (session === 'active') {
      void this.syncNow();
    } else if (session === 'none') {
      void this.deps.storage.purgeLocalTombstones();
    }
  }

  setOnline(online: boolean): void {
    const wasOffline = !this.online;
    this.online = online;
    if (online) {
      this.unreachable = false;
    }
    this.emit();
    if (online && wasOffline) {
      void this.syncNow();
    }
  }

  notifyLocalWrite(): void {
    if (this.session !== 'active') {
      return;
    }
    this.clearTimer('debounceTimer');
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.syncNow();
    }, this.deps.debounceMs ?? WRITE_DEBOUNCE_MS);
  }

  async syncNow(): Promise<boolean> {
    if (this.session !== 'active' || !this.online) {
      return false;
    }
    if (this.syncing) {
      this.rerun = true;
      return false;
    }
    this.clearTimer('retryTimer');
    this.syncing = true;
    this.emit();
    let ok = false;
    try {
      do {
        this.rerun = false;
        await this.runCycles();
      } while (this.rerun);
      this.failed = false;
      this.unreachable = false;
      this.attempts = 0;
      this.lastError = null;
      ok = true;
    } catch (error) {
      this.handleFailure(error);
    } finally {
      this.syncing = false;
      this.conflicts = await this.deps.storage.countConflicts();
      this.emit();
    }
    return ok;
  }

  async resolveConflict(conflictId: number, choice: ConflictChoice): Promise<void> {
    await this.deps.storage.resolve(conflictId, choice);
    this.conflicts = await this.deps.storage.countConflicts();
    this.emit();
    this.notifyLocalWrite();
  }

  dispose(): void {
    this.clearTimers();
    this.listeners.clear();
  }

  private async runCycles(): Promise<void> {
    const {storage, api} = this.deps;
    const state = await storage.readState();
    let cursor = state.cursor;
    let pullOnly = false;
    for (let i = 0; i < MAX_CYCLES; i++) {
      const dirty = pullOnly ? [] : await storage.readDirty(MAX_BATCH);
      const batch =
        dirty.length > 0
          ? buildBatch(dirty, cursor, state.deviceId)
          : emptyBatch(cursor, state.deviceId);
      const response = await api.sync(batch.request);
      const snapshots = await storage.snapshots(keysToInspect(response, batch.sent));
      await storage.applyPlan(planApply(response, batch.sent, snapshots), response.cursor);
      cursor = response.cursor;
      this.lastSyncedAt = new Date().toISOString();
      if (response.hasMore) {
        pullOnly = true;
        continue;
      }
      pullOnly = false;
      if (dirty.length < MAX_BATCH) {
        return;
      }
    }
  }

  private handleFailure(error: unknown): void {
    if (error instanceof AuthExpiredError) {
      this.session = 'expired';
      this.clearTimers();
      this.deps.onSessionExpired?.();
      return;
    }
    this.failed = true;
    this.lastError = error instanceof Error ? error.message : 'Erreur inconnue';
    if (error instanceof NetworkError) {
      this.unreachable = true;
    }
    this.attempts += 1;
    const delay = (this.deps.backoff ?? backoffDelay)(this.attempts);
    this.clearTimer('retryTimer');
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.syncNow();
    }, delay);
  }

  private clearTimer(which: 'debounceTimer' | 'retryTimer'): void {
    if (this[which] !== null) {
      clearTimeout(this[which]);
      this[which] = null;
    }
  }

  private clearTimers(): void {
    this.clearTimer('debounceTimer');
    this.clearTimer('retryTimer');
  }

  private compute(): SyncSnapshot {
    const status = deriveSyncStatus({
      session: this.session,
      online: this.online && !this.unreachable,
      syncing: this.syncing,
      conflicts: this.conflicts,
      failed: this.failed,
    });
    return {
      status,
      label: statusLabel(status, this.conflicts),
      conflicts: this.conflicts,
      lastSyncedAt: this.lastSyncedAt,
      lastError: this.lastError,
    };
  }

  private emit(): void {
    const next = this.compute();
    const prev = this.snapshot;
    if (
      next.status === prev.status &&
      next.conflicts === prev.conflicts &&
      next.lastSyncedAt === prev.lastSyncedAt &&
      next.lastError === prev.lastError
    ) {
      return;
    }
    this.snapshot = next;
    for (const l of Array.from(this.listeners)) {
      l();
    }
  }
}
