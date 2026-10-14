import {
  formatAgo,
  formatDayLong,
  formatDayShort,
  formatDecimal,
  formatDuration,
  formatDurationSpaced,
  formatHours,
  formatXof,
  formatXofCompact,
  initialOf,
} from '../src/domain/format';
import {
  addDays,
  addMonths,
  diffDays,
  isDay,
  isTime,
  monthRange,
  startOfWeek,
  toDay,
  toIso,
  weekdayOf,
} from '../src/domain/dates';
import {isUuid, stableUuid, uuidv4} from '../src/domain/ids';

describe('formatXof', () => {
  it('groupe les milliers avec une espace fine insécable', () => {
    expect(formatXof(12500)).toBe('12 500 FCFA');
    expect(formatXof(1234567)).toBe('1 234 567 FCFA');
    expect(formatXof(0)).toBe('0 FCFA');
  });
  it('gère les signes', () => {
    expect(formatXof(-3200)).toBe('−3 200 FCFA');
    expect(formatXof(1000, {sign: true})).toBe('+1 000 FCFA');
    expect(formatXof(0, {sign: true})).toBe('0 FCFA');
  });
  it('formate en compact', () => {
    expect(formatXofCompact(200000)).toBe('200k FCFA');
    expect(formatXofCompact(1500000)).toBe('1,5M FCFA');
    expect(formatXofCompact(950)).toBe('950 FCFA');
  });
});

describe('dates en français', () => {
  it('formate les jours', () => {
    expect(formatDayShort('2026-10-07')).toBe('Mer. 7 oct.');
    expect(formatDayLong('2026-10-08')).toBe('Jeudi 8 oct.');
    expect(formatDayShort('2026-03-01')).toBe('Dim. 1 mars');
  });
  it('formate durées et heures', () => {
    expect(formatDuration(270)).toBe('4h30');
    expect(formatDuration(80)).toBe('1h20');
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(120)).toBe('2h00');
    expect(formatDurationSpaced(120)).toBe('2h 00min');
    expect(formatDurationSpaced(90)).toBe('1h 30min');
    expect(formatHours(5.5)).toBe('5h30');
    expect(formatDecimal(1.25)).toBe('1,25');
    expect(formatDecimal(2)).toBe('2');
    expect(formatAgo(2)).toBe('il y a 2j');
    expect(initialOf(' aminata')).toBe('A');
  });
});

describe('calcul de dates', () => {
  it('ajoute des jours à travers les mois', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(diffDays('2026-10-01', '2026-10-08')).toBe(7);
  });
  it('trouve le lundi de la semaine', () => {
    expect(startOfWeek('2026-10-07')).toBe('2026-10-05');
    expect(startOfWeek('2026-10-11')).toBe('2026-10-05');
    expect(startOfWeek('2026-10-05')).toBe('2026-10-05');
    expect(weekdayOf('2026-10-11')).toBe(0);
  });
  it('gère les mois', () => {
    expect(monthRange('2026-02')).toEqual({from: '2026-02-01', to: '2026-02-28'});
    expect(addMonths('2026-12', 1)).toBe('2027-01');
  });
  it('valide les formats', () => {
    expect(isDay('2026-02-30')).toBe(false);
    expect(isDay('2026-10-07')).toBe(true);
    expect(isTime('24:00')).toBe(false);
    expect(isTime('07:05')).toBe(true);
    expect(toDay(new Date(2026, 9, 7, 23, 59))).toBe('2026-10-07');
    expect(toIso(new Date('2026-10-05T17:00:00.000Z'))).toBe('2026-10-05T17:00:00Z');
  });
});

describe('identifiants', () => {
  it('produit des UUID v4 valides', () => {
    for (let i = 0; i < 20; i++) {
      expect(isUuid(uuidv4())).toBe(true);
    }
    expect(uuidv4()).not.toBe(uuidv4());
  });
  it('produit des UUID stables', () => {
    expect(stableUuid('task:1')).toBe(stableUuid('task:1'));
    expect(stableUuid('task:1')).not.toBe(stableUuid('task:2'));
    expect(isUuid(stableUuid('x'))).toBe(true);
  });
});
