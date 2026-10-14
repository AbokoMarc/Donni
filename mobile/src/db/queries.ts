import {addDays, monthRange} from '../domain/dates';
import type {AccountSums} from '../domain/money';
import {buildWeeklyReview} from '../domain/review';
import type {WeeklyReviewPayload} from '../domain/review';
import {occursOn} from '../domain/recurrence';
import type {SearchCorpus} from '../domain/search';
import type {
  Account,
  Budget,
  Contact,
  ContactInteraction,
  EnergyLog,
  Goal,
  GoalStep,
  Habit,
  HabitLog,
  Note,
  Reminder,
  Settings,
  SettingsData,
  Skill,
  Task,
  Transaction,
  TransactionCategory,
} from '../domain/types';
import {monthOf, startOfWeek} from '../domain/dates';
import type {Reader} from './store';

export const DEFAULT_SETTINGS: SettingsData = {
  focusMode: false,
  whatsappOptIn: false,
  language: 'fr',
  quietStart: null,
  quietEnd: null,
  dailyBriefAt: null,
};

export interface TransactionFilter {
  from?: string;
  to?: string;
  category?: TransactionCategory;
  text?: string;
  limit?: number;
  offset?: number;
}

const escapeLike = (s: string): string => s.replace(/[\\%_]/g, m => `\\${m}`);

export function createQueries(r: Reader) {
  const queries = {
    async tasksForDay(day: string): Promise<Task[]> {
      const rows = await r.select('tasks', {
        where: '"day" = ? OR ("recurrence" IS NOT NULL AND "day" < ?)',
        params: [day, day],
        orderBy:
          'CASE WHEN "start_time" IS NULL THEN 1 ELSE 0 END, "start_time", "position", "created_at"',
      });
      return rows.filter(t => occursOn(t, day));
    },

    tasksInRange(from: string, to: string): Promise<Task[]> {
      return r.select('tasks', {
        where: '"day" BETWEEN ? AND ?',
        params: [from, to],
        orderBy: '"day", "start_time", "position"',
      });
    },

    tasksForReminders(today: string): Promise<Task[]> {
      return r.select('tasks', {
        where: `"status" IN ('todo', 'doing') AND ("day" >= ? OR "recurrence" IS NOT NULL)`,
        params: [today],
      });
    },

    accounts(): Promise<Account[]> {
      return r.select('accounts', {orderBy: '"created_at"'});
    },

    async balanceSums(): Promise<AccountSums> {
      const rows = await r.rawAll(
        'SELECT "account_id" AS id, SUM("amount_xof") AS total FROM "transactions" WHERE "deleted_at" IS NULL GROUP BY "account_id"',
      );
      const out: Record<string, number> = {};
      for (const row of rows) {
        out[row.id == null ? '' : String(row.id)] = Number(row.total);
      }
      return out;
    },

    transactions(filter: TransactionFilter = {}): Promise<Transaction[]> {
      const clauses: string[] = [];
      const params: Array<string | number> = [];
      if (filter.from) {
        clauses.push('"day" >= ?');
        params.push(filter.from);
      }
      if (filter.to) {
        clauses.push('"day" <= ?');
        params.push(filter.to);
      }
      if (filter.category) {
        clauses.push('"category" = ?');
        params.push(filter.category);
      }
      if (filter.text) {
        clauses.push(`"label" LIKE ? ESCAPE '\\'`);
        params.push(`%${escapeLike(filter.text)}%`);
      }
      return r.select('transactions', {
        where: clauses.length > 0 ? clauses.join(' AND ') : undefined,
        params,
        orderBy: '"day" DESC, "created_at" DESC',
        limit: filter.limit,
        offset: filter.offset,
      });
    },

    transactionsForMonth(month: string): Promise<Transaction[]> {
      const {from, to} = monthRange(month);
      return queries.transactions({from, to});
    },

    budgetsForMonth(month: string): Promise<Budget[]> {
      return r.select('budgets', {where: '"month" = ?', params: [month], orderBy: '"created_at"'});
    },

    energyForDay(day: string): Promise<EnergyLog[]> {
      return r.select('energy', {where: '"day" = ?', params: [day], orderBy: '"created_at"'});
    },

    energyInRange(from: string, to: string): Promise<EnergyLog[]> {
      return r.select('energy', {
        where: '"day" BETWEEN ? AND ?',
        params: [from, to],
        orderBy: '"day"',
      });
    },

    contacts(): Promise<Contact[]> {
      return r.select('contacts', {orderBy: '"name" COLLATE NOCASE'});
    },

    interactionsOfContact(contactId: string, limit = 50): Promise<ContactInteraction[]> {
      return r.select('contactInteractions', {
        where: '"contact_id" = ?',
        params: [contactId],
        orderBy: '"at" DESC',
        limit,
      });
    },

    interactionsInRange(fromIso: string, toIso: string): Promise<ContactInteraction[]> {
      return r.select('contactInteractions', {
        where: '"at" >= ? AND "at" < ?',
        params: [fromIso, toIso],
        orderBy: '"at" DESC',
      });
    },

    goals(): Promise<Goal[]> {
      return r.select('goals', {
        orderBy:
          'CASE WHEN "status" = \'done\' THEN 1 ELSE 0 END, "due_date" IS NULL, "due_date", "created_at"',
      });
    },

    stepsOfGoal(goalId: string): Promise<GoalStep[]> {
      return r.select('goalSteps', {
        where: '"goal_id" = ?',
        params: [goalId],
        orderBy: '"position", "created_at"',
      });
    },

    allSteps(): Promise<GoalStep[]> {
      return r.select('goalSteps', {orderBy: '"position", "created_at"'});
    },

    habits(includeArchived = false): Promise<Habit[]> {
      return r.select('habits', {
        where: includeArchived ? undefined : '"archived" = 0',
        orderBy: '"created_at"',
      });
    },

    habitLogsInRange(from: string, to: string, habitId?: string): Promise<HabitLog[]> {
      return r.select('habitLogs', {
        where: habitId ? '"day" BETWEEN ? AND ? AND "habit_id" = ?' : '"day" BETWEEN ? AND ?',
        params: habitId ? [from, to, habitId] : [from, to],
        orderBy: '"day"',
      });
    },

    skills(): Promise<Skill[]> {
      return r.select('skills', {orderBy: '"updated_at" DESC'});
    },

    notes(limit = 50, offset = 0): Promise<Note[]> {
      return r.select('notes', {orderBy: '"updated_at" DESC', limit, offset});
    },

    notesFor(targetType: string, targetId: string): Promise<Note[]> {
      return r.select('notes', {
        where: '"target_type" = ? AND "target_id" = ?',
        params: [targetType, targetId],
        orderBy: '"updated_at" DESC',
      });
    },

    reminders(): Promise<Reminder[]> {
      return r.select('reminders', {orderBy: '"fire_at"'});
    },

    lastWhatsappReminder(): Promise<Reminder | null> {
      return r
        .select('reminders', {
          where: '"whatsapp_sent_at" IS NOT NULL',
          orderBy: '"whatsapp_sent_at" DESC',
          limit: 1,
        })
        .then(rows => rows[0] ?? null);
    },

    async settingsRow(): Promise<Settings | null> {
      const rows = await r.select('settings', {orderBy: '"updated_at" DESC', limit: 1});
      return rows[0] ?? null;
    },

    async settings(): Promise<SettingsData> {
      const row = await queries.settingsRow();
      return row
        ? {
            focusMode: row.focusMode,
            whatsappOptIn: row.whatsappOptIn,
            language: row.language,
            quietStart: row.quietStart,
            quietEnd: row.quietEnd,
            dailyBriefAt: row.dailyBriefAt,
          }
        : DEFAULT_SETTINGS;
    },

    async searchCorpus(): Promise<SearchCorpus> {
      const [contacts, tasks, notes, transactions, goals, habits, skills] = await Promise.all([
        r.select('contacts'),
        r.select('tasks', {orderBy: '"day" DESC', limit: 500}),
        r.select('notes', {orderBy: '"updated_at" DESC', limit: 500}),
        r.select('transactions', {orderBy: '"day" DESC', limit: 1000}),
        r.select('goals'),
        r.select('habits'),
        r.select('skills'),
      ]);
      return {contacts, tasks, notes, transactions, goals, habits, skills};
    },

    async weeklyReview(weekStart: string): Promise<WeeklyReviewPayload> {
      const monday = startOfWeek(weekStart);
      const sunday = addDays(monday, 6);
      const month = monthOf(monday);
      const [tasks, txs, energy, goals, interactions, budgets, monthTxs] = await Promise.all([
        queries.tasksInRange(monday, sunday),
        queries.transactions({from: monday, to: sunday}),
        queries.energyInRange(monday, sunday),
        r.select('goals'),
        queries.interactionsInRange(
          new Date(monday + 'T00:00:00').toISOString(),
          new Date(addDays(sunday, 1) + 'T00:00:00').toISOString(),
        ),
        queries.budgetsForMonth(month),
        queries.transactionsForMonth(month),
      ]);
      const globalBudget = budgets.find(b => b.category === null) ?? null;
      const monthExpense = monthTxs
        .filter(t => t.amountXof < 0)
        .reduce((sum, t) => sum - t.amountXof, 0);
      return buildWeeklyReview({
        weekStart: monday,
        tasks,
        transactions: txs,
        energy,
        goals: {done: goals.filter(g => g.status === 'done').length, total: goals.length},
        interactions: interactions.length,
        monthlyBudgetXof: globalBudget ? globalBudget.limitXof : null,
        monthExpenseXof: globalBudget ? monthExpense : null,
      });
    },
  };
  return queries;
}

export type Queries = ReturnType<typeof createQueries>;
