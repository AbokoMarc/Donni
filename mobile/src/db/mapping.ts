import type {EntityData, EntityName, Entity} from '../domain/types';
import {ENTITIES} from './entities';
import type {EntityDef, FieldDef} from './entities';
import type {SqlRow, SqlValue} from './sql';

export type Dict = Record<string, unknown>;

function decode(field: FieldDef, raw: unknown): unknown {
  if (raw === null || raw === undefined) {
    return null;
  }
  switch (field.kind) {
    case 'bool':
      return Number(raw) === 1;
    case 'int':
    case 'real':
      return Number(raw);
    case 'json':
      try {
        return JSON.parse(String(raw));
      } catch {
        return {};
      }
    default:
      return String(raw);
  }
}

export function encode(field: FieldDef, value: unknown): SqlValue {
  if (value === null || value === undefined) {
    return null;
  }
  switch (field.kind) {
    case 'bool':
      return value ? 1 : 0;
    case 'json':
      return JSON.stringify(value);
    case 'int':
    case 'real':
      return Number(value);
    default:
      return String(value);
  }
}

export function rowToRecord<K extends EntityName>(
  def: EntityDef,
  row: SqlRow,
): Entity<K> {
  const record: Dict = {
    id: String(row.id),
    version: Number(row.version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    deletedAt: row.deleted_at == null ? null : String(row.deleted_at),
    dirty: Number(row.dirty) === 1,
    localSeq: Number(row.local_seq),
  };
  for (const field of def.fields) {
    record[field.name] = decode(field, row[field.column]);
  }
  return record as unknown as Entity<K>;
}

export function dataOf<K extends EntityName>(
  def: EntityDef,
  record: Entity<K>,
): EntityData[K] {
  const out: Dict = {};
  const source = record as unknown as Dict;
  for (const field of def.fields) {
    out[field.name] = source[field.name];
  }
  return out as unknown as EntityData[K];
}

/** Champs métier envoyés au serveur : les valeurs absentes sont omises, les colonnes locales exclues. */
export function toSyncData(def: EntityDef, record: Dict): Dict {
  const out: Dict = {};
  for (const field of def.fields) {
    if (field.local) {
      continue;
    }
    const value = record[field.name];
    if (value !== null && value !== undefined) {
      out[field.name] = value;
    }
  }
  return out;
}

function coerce(field: FieldDef, value: unknown): unknown {
  if (value === null || value === undefined) {
    return field.def !== undefined ? field.def : null;
  }
  switch (field.kind) {
    case 'bool':
      return value === true || value === 1 || value === 'true';
    case 'int':
    case 'real':
      return Number(value);
    case 'json':
      return typeof value === 'string' ? JSON.parse(value) : value;
    default:
      return String(value);
  }
}

export function fromSyncData(def: EntityDef, data: Dict): Dict {
  const out: Dict = {};
  for (const field of def.fields) {
    out[field.name] = coerce(field, data[field.name]);
  }
  return out;
}

export function entityDef(name: EntityName): EntityDef {
  return ENTITIES[name];
}
