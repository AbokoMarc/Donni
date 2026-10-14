import {nowIso} from '../domain/dates';
import {uuidv4} from '../domain/ids';
import type {RandomSource} from '../domain/ids';
import type {Entity, EntityData, EntityName, Insertable} from '../domain/types';
import {ChangeBus} from './bus';
import type {WriteOrigin} from './bus';
import {ENTITIES} from './entities';
import type {EntityDef} from './entities';
import {encode, rowToRecord} from './mapping';
import type {Dict} from './mapping';
import {runMigrations} from './migrations';
import type {SqlDatabase, SqlExecutor, SqlValue} from './sql';
import {validateRecord} from './validate';

export interface SelectQuery {
  where?: string;
  params?: readonly SqlValue[];
  orderBy?: string;
  limit?: number;
  offset?: number;
  includeDeleted?: boolean;
}

export interface Reader {
  select<K extends EntityName>(entity: K, query?: SelectQuery): Promise<Entity<K>[]>;
  get<K extends EntityName>(entity: K, id: string): Promise<Entity<K> | null>;
  rawAll(sql: string, params?: readonly SqlValue[]): Promise<Array<Record<string, unknown>>>;
}

export interface StoreOptions {
  now?: () => Date;
  random?: RandomSource;
}

const q = (identifier: string): string => `"${identifier}"`;

export class StoreTx implements Reader {
  readonly touched = new Set<EntityName>();
  private readonly ex: SqlExecutor;
  private readonly now: () => Date;
  private readonly random: RandomSource;

  constructor(ex: SqlExecutor, now: () => Date, random: RandomSource) {
    this.ex = ex;
    this.now = now;
    this.random = random;
  }

  rawAll(sql: string, params: readonly SqlValue[] = []) {
    return this.ex.all(sql, params);
  }

  executor(): SqlExecutor {
    return this.ex;
  }

  touch(entity: EntityName): void {
    this.touched.add(entity);
  }

  async select<K extends EntityName>(entity: K, query: SelectQuery = {}): Promise<Entity<K>[]> {
    const def = ENTITIES[entity];
    const clauses: string[] = [];
    if (!query.includeDeleted) {
      clauses.push('"deleted_at" IS NULL');
    }
    if (query.where) {
      clauses.push(`(${query.where})`);
    }
    let sql = `SELECT * FROM ${q(def.table)}`;
    if (clauses.length > 0) {
      sql += ` WHERE ${clauses.join(' AND ')}`;
    }
    if (query.orderBy) {
      sql += ` ORDER BY ${query.orderBy}`;
    }
    const params: SqlValue[] = [...(query.params ?? [])];
    if (query.limit !== undefined) {
      sql += ' LIMIT ?';
      params.push(query.limit);
      if (query.offset) {
        sql += ' OFFSET ?';
        params.push(query.offset);
      }
    }
    const rows = await this.ex.all(sql, params);
    return rows.map(r => rowToRecord<K>(def, r));
  }

  async get<K extends EntityName>(
    entity: K,
    id: string,
    includeDeleted = false,
  ): Promise<Entity<K> | null> {
    const rows = await this.select(entity, {
      where: '"id" = ?',
      params: [id],
      includeDeleted,
      limit: 1,
    });
    return rows[0] ?? null;
  }

  private async nextSeq(): Promise<number> {
    await this.ex.run('UPDATE sync_state SET local_seq = local_seq + 1 WHERE id = 1');
    const rows = await this.ex.all('SELECT local_seq FROM sync_state WHERE id = 1');
    return Number(rows[0].local_seq);
  }

  private async write(
    def: EntityDef,
    mode: 'insert' | 'update',
    record: Dict,
  ): Promise<void> {
    const seq = await this.nextSeq();
    const fieldCols = def.fields.map(f => f.column);
    const fieldVals = def.fields.map(f => encode(f, record[f.name]));
    if (mode === 'insert') {
      const cols = [
        'id',
        'version',
        'created_at',
        'updated_at',
        'deleted_at',
        'dirty',
        'local_seq',
        ...fieldCols,
      ];
      const vals: SqlValue[] = [
        String(record.id),
        Number(record.version),
        String(record.createdAt),
        String(record.updatedAt),
        (record.deletedAt as string | null) ?? null,
        1,
        seq,
        ...fieldVals,
      ];
      await this.ex.run(
        `INSERT INTO ${q(def.table)} (${cols.map(q).join(', ')}) VALUES (${cols
          .map(() => '?')
          .join(', ')})`,
        vals,
      );
    } else {
      const sets = ['updated_at', 'deleted_at', 'dirty', 'local_seq', ...fieldCols];
      const vals: SqlValue[] = [
        String(record.updatedAt),
        (record.deletedAt as string | null) ?? null,
        1,
        seq,
        ...fieldVals,
        String(record.id),
      ];
      await this.ex.run(
        `UPDATE ${q(def.table)} SET ${sets.map(c => `${q(c)} = ?`).join(', ')} WHERE "id" = ?`,
        vals,
      );
    }
    this.touched.add(def.name);
  }

  async insert<K extends EntityName>(entity: K, input: Insertable<K>): Promise<Entity<K>> {
    const def = ENTITIES[entity];
    const source = input as unknown as Dict;
    const stamp = nowIso(this.now());
    const record: Dict = {
      id: typeof source.id === 'string' ? source.id : uuidv4(this.random),
      version: 0,
      createdAt: stamp,
      updatedAt: stamp,
      deletedAt: null,
    };
    for (const field of def.fields) {
      const value = source[field.name];
      record[field.name] = value !== undefined ? value : field.def !== undefined ? field.def : null;
    }
    validateRecord(def, record);
    await this.write(def, 'insert', record);
    return (await this.get(entity, String(record.id), true)) as Entity<K>;
  }

  async update<K extends EntityName>(
    entity: K,
    id: string,
    patch: Partial<EntityData[K]>,
  ): Promise<Entity<K> | null> {
    const def = ENTITIES[entity];
    const current = await this.get(entity, id);
    if (!current) {
      return null;
    }
    const record: Dict = {...(current as unknown as Dict)};
    for (const [key, value] of Object.entries(patch as Dict)) {
      if (def.fields.some(f => f.name === key) && value !== undefined) {
        record[key] = value;
      }
    }
    record.updatedAt = nowIso(this.now());
    validateRecord(def, record);
    await this.write(def, 'update', record);
    return this.get(entity, id);
  }

  async upsert<K extends EntityName>(
    entity: K,
    input: Insertable<K> & {id: string},
  ): Promise<Entity<K>> {
    const existing = await this.get(entity, input.id, true);
    if (!existing) {
      return this.insert(entity, input);
    }
    const {id: _id, ...rest} = input as unknown as Dict;
    const record: Dict = {...(existing as unknown as Dict), ...rest, deletedAt: null};
    const def = ENTITIES[entity];
    record.updatedAt = nowIso(this.now());
    validateRecord(def, record);
    await this.write(def, 'update', record);
    return (await this.get(entity, input.id)) as Entity<K>;
  }

  async softDelete(entity: EntityName, id: string): Promise<boolean> {
    const def = ENTITIES[entity];
    const current = await this.get(entity, id);
    if (!current) {
      return false;
    }
    const record: Dict = {...(current as unknown as Dict)};
    const stamp = nowIso(this.now());
    record.deletedAt = stamp;
    record.updatedAt = stamp;
    await this.write(def, 'update', record);
    return true;
  }
}

export class DataStore implements Reader {
  readonly bus = new ChangeBus();
  private readonly db: SqlDatabase;
  private readonly now: () => Date;
  private readonly random: RandomSource;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(db: SqlDatabase, options: StoreOptions = {}) {
    this.db = db;
    this.now = options.now ?? (() => new Date());
    this.random = options.random ?? Math.random;
  }

  async init(): Promise<void> {
    await runMigrations(this.db, undefined, this.now);
    await this.db.run('INSERT OR IGNORE INTO sync_state (id, device_id) VALUES (1, ?)', [
      uuidv4(this.random),
    ]);
  }

  /**
   * Toutes les écritures passent ici : une seule transaction à la fois,
   * et les abonnés ne sont prévenus qu'après validation.
   * Ne pas rappeler `transaction` depuis `fn`, utiliser l'objet reçu.
   */
  transaction<T>(fn: (tx: StoreTx) => Promise<T>, origin: WriteOrigin = 'user'): Promise<T> {
    const run = this.chain.then(async () => {
      let result: T | undefined;
      let touched: Set<EntityName> = new Set();
      await this.db.transaction(async ex => {
        const tx = new StoreTx(ex, this.now, this.random);
        result = await fn(tx);
        touched = tx.touched;
      });
      this.bus.emit(touched, origin);
      return result as T;
    });
    this.chain = run.catch(() => undefined);
    return run;
  }

  rawAll(sql: string, params: readonly SqlValue[] = []) {
    return this.db.all(sql, params);
  }

  select<K extends EntityName>(entity: K, query: SelectQuery = {}): Promise<Entity<K>[]> {
    return new StoreTx(this.db, this.now, this.random).select(entity, query);
  }

  get<K extends EntityName>(entity: K, id: string): Promise<Entity<K> | null> {
    return new StoreTx(this.db, this.now, this.random).get(entity, id);
  }

  async count(entity: EntityName, where?: string, params: readonly SqlValue[] = []): Promise<number> {
    const rows = await this.db.all(
      `SELECT COUNT(*) AS n FROM ${q(ENTITIES[entity].table)} WHERE "deleted_at" IS NULL${
        where ? ` AND (${where})` : ''
      }`,
      params,
    );
    return Number(rows[0].n);
  }

  insert<K extends EntityName>(entity: K, input: Insertable<K>, origin: WriteOrigin = 'user') {
    return this.transaction(tx => tx.insert(entity, input), origin);
  }

  update<K extends EntityName>(
    entity: K,
    id: string,
    patch: Partial<EntityData[K]>,
    origin: WriteOrigin = 'user',
  ) {
    return this.transaction(tx => tx.update(entity, id, patch), origin);
  }

  upsert<K extends EntityName>(
    entity: K,
    input: Insertable<K> & {id: string},
    origin: WriteOrigin = 'user',
  ) {
    return this.transaction(tx => tx.upsert(entity, input), origin);
  }

  softDelete(entity: EntityName, id: string, origin: WriteOrigin = 'user') {
    return this.transaction(tx => tx.softDelete(entity, id), origin);
  }

  async getKv(key: string): Promise<string | null> {
    const rows = await this.db.all('SELECT value FROM kv WHERE key = ?', [key]);
    return rows.length > 0 ? String(rows[0].value) : null;
  }

  async setKv(key: string, value: string): Promise<void> {
    await this.db.run('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', [key, value]);
  }

  async deleteKv(key: string): Promise<void> {
    await this.db.run('DELETE FROM kv WHERE key = ?', [key]);
  }
}
