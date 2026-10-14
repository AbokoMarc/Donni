import {runMigrations} from '../src/db/migrations';
import {ENTITIES, ENTITY_NAMES} from '../src/db/entities';
import {fromSyncData, toSyncData} from '../src/db/mapping';
import {ValidationError} from '../src/db/validate';
import {createTestStore, openMemoryDatabase} from './support/nodeSqlite';

describe('migrations', () => {
  it('crée les 16 tables, sync_state, sync_conflicts et kv', async () => {
    const {db} = await createTestStore();
    const tables = (await db.all("SELECT name FROM sqlite_master WHERE type = 'table'")).map(r => String(r.name));
    for (const name of ENTITY_NAMES) {
      expect(tables).toContain(ENTITIES[name].table);
    }
    expect(ENTITY_NAMES).toHaveLength(16);
    expect(tables).toContain('energy_logs');
    for (const t of ['sync_state', 'sync_conflicts', 'kv', 'schema_migrations']) {
      expect(tables).toContain(t);
    }
  });
  it('est rejouable sans effet', async () => {
    const db = openMemoryDatabase();
    expect(await runMigrations(db)).toEqual([1]);
    expect(await runMigrations(db)).toEqual([]);
    const rows = await db.all('SELECT version FROM schema_migrations');
    expect(rows).toHaveLength(1);
  });
  it('porte les colonnes communes', async () => {
    const {db} = await createTestStore();
    const cols = (await db.all('PRAGMA table_info(tasks)')).map(r => String(r.name));
    for (const c of ['id', 'version', 'created_at', 'updated_at', 'deleted_at', 'dirty', 'local_seq', 'start_time', 'remind_before_min']) {
      expect(cols).toContain(c);
    }
  });
});

describe('écritures', () => {
  it('insère avec valeurs par défaut, dirty et local_seq', async () => {
    const {store} = await createTestStore();
    const a = await store.insert('tasks', {title: 'Sport', day: '2026-10-07'});
    const b = await store.insert('tasks', {title: 'Lire', day: '2026-10-07', startTime: '18:00'});
    expect(a.dirty).toBe(true);
    expect(a.version).toBe(0);
    expect(a.status).toBe('todo');
    expect(a.priority).toBe(1);
    expect(a.startTime).toBeNull();
    expect(b.localSeq).toBe(a.localSeq + 1);
    expect(a.createdAt).toBe('2026-10-07T08:00:00Z');
  });
  it('met à jour sans toucher à la version de base', async () => {
    const {store, clock} = await createTestStore();
    const t = await store.insert('tasks', {title: 'Sport', day: '2026-10-07'});
    clock.advance(60_000);
    const u = await store.update('tasks', t.id, {startTime: '19:30', title: 'Sport 2'});
    expect(u?.startTime).toBe('19:30');
    expect(u?.title).toBe('Sport 2');
    expect(u?.version).toBe(0);
    expect(u?.updatedAt).toBe('2026-10-07T08:01:00Z');
    expect((u?.localSeq as number) > t.localSeq).toBe(true);
    expect(await store.update('tasks', 'absent', {title: 'x'})).toBeNull();
  });
  it('supprime logiquement', async () => {
    const {store} = await createTestStore();
    const t = await store.insert('tasks', {title: 'Sport', day: '2026-10-07'});
    expect(await store.softDelete('tasks', t.id)).toBe(true);
    expect(await store.get('tasks', t.id)).toBeNull();
    expect(await store.select('tasks')).toHaveLength(0);
    expect(await store.select('tasks', {includeDeleted: true})).toHaveLength(1);
    expect(await store.softDelete('tasks', t.id)).toBe(false);
  });
  it('upsert crée puis modifie et ressuscite', async () => {
    const {store} = await createTestStore();
    const id = '11111111-1111-4111-8111-111111111111';
    await store.upsert('goals', {id, title: 'A'});
    await store.upsert('goals', {id, title: 'B', status: 'doing'});
    const g = await store.get('goals', id);
    expect(g?.title).toBe('B');
    expect(g?.status).toBe('doing');
    await store.softDelete('goals', id);
    await store.upsert('goals', {id, title: 'C'});
    expect((await store.get('goals', id))?.title).toBe('C');
    expect(await store.count('goals')).toBe(1);
  });
  it('refuse les données invalides sans rien écrire', async () => {
    const {store} = await createTestStore();
    await expect(store.insert('tasks', {title: 'x', day: '2026-13-40'})).rejects.toThrow(ValidationError);
    await expect(store.insert('tasks', {title: 'x', day: '2026-10-07', startTime: '25:00'})).rejects.toThrow(ValidationError);
    await expect(store.insert('budgets', {month: '2026-10', limitXof: 0})).rejects.toThrow(ValidationError);
    await expect(store.insert('skills', {name: 'x', level: 101})).rejects.toThrow(ValidationError);
    await expect(store.insert('tasks', {title: ' ', day: '2026-10-07'})).rejects.toThrow(ValidationError);
    expect(await store.count('tasks')).toBe(0);
    const {sync} = {sync: await store.rawAll('SELECT local_seq FROM sync_state')};
    expect(Number(sync[0].local_seq)).toBe(0);
  });
  it('annule toute la transaction en cas d\'échec', async () => {
    const {store} = await createTestStore();
    await expect(
      store.transaction(async tx => {
        await tx.insert('goals', {title: 'A'});
        await tx.insert('goals', {title: ''});
      }),
    ).rejects.toThrow(ValidationError);
    expect(await store.count('goals')).toBe(0);
    await store.insert('goals', {title: 'ok'});
    expect(await store.count('goals')).toBe(1);
  });
  it('conserve les types : booléens, JSON, nombres réels', async () => {
    const {store} = await createTestStore();
    const s = await store.insert('settings', {focusMode: true, quietStart: '22:00'});
    expect(s.focusMode).toBe(true);
    expect(s.whatsappOptIn).toBe(false);
    const r = await store.insert('weeklyReviews', {weekStart: '2026-10-05', payload: {a: [1, 2], b: 'x'}});
    expect(r.payload).toEqual({a: [1, 2], b: 'x'});
    const e = await store.insert('energy', {day: '2026-10-07', metric: 'sleep', label: 'Sommeil', value: 5.5, target: 6});
    expect(e.value).toBe(5.5);
  });
});

describe('notifications de changement', () => {
  it('prévient les abonnés ciblés après validation', async () => {
    const {store} = await createTestStore();
    const seen: string[] = [];
    store.bus.subscribe(['tasks'], e => seen.push(`t:${e.origin}`));
    store.bus.subscribe(null, e => seen.push(`all:${Array.from(e.entities).join(',')}`));
    await store.insert('goals', {title: 'A'});
    await store.insert('tasks', {title: 'B', day: '2026-10-07'}, 'derive');
    expect(seen).toEqual(['all:goals', 't:derive', 'all:tasks']);
  });
  it('ne prévient pas si la transaction échoue', async () => {
    const {store} = await createTestStore();
    let calls = 0;
    store.bus.subscribe(null, () => (calls += 1));
    await expect(store.insert('goals', {title: ''})).rejects.toThrow(ValidationError);
    expect(calls).toBe(0);
  });
});

describe('correspondance protocole', () => {
  it('omet les valeurs nulles et les colonnes locales', () => {
    const data = toSyncData(ENTITIES.reminders, {
      targetType: 'task', targetId: null, label: 'x', fireAt: '2026-10-07T08:00:00Z',
      status: 'scheduled', viaWhatsapp: false, whatsappSentAt: null, kind: 'smart',
    });
    expect(data).toEqual({targetType: 'task', label: 'x', fireAt: '2026-10-07T08:00:00Z', status: 'scheduled', viaWhatsapp: false});
  });
  it('relit les données serveur avec les valeurs par défaut', () => {
    const out = fromSyncData(ENTITIES.tasks, {title: 'A', day: '2026-10-07', priority: 2});
    expect(out.status).toBe('todo');
    expect(out.priority).toBe(2);
    expect(out.startTime).toBeNull();
    expect(fromSyncData(ENTITIES.settings, {focusMode: 'true'}).focusMode).toBe(true);
  });
});
