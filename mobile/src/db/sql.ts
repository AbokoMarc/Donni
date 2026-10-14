export type SqlValue = string | number | null;
export type SqlRow = Record<string, unknown>;

export interface SqlExecutor {
  all(sql: string, params?: readonly SqlValue[]): Promise<SqlRow[]>;
  run(sql: string, params?: readonly SqlValue[]): Promise<{rowsAffected: number}>;
}

export interface SqlDatabase extends SqlExecutor {
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
  close(): void;
}
