import {initialSchemaStatements} from './schema';
import type {SqlDatabase, SqlExecutor} from './sql';

export interface Migration {
  version: number;
  name: string;
  up(tx: SqlExecutor): Promise<void>;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'schema initial',
    async up(tx) {
      for (const statement of initialSchemaStatements()) {
        await tx.run(statement);
      }
    },
  },
];

export async function runMigrations(
  db: SqlDatabase,
  migrations: readonly Migration[] = MIGRATIONS,
  now: () => Date = () => new Date(),
): Promise<number[]> {
  await db.run(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
)`,
  );
  const rows = await db.all('SELECT version FROM schema_migrations');
  const done = new Set(rows.map(r => Number(r.version)));
  const applied: number[] = [];
  const ordered = migrations.slice().sort((a, b) => a.version - b.version);
  for (const m of ordered) {
    if (done.has(m.version)) {
      continue;
    }
    await db.transaction(async tx => {
      await m.up(tx);
      await tx.run(
        'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
        [m.version, m.name, now().toISOString()],
      );
    });
    applied.push(m.version);
  }
  return applied;
}
