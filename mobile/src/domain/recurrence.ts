import {addDays, diffDays, weekdayOf} from './dates';

export interface Recurring {
  day: string;
  recurrence: string | null;
}

export function recurrenceDays(recurrence: string): number[] | null {
  if (recurrence === 'daily') {
    return [0, 1, 2, 3, 4, 5, 6];
  }
  if (recurrence === 'weekdays') {
    return [1, 2, 3, 4, 5];
  }
  if (recurrence.startsWith('weekly:')) {
    const days = recurrence
      .slice(7)
      .split(',')
      .map(Number)
      .filter(n => Number.isInteger(n) && n >= 0 && n <= 6);
    return days.length > 0 ? days : null;
  }
  return null;
}

export function occursOn(task: Recurring, day: string): boolean {
  if (task.day === day) {
    return true;
  }
  if (!task.recurrence || diffDays(task.day, day) < 0) {
    return false;
  }
  const days = recurrenceDays(task.recurrence);
  return days !== null && days.includes(weekdayOf(day));
}

export function occurrencesBetween(
  task: Recurring,
  from: string,
  to: string,
): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (occursOn(task, d)) {
      out.push(d);
    }
  }
  return out;
}
