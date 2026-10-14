import {AuthExpiredError, NetworkError} from '../src/api/errors';
import {createRepository} from '../src/db/repository';
import {buildBatch} from '../src/sync/engine/batch';
import {backoffDelay} from '../src/sync/engine/backoff';
import {planApply} from '../src/sync/engine/apply';
import {deriveSyncStatus, statusLabel} from '../src/sync/engine/status';
import {SyncService} from '../src/sync/SyncService';
import {SyncStorage} from '../src/sync/SyncStorage';
import {FakeServer} from './support/fakeServer';
import {createTestStore} from './support/nodeSqlite';

async function setup(opts: {debounceMs?: number} = {}) {
  const ctx = await createTestStore();
  const repo = createRepository(ctx.store);
  const storage = new SyncStorage(ctx.store, () => ctx.clock.now);
  const server = new FakeServer();
  const expired: number[] = [];
  const service = new SyncService({
    storage,
    api: server,
    debounceMs: opts.debounceMs ?? 5,
    backoff: () => 5,
    onSessionExpired: () => expired.push(1),
  });
  await service.start();
  return {...ctx, repo, storage, server, service, expired};
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function activate(service: SyncService) {
  service.setSession('active');
  await sleep(30);
}

describe('moteur : lot et plan', () => {
  it('trie par local_seq, plafonne à 200 et vide les données des suppressions', async () => {
    const {repo, storage} = await setup();
    for (let i = 0; i < 205; i++) {
      await repo.tables.notes.insert({title: `n${i}`});
    }
    const goal = await repo.tables.goals.insert({title: 'À supprimer'});
    await repo.tables.goals.softDelete(goal.id);
    const dirty = await storage.readDirty(1000);
    const batch = buildBatch(dirty.slice().reverse(), 7, 'dev', 200);
    expect(batch.request.cursor).toBe(7);
    expect(batch.request.deviceId).toBe('dev');
    expect(batch.request.changes).toHaveLength(200);
    expect(batch.sent[0].localSeq < batch.sent[199].localSeq).toBe(true);
    const full = buildBatch(dirty, 0, 'dev');
    const del = full.request.changes.find(c => c.id === goal.id);
    expect(del).toBeUndefined();
    const only = buildBatch(dirty.filter(d => d.entity === 'goals'), 0, 'dev');
    expect(only.request.changes[0]).toEqual({entity: 'goals', id: goal.id, baseVersion: 0, deleted: true, data: {}});
  });

  it('envoie tous les champs métier sans null ni colonne locale', async () => {
    const {repo, storage} = await setup();
    await repo.tables.reminders.insert({targetType: 'task', label: 'x', fireAt: '2026-10-07T17:00:00Z', kind: 'smart'});
    const batch = buildBatch(await storage.readDirty(10), 0, 'dev');
    expect(batch.request.changes[0].data).toEqual({
      targetType: 'task', label: 'x', fireAt: '2026-10-07T17:00:00Z', status: 'scheduled', viaWhatsapp: false,
    });
  });

  it('planApply ignore les entités inconnues et les versions périmées', () => {
    const plan = planApply(
      {
        cursor: 5, hasMore: false, applied: [], conflicts: [],
        changes: [
          {entity: 'inconnue', id: 'a', version: 3, deleted: false, data: {}},
          {entity: 'goals', id: 'b', version: 2, deleted: false, data: {title: 'x'}},
        ],
      },
      [],
      new Map([['goals:b', {version: 4, dirty: false, localSeq: 0, deleted: false}]]),
    );
    expect(plan).toEqual({acks: [], writes: [], purges: [], conflicts: []});
  });
});

describe('moteur : backoff et état', () => {
  it('double le délai jusqu\'à 5 minutes', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(backoffDelay)).toEqual([
      5000, 10000, 20000, 40000, 80000, 160000, 300000, 300000, 300000,
    ]);
  });
  it('dérive l\'état affiché', () => {
    const base = {session: 'active' as const, online: true, syncing: false, conflicts: 0, failed: false};
    expect(statusLabel(deriveSyncStatus(base))).toBe('Synchronisé');
    expect(statusLabel(deriveSyncStatus({...base, online: false}))).toBe('Hors connexion');
    expect(statusLabel(deriveSyncStatus({...base, syncing: true, online: false}))).toBe('Synchronisation…');
    expect(statusLabel(deriveSyncStatus({...base, conflicts: 2}), 2)).toBe('Conflits à résoudre (2)');
    expect(deriveSyncStatus({...base, session: 'none'})).toBe('local');
    expect(deriveSyncStatus({...base, session: 'expired'})).toBe('expired');
    expect(deriveSyncStatus({...base, failed: true})).toBe('error');
  });
});

describe('SyncService', () => {
  it('reste inactif sans session et hors connexion', async () => {
    const {service, server, repo} = await setup();
    await repo.tables.goals.insert({title: 'A'});
    expect(await service.syncNow()).toBe(false);
    expect(service.getSnapshot().status).toBe('local');
    service.setOnline(false);
    service.setSession('active');
    await sleep(20);
    expect(service.getSnapshot().label).toBe('Hors connexion');
    expect(server.requests).toHaveLength(0);
  });

  it('envoie les créations locales puis acquitte', async () => {
    const {service, server, repo} = await setup();
    const g = await repo.tables.goals.insert({title: 'Chef de projet', dueDate: '2026-12-01'});
    await activate(service);
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0].changes[0]).toEqual({
      entity: 'goals', id: g.id, baseVersion: 0, deleted: false,
      data: {title: 'Chef de projet', status: 'todo', dueDate: '2026-12-01'},
    });
    const after = await repo.tables.goals.get(g.id);
    expect(after?.dirty).toBe(false);
    expect(after?.version).toBe(1);
    expect(service.getSnapshot().label).toBe('Synchronisé');
    expect((await new SyncStorage(repo.store).readState()).cursor).toBe(1);
  });

  it('garde la ligne sale si elle est modifiée pendant l\'envoi', async () => {
    const {service, server, repo} = await setup();
    const g = await repo.tables.goals.insert({title: 'A'});
    let once = true;
    server.onRequest = async () => {
      if (once) {
        once = false;
        await repo.tables.goals.update(g.id, {title: 'A modifié'});
        service.notifyLocalWrite();
      }
    };
    await activate(service);
    await sleep(30);
    const after = await repo.tables.goals.get(g.id);
    expect(after?.title).toBe('A modifié');
    expect(after?.dirty).toBe(false);
    expect(server.rows.get(`goals:${g.id}`)?.data.title).toBe('A modifié');
    expect(server.requests.length >= 2).toBe(true);
  });

  it('purge localement une suppression acquittée', async () => {
    const {service, server, repo, db} = await setup();
    const g = await repo.tables.goals.insert({title: 'A'});
    await activate(service);
    await repo.tables.goals.softDelete(g.id);
    await service.syncNow();
    expect(server.rows.get(`goals:${g.id}`)?.deleted).toBe(true);
    const rows = await db.all('SELECT id FROM goals');
    expect(rows).toHaveLength(0);
  });

  it('applique les modifications du serveur, y compris suppressions', async () => {
    const {service, server, repo} = await setup();
    const id = '22222222-2222-4222-8222-222222222222';
    server.put('contacts', id, {name: 'Maman', relation: 'famille', frequencyKind: 'none'});
    server.put('tasks', '33333333-3333-4333-8333-333333333333', {title: 'Distante', day: '2026-10-08'});
    await activate(service);
    expect((await repo.tables.contacts.get(id))?.name).toBe('Maman');
    expect((await repo.tables.contacts.get(id))?.dirty).toBe(false);
    expect((await repo.tables.tasks.list())[0].title).toBe('Distante');
    server.put('contacts', id, {}, true);
    await service.syncNow();
    expect(await repo.tables.contacts.get(id)).toBeNull();
    expect(await repo.tables.contacts.count()).toBe(0);
  });

  it('pagine quand le serveur a plus de 200 changements', async () => {
    const {service, server, repo} = await setup();
    for (let i = 0; i < 450; i++) {
      server.put('notes', `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, {title: `n${i}`, body: ''});
    }
    await activate(service);
    await sleep(50);
    expect(await repo.tables.notes.count()).toBe(450);
    expect(server.requests.map(r => r.changes.length)).toEqual([0, 0, 0]);
  });

  it('pousse par lots de 200 tant qu\'il reste des lignes sales', async () => {
    const {service, server, repo} = await setup();
    for (let i = 0; i < 230; i++) {
      await repo.tables.notes.insert({title: `n${i}`});
    }
    await activate(service);
    await sleep(80);
    expect(server.requests.map(r => r.changes.length)).toEqual([200, 30]);
    expect(await repo.tables.notes.count('"dirty" = 1')).toBe(0);
  });

  it('enregistre un conflit sans rien écraser puis résout "garder ma version"', async () => {
    const {service, server, repo, storage} = await setup();
    const g = await repo.tables.goals.insert({title: 'Local'});
    await activate(service);
    server.put('goals', g.id, {title: 'Serveur', status: 'doing'});
    await repo.tables.goals.update(g.id, {title: 'Local 2'});
    await service.syncNow();
    const conflicts = await storage.listConflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].local.data.title).toBe('Local 2');
    expect(conflicts[0].server.data.title).toBe('Serveur');
    expect(service.getSnapshot().label).toBe('Conflits à résoudre (1)');
    expect((await repo.tables.goals.get(g.id))?.title).toBe('Local 2');
    const before = server.requests.length;
    await service.syncNow();
    expect(server.requests[before].changes).toHaveLength(0);

    await service.resolveConflict(conflicts[0].id, 'mine');
    await sleep(30);
    expect(server.rows.get(`goals:${g.id}`)?.data.title).toBe('Local 2');
    expect((await repo.tables.goals.get(g.id))?.dirty).toBe(false);
    expect(await storage.countConflicts()).toBe(0);
    expect(service.getSnapshot().label).toBe('Synchronisé');
  });

  it('résout "garder la version du serveur"', async () => {
    const {service, server, repo, storage} = await setup();
    const g = await repo.tables.goals.insert({title: 'Local'});
    await activate(service);
    server.put('goals', g.id, {title: 'Serveur', status: 'doing'});
    await repo.tables.goals.update(g.id, {title: 'Local 2'});
    await service.syncNow();
    const [conflict] = await storage.listConflicts();
    await service.resolveConflict(conflict.id, 'server');
    const row = await repo.tables.goals.get(g.id);
    expect(row?.title).toBe('Serveur');
    expect(row?.status).toBe('doing');
    expect(row?.dirty).toBe(false);
    expect(row?.version).toBe(server.rows.get(`goals:${g.id}`)?.version);
    expect(await storage.countConflicts()).toBe(0);
  });

  it('détecte le conflit quand le serveur envoie une ligne que l\'utilisateur a aussi modifiée', async () => {
    const {service, server, repo, storage} = await setup();
    const g = await repo.tables.goals.insert({title: 'Local'});
    await activate(service);
    const row = await repo.tables.goals.get(g.id);
    await repo.tables.goals.update(g.id, {title: 'Local 2'});
    server.put('goals', g.id, {title: 'Serveur'});
    expect(row?.version).toBe(1);
    await service.syncNow();
    expect(await storage.countConflicts()).toBe(1);
  });

  it('conserve la colonne locale des rappels lors d\'une mise à jour serveur', async () => {
    const {service, server, repo} = await setup();
    const r = await repo.tables.reminders.insert({targetType: 'task', label: 'x', fireAt: '2026-10-07T17:00:00Z', kind: 'smart'});
    await activate(service);
    server.put('reminders', r.id, {targetType: 'task', label: 'y', fireAt: '2026-10-07T17:00:00Z', status: 'fired', viaWhatsapp: false});
    await service.syncNow();
    const after = await repo.tables.reminders.get(r.id);
    expect(after?.label).toBe('y');
    expect(after?.status).toBe('fired');
    expect(after?.kind).toBe('smart');
  });

  it('ignore une ligne serveur malformée sans bloquer la synchronisation', async () => {
    const {service, server, repo} = await setup();
    server.put('tasks', '44444444-4444-4444-8444-444444444444', {day: '2026-10-08'});
    server.put('goals', '55555555-5555-4555-8555-555555555555', {title: 'Valide'});
    await activate(service);
    expect(await repo.tables.tasks.count()).toBe(0);
    expect(await repo.tables.goals.count()).toBe(1);
    expect(service.getSnapshot().status).toBe('synced');
  });

  it('réessaie après une erreur réseau', async () => {
    const {service, server, repo} = await setup();
    await repo.tables.goals.insert({title: 'A'});
    server.failWith = new NetworkError();
    await activate(service);
    expect(service.getSnapshot().status).toBe('offline');
    server.failWith = null;
    await sleep(40);
    expect(service.getSnapshot().status).toBe('synced');
    expect(await repo.tables.goals.count('"dirty" = 1')).toBe(0);
  });

  it('signale une session expirée sans réessayer', async () => {
    const {service, server, expired} = await setup();
    server.failWith = new AuthExpiredError();
    await activate(service);
    expect(service.getSnapshot().status).toBe('expired');
    expect(expired).toEqual([1]);
    const n = server.requests.length;
    await sleep(30);
    expect(server.requests.length).toBe(n);
  });

  it('synchronise après une écriture, avec anti-rebond', async () => {
    const {service, server, repo} = await setup({debounceMs: 20});
    await activate(service);
    const before = server.requests.length;
    await repo.tables.goals.insert({title: 'A'});
    service.notifyLocalWrite();
    await repo.tables.goals.insert({title: 'B'});
    service.notifyLocalWrite();
    await sleep(5);
    expect(server.requests.length).toBe(before);
    await sleep(60);
    expect(server.requests.length).toBe(before + 1);
    expect(server.requests[before].changes).toHaveLength(2);
  });

  it('rattache les données locales à un nouveau compte', async () => {
    const {repo, storage, service, server} = await setup();
    const a = await repo.tables.goals.insert({title: 'A'});
    const b = await repo.tables.goals.insert({title: 'B'});
    await repo.tables.goals.softDelete(b.id);
    await activate(service);
    service.setSession('none');
    await sleep(10);
    await storage.adoptLocalData();
    const row = await repo.tables.goals.get(a.id);
    expect(row?.version).toBe(0);
    expect(row?.dirty).toBe(true);
    expect((await storage.readState()).cursor).toBe(0);
    server.rows.clear();
    service.setSession('active');
    await sleep(40);
    expect(server.rows.has(`goals:${a.id}`)).toBe(true);
  });

  it('efface les suppressions jamais envoyées en mode local', async () => {
    const {repo, service, db} = await setup();
    const g = await repo.tables.goals.insert({title: 'A'});
    await repo.tables.goals.softDelete(g.id);
    service.setSession('active');
    service.setSession('none');
    await sleep(30);
    expect(await db.all('SELECT id FROM goals')).toHaveLength(0);
  });
});
