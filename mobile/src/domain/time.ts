import {formatTimeOfDay, parseTime} from './dates';
import type {TaskData} from './types';

export type SlotLike = Pick<
  TaskData,
  'kind' | 'startTime' | 'endTime' | 'durationMin' | 'status'
>;

export interface Range {
  start: number;
  end: number;
}

export const DAY_WINDOW: Range = {start: 7 * 60, end: 22 * 60};

export function slotRange(
  t: Pick<TaskData, 'startTime' | 'endTime' | 'durationMin'>,
): Range | null {
  if (!t.startTime) {
    return null;
  }
  const start = parseTime(t.startTime);
  let end: number;
  if (t.endTime) {
    end = parseTime(t.endTime);
  } else if (t.durationMin != null && t.durationMin > 0) {
    end = start + t.durationMin;
  } else {
    return null;
  }
  if (end <= start) {
    return null;
  }
  return {start, end: Math.min(end, 1440)};
}

export function slotDuration(
  t: Pick<TaskData, 'startTime' | 'endTime' | 'durationMin'>,
): number {
  const r = slotRange(t);
  return r ? r.end - r.start : t.durationMin ?? 0;
}

export function computeEnd(startTime: string, durationMin: number): string {
  return formatTimeOfDay(parseTime(startTime) + durationMin);
}

export function computeDuration(
  startTime: string,
  endTime: string,
): number | null {
  const diff = parseTime(endTime) - parseTime(startTime);
  return diff > 0 ? diff : null;
}

export function sortSlots<
  T extends Pick<TaskData, 'startTime' | 'position'> & {createdAt?: string},
>(tasks: readonly T[]): T[] {
  return tasks.slice().sort((a, b) => {
    if (a.startTime && b.startTime) {
      if (a.startTime !== b.startTime) {
        return a.startTime < b.startTime ? -1 : 1;
      }
    } else if (a.startTime || b.startTime) {
      return a.startTime ? -1 : 1;
    }
    if (a.position !== b.position) {
      return a.position - b.position;
    }
    return (a.createdAt ?? '') < (b.createdAt ?? '') ? -1 : 1;
  });
}

export function findOverlaps(
  tasks: ReadonlyArray<
    Pick<TaskData, 'startTime' | 'endTime' | 'durationMin' | 'status'> & {
      id: string;
    }
  >,
): Array<[string, string]> {
  const timed = tasks
    .filter(t => t.status !== 'skipped')
    .map(t => ({id: t.id, range: slotRange(t)}))
    .filter((t): t is {id: string; range: Range} => t.range !== null)
    .sort((a, b) => a.range.start - b.range.start);
  const out: Array<[string, string]> = [];
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      if (timed[j].range.start >= timed[i].range.end) {
        break;
      }
      out.push([timed[i].id, timed[j].id]);
    }
  }
  return out;
}

export type SlotState =
  | 'done'
  | 'skipped'
  | 'inProgress'
  | 'upcoming'
  | 'late'
  | 'untimed';

export function slotState(t: SlotLike, nowMin: number): SlotState {
  if (t.status === 'done') {
    return 'done';
  }
  if (t.status === 'skipped') {
    return 'skipped';
  }
  const r = slotRange(t);
  if (!r) {
    return 'untimed';
  }
  if (t.status === 'doing' && nowMin >= r.start && nowMin < r.end) {
    return 'inProgress';
  }
  if (nowMin < r.start) {
    return 'upcoming';
  }
  if (nowMin < r.end) {
    return 'inProgress';
  }
  return 'late';
}

export function slotProgress(t: SlotLike, nowMin: number): number {
  const state = slotState(t, nowMin);
  if (state === 'done') {
    return 100;
  }
  if (state === 'inProgress') {
    const r = slotRange(t) as Range;
    return Math.round(((nowMin - r.start) / (r.end - r.start)) * 100);
  }
  return 0;
}

function mergeRanges(ranges: Range[]): Range[] {
  const sorted = ranges.slice().sort((a, b) => a.start - b.start);
  const out: Range[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      out.push({start: r.start, end: r.end});
    }
  }
  return out;
}

const total = (ranges: Range[]): number =>
  ranges.reduce((sum, r) => sum + (r.end - r.start), 0);

export interface DayStats {
  plannedMin: number;
  doneMin: number;
  remainingMin: number;
  focusMin: number;
  breakMin: number;
  availableMin: number;
  progress: number;
}

export function dayStats(
  tasks: readonly SlotLike[],
  nowMin: number,
  window: Range = DAY_WINDOW,
): DayStats {
  const active = tasks.filter(t => t.status !== 'skipped');
  const timed = active
    .map(t => ({t, range: slotRange(t)}))
    .filter((x): x is {t: SlotLike; range: Range} => x.range !== null);

  const plannedMin = total(mergeRanges(timed.map(x => x.range)));

  let doneMin = 0;
  let remainingMin = 0;
  let focusMin = 0;
  let breakMin = 0;
  let weighted = 0;
  let weights = 0;
  for (const {t, range} of timed) {
    const duration = range.end - range.start;
    const progress = slotProgress(t, nowMin);
    weighted += progress * duration;
    weights += duration;
    doneMin += Math.round((progress / 100) * duration);
    const state = slotState(t, nowMin);
    if (state === 'inProgress') {
      remainingMin += range.end - nowMin;
    } else if (state === 'upcoming' || state === 'late') {
      remainingMin += duration;
    }
    if (t.kind === 'focus') {
      focusMin += duration;
    } else if (t.kind === 'break') {
      breakMin += duration;
    }
  }

  const from = Math.max(window.start, nowMin);
  const busy = mergeRanges(
    timed
      .map(x => ({
        start: Math.max(x.range.start, from),
        end: Math.min(x.range.end, window.end),
      }))
      .filter(r => r.end > r.start),
  );
  const availableMin = Math.max(0, window.end - from - total(busy));

  return {
    plannedMin,
    doneMin,
    remainingMin,
    focusMin,
    breakMin,
    availableMin,
    progress: weights === 0 ? 0 : Math.round(weighted / weights),
  };
}

export interface Placement {
  id: string;
  startTime: string;
  endTime: string;
  position: number;
}

export function reorderSlots(
  slots: ReadonlyArray<
    Pick<TaskData, 'startTime' | 'endTime' | 'durationMin'> & {id: string}
  >,
  from: number,
  to: number,
): Placement[] {
  const timed = slots
    .map(s => ({id: s.id, range: slotRange(s)}))
    .filter((s): s is {id: string; range: Range} => s.range !== null);
  if (from < 0 || from >= timed.length || to < 0 || to >= timed.length) {
    return [];
  }
  const gaps = timed.map((s, i) =>
    i < timed.length - 1
      ? Math.max(0, timed[i + 1].range.start - s.range.end)
      : 0,
  );
  const order = timed.slice();
  const [moved] = order.splice(from, 1);
  order.splice(to, 0, moved);

  let cursor = timed[0].range.start;
  return order.map((s, position) => {
    const duration = s.range.end - s.range.start;
    const start = Math.min(cursor, 1439 - 1);
    const end = Math.min(start + duration, 1439);
    cursor = start + duration + gaps[position];
    return {
      id: s.id,
      startTime: formatTimeOfDay(start),
      endTime: formatTimeOfDay(end),
      position,
    };
  });
}

export function timelinePosition(
  minutes: number,
  window: Range = DAY_WINDOW,
): number {
  const ratio = (minutes - window.start) / (window.end - window.start);
  return Math.max(0, Math.min(1, ratio));
}
