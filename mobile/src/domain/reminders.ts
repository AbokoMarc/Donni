import {
  addDays,
  combine,
  daysBetweenInstants,
  formatTimeOfDay,
  minutesOfDay,
  parseTime,
  startOfWeek,
  toDay,
  toIso,
} from './dates';
import {formatDuration} from './format';
import {stableUuid} from './ids';
import {occursOn, occurrencesBetween} from './recurrence';
import {slotRange} from './time';
import type {
  Contact,
  Goal,
  Habit,
  HabitLog,
  Reminder,
  ReminderKind,
  ReminderTargetType,
  Settings,
  Task,
} from './types';

export const REMINDER_WINDOW_DAYS = 14;
export const LATE_GRACE_MS = 60_000;
export const BRIEF_TARGET_ID = stableUuid('daily-brief');
const GOAL_REMINDER_TIME = '09:00';

export interface DerivedReminder {
  id: string;
  targetType: ReminderTargetType;
  targetId: string | null;
  label: string;
  fireAt: string;
  kind: ReminderKind;
}

export interface DeriveInput {
  now: Date;
  tasks: readonly Task[];
  habits: readonly Habit[];
  habitLogs: readonly Pick<HabitLog, 'habitId' | 'day' | 'count'>[];
  goals: readonly Goal[];
  contacts: readonly Contact[];
  settings:
    | (Pick<Settings, 'quietStart' | 'quietEnd' | 'dailyBriefAt'> & Partial<Pick<Settings, 'focusMode'>>)
    | null;
  windowDays?: number;
}

export function applyQuietHours(
  fireAt: Date,
  quietStart: string | null,
  quietEnd: string | null,
): Date {
  if (!quietStart || !quietEnd) {
    return fireAt;
  }
  const s = parseTime(quietStart);
  const e = parseTime(quietEnd);
  if (s === e) {
    return fireAt;
  }
  const m = minutesOfDay(fireAt);
  const day = toDay(fireAt);
  const end = formatTimeOfDay(e);
  if (s < e) {
    return m >= s && m < e ? combine(day, end) : fireAt;
  }
  if (m >= s) {
    return combine(addDays(day, 1), end);
  }
  return m < e ? combine(day, end) : fireAt;
}

function plural(n: number, one: string, many: string): string {
  return n > 1 ? many : one;
}

interface Candidate extends DerivedReminder {
  at: Date;
  exempt: boolean;
}

export function deriveReminders(input: DeriveInput): DerivedReminder[] {
  const {now, settings} = input;
  const windowDays = input.windowDays ?? REMINDER_WINDOW_DAYS;
  const today = toDay(now);
  const lastDay = addDays(today, windowDays);
  const horizon = combine(lastDay, '23:59');
  const focus = settings?.focusMode === true;
  const out: Candidate[] = [];

  const add = (
    key: string,
    targetType: ReminderTargetType,
    targetId: string | null,
    label: string,
    at: Date,
    kind: ReminderKind,
    exempt = false,
  ): void => {
    out.push({
      id: stableUuid(key),
      targetType,
      targetId,
      label,
      fireAt: toIso(at),
      kind,
      at,
      exempt,
    });
  };

  for (const t of input.tasks) {
    if (t.deletedAt || t.kind === 'break' || !t.startTime) {
      continue;
    }
    if (t.status !== 'todo' && t.status !== 'doing') {
      continue;
    }
    const before = t.remindBeforeMin ?? 0;
    const exempt = t.priority === 2;
    for (const d of occurrencesBetween(t, today, lastDay)) {
      const start = combine(d, t.startTime);
      const at = new Date(start.getTime() - before * 60_000);
      const label =
        before > 0
          ? `${t.title} dans ${formatDuration(before)}`
          : `${t.title} · ${t.startTime}`;
      add(`task:${t.id}:${d}:start`, 'task', t.id, label, at, 'plain', exempt);
    }
    const range = slotRange(t);
    if (range && occursOn(t, t.day) && t.day >= today) {
      const endAt = combine(t.day, formatTimeOfDay(Math.min(range.end, 1439)));
      add(
        `task:${t.id}:${t.day}:smart`,
        'task',
        t.id,
        `Tu avais prévu ${formatDuration(range.end - range.start)} de ${
          t.title
        }. Veux-tu la reprogrammer ?`,
        endAt,
        'smart',
        exempt,
      );
    }
  }

  const logsByHabit = new Map<string, Array<Pick<HabitLog, 'day' | 'count'>>>();
  for (const l of input.habitLogs) {
    const list = logsByHabit.get(l.habitId) ?? [];
    list.push(l);
    logsByHabit.set(l.habitId, list);
  }
  for (const h of input.habits) {
    if (focus || h.deletedAt || h.archived || !h.remindAt) {
      continue;
    }
    const logs = logsByHabit.get(h.id) ?? [];
    for (let d = today; d <= lastDay; d = addDays(d, 1)) {
      const countFor = (days: string[]): number =>
        logs.filter(l => days.includes(l.day)).reduce((a, l) => a + l.count, 0);
      let done: boolean;
      if (h.cadence === 'daily') {
        done = countFor([d]) >= h.targetPerPeriod;
      } else {
        const week: string[] = [];
        const monday = startOfWeek(d);
        for (let i = 0; i < 7; i++) {
          week.push(addDays(monday, i));
        }
        done = countFor(week) >= h.targetPerPeriod;
      }
      if (!done) {
        add(`habit:${h.id}:${d}`, 'habit', h.id, h.title, combine(d, h.remindAt), 'plain');
      }
    }
  }

  for (const g of input.goals) {
    if (focus || g.deletedAt || g.status === 'done' || !g.dueDate) {
      continue;
    }
    add(
      `goal:${g.id}:${g.dueDate}:eve`,
      'goal',
      g.id,
      `Échéance demain : ${g.title}`,
      combine(addDays(g.dueDate, -1), GOAL_REMINDER_TIME),
      'plain',
    );
    add(
      `goal:${g.id}:${g.dueDate}:day`,
      'goal',
      g.id,
      `Échéance aujourd'hui : ${g.title}`,
      combine(g.dueDate, GOAL_REMINDER_TIME),
      'plain',
    );
  }

  for (const c of input.contacts) {
    if (focus || c.deletedAt || !c.nextContactAt) {
      continue;
    }
    const at = new Date(c.nextContactAt);
    const since = c.lastContactAt ? daysBetweenInstants(c.lastContactAt, at) : null;
    const label =
      since !== null && since > 0
        ? `Relancer ${c.name} : dernier échange il y a ${since} jours`
        : `Relancer ${c.name}`;
    add(`contact:${c.id}:${c.nextContactAt}`, 'contact', c.id, label, at, 'plain');
  }

  if (!focus && settings?.dailyBriefAt) {
    const activeTasks = input.tasks.filter(
      t => !t.deletedAt && t.status !== 'skipped' && t.kind !== 'break',
    );
    for (let d = today; d <= lastDay; d = addDays(d, 1)) {
      const n = activeTasks.filter(t => occursOn(t, d)).length;
      const label =
        n === 0
          ? 'Résumé du matin : aucune tâche prévue aujourd\'hui.'
          : `Résumé du matin : ${n} ${plural(n, 'tâche prévue', 'tâches prévues')} aujourd'hui.`;
      add(`brief:${d}`, 'custom', BRIEF_TARGET_ID, label, combine(d, settings.dailyBriefAt), 'plain');
    }
  }

  const result: DerivedReminder[] = [];
  for (const c of out) {
    const at = c.exempt
      ? c.at
      : applyQuietHours(c.at, settings?.quietStart ?? null, settings?.quietEnd ?? null);
    if (at.getTime() <= now.getTime() || at.getTime() > horizon.getTime()) {
      continue;
    }
    result.push({
      id: c.id,
      targetType: c.targetType,
      targetId: c.targetId,
      label: c.label,
      fireAt: toIso(at),
      kind: c.kind,
    });
  }
  return result.sort((a, b) => (a.fireAt < b.fireAt ? -1 : a.fireAt > b.fireAt ? 1 : 0));
}

export interface RowUpdate {
  id: string;
  patch: {
    label: string;
    fireAt: string;
    kind: ReminderKind;
    status: 'scheduled';
  };
}

export interface RowDiff {
  insert: DerivedReminder[];
  update: RowUpdate[];
  revive: DerivedReminder[];
  remove: string[];
  markFired: string[];
}

export interface RegisteredTrigger {
  id: string;
  timestamp: number;
  label: string;
}

export interface TriggerDiff {
  schedule: Reminder[];
  cancel: string[];
  displayNow: Reminder[];
}

type RowLike = Pick<
  Reminder,
  'id' | 'targetType' | 'targetId' | 'label' | 'fireAt' | 'status' | 'kind' | 'deletedAt'
>;

export function isDerivedOwned(row: Pick<Reminder, 'targetType' | 'targetId'>): boolean {
  if (row.targetType === 'custom') {
    return row.targetId === BRIEF_TARGET_ID;
  }
  return row.targetType !== 'budget';
}

export class ReminderPlanner {
  private readonly windowDays: number;

  constructor(windowDays: number = REMINDER_WINDOW_DAYS) {
    this.windowDays = windowDays;
  }

  private horizon(now: Date): number {
    return combine(addDays(toDay(now), this.windowDays), '23:59').getTime();
  }

  diffRows(
    existing: readonly RowLike[],
    derived: readonly DerivedReminder[],
    now: Date,
  ): RowDiff {
    const byId = new Map(existing.map(r => [r.id, r]));
    const wanted = new Set(derived.map(d => d.id));
    const nowMs = now.getTime();
    const horizon = this.horizon(now);
    const diff: RowDiff = {insert: [], update: [], revive: [], remove: [], markFired: []};

    for (const d of derived) {
      const row = byId.get(d.id);
      if (!row) {
        diff.insert.push(d);
      } else if (row.deletedAt) {
        diff.revive.push(d);
      } else if (row.fireAt !== d.fireAt) {
        diff.update.push({
          id: d.id,
          patch: {label: d.label, fireAt: d.fireAt, kind: d.kind, status: 'scheduled'},
        });
      } else if (
        row.status === 'scheduled' &&
        (row.label !== d.label || row.kind !== d.kind)
      ) {
        diff.update.push({
          id: d.id,
          patch: {label: d.label, fireAt: d.fireAt, kind: d.kind, status: 'scheduled'},
        });
      }
    }

    for (const row of existing) {
      if (row.deletedAt || row.status !== 'scheduled') {
        continue;
      }
      const fireMs = Date.parse(row.fireAt);
      if (isDerivedOwned(row) && !wanted.has(row.id) && fireMs > nowMs && fireMs <= horizon) {
        diff.remove.push(row.id);
      } else if (fireMs <= nowMs - LATE_GRACE_MS) {
        diff.markFired.push(row.id);
      }
    }
    return diff;
  }

  diffTriggers(
    rows: readonly Reminder[],
    registered: readonly RegisteredTrigger[],
    now: Date,
  ): TriggerDiff {
    const nowMs = now.getTime();
    const horizon = this.horizon(now);
    const live = rows.filter(r => !r.deletedAt && r.status === 'scheduled');
    const upcoming = live.filter(r => {
      const t = Date.parse(r.fireAt);
      return t > nowMs && t <= horizon;
    });
    const wantedIds = new Set(upcoming.map(r => r.id));
    const regById = new Map(registered.map(r => [r.id, r]));

    const schedule = upcoming.filter(r => {
      const reg = regById.get(r.id);
      return !reg || reg.timestamp !== Date.parse(r.fireAt) || reg.label !== r.label;
    });
    const cancel = registered.filter(r => !wantedIds.has(r.id)).map(r => r.id);
    const displayNow = live.filter(r => {
      const t = Date.parse(r.fireAt);
      return t <= nowMs && t > nowMs - LATE_GRACE_MS && !regById.has(r.id);
    });
    return {schedule, cancel, displayNow};
  }
}

export type SnoozeChoice = 'now' | 'evening' | 'tomorrow';

export interface TaskReschedule {
  day: string;
  startTime: string;
  endTime: string | null;
  status: 'todo';
}

export function rescheduleTask(
  task: Pick<Task, 'startTime' | 'endTime' | 'durationMin'>,
  choice: SnoozeChoice,
  now: Date,
): TaskReschedule {
  const range = slotRange(task);
  const duration = range ? range.end - range.start : null;
  let target: Date;
  if (choice === 'now') {
    target = new Date(now.getTime() + 10 * 60_000);
  } else if (choice === 'evening') {
    const evening = combine(toDay(now), '19:00');
    target = evening.getTime() > now.getTime() ? evening : new Date(now.getTime() + 2 * 3_600_000);
  } else {
    const [h, m] = (task.startTime ?? formatTimeOfDay(minutesOfDay(now))).split(':').map(Number);
    const tomorrow = combine(addDays(toDay(now), 1), '00:00');
    tomorrow.setHours(h, m, 0, 0);
    target = tomorrow;
  }
  const startMin = minutesOfDay(target);
  return {
    day: toDay(target),
    startTime: formatTimeOfDay(startMin),
    endTime: duration !== null ? formatTimeOfDay(startMin + duration) : null,
    status: 'todo',
  };
}
