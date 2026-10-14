import {ENTITIES, ENTITY_NAMES} from './entities';
import type {EntityDef, FieldDef} from './entities';

const q = (identifier: string): string => `"${identifier}"`;

const SQL_TYPE = {
  text: 'TEXT',
  int: 'INTEGER',
  real: 'REAL',
  bool: 'INTEGER',
  json: 'TEXT',
} as const;

function sqlLiteral(value: unknown): string {
  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function columnSql(field: FieldDef): string {
  const hasDefault = field.def !== undefined && field.def !== null;
  let sql = `${q(field.column)} ${SQL_TYPE[field.kind]}`;
  if (field.required || hasDefault) {
    sql += ' NOT NULL';
  }
  if (hasDefault) {
    sql += ` DEFAULT ${sqlLiteral(field.def)}`;
  }
  return sql;
}

export function createTableSql(def: EntityDef): string {
  const columns = [
    `${q('id')} TEXT PRIMARY KEY NOT NULL`,
    `${q('version')} INTEGER NOT NULL DEFAULT 0`,
    `${q('created_at')} TEXT NOT NULL`,
    `${q('updated_at')} TEXT NOT NULL`,
    `${q('deleted_at')} TEXT`,
    `${q('dirty')} INTEGER NOT NULL DEFAULT 0`,
    `${q('local_seq')} INTEGER NOT NULL DEFAULT 0`,
    ...def.fields.map(columnSql),
  ];
  return `CREATE TABLE ${q(def.table)} (\n  ${columns.join(',\n  ')}\n)`;
}

export function createIndexSql(def: EntityDef): string[] {
  const out = [
    `CREATE INDEX ${q(`idx_${def.table}_dirty`)} ON ${q(def.table)} (${q(
      'local_seq',
    )}) WHERE ${q('dirty')} = 1`,
  ];
  for (const cols of def.indexes) {
    out.push(
      `CREATE INDEX ${q(`idx_${def.table}_${cols.join('_')}`)} ON ${q(
        def.table,
      )} (${cols.map(q).join(', ')})`,
    );
  }
  return out;
}

export function initialSchemaStatements(): string[] {
  const out: string[] = [];
  for (const name of ENTITY_NAMES) {
    const def = ENTITIES[name];
    out.push(createTableSql(def), ...createIndexSql(def));
  }
  out.push(
    `CREATE TABLE sync_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  cursor INTEGER NOT NULL DEFAULT 0,
  local_seq INTEGER NOT NULL DEFAULT 0,
  device_id TEXT NOT NULL,
  last_synced_at TEXT
)`,
    `CREATE TABLE sync_conflicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  local_json TEXT NOT NULL,
  server_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (entity, entity_id)
)`,
    `CREATE TABLE kv (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
)`,
  );
  return out;
}
