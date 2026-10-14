import {isDeepStrictEqual} from 'node:util';
import {isEntityName} from '../../src/db/entities';
import type {
  ServerChange,
  SyncRequest,
  SyncResponse,
} from '../../src/sync/engine/types';

interface Stored {
  entity: string;
  id: string;
  version: number;
  deleted: boolean;
  data: Record<string, unknown>;
}

export class FakeServer {
  seq = 0;
  rows = new Map<string, Stored>();
  requests: SyncRequest[] = [];
  failWith: Error | null = null;
  onRequest: (() => Promise<void>) | null = null;

  put(entity: string, id: string, data: Record<string, unknown>, deleted = false): Stored {
    const row = {entity, id, version: ++this.seq, deleted, data};
    this.rows.set(`${entity}:${id}`, row);
    return row;
  }

  async sync(request: SyncRequest): Promise<SyncResponse> {
    this.requests.push(JSON.parse(JSON.stringify(request)));
    if (this.failWith) {
      throw this.failWith;
    }
    if (this.onRequest) {
      await this.onRequest();
    }
    const applied: SyncResponse['applied'] = [];
    const conflicts: SyncResponse['conflicts'] = [];
    const touched = new Set<string>();
    for (const c of request.changes) {
      if (!isEntityName(c.entity)) {
        throw new Error('422 entité inconnue');
      }
      const key = `${c.entity}:${c.id}`;
      const existing = this.rows.get(key);
      if (!existing || existing.version === c.baseVersion) {
        const row = this.put(c.entity, c.id, c.deleted ? existing?.data ?? {} : c.data, c.deleted);
        applied.push({entity: c.entity, id: c.id, version: row.version});
        touched.add(key);
      } else if (!c.deleted && !existing.deleted && isDeepStrictEqual(existing.data, c.data)) {
        applied.push({entity: c.entity, id: c.id, version: existing.version});
        touched.add(key);
      } else {
        conflicts.push({
          entity: c.entity,
          id: c.id,
          server: {version: existing.version, deleted: existing.deleted, data: existing.data},
        });
      }
    }
    const pending = Array.from(this.rows.values())
      .filter(r => r.version > request.cursor && !touched.has(`${r.entity}:${r.id}`))
      .sort((a, b) => a.version - b.version);
    const page = pending.slice(0, 200);
    const hasMore = pending.length > 200;
    const changes: ServerChange[] = page.map(r => ({
      entity: r.entity,
      id: r.id,
      version: r.version,
      deleted: r.deleted,
      data: r.data,
    }));
    return {
      cursor: hasMore ? page[page.length - 1].version : this.seq,
      hasMore,
      applied,
      conflicts,
      changes,
    };
  }
}
