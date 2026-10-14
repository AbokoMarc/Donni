import {nowIso} from '../domain/dates';
import type {EntityName} from '../domain/types';
import {ENTITIES, ENTITY_NAMES} from '../db/entities';
import type {EntityDef} from '../db/entities';
import {dataOf, encode, fromSyncData, rowToRecord} from '../db/mapping';
import type {SqlExecutor, SqlValue} from '../db/sql';
import type {DataStore} from '../db/store';
import type {ApplyPlan} from './engine/apply';
import type {ConflictChoice, ConflictRecord} from './engine/conflicts';
import {resolveConflict} from './engine/conflicts';
import {keyOf} from './engine/types';
import type {Dict, DirtyRow, LocalSnapshot} from './engine/types';

export interface SyncState {
  cursor: number;
  deviceId: string;
  lastSyncedAt: string | null;
}

const q = (identifier: string): string => `"${identifier}"`;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const CHUNK = 400;

function validInstant(value: unknown): string | null {
  return typeof value === 'string' && INSTANT.test(value) ? value : null;
}

async function writeServerRow(
  ex: SqlExecutor,
  def: EntityDef,
  id: string,
  version: number,
  data: Dict,
  now: string,
): Promise<boolean> {
  const fields = fromSyncData(def, data);
  for (const f of def.fields) {
    if (f.required && (fields[f.name] === null || fields[f.name] === undefined)) {
      return false;
    }
  }
  const updatedAt = validInstant(data.updatedAt) ?? now;
  const existing = await ex.all(`SELECT "id" FROM ${q(def.table)} WHERE "id" = ?`, [id]);
  if (existing.length > 0) {
    const synced = def.fields.filter(f => !f.local);
    const sets = ['version', 'updated_at', 'deleted_at', 'dirty', ...synced.map(f => f.column)];
    const values: SqlValue[] = [version, updatedAt, null, 0, ...synced.map(f => encode(f, fields[f.name]))];
    await ex.run(
      `UPDATE ${q(def.table)} SET ${sets.map(c => `${q(c)} = ?`).join(', ')} WHERE "id" = ?`,
      [...values, id],
    );
  } else {
    const createdAt = validInstant(data.createdAt) ?? now;
    const cols = ['id', 'version', 'created_at', 'updated_at', 'deleted_at', 'dirty', 'local_seq', ...def.fields.map(f => f.column)];
    const values: SqlValue[] = [id, version, createdAt, updatedAt, null, 0, 0, ...def.fields.map(f => encode(f, fields[f.name]))];
    await ex.run(
      `INSERT INTO ${q(def.table)} (${cols.map(q).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      values,
    );
  }
  return true;
}

export class SyncStorage {
  private readonly store: DataStore;
  private readonly now: () => Date;

  constructor(store: DataStore, now: () => Date = () => new Date()) {
    this.store = store;
    this.now = now;
  }

  async readState(): Promise<SyncState> {
    const rows = await this.store.rawAll('SELECT cursor, device_id, last_synced_at FROM sync_state WHERE id = 1');
    const r = rows[0];
    return {
      cursor: Number(r.cursor),
      deviceId: String(r.device_id),
      lastSyncedAt: r.last_synced_at == null ? null : String(r.last_synced_at),
    };
  }

  async readDirty(limit: number): Promise<DirtyRow[]> {
    const all: DirtyRow[] = [];
    for (const name of ENTITY_NAMES) {
      const def = ENTITIES[name];
      const rows = await this.store.rawAll(
        `SELECT * FROM ${q(def.table)} WHERE "dirty" = 1 AND "id" NOT IN (SELECT "entity_id" FROM sync_conflicts WHERE "entity" = ?) ORDER BY "local_seq" LIMIT ?`,
        [name, limit],
      );
      for (const row of rows) {
        all.push({entity: name, record: rowToRecord(def, row) as unknown as DirtyRow['record']});
      }
    }
    return all.sort((a, b) => a.record.localSeq - b.record.localSeq).slice(0, limit);
  }

  async snapshots(
    keys: ReadonlyArray<{entity: EntityName; id: string}>,
  ): Promise<Map<string, LocalSnapshot>> {
    const out = new Map<string, LocalSnapshot>();
    const byEntity = new Map<EntityName, string[]>();
    for (const k of keys) {
      byEntity.set(k.entity, [...(byEntity.get(k.entity) ?? []), k.id]);
    }
    for (const [entity, ids] of byEntity) {
      const def = ENTITIES[entity];
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        const rows = await this.store.rawAll(
          `SELECT "id", "version", "dirty", "local_seq", "deleted_at" FROM ${q(def.table)} WHERE "id" IN (${chunk.map(() => '?').join(', ')})`,
          chunk,
        );
        for (const r of rows) {
          out.set(keyOf(entity, String(r.id)), {
            version: Number(r.version),
            dirty: Number(r.dirty) === 1,
            localSeq: Number(r.local_seq),
            deleted: r.deleted_at != null,
          });
        }
      }
    }
    return out;
  }

  async applyPlan(plan: ApplyPlan, cursor: number): Promise<void> {
    const stamp = nowIso(this.now());
    await this.store.transaction(async tx => {
      const ex = tx.executor();
      for (const ack of plan.acks) {
        const def = ENTITIES[ack.entity];
        if (ack.purge) {
          await ex.run(`DELETE FROM ${q(def.table)} WHERE "id" = ?`, [ack.id]);
        } else {
          await ex.run(`UPDATE ${q(def.table)} SET "version" = ?, "dirty" = ? WHERE "id" = ?`, [
            ack.version,
            ack.keepDirty ? 1 : 0,
            ack.id,
          ]);
        }
        tx.touch(ack.entity);
      }
      for (const w of plan.writes) {
        if (await writeServerRow(ex, ENTITIES[w.entity], w.id, w.version, w.data, stamp)) {
          tx.touch(w.entity);
        }
      }
      for (const p of plan.purges) {
        await ex.run(`DELETE FROM ${q(ENTITIES[p.entity].table)} WHERE "id" = ?`, [p.id]);
        tx.touch(p.entity);
      }
      for (const c of plan.conflicts) {
        const def = ENTITIES[c.entity];
        const rows = await ex.all(`SELECT * FROM ${q(def.table)} WHERE "id" = ?`, [c.id]);
        const local = rows[0]
          ? (() => {
              const rec = rowToRecord(def, rows[0]);
              return {
                version: rec.version,
                deleted: rec.deletedAt !== null,
                data: dataOf(def, rec) as unknown as Dict,
              };
            })()
          : {version: 0, deleted: true, data: {}};
        await ex.run(
          `INSERT INTO sync_conflicts (entity, entity_id, local_json, server_json, created_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (entity, entity_id) DO UPDATE SET local_json = excluded.local_json, server_json = excluded.server_json`,
          [c.entity, c.id, JSON.stringify(local), JSON.stringify(c.server), stamp],
        );
      }
      await ex.run('UPDATE sync_state SET cursor = ?, last_synced_at = ? WHERE id = 1', [cursor, stamp]);
    }, 'sync');
  }

  async listConflicts(): Promise<ConflictRecord[]> {
    const rows = await this.store.rawAll('SELECT * FROM sync_conflicts ORDER BY id');
    return rows.map(r => ({
      id: Number(r.id),
      entity: String(r.entity) as EntityName,
      entityId: String(r.entity_id),
      local: JSON.parse(String(r.local_json)),
      server: JSON.parse(String(r.server_json)),
      createdAt: String(r.created_at),
    }));
  }

  async countConflicts(): Promise<number> {
    const rows = await this.store.rawAll('SELECT COUNT(*) AS n FROM sync_conflicts');
    return Number(rows[0].n);
  }

  async resolve(conflictId: number, choice: ConflictChoice): Promise<void> {
    const stamp = nowIso(this.now());
    await this.store.transaction(async tx => {
      const ex = tx.executor();
      const rows = await ex.all('SELECT * FROM sync_conflicts WHERE id = ?', [conflictId]);
      if (rows.length === 0) {
        return;
      }
      const entity = String(rows[0].entity) as EntityName;
      const entityId = String(rows[0].entity_id);
      const server = JSON.parse(String(rows[0].server_json));
      const def = ENTITIES[entity];
      const resolution = resolveConflict({server}, choice);
      if (resolution.kind === 'rebase') {
        await ex.run('UPDATE sync_state SET local_seq = local_seq + 1 WHERE id = 1');
        const seq = Number((await ex.all('SELECT local_seq FROM sync_state WHERE id = 1'))[0].local_seq);
        await ex.run(
          `UPDATE ${q(def.table)} SET "version" = ?, "dirty" = 1, "local_seq" = ? WHERE "id" = ?`,
          [resolution.version, seq, entityId],
        );
      } else if (resolution.kind === 'purge') {
        await ex.run(`DELETE FROM ${q(def.table)} WHERE "id" = ?`, [entityId]);
      } else {
        await writeServerRow(ex, def, entityId, resolution.version, resolution.data, stamp);
      }
      await ex.run('DELETE FROM sync_conflicts WHERE id = ?', [conflictId]);
      tx.touch(entity);
    }, 'sync');
  }

  /** Sans compte, une suppression jamais envoyée n'a rien à annoncer au serveur. */
  async purgeLocalTombstones(): Promise<void> {
    await this.store.transaction(async tx => {
      for (const name of ENTITY_NAMES) {
        const r = await tx
          .executor()
          .run(`DELETE FROM ${q(ENTITIES[name].table)} WHERE "deleted_at" IS NOT NULL AND "version" = 0`);
        if (r.rowsAffected > 0) {
          tx.touch(name);
        }
      }
    }, 'system');
  }

  /** Rattache les données locales à un nouveau compte : tout est renvoyé comme neuf. */
  async adoptLocalData(): Promise<void> {
    await this.store.transaction(async tx => {
      const ex = tx.executor();
      for (const name of ENTITY_NAMES) {
        const table = q(ENTITIES[name].table);
        await ex.run(`DELETE FROM ${table} WHERE "deleted_at" IS NOT NULL`);
        await ex.run(`UPDATE ${table} SET "version" = 0, "dirty" = 1`);
        tx.touch(name);
      }
      await ex.run('DELETE FROM sync_conflicts');
      await ex.run('UPDATE sync_state SET cursor = 0, last_synced_at = NULL WHERE id = 1');
    }, 'system');
  }

  async wipe(): Promise<void> {
    await this.store.transaction(async tx => {
      const ex = tx.executor();
      for (const name of ENTITY_NAMES) {
        await ex.run(`DELETE FROM ${q(ENTITIES[name].table)}`);
        tx.touch(name);
      }
      await ex.run('DELETE FROM sync_conflicts');
      await ex.run('UPDATE sync_state SET cursor = 0, last_synced_at = NULL WHERE id = 1');
    }, 'system');
  }
}
