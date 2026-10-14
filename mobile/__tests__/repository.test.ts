import {LiveQuery} from '../src/db/liveQuery';
import {createRepository} from '../src/db/repository';
import {DEFAULT_SETTINGS} from '../src/db/queries';
import {createTestStore} from './support/nodeSqlite';

async function setup() {
  const ctx = await createTestStore();
  return {...ctx, repo: createRepository(ctx.store)};
}

describe('requêtes ciblées', () => {
  it('tâches du jour, triées, avec récurrences', async () => {
    const {repo} = await setup();
    const t = repo.tables.tasks;
    await t.insert({title: 'Sans heure', day: '2026-10-07'});
    await t.insert({title: 'Tard', day: '2026-10-07', startTime: '18:00'});
    await t.insert({title: 'Tôt', day: '2026-10-07', startTime: '07:00'});
    await t.insert({title: 'Autre jour', day: '2026-10-08', startTime: '09:00'});
    await t.insert({title: 'Quotidienne', day: '2026-10-01', startTime: '12:00', recurrence: 'daily'});
    await t.insert({title: 'Lundi', day: '2026-10-05', startTime: '12:30', recurrence: 'weekly:1'});
    const out = await repo.q.tasksForDay('2026-10-07');
    expect(out.map(x => x.title)).toEqual(['Tôt', 'Quotidienne', 'Tard', 'Sans heure']);
    const monday = await repo.q.tasksForDay('2026-10-12');
    expect(monday.map(x => x.title)).toEqual(['Quotidienne', 'Lundi']);
  });

  it('soldes par compte et transactions filtrées', async () => {
    const {repo} = await setup();
    const w = await repo.tables.accounts.insert({label: 'Principal', kind: 'wallet', amountXof: 10000});
    const tx = repo.tables.transactions;
    await tx.insert({accountId: w.id, day: '2026-10-05', label: 'Salaire', amountXof: 5000, category: 'revenus'});
    await tx.insert({accountId: w.id, day: '2026-10-06', label: 'Loyer 50%', amountXof: -2200, category: 'logement'});
    await tx.insert({day: '2026-10-07', label: 'Épicerie', amountXof: -1200, category: 'alimentation'});
    const removed = await tx.insert({day: '2026-10-07', label: 'Erreur', amountXof: -999});
    await tx.softDelete(removed.id);
    expect(await repo.q.balanceSums()).toEqual({[w.id]: 2800, '': -1200});
    expect((await repo.q.transactions()).map(x => x.label)).toEqual(['Épicerie', 'Loyer 50%', 'Salaire']);
    expect(await repo.q.transactions({category: 'logement'})).toHaveLength(1);
    expect(await repo.q.transactions({from: '2026-10-06', to: '2026-10-06'})).toHaveLength(1);
    expect((await repo.q.transactions({text: '50%'}))[0].label).toBe('Loyer 50%');
    expect(await repo.q.transactions({text: '%'})).toHaveLength(1);
    expect(await repo.q.transactions({limit: 1, offset: 1})).toHaveLength(1);
    expect(await repo.q.transactionsForMonth('2026-10')).toHaveLength(3);
  });

  it('énergie, contacts, étapes, habitudes', async () => {
    const {repo} = await setup();
    await repo.tables.energy.insert({day: '2026-10-07', metric: 'sleep', label: 'Sommeil', value: 5.5, target: 6});
    await repo.tables.energy.insert({day: '2026-10-06', metric: 'sleep', label: 'Sommeil', value: 7});
    expect(await repo.q.energyForDay('2026-10-07')).toHaveLength(1);
    expect(await repo.q.energyInRange('2026-10-01', '2026-10-31')).toHaveLength(2);

    await repo.tables.contacts.insert({name: 'zoé'});
    await repo.tables.contacts.insert({name: 'Aminata'});
    expect((await repo.q.contacts()).map(c => c.name)).toEqual(['Aminata', 'zoé']);

    const g = await repo.tables.goals.insert({title: 'Objectif'});
    await repo.tables.goalSteps.insert({goalId: g.id, title: 'B', position: 1});
    await repo.tables.goalSteps.insert({goalId: g.id, title: 'A', position: 0});
    await repo.tables.goalSteps.insert({goalId: 'autre', title: 'Z'});
    expect((await repo.q.stepsOfGoal(g.id)).map(s => s.title)).toEqual(['A', 'B']);

    await repo.tables.habits.insert({title: 'Lire'});
    await repo.tables.habits.insert({title: 'Ancienne', archived: true});
    expect(await repo.q.habits()).toHaveLength(1);
    expect(await repo.q.habits(true)).toHaveLength(2);
  });

  it('objectifs : en cours avant terminés, par échéance', async () => {
    const {repo} = await setup();
    await repo.tables.goals.insert({title: 'Fini', status: 'done', dueDate: '2026-01-01'});
    await repo.tables.goals.insert({title: 'Sans date'});
    await repo.tables.goals.insert({title: 'Proche', dueDate: '2026-10-10'});
    await repo.tables.goals.insert({title: 'Loin', dueDate: '2026-12-10'});
    expect((await repo.q.goals()).map(g => g.title)).toEqual(['Proche', 'Loin', 'Sans date', 'Fini']);
  });

  it('réglages : valeurs par défaut puis enregistrement unique', async () => {
    const {repo} = await setup();
    expect(await repo.q.settings()).toEqual(DEFAULT_SETTINGS);
    await repo.saveSettings({quietStart: '22:00', quietEnd: '07:00'});
    await repo.saveSettings({dailyBriefAt: '07:30'});
    expect(await repo.tables.settings.count()).toBe(1);
    const s = await repo.q.settings();
    expect(s.quietStart).toBe('22:00');
    expect(s.dailyBriefAt).toBe('07:30');
  });
});

describe('actions composées', () => {
  it('enregistre une interaction et replanifie le contact', async () => {
    const {repo} = await setup();
    const c = await repo.tables.contacts.insert({
      name: 'Maman', frequencyKind: 'monthly', frequencyDay: 1, frequencyTime: '10:00',
    });
    const at = new Date(2026, 9, 7, 9, 0);
    await repo.recordInteraction(c.id, 'call', at, 'Appel du soir');
    const after = await repo.tables.contacts.get(c.id);
    expect(after?.lastContactAt).toBe(at.toISOString().replace('.000Z', 'Z'));
    expect(new Date(after?.nextContactAt as string).getMonth()).toBe(10);
    expect(await repo.q.interactionsOfContact(c.id)).toHaveLength(1);
    await expect(repo.recordInteraction('absent', 'call')).rejects.toThrow('Contact introuvable');
    expect(await repo.tables.contactInteractions.count()).toBe(1);
  });

  it('crée ou met à jour le compteur d\'habitude du jour', async () => {
    const {repo} = await setup();
    const h = await repo.tables.habits.insert({title: 'Eau'});
    await repo.setHabitCount(h.id, '2026-10-07', 1);
    await repo.setHabitCount(h.id, '2026-10-07', 3);
    const logs = await repo.q.habitLogsInRange('2026-10-01', '2026-10-31', h.id);
    expect(logs).toHaveLength(1);
    expect(logs[0].count).toBe(3);
  });

  it('applique une réorganisation en une transaction', async () => {
    const {repo} = await setup();
    const a = await repo.tables.tasks.insert({title: 'A', day: '2026-10-07', startTime: '07:00', endTime: '09:00'});
    const b = await repo.tables.tasks.insert({title: 'B', day: '2026-10-07', startTime: '09:00', endTime: '10:30'});
    await repo.applyPlacements([
      {id: b.id, startTime: '07:00', endTime: '08:30', position: 0},
      {id: a.id, startTime: '08:30', endTime: '10:30', position: 1},
    ]);
    expect((await repo.q.tasksForDay('2026-10-07')).map(t => t.title)).toEqual(['B', 'A']);
  });

  it('calcule le bilan hebdomadaire depuis la base', async () => {
    const {repo} = await setup();
    await repo.tables.tasks.insert({title: 'A', day: '2026-10-06', startTime: '09:00', endTime: '11:00', status: 'done'});
    await repo.tables.tasks.insert({title: 'B', day: '2026-10-07', startTime: '09:00', endTime: '10:00'});
    await repo.tables.budgets.insert({month: '2026-10', limitXof: 150000});
    await repo.tables.transactions.insert({day: '2026-10-02', label: 'Courses', amountXof: -30000});
    await repo.tables.transactions.insert({day: '2026-10-06', label: 'Transport', amountXof: -2000});
    const review = await repo.q.weeklyReview('2026-10-08');
    expect(review.weekStart).toBe('2026-10-05');
    expect(review.time.ratio).toBe(67);
    expect(review.money.expenseXof).toBe(2000);
    expect(review.money.monthExpenseXof).toBe(32000);
  });
});

describe('LiveQuery', () => {
  const tick = () => new Promise<void>(resolve => setTimeout(resolve, 5));

  it('charge à l\'abonnement puis relit après chaque écriture ciblée', async () => {
    const {repo, store} = await setup();
    const q = new LiveQuery(store.bus, ['goals'], () => repo.tables.goals.list());
    expect(q.getSnapshot().status).toBe('loading');
    let notified = 0;
    const off = q.subscribe(() => (notified += 1));
    await tick();
    expect(q.getSnapshot().status).toBe('ready');
    expect(q.getSnapshot().data).toEqual([]);
    await repo.tables.goals.insert({title: 'A'});
    await tick();
    expect(q.getSnapshot().data).toHaveLength(1);
    await repo.tables.notes.insert({title: 'Sans rapport'});
    await tick();
    expect(notified).toBe(2);
    off();
    await repo.tables.goals.insert({title: 'B'});
    await tick();
    expect(q.getSnapshot().data).toHaveLength(1);
  });

  it('garde une identité de snapshot stable entre deux lectures', async () => {
    const {repo, store} = await setup();
    const q = new LiveQuery(store.bus, ['goals'], () => repo.tables.goals.list());
    expect(q.getSnapshot()).toBe(q.getSnapshot());
  });

  it('signale les erreurs sans perdre les données précédentes', async () => {
    const {store} = await setup();
    let fail = false;
    const q = new LiveQuery(store.bus, ['goals'], async () => {
      if (fail) {
        throw new Error('boom');
      }
      return 1;
    });
    q.subscribe(() => undefined);
    await tick();
    fail = true;
    await q.refresh();
    expect(q.getSnapshot().status).toBe('error');
    expect(q.getSnapshot().data).toBe(1);
  });
});
