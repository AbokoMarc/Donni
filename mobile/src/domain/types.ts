export type EntityName =
  | 'tasks'
  | 'reminders'
  | 'goals'
  | 'goalSteps'
  | 'habits'
  | 'habitLogs'
  | 'accounts'
  | 'transactions'
  | 'budgets'
  | 'energy'
  | 'contacts'
  | 'contactInteractions'
  | 'skills'
  | 'notes'
  | 'weeklyReviews'
  | 'settings';

export interface BaseFields {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  dirty: boolean;
  localSeq: number;
}

export type TaskKind = 'task' | 'routine' | 'focus' | 'break' | 'event';
export type TaskStatus = 'todo' | 'doing' | 'done' | 'skipped';

export interface TaskData {
  title: string;
  notes: string | null;
  kind: TaskKind;
  day: string;
  startTime: string | null;
  endTime: string | null;
  durationMin: number | null;
  priority: 0 | 1 | 2;
  status: TaskStatus;
  position: number;
  recurrence: string | null;
  goalId: string | null;
  remindBeforeMin: number | null;
}

export type ReminderTargetType =
  | 'task'
  | 'goal'
  | 'habit'
  | 'contact'
  | 'budget'
  | 'custom';
export type ReminderStatus = 'scheduled' | 'fired' | 'dismissed' | 'snoozed';
export type ReminderKind = 'plain' | 'smart';

export interface ReminderData {
  targetType: ReminderTargetType;
  targetId: string | null;
  label: string;
  fireAt: string;
  status: ReminderStatus;
  viaWhatsapp: boolean;
  whatsappSentAt: string | null;
  /** Colonne locale, jamais envoyée au serveur. */
  kind: ReminderKind;
}

export type GoalStatus = 'todo' | 'doing' | 'done';

export interface GoalData {
  title: string;
  status: GoalStatus;
  dueDate: string | null;
  notes: string | null;
  progressManual: number | null;
}

export interface GoalStepData {
  goalId: string;
  title: string;
  done: boolean;
  position: number;
}

export type HabitCadence = 'daily' | 'weekly';

export interface HabitData {
  title: string;
  cadence: HabitCadence;
  targetPerPeriod: number;
  remindAt: string | null;
  goalId: string | null;
  archived: boolean;
}

export interface HabitLogData {
  habitId: string;
  day: string;
  count: number;
}

export type AccountKind = 'wallet' | 'debt' | 'credit';

export interface AccountData {
  label: string;
  kind: AccountKind;
  provider: string | null;
  amountXof: number;
  counterparty: string | null;
  dueDate: string | null;
  note: string | null;
}

export type TransactionCategory =
  | 'alimentation'
  | 'transport'
  | 'logement'
  | 'sante'
  | 'etudes'
  | 'travail'
  | 'loisirs'
  | 'famille'
  | 'abonnements'
  | 'revenus'
  | 'autres';

export interface TransactionData {
  accountId: string | null;
  day: string;
  label: string;
  amountXof: number;
  category: TransactionCategory;
  note: string | null;
}

export interface BudgetData {
  month: string;
  category: TransactionCategory | null;
  limitXof: number;
  alertedLevel: 0 | 80 | 100;
}

export interface EnergyData {
  day: string;
  metric: string;
  label: string;
  value: number | null;
  valueText: string | null;
  target: number | null;
  unit: string | null;
}

export type ContactRelation =
  | 'famille'
  | 'ami'
  | 'mentor'
  | 'collegue'
  | 'client'
  | 'partenaire'
  | 'autre';
export type FrequencyKind = 'none' | 'weekly' | 'biweekly' | 'monthly';

export interface ContactData {
  name: string;
  relation: ContactRelation;
  phone: string | null;
  note: string | null;
  frequencyKind: FrequencyKind;
  frequencyDay: number | null;
  frequencyTime: string | null;
  lastContactAt: string | null;
  nextContactAt: string | null;
}

export type InteractionChannel = 'call' | 'whatsapp' | 'meeting' | 'other';

export interface ContactInteractionData {
  contactId: string;
  at: string;
  channel: InteractionChannel;
  note: string | null;
}

export interface SkillData {
  name: string;
  level: number;
  monthlyTargetXof: number | null;
  note: string | null;
}

export interface NoteData {
  title: string;
  body: string;
  targetType: string | null;
  targetId: string | null;
}

export interface WeeklyReviewData {
  weekStart: string;
  payload: Record<string, unknown>;
}

export interface SettingsData {
  focusMode: boolean;
  whatsappOptIn: boolean;
  language: string;
  quietStart: string | null;
  quietEnd: string | null;
  dailyBriefAt: string | null;
}

export interface EntityData {
  tasks: TaskData;
  reminders: ReminderData;
  goals: GoalData;
  goalSteps: GoalStepData;
  habits: HabitData;
  habitLogs: HabitLogData;
  accounts: AccountData;
  transactions: TransactionData;
  budgets: BudgetData;
  energy: EnergyData;
  contacts: ContactData;
  contactInteractions: ContactInteractionData;
  skills: SkillData;
  notes: NoteData;
  weeklyReviews: WeeklyReviewData;
  settings: SettingsData;
}

export type Entity<K extends EntityName> = BaseFields & EntityData[K];

export interface RequiredOnCreate {
  tasks: 'title' | 'day';
  reminders: 'targetType' | 'label' | 'fireAt';
  goals: 'title';
  goalSteps: 'goalId' | 'title';
  habits: 'title';
  habitLogs: 'habitId' | 'day';
  accounts: 'label' | 'kind';
  transactions: 'day' | 'label' | 'amountXof';
  budgets: 'month' | 'limitXof';
  energy: 'day' | 'metric' | 'label';
  contacts: 'name';
  contactInteractions: 'contactId' | 'at';
  skills: 'name';
  notes: 'title';
  weeklyReviews: 'weekStart' | 'payload';
  settings: never;
}

export type Insertable<K extends EntityName> = Pick<
  EntityData[K],
  RequiredOnCreate[K] & keyof EntityData[K]
> &
  Partial<EntityData[K]> & {id?: string};

export type Task = Entity<'tasks'>;
export type Reminder = Entity<'reminders'>;
export type Goal = Entity<'goals'>;
export type GoalStep = Entity<'goalSteps'>;
export type Habit = Entity<'habits'>;
export type HabitLog = Entity<'habitLogs'>;
export type Account = Entity<'accounts'>;
export type Transaction = Entity<'transactions'>;
export type Budget = Entity<'budgets'>;
export type EnergyLog = Entity<'energy'>;
export type Contact = Entity<'contacts'>;
export type ContactInteraction = Entity<'contactInteractions'>;
export type Skill = Entity<'skills'>;
export type Note = Entity<'notes'>;
export type WeeklyReview = Entity<'weeklyReviews'>;
export type Settings = Entity<'settings'>;
