import {monthOf, toDay} from '../domain/dates';
import {CATEGORY_LABELS, evaluateBudgets} from '../domain/money';
import {formatXof} from '../domain/format';
import type {EntityName} from '../domain/types';
import type {WriteOrigin} from '../db/bus';
import type {Repository} from '../db/repository';
import type {NotificationPort} from '../notifications/port';
import type {ReminderScheduler} from '../notifications/ReminderScheduler';

const DERIVING: readonly EntityName[] = ['tasks', 'habits', 'habitLogs', 'goals', 'contacts', 'settings'];
const MONEY: readonly EntityName[] = ['transactions', 'budgets'];

export interface EffectsDeps {
  repo: Repository;
  scheduler: ReminderScheduler;
  port: NotificationPort;
  onUserWrite: () => void;
  now?: () => Date;
  deriveDelayMs?: number;
}

export async function checkBudgets(
  repo: Repository,
  port: NotificationPort,
  now: Date,
): Promise<void> {
  const month = monthOf(toDay(now));
  const [budgets, transactions] = await Promise.all([
    repo.q.budgetsForMonth(month),
    repo.q.transactionsForMonth(month),
  ]);
  const evaluation = evaluateBudgets(budgets, transactions);
  const byId = new Map(budgets.map(b => [b.id, b]));
  for (const alert of evaluation.alerts) {
    const budget = byId.get(alert.budgetId);
    if (!budget) {
      continue;
    }
    const scope = budget.category ? CATEGORY_LABELS[budget.category] : 'du mois';
    const body =
      alert.level === 100
        ? `Budget ${scope} : limite de ${formatXof(budget.limitXof)} atteinte.`
        : `Budget ${scope} : 80 % de ${formatXof(budget.limitXof)} utilisés.`;
    await port.show({
      id: `budget:${budget.id}:${alert.level}`,
      title: 'Budget',
      body,
      channel: 'alerts',
      data: {targetType: 'budget', targetId: budget.id},
    });
  }
  for (const update of evaluation.levelUpdates) {
    await repo.tables.budgets.update(update.budgetId, {alertedLevel: update.level});
  }
}

/** Branche les écritures locales sur la dérivation des rappels, la synchronisation et les alertes de budget. */
export function startEffects(deps: EffectsDeps): () => void {
  const now = deps.now ?? (() => new Date());
  const delay = deps.deriveDelayMs ?? 800;
  let deriveTimer: ReturnType<typeof setTimeout> | null = null;
  let budgetTimer: ReturnType<typeof setTimeout> | null = null;

  const unsubscribe = deps.repo.bus.subscribe(null, ({entities, origin}: {entities: ReadonlySet<EntityName>; origin: WriteOrigin}) => {
    if (origin === 'derive') {
      return;
    }
    const touches = (names: readonly EntityName[]) => names.some(n => entities.has(n));
    if (origin === 'user') {
      deps.onUserWrite();
    }
    if (touches(DERIVING)) {
      if (deriveTimer) {
        clearTimeout(deriveTimer);
      }
      deriveTimer = setTimeout(() => {
        deriveTimer = null;
        void deps.scheduler.refresh().catch(() => undefined);
      }, delay);
    }
    if (origin === 'user' && touches(MONEY)) {
      if (budgetTimer) {
        clearTimeout(budgetTimer);
      }
      budgetTimer = setTimeout(() => {
        budgetTimer = null;
        void checkBudgets(deps.repo, deps.port, now()).catch(() => undefined);
      }, 400);
    }
  });

  return () => {
    unsubscribe();
    if (deriveTimer) {
      clearTimeout(deriveTimer);
    }
    if (budgetTimer) {
      clearTimeout(budgetTimer);
    }
  };
}
