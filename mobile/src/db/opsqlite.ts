import {open} from '@op-engineering/op-sqlite';
import type {SqlDatabase, SqlExecutor, SqlRow, SqlValue} from './sql';

interface RawResult {
  rowsAffected?: number;
  rows?: unknown;
}

function rowsOf(result: RawResult): SqlRow[] {
  const rows = result.rows as {_array?: SqlRow[]} | SqlRow[] | undefined;
  if (Array.isArray(rows)) {
    return rows;
  }
  return rows?._array ?? [];
}

function adapt(
  execute: (sql: string, params?: SqlValue[]) => Promise<RawResult>,
): SqlExecutor {
  return {
    async all(sql, params = []) {
      return rowsOf(await execute(sql, [...params]));
    },
    async run(sql, params = []) {
      const result = await execute(sql, [...params]);
      return {rowsAffected: result.rowsAffected ?? 0};
    },
  };
}

export async function openDatabase(name = 'donni.db'): Promise<SqlDatabase> {
  const db = open({name});
  const executor = adapt((sql, params) => db.execute(sql, params));
  await db.execute('PRAGMA journal_mode = WAL');
  return {
    ...executor,
    async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      let result: T | undefined;
      await db.transaction(async tx => {
        result = await fn(adapt((sql, params) => tx.execute(sql, params)));
      });
      return result as T;
    },
    close() {
      db.close();
    },
  };
}
