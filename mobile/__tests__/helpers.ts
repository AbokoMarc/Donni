import type {
  Account,
  BaseFields,
  Contact,
  Goal,
  Habit,
  Task,
  Transaction,
} from '../src/domain/types';

let counter = 0;

export function base(overrides: Partial<BaseFields> = {}): BaseFields {
  counter += 1;
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    version: 0,
    createdAt: '2026-10-01T08:00:00Z',
    updatedAt: '2026-10-01T08:00:00Z',
    deletedAt: null,
    dirty: false,
    localSeq: 0,
    ...overrides,
  };
}

export function makeTask(o: Partial<Task> = {}): Task {
  return {
    ...base(),
    title: 'Tâche',
    notes: null,
    kind: 'task',
    day: '2026-10-07',
    startTime: null,
    endTime: null,
    durationMin: null,
    priority: 1,
    status: 'todo',
    position: 0,
    recurrence: null,
    goalId: null,
    remindBeforeMin: null,
    ...o,
  };
}

export function makeContact(o: Partial<Contact> = {}): Contact {
  return {
    ...base(),
    name: 'Aminata',
    relation: 'client',
    phone: null,
    note: null,
    frequencyKind: 'none',
    frequencyDay: null,
    frequencyTime: null,
    lastContactAt: null,
    nextContactAt: null,
    ...o,
  };
}

export function makeGoal(o: Partial<Goal> = {}): Goal {
  return {
    ...base(),
    title: 'Objectif',
    status: 'doing',
    dueDate: null,
    notes: null,
    progressManual: null,
    ...o,
  };
}

export function makeHabit(o: Partial<Habit> = {}): Habit {
  return {
    ...base(),
    title: 'Lire',
    cadence: 'daily',
    targetPerPeriod: 1,
    remindAt: null,
    goalId: null,
    archived: false,
    ...o,
  };
}

export function makeAccount(o: Partial<Account> = {}): Account {
  return {
    ...base(),
    label: 'Compte',
    kind: 'wallet',
    provider: null,
    amountXof: 0,
    counterparty: null,
    dueDate: null,
    note: null,
    ...o,
  };
}

export function makeTransaction(o: Partial<Transaction> = {}): Transaction {
  return {
    ...base(),
    accountId: null,
    day: '2026-10-07',
    label: 'Achat',
    amountXof: -1000,
    category: 'autres',
    note: null,
    ...o,
  };
}
