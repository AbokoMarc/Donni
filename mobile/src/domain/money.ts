import {addDays, monthOf, monthRange, startOfWeek} from './dates';
import {formatDayMonth, formatMonthShort} from './format';
import type {
  Account,
  Budget,
  Transaction,
  TransactionCategory,
} from './types';

export const BUDGET_THRESHOLDS = [80, 100] as const;

export const CATEGORY_LABELS: Record<TransactionCategory, string> = {
  alimentation: 'Alimentation',
  transport: 'Transport',
  logement: 'Logement',
  sante: 'Santé',
  etudes: 'Études',
  travail: 'Travail',
  loisirs: 'Loisirs',
  famille: 'Famille',
  abonnements: 'Abonnements',
  revenus: 'Revenus',
  autres: 'Autres',
};

export const EXPENSE_CATEGORIES: TransactionCategory[] = [
  'alimentation',
  'transport',
  'logement',
  'sante',
  'etudes',
  'travail',
  'loisirs',
  'famille',
  'abonnements',
  'autres',
];

export type AccountSums = Readonly<Record<string, number>>;

export const UNASSIGNED = '';

export function primaryWallet<T extends Pick<Account, 'kind' | 'createdAt'>>(
  accounts: readonly T[],
): T | null {
  const wallets = accounts
    .filter(a => a.kind === 'wallet')
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  return wallets[0] ?? null;
}

export function sumByAccount(
  transactions: ReadonlyArray<Pick<Transaction, 'accountId' | 'amountXof'>>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of transactions) {
    const key = t.accountId ?? UNASSIGNED;
    out[key] = (out[key] ?? 0) + t.amountXof;
  }
  return out;
}

/** Les mouvements sans compte (ou vers un compte supprimé) sont rattachés au portefeuille principal. */
export function walletBalances(
  accounts: ReadonlyArray<
    Pick<Account, 'id' | 'kind' | 'createdAt' | 'amountXof'>
  >,
  sums: AccountSums,
): Record<string, number> {
  const wallets = accounts.filter(a => a.kind === 'wallet');
  const known = new Set(wallets.map(w => w.id));
  const main = primaryWallet(accounts);
  const out: Record<string, number> = {};
  for (const w of wallets) {
    out[w.id] = w.amountXof + (sums[w.id] ?? 0);
  }
  if (main) {
    for (const [key, value] of Object.entries(sums)) {
      if (!known.has(key)) {
        out[main.id] += value;
      }
    }
  }
  return out;
}

export function totalBalance(
  accounts: ReadonlyArray<
    Pick<Account, 'id' | 'kind' | 'createdAt' | 'amountXof'>
  >,
  sums: AccountSums,
): number {
  const balances = walletBalances(accounts, sums);
  const ids = Object.keys(balances);
  if (ids.length === 0) {
    return Object.values(sums).reduce((a, b) => a + b, 0);
  }
  return ids.reduce((acc, id) => acc + balances[id], 0);
}

export function debtTotal(accounts: ReadonlyArray<Pick<Account, 'kind' | 'amountXof'>>): number {
  return accounts
    .filter(a => a.kind === 'debt')
    .reduce((acc, a) => acc + -Math.abs(a.amountXof), 0);
}

export function creditTotal(accounts: ReadonlyArray<Pick<Account, 'kind' | 'amountXof'>>): number {
  return accounts
    .filter(a => a.kind === 'credit')
    .reduce((acc, a) => acc + Math.abs(a.amountXof), 0);
}

export interface Flow {
  income: number;
  expense: number;
}

export function flowOf(
  transactions: ReadonlyArray<Pick<Transaction, 'amountXof'>>,
): Flow {
  let income = 0;
  let expense = 0;
  for (const t of transactions) {
    if (t.amountXof >= 0) {
      income += t.amountXof;
    } else {
      expense += -t.amountXof;
    }
  }
  return {income, expense};
}

export interface FlowBucket extends Flow {
  key: string;
  label: string;
}

export function flowByWeek(
  transactions: ReadonlyArray<Pick<Transaction, 'day' | 'amountXof'>>,
  from: string,
  to: string,
): FlowBucket[] {
  const buckets = new Map<string, FlowBucket>();
  for (let w = startOfWeek(from); w <= to; w = addDays(w, 7)) {
    buckets.set(w, {key: w, label: formatDayMonth(w), income: 0, expense: 0});
  }
  for (const t of transactions) {
    if (t.day < from || t.day > to) {
      continue;
    }
    const b = buckets.get(startOfWeek(t.day));
    if (b) {
      if (t.amountXof >= 0) {
        b.income += t.amountXof;
      } else {
        b.expense += -t.amountXof;
      }
    }
  }
  return Array.from(buckets.values());
}

export function flowByMonth(
  transactions: ReadonlyArray<Pick<Transaction, 'day' | 'amountXof'>>,
  months: readonly string[],
): FlowBucket[] {
  const buckets = new Map<string, FlowBucket>();
  for (const m of months) {
    buckets.set(m, {key: m, label: formatMonthShort(m), income: 0, expense: 0});
  }
  for (const t of transactions) {
    const b = buckets.get(monthOf(t.day));
    if (b) {
      if (t.amountXof >= 0) {
        b.income += t.amountXof;
      } else {
        b.expense += -t.amountXof;
      }
    }
  }
  return Array.from(buckets.values());
}

export function expensesByCategory(
  transactions: ReadonlyArray<Pick<Transaction, 'amountXof' | 'category'>>,
): Array<{category: TransactionCategory; total: number}> {
  const sums = new Map<TransactionCategory, number>();
  for (const t of transactions) {
    if (t.amountXof < 0) {
      sums.set(t.category, (sums.get(t.category) ?? 0) + -t.amountXof);
    }
  }
  return Array.from(sums, ([category, total]) => ({category, total})).sort(
    (a, b) => b.total - a.total,
  );
}

export type BudgetLevel = 0 | 80 | 100;

export interface BudgetUsage {
  spent: number;
  limit: number;
  ratio: number;
  level: BudgetLevel;
}

export function budgetUsage(
  budget: Pick<Budget, 'month' | 'category' | 'limitXof'>,
  transactions: ReadonlyArray<
    Pick<Transaction, 'day' | 'amountXof' | 'category'>
  >,
): BudgetUsage {
  const {from, to} = monthRange(budget.month);
  let spent = 0;
  for (const t of transactions) {
    if (t.amountXof >= 0 || t.day < from || t.day > to) {
      continue;
    }
    if (budget.category === null || t.category === budget.category) {
      spent += -t.amountXof;
    }
  }
  const ratio = budget.limitXof > 0 ? spent / budget.limitXof : 0;
  const level: BudgetLevel = ratio >= 1 ? 100 : ratio >= 0.8 ? 80 : 0;
  return {spent, limit: budget.limitXof, ratio, level};
}

export interface BudgetAlert {
  budgetId: string;
  level: 80 | 100;
}

export interface BudgetEvaluation {
  alerts: BudgetAlert[];
  /** Niveaux à réenregistrer sur les budgets (montée ou retour sous un seuil). */
  levelUpdates: Array<{budgetId: string; level: BudgetLevel}>;
}

export function evaluateBudgets(
  budgets: ReadonlyArray<
    Pick<Budget, 'id' | 'month' | 'category' | 'limitXof' | 'alertedLevel'>
  >,
  transactions: ReadonlyArray<
    Pick<Transaction, 'day' | 'amountXof' | 'category'>
  >,
): BudgetEvaluation {
  const alerts: BudgetAlert[] = [];
  const levelUpdates: BudgetEvaluation['levelUpdates'] = [];
  for (const b of budgets) {
    const {level} = budgetUsage(b, transactions);
    if (level > b.alertedLevel) {
      alerts.push({budgetId: b.id, level: level as 80 | 100});
      levelUpdates.push({budgetId: b.id, level});
    } else if (level < b.alertedLevel) {
      levelUpdates.push({budgetId: b.id, level});
    }
  }
  return {alerts, levelUpdates};
}
