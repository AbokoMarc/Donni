import {
  computeDuration,
  computeEnd,
  dayStats,
  findOverlaps,
  reorderSlots,
  slotProgress,
  slotRange,
  slotState,
  sortSlots,
} from '../src/domain/time';
import {occursOn, occurrencesBetween} from '../src/domain/recurrence';

const slot = (startTime: string, endTime: string, extra = {}) => ({
  kind: 'task' as const,
  startTime,
  endTime,
  durationMin: null,
  status: 'todo' as const,
  ...extra,
});

describe('créneaux', () => {
  it('calcule durée et fin', () => {
    expect(computeEnd('09:00', 90)).toBe('10:30');
    expect(computeDuration('09:00', '10:30')).toBe(90);
    expect(computeDuration('10:30', '09:00')).toBeNull();
    expect(slotRange({startTime: '09:00', endTime: null, durationMin: 45})).toEqual({
      start: 540,
      end: 585,
    });
    expect(slotRange({startTime: null, endTime: null, durationMin: 45})).toBeNull();
  });

  it('détecte les chevauchements', () => {
    const tasks = [
      {id: 'a', ...slot('09:00', '10:30')},
      {id: 'b', ...slot('10:00', '11:00')},
      {id: 'c', ...slot('11:00', '12:00')},
    ];
    expect(findOverlaps(tasks)).toEqual([['a', 'b']]);
  });

  it('trie par heure puis position', () => {
    const sorted = sortSlots([
      {startTime: '10:00', position: 0},
      {startTime: null, position: 0},
      {startTime: '08:00', position: 2},
    ]);
    expect(sorted.map(s => s.startTime)).toEqual(['08:00', '10:00', null]);
  });

  it('détermine l\'état et la progression', () => {
    const t = slot('09:00', '10:30');
    expect(slotState(t, 8 * 60)).toBe('upcoming');
    expect(slotState(t, 9 * 60 + 45)).toBe('inProgress');
    expect(slotProgress(t, 9 * 60 + 45)).toBe(50);
    expect(slotState(t, 11 * 60)).toBe('late');
    expect(slotState({...t, status: 'done'}, 11 * 60)).toBe('done');
    expect(slotProgress({...t, status: 'done'}, 8 * 60)).toBe(100);
  });
});

describe('statistiques du jour', () => {
  it('calcule planifié, réalisé, restant et disponible', () => {
    const tasks = [
      slot('07:00', '09:00', {status: 'done'}),
      slot('09:00', '10:30', {kind: 'focus'}),
      slot('10:30', '11:30', {kind: 'break'}),
    ];
    const s = dayStats(tasks, 10 * 60);
    expect(s.plannedMin).toBe(270);
    expect(s.focusMin).toBe(90);
    expect(s.breakMin).toBe(60);
    expect(s.doneMin).toBe(120 + 60);
    expect(s.remainingMin).toBe(30 + 60);
    expect(s.availableMin).toBe(630);
    expect(s.progress).toBe(67);
  });

  it('compte une fois les plages qui se chevauchent', () => {
    const s = dayStats([slot('09:00', '11:00'), slot('10:00', '12:00')], 0);
    expect(s.plannedMin).toBe(180);
    expect(s.availableMin).toBe(15 * 60 - 180);
  });

  it('ignore les créneaux passés pour le temps disponible', () => {
    const s = dayStats([slot('08:00', '09:00')], 20 * 60);
    expect(s.availableMin).toBe(120);
  });

  it('ne donne rien sans créneau', () => {
    const s = dayStats([], 12 * 60);
    expect(s.progress).toBe(0);
    expect(s.plannedMin).toBe(0);
  });
});

describe('réorganisation', () => {
  const slots = [
    {id: 'a', startTime: '07:00', endTime: '09:00', durationMin: null},
    {id: 'b', startTime: '09:00', endTime: '10:30', durationMin: null},
    {id: 'c', startTime: '11:00', endTime: '12:00', durationMin: null},
  ];
  it('conserve les durées et les écarts', () => {
    const placed = reorderSlots(slots, 0, 2);
    expect(placed.map(p => p.id)).toEqual(['b', 'c', 'a']);
    expect(placed[0]).toEqual({id: 'b', startTime: '07:00', endTime: '08:30', position: 0});
    expect(placed[1]).toEqual({id: 'c', startTime: '08:30', endTime: '09:30', position: 1});
    expect(placed[2].startTime).toBe('10:00');
    expect(placed[2].endTime).toBe('12:00');
  });
  it('rejette les index invalides', () => {
    expect(reorderSlots(slots, 5, 0)).toEqual([]);
  });
});

describe('récurrence', () => {
  it('reconnaît les occurrences', () => {
    const daily = {day: '2026-10-05', recurrence: 'daily'};
    expect(occursOn(daily, '2026-10-09')).toBe(true);
    expect(occursOn(daily, '2026-10-04')).toBe(false);
    const wk = {day: '2026-10-05', recurrence: 'weekdays'};
    expect(occursOn(wk, '2026-10-10')).toBe(false);
    expect(occursOn(wk, '2026-10-12')).toBe(true);
    const weekly = {day: '2026-10-05', recurrence: 'weekly:1,3,5'};
    expect(occurrencesBetween(weekly, '2026-10-05', '2026-10-11')).toEqual([
      '2026-10-05',
      '2026-10-07',
      '2026-10-09',
    ]);
    expect(occursOn({day: '2026-10-05', recurrence: null}, '2026-10-06')).toBe(false);
    expect(occursOn({day: '2026-10-05', recurrence: 'bogus'}, '2026-10-06')).toBe(false);
  });
});
