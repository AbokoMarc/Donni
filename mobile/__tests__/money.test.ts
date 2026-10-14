import {
  budgetUsage,
  creditTotal,
  debtTotal,
  evaluateBudgets,
  expensesByCategory,
  flowByMonth,
  flowByWeek,
  flowOf,
  sumByAccount,
  totalBalance,
  walletBalances,
} from '../src/domain/money';
import {makeAccount, makeTransaction} from './helpers';

describe('soldes', () => {
  const wallet = makeAccount({id: 'w1', amountXof: 10000, createdAt: '2026-01-01T00:00:00Z'});
  const wallet2 = makeAccount({id: 'w2', amountXof: 500, createdAt: '2026-02-01T00:00:00Z'});

  it('ajoute les mouvements au solde d\'ouverture', () => {
    const txs = [
      makeTransaction({accountId: 'w1', amountXof: 5000}),
      makeTransaction({accountId: 'w1', amountXof: -2500}),
    ];
    expect(walletBalances([wallet], sumByAccount(txs))).toEqual({w1: 12500});
  });

  it('rattache les mouvements sans compte au portefeuille principal', () => {
    const txs = [
      makeTransaction({accountId: null, amountXof: -1000}),
      makeTransaction({accountId: 'inconnu', amountXof: -500}),
      makeTransaction({accountId: 'w2', amountXof: 100}),
    ];
    const sums = sumByAccount(txs);
    expect(walletBalances([wallet2, wallet], sums)).toEqual({w1: 8500, w2: 600});
    expect(totalBalance([wallet, wallet2], sums)).toBe(9100);
  });

  it('calcule sans portefeuille', () => {
    expect(totalBalance([], sumByAccount([makeTransaction({amountXof: -300})]))).toBe(-300);
  });

  it('totalise dettes et crédits', () => {
    const accounts = [
      makeAccount({kind: 'debt', amountXof: -3200}),
      makeAccount({kind: 'debt', amountXof: 200}),
      makeAccount({kind: 'credit', amountXof: 1000}),
    ];
    expect(debtTotal(accounts)).toBe(-3400);
    expect(creditTotal(accounts)).toBe(1000);
  });
});

describe('flux', () => {
  const txs = [
    makeTransaction({day: '2026-10-05', amountXof: 5000}),
    makeTransaction({day: '2026-10-06', amountXof: -2200}),
    makeTransaction({day: '2026-10-14', amountXof: -1200}),
    makeTransaction({day: '2026-09-30', amountXof: -700}),
  ];
  it('totalise entrées et sorties', () => {
    expect(flowOf(txs)).toEqual({income: 5000, expense: 4100});
  });
  it('regroupe par semaine', () => {
    const buckets = flowByWeek(txs, '2026-09-30', '2026-10-15');
    expect(buckets.map(b => b.key)).toEqual(['2026-09-28', '2026-10-05', '2026-10-12']);
    expect(buckets[0].expense).toBe(700);
    expect(buckets[1]).toEqual({key: '2026-10-05', label: '05 oct.', income: 5000, expense: 2200});
    expect(buckets[2].expense).toBe(1200);
  });
  it('regroupe par mois', () => {
    const buckets = flowByMonth(txs, ['2026-09', '2026-10']);
    expect(buckets.map(b => [b.label, b.expense])).toEqual([['Sept.', 700], ['Oct.', 3400]]);
  });
  it('classe les dépenses par catégorie', () => {
    const out = expensesByCategory([
      makeTransaction({amountXof: -500, category: 'transport'}),
      makeTransaction({amountXof: -1500, category: 'alimentation'}),
      makeTransaction({amountXof: -500, category: 'transport'}),
      makeTransaction({amountXof: 9000, category: 'revenus'}),
    ]);
    expect(out).toEqual([
      {category: 'alimentation', total: 1500},
      {category: 'transport', total: 1000},
    ]);
  });
});

describe('budgets', () => {
  const txs = [
    makeTransaction({day: '2026-10-02', amountXof: -80000, category: 'alimentation'}),
    makeTransaction({day: '2026-10-03', amountXof: -20000, category: 'transport'}),
    makeTransaction({day: '2026-09-30', amountXof: -90000, category: 'alimentation'}),
    makeTransaction({day: '2026-10-04', amountXof: 50000, category: 'revenus'}),
  ];
  it('mesure l\'usage global et par catégorie', () => {
    const global = budgetUsage({month: '2026-10', category: null, limitXof: 125000}, txs);
    expect(global.spent).toBe(100000);
    expect(global.level).toBe(80);
    const food = budgetUsage({month: '2026-10', category: 'alimentation', limitXof: 80000}, txs);
    expect(food.level).toBe(100);
    const none = budgetUsage({month: '2026-10', category: 'loisirs', limitXof: 10}, txs);
    expect(none.level).toBe(0);
  });
  it('n\'alerte qu\'à la montée de seuil', () => {
    const budgets = [
      {id: 'a', month: '2026-10', category: null, limitXof: 125000, alertedLevel: 0 as const},
      {id: 'b', month: '2026-10', category: 'alimentation' as const, limitXof: 80000, alertedLevel: 100 as const},
      {id: 'c', month: '2026-10', category: 'transport' as const, limitXof: 20000, alertedLevel: 80 as const},
      {id: 'd', month: '2026-10', category: 'transport' as const, limitXof: 200000, alertedLevel: 80 as const},
    ];
    const ev = evaluateBudgets(budgets, txs);
    expect(ev.alerts).toEqual([{budgetId: 'a', level: 80}, {budgetId: 'c', level: 100}]);
    expect(ev.levelUpdates).toEqual([
      {budgetId: 'a', level: 80},
      {budgetId: 'c', level: 100},
      {budgetId: 'd', level: 0},
    ]);
  });
});
