import {addDays, diffDays, startOfWeek} from './dates';
import type {Habit, HabitLog} from './types';

type HabitRule = Pick<Habit, 'cadence' | 'targetPerPeriod'>;
type LogLike = Pick<HabitLog, 'day' | 'count'>;

export function periodKey(cadence: Habit['cadence'], day: string): string {
  return cadence === 'weekly' ? startOfWeek(day) : day;
}

function stepOf(cadence: Habit['cadence']): number {
  return cadence === 'weekly' ? 7 : 1;
}

function countsByPeriod(
  cadence: Habit['cadence'],
  logs: readonly LogLike[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of logs) {
    const key = periodKey(cadence, l.day);
    out.set(key, (out.get(key) ?? 0) + l.count);
  }
  return out;
}

export interface PeriodProgress {
  count: number;
  target: number;
  done: boolean;
}

export function periodProgress(
  habit: HabitRule,
  logs: readonly LogLike[],
  today: string,
): PeriodProgress {
  const count =
    countsByPeriod(habit.cadence, logs).get(periodKey(habit.cadence, today)) ??
    0;
  return {
    count,
    target: habit.targetPerPeriod,
    done: count >= habit.targetPerPeriod,
  };
}

export function currentStreak(
  habit: HabitRule,
  logs: readonly LogLike[],
  today: string,
): number {
  const counts = countsByPeriod(habit.cadence, logs);
  const step = stepOf(habit.cadence);
  let cursor = periodKey(habit.cadence, today);
  if ((counts.get(cursor) ?? 0) < habit.targetPerPeriod) {
    cursor = addDays(cursor, -step);
  }
  let streak = 0;
  while ((counts.get(cursor) ?? 0) >= habit.targetPerPeriod) {
    streak += 1;
    cursor = addDays(cursor, -step);
  }
  return streak;
}

export function bestStreak(habit: HabitRule, logs: readonly LogLike[]): number {
  const counts = countsByPeriod(habit.cadence, logs);
  const step = stepOf(habit.cadence);
  const met = Array.from(counts)
    .filter(([, c]) => c >= habit.targetPerPeriod)
    .map(([k]) => k)
    .sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const key of met) {
    run = prev !== null && diffDays(prev, key) === step ? run + 1 : 1;
    best = Math.max(best, run);
    prev = key;
  }
  return best;
}
