import type {EntityName} from '../domain/types';

export type FieldKind = 'text' | 'int' | 'real' | 'bool' | 'json';
export type FieldFormat = 'time' | 'day' | 'month' | 'instant';

export interface FieldDef {
  name: string;
  column: string;
  kind: FieldKind;
  required: boolean;
  /** Colonne propre au téléphone, absente du protocole de synchronisation. */
  local: boolean;
  def?: unknown;
  oneOf?: readonly (string | number)[];
  min?: number;
  max?: number;
  format?: FieldFormat;
}

export interface EntityDef {
  name: EntityName;
  table: string;
  fields: FieldDef[];
  indexes: string[][];
}

export function toSnake(name: string): string {
  return name.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);
}

interface Opt {
  req?: boolean;
  def?: unknown;
  local?: boolean;
  oneOf?: readonly (string | number)[];
  min?: number;
  max?: number;
  format?: FieldFormat;
}

function f(name: string, kind: FieldKind, o: Opt = {}): FieldDef {
  return {
    name,
    column: toSnake(name),
    kind,
    required: o.req === true,
    local: o.local === true,
    def: o.def,
    oneOf: o.oneOf,
    min: o.min,
    max: o.max,
    format: o.format,
  };
}

const TASK_KINDS = ['task', 'routine', 'focus', 'break', 'event'] as const;
const TASK_STATUS = ['todo', 'doing', 'done', 'skipped'] as const;
const TARGETS = ['task', 'goal', 'habit', 'contact', 'budget', 'custom'] as const;
const REMINDER_STATUS = ['scheduled', 'fired', 'dismissed', 'snoozed'] as const;
const GOAL_STATUS = ['todo', 'doing', 'done'] as const;
const CADENCES = ['daily', 'weekly'] as const;
const ACCOUNT_KINDS = ['wallet', 'debt', 'credit'] as const;
const CATEGORIES = [
  'alimentation',
  'transport',
  'logement',
  'sante',
  'etudes',
  'travail',
  'loisirs',
  'famille',
  'abonnements',
  'revenus',
  'autres',
] as const;
const RELATIONS = [
  'famille',
  'ami',
  'mentor',
  'collegue',
  'client',
  'partenaire',
  'autre',
] as const;
const FREQUENCIES = ['none', 'weekly', 'biweekly', 'monthly'] as const;
const CHANNELS = ['call', 'whatsapp', 'meeting', 'other'] as const;

export const ENTITIES: Record<EntityName, EntityDef> = {
  tasks: {
    name: 'tasks',
    table: 'tasks',
    fields: [
      f('title', 'text', {req: true}),
      f('notes', 'text'),
      f('kind', 'text', {def: 'task', oneOf: TASK_KINDS}),
      f('day', 'text', {req: true, format: 'day'}),
      f('startTime', 'text', {format: 'time'}),
      f('endTime', 'text', {format: 'time'}),
      f('durationMin', 'int', {min: 0}),
      f('priority', 'int', {def: 1, min: 0, max: 2}),
      f('status', 'text', {def: 'todo', oneOf: TASK_STATUS}),
      f('position', 'int', {def: 0}),
      f('recurrence', 'text'),
      f('goalId', 'text'),
      f('remindBeforeMin', 'int', {min: 0}),
    ],
    indexes: [['day'], ['status']],
  },
  reminders: {
    name: 'reminders',
    table: 'reminders',
    fields: [
      f('targetType', 'text', {req: true, oneOf: TARGETS}),
      f('targetId', 'text'),
      f('label', 'text', {req: true}),
      f('fireAt', 'text', {req: true, format: 'instant'}),
      f('status', 'text', {def: 'scheduled', oneOf: REMINDER_STATUS}),
      f('viaWhatsapp', 'bool', {def: false}),
      f('whatsappSentAt', 'text', {format: 'instant'}),
      f('kind', 'text', {def: 'plain', local: true, oneOf: ['plain', 'smart']}),
    ],
    indexes: [['fire_at'], ['status']],
  },
  goals: {
    name: 'goals',
    table: 'goals',
    fields: [
      f('title', 'text', {req: true}),
      f('status', 'text', {def: 'todo', oneOf: GOAL_STATUS}),
      f('dueDate', 'text', {format: 'day'}),
      f('notes', 'text'),
      f('progressManual', 'int', {min: 0, max: 100}),
    ],
    indexes: [],
  },
  goalSteps: {
    name: 'goalSteps',
    table: 'goal_steps',
    fields: [
      f('goalId', 'text', {req: true}),
      f('title', 'text', {req: true}),
      f('done', 'bool', {def: false}),
      f('position', 'int', {def: 0}),
    ],
    indexes: [['goal_id']],
  },
  habits: {
    name: 'habits',
    table: 'habits',
    fields: [
      f('title', 'text', {req: true}),
      f('cadence', 'text', {def: 'daily', oneOf: CADENCES}),
      f('targetPerPeriod', 'int', {def: 1, min: 1}),
      f('remindAt', 'text', {format: 'time'}),
      f('goalId', 'text'),
      f('archived', 'bool', {def: false}),
    ],
    indexes: [],
  },
  habitLogs: {
    name: 'habitLogs',
    table: 'habit_logs',
    fields: [
      f('habitId', 'text', {req: true}),
      f('day', 'text', {req: true, format: 'day'}),
      f('count', 'int', {def: 0, min: 0}),
    ],
    indexes: [['habit_id', 'day']],
  },
  accounts: {
    name: 'accounts',
    table: 'accounts',
    fields: [
      f('label', 'text', {req: true}),
      f('kind', 'text', {req: true, oneOf: ACCOUNT_KINDS}),
      f('provider', 'text'),
      f('amountXof', 'int', {def: 0}),
      f('counterparty', 'text'),
      f('dueDate', 'text', {format: 'day'}),
      f('note', 'text'),
    ],
    indexes: [],
  },
  transactions: {
    name: 'transactions',
    table: 'transactions',
    fields: [
      f('accountId', 'text'),
      f('day', 'text', {req: true, format: 'day'}),
      f('label', 'text', {req: true}),
      f('amountXof', 'int', {req: true}),
      f('category', 'text', {def: 'autres', oneOf: CATEGORIES}),
      f('note', 'text'),
    ],
    indexes: [['day'], ['account_id']],
  },
  budgets: {
    name: 'budgets',
    table: 'budgets',
    fields: [
      f('month', 'text', {req: true, format: 'month'}),
      f('category', 'text', {oneOf: CATEGORIES}),
      f('limitXof', 'int', {req: true, min: 1}),
      f('alertedLevel', 'int', {def: 0, oneOf: [0, 80, 100]}),
    ],
    indexes: [['month']],
  },
  energy: {
    name: 'energy',
    table: 'energy_logs',
    fields: [
      f('day', 'text', {req: true, format: 'day'}),
      f('metric', 'text', {req: true}),
      f('label', 'text', {req: true}),
      f('value', 'real'),
      f('valueText', 'text'),
      f('target', 'real'),
      f('unit', 'text'),
    ],
    indexes: [['day']],
  },
  contacts: {
    name: 'contacts',
    table: 'contacts',
    fields: [
      f('name', 'text', {req: true}),
      f('relation', 'text', {def: 'autre', oneOf: RELATIONS}),
      f('phone', 'text'),
      f('note', 'text'),
      f('frequencyKind', 'text', {def: 'none', oneOf: FREQUENCIES}),
      f('frequencyDay', 'int', {min: 0, max: 28}),
      f('frequencyTime', 'text', {format: 'time'}),
      f('lastContactAt', 'text', {format: 'instant'}),
      f('nextContactAt', 'text', {format: 'instant'}),
    ],
    indexes: [],
  },
  contactInteractions: {
    name: 'contactInteractions',
    table: 'contact_interactions',
    fields: [
      f('contactId', 'text', {req: true}),
      f('at', 'text', {req: true, format: 'instant'}),
      f('channel', 'text', {def: 'call', oneOf: CHANNELS}),
      f('note', 'text'),
    ],
    indexes: [['contact_id', 'at']],
  },
  skills: {
    name: 'skills',
    table: 'skills',
    fields: [
      f('name', 'text', {req: true}),
      f('level', 'int', {def: 0, min: 0, max: 100}),
      f('monthlyTargetXof', 'int', {min: 0}),
      f('note', 'text'),
    ],
    indexes: [],
  },
  notes: {
    name: 'notes',
    table: 'notes',
    fields: [
      f('title', 'text', {req: true}),
      f('body', 'text', {def: ''}),
      f('targetType', 'text'),
      f('targetId', 'text'),
    ],
    indexes: [],
  },
  weeklyReviews: {
    name: 'weeklyReviews',
    table: 'weekly_reviews',
    fields: [
      f('weekStart', 'text', {req: true, format: 'day'}),
      f('payload', 'json', {req: true}),
    ],
    indexes: [['week_start']],
  },
  settings: {
    name: 'settings',
    table: 'user_settings',
    fields: [
      f('focusMode', 'bool', {def: false}),
      f('whatsappOptIn', 'bool', {def: false}),
      f('language', 'text', {def: 'fr'}),
      f('quietStart', 'text', {format: 'time'}),
      f('quietEnd', 'text', {format: 'time'}),
      f('dailyBriefAt', 'text', {format: 'time'}),
    ],
    indexes: [],
  },
};

export const ENTITY_NAMES = Object.keys(ENTITIES) as EntityName[];

export function isEntityName(value: string): value is EntityName {
  return Object.prototype.hasOwnProperty.call(ENTITIES, value);
}

export function entityByTable(table: string): EntityDef | null {
  return ENTITY_NAMES.map(n => ENTITIES[n]).find(d => d.table === table) ?? null;
}
