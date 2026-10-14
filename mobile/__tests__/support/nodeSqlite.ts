// @ts-ignore module fourni par Node 22.5+ uniquement, sans typage dans ce projet
import {DatabaseSync} from 'node:sqlite';
import type {SqlDatabase, SqlExecutor, SqlRow, SqlValue} from '../../src/db/sql';
import {DataStore} from '../../src/db/store';
import type {StoreOptions} from '../../src/db/store';

export function openMemoryDatabase(): SqlDatabase {
  const db = new DatabaseSync(':memory:');
  const executor: SqlExecutor = {
    async all(sql: string, params: readonly SqlValue[] = []) {
      return db.prepare(sql).all(...params) as SqlRow[];
    },
    async run(sql: string, params: readonly SqlValue[] = []) {
      const result = db.prepare(sql).run(...params);
      return {rowsAffected: Number(result.changes)};
    },
  };
  return {
    ...executor,
    async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      db.exec('BEGIN');
      try {
        const out = await fn(executor);
        db.exec('COMMIT');
        return out;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    close() {
      db.close();
    },
  };
}

export interface TestClock {
  now: Date;
  advance(ms: number): void;
}

export async function createTestStore(
  options: StoreOptions & {start?: Date} = {},
): Promise<{store: DataStore; db: SqlDatabase; clock: TestClock}> {
  const db = openMemoryDatabase();
  const clock: TestClock = {
    now: options.start ?? new Date('2026-10-07T08:00:00Z'),
    advance(ms: number) {
      clock.now = new Date(clock.now.getTime() + ms);
    },
  };
  let n = 0;
  const store = new DataStore(db, {
    now: () => clock.now,
    random: options.random ?? (() => ((n = (n * 7919 + 104729) % 1000003) % 256) / 256),
  });
  await store.init();
  return {store, db, clock};
}
