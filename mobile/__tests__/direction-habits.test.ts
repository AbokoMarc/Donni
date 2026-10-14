import {averageProgress, featuredSkill, goalProgress} from '../src/domain/direction';
import {bestStreak, currentStreak, periodProgress} from '../src/domain/habits';
import {buildWeeklyReview} from '../src/domain/review';
import {normalize, searchAll} from '../src/domain/search';

describe('direction', () => {
  it('calcule la progression depuis les étapes', () => {
    expect(goalProgress({status: 'doing', progressManual: 10}, [{done: true}, {done: false}, {done: true}, {done: true}, {done: false}])).toBe(60);
  });
  it('retombe sur la valeur manuelle ou le statut', () => {
    expect(goalProgress({status: 'doing', progressManual: 35}, [])).toBe(35);
    expect(goalProgress({status: 'done', progressManual: null}, [])).toBe(100);
    expect(goalProgress({status: 'todo', progressManual: null}, [])).toBe(0);
    expect(goalProgress({status: 'doing', progressManual: 140}, [])).toBe(100);
  });
  it('moyenne et compétence mise en avant', () => {
    expect(averageProgress([60, 0])).toBe(30);
    expect(averageProgress([])).toBe(0);
    expect(featuredSkill([{updatedAt: '2026-10-01T00:00:00Z', n: 1}, {updatedAt: '2026-10-05T00:00:00Z', n: 2}])?.n).toBe(2);
    expect(featuredSkill([])).toBeNull();
  });
});

describe('habitudes', () => {
  const daily = {cadence: 'daily' as const, targetPerPeriod: 1};
  const logs = [
    {day: '2026-10-07', count: 1},
    {day: '2026-10-06', count: 1},
    {day: '2026-10-05', count: 2},
    {day: '2026-10-03', count: 1},
    {day: '2026-10-02', count: 1},
  ];
  it('compte la série en cours', () => {
    expect(currentStreak(daily, logs, '2026-10-07')).toBe(3);
  });
  it('ne casse pas la série tant que la journée n\'est pas finie', () => {
    expect(currentStreak(daily, logs.slice(1), '2026-10-07')).toBe(2);
    expect(currentStreak(daily, [], '2026-10-07')).toBe(0);
    expect(currentStreak(daily, logs, '2026-10-09')).toBe(0);
  });
  it('trouve la meilleure série', () => {
    expect(bestStreak(daily, logs)).toBe(3);
    expect(bestStreak(daily, [])).toBe(0);
  });
  it('gère les habitudes hebdomadaires', () => {
    const weekly = {cadence: 'weekly' as const, targetPerPeriod: 3};
    const wl = [
      {day: '2026-09-21', count: 1},
      {day: '2026-09-23', count: 2},
      {day: '2026-09-29', count: 3},
      {day: '2026-10-05', count: 1},
    ];
    expect(periodProgress(weekly, wl, '2026-10-07')).toEqual({count: 1, target: 3, done: false});
    expect(currentStreak(weekly, wl, '2026-10-07')).toBe(2);
    expect(bestStreak(weekly, wl)).toBe(2);
  });
});

describe('bilan hebdomadaire', () => {
  it('agrège les données de la semaine', () => {
    const review = buildWeeklyReview({
      weekStart: '2026-10-05',
      tasks: [
        {status: 'done', startTime: '09:00', endTime: '11:00', durationMin: null},
        {status: 'todo', startTime: '14:00', endTime: '15:00', durationMin: null},
        {status: 'skipped', startTime: '16:00', endTime: '17:00', durationMin: null},
      ],
      transactions: [{amountXof: 5000}, {amountXof: -2000}],
      energy: [{metric: 'mood', value: 7}, {metric: 'focus', value: 8}, {metric: 'sleep', value: 6}],
      goals: {done: 3, total: 5},
      interactions: 4,
      monthlyBudgetXof: 150000,
      monthExpenseXof: 128500,
    });
    expect(review.weekEnd).toBe('2026-10-11');
    expect(review.time).toEqual({plannedMin: 180, doneMin: 120, ratio: 67});
    expect(review.money.expenseXof).toBe(2000);
    expect(review.energy).toEqual({average: 7.5, samples: 2});
    expect(review.observations).toContain('Tu as réalisé 67 % de ton planning cette semaine.');
    expect(review.observations).toContain('Tu as utilisé 86 % de ton budget du mois.');
    expect(review.observations).toContain('4 échanges avec ton réseau cette semaine.');
  });
  it('reste sobre sans donnée', () => {
    const review = buildWeeklyReview({
      weekStart: '2026-10-05', tasks: [], transactions: [], energy: [],
      goals: {done: 0, total: 0}, interactions: 0, monthlyBudgetXof: null, monthExpenseXof: null,
    });
    expect(review.time.ratio).toBeNull();
    expect(review.energy.average).toBeNull();
    expect(review.observations).toEqual(["Aucun échange avec ton réseau n'est enregistré cette semaine."]);
  });
});

describe('recherche globale', () => {
  it('normalise sans accents', () => {
    expect(normalize('  Éléonore ÇA ')).toBe('eleonore ca');
  });
  it('trouve et classe les résultats', () => {
    const hits = searchAll('paul', {
      contacts: [{id: 'c1', name: 'Paul Nkoulou', note: null, phone: null, relation: 'mentor'}],
      tasks: [{id: 't1', title: 'Appeler Paul', notes: null, day: '2026-10-07', startTime: '10:00'}],
      notes: [{id: 'n1', title: 'Idées', body: 'Parler à paul du projet'}],
      transactions: [{id: 'x1', label: 'Remboursement Paul', note: null, day: '2026-10-06', amountXof: -5000}],
    });
    expect(hits.map(h => h.id)).toEqual(['c1', 't1', 'x1', 'n1']);
    expect(hits[0].subtitle).toBe('Mentor');
    expect(hits[1].subtitle).toBe('Mer. 7 oct. · 10:00');
  });
  it('cherche sans tenir compte des accents ni de la casse', () => {
    const hits = searchAll('ELEONORE', {contacts: [{id: 'c', name: 'Éléonore', note: null, phone: null, relation: 'ami'}]});
    expect(hits).toHaveLength(1);
    expect(searchAll('  ', {})).toEqual([]);
    expect(searchAll('zzz', {contacts: [{id: 'c', name: 'Éléonore', note: null, phone: null, relation: 'ami'}]})).toEqual([]);
  });
  it('exige tous les mots', () => {
    const corpus = {goals: [{id: 'g', title: 'Devenir chef de projet', notes: 'certification PMP'}]};
    expect(searchAll('chef pmp', corpus)).toHaveLength(1);
    expect(searchAll('chef xyz', corpus)).toHaveLength(0);
  });
});
