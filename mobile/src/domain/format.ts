import {diffDays, parseDay} from './dates';

const NNBSP = ' ';
const MINUS = '−';

const MONTHS_SHORT = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];
const WEEKDAYS_SHORT = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
const WEEKDAYS_LONG = [
  'Dimanche',
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
];

export function groupThousands(n: number): string {
  const digits = String(Math.abs(Math.trunc(n)));
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) {
      out += NNBSP;
    }
    out += digits[i];
  }
  return out;
}

export function formatXof(amount: number, opts: {sign?: boolean} = {}): string {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? MINUS : opts.sign && rounded > 0 ? '+' : '';
  return `${sign}${groupThousands(rounded)}${NNBSP}FCFA`;
}

export function formatXofCompact(amount: number): string {
  const abs = Math.abs(Math.round(amount));
  const sign = amount < 0 ? MINUS : '';
  if (abs >= 1_000_000) {
    const v = Math.round(abs / 100_000) / 10;
    return `${sign}${String(v).replace('.', ',')}M${NNBSP}FCFA`;
  }
  if (abs >= 1000) {
    const v = Math.round(abs / 100) / 10;
    return `${sign}${String(v).replace('.', ',')}k${NNBSP}FCFA`;
  }
  return `${sign}${abs}${NNBSP}FCFA`;
}

export function formatDecimal(value: number, digits = 2): string {
  const fixed = value.toFixed(digits);
  const trimmed = fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
  return trimmed.replace('.', ',');
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}${NNBSP}%`;
}

export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) {
    return `${m} min`;
  }
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return `${h}h${rest < 10 ? '0' + rest : rest}`;
}

export function formatDurationSpaced(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) {
    return `${rest}min`;
  }
  return `${h}h ${rest < 10 ? '0' + rest : rest}min`;
}

export function formatHours(hours: number): string {
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h${m < 10 ? '0' + m : m}`;
}

export function formatDayShort(day: string): string {
  const d = parseDay(day);
  return `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} ${
    MONTHS_SHORT[d.getMonth()]
  }`;
}

export function formatDayLong(day: string): string {
  const d = parseDay(day);
  return `${WEEKDAYS_LONG[d.getDay()]} ${d.getDate()} ${
    MONTHS_SHORT[d.getMonth()]
  }`;
}

export function formatDayMonth(day: string): string {
  const d = parseDay(day);
  const dd = d.getDate() < 10 ? '0' + d.getDate() : String(d.getDate());
  return `${dd} ${MONTHS_SHORT[d.getMonth()]}`;
}

export function formatDayNumeric(day: string, spaced = false): string {
  const [y, m, d] = day.split('-');
  return spaced ? `${d} / ${m} / ${y}` : `${d}/${m}/${y}`;
}

export function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const name = MONTHS_SHORT[m - 1];
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`;
}

export function formatMonthShort(month: string): string {
  const name = MONTHS_SHORT[Number(month.slice(5, 7)) - 1];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function formatRelativeDay(day: string, today: string): string {
  const diff = diffDays(today, day);
  if (diff === 0) {
    return "Aujourd'hui";
  }
  if (diff === 1) {
    return 'Demain';
  }
  if (diff === -1) {
    return 'Hier';
  }
  return formatDayShort(day);
}

export function formatAgo(days: number): string {
  if (days <= 0) {
    return "aujourd'hui";
  }
  if (days === 1) {
    return 'hier';
  }
  return `il y a ${days}j`;
}

export function formatAgoMinutes(minutes: number): string {
  if (minutes < 1) {
    return "à l'instant";
  }
  if (minutes < 60) {
    return `il y a ${Math.round(minutes)} min`;
  }
  if (minutes < 1440) {
    return `il y a ${Math.floor(minutes / 60)} h`;
  }
  return formatAgo(Math.floor(minutes / 1440));
}

export function initialOf(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?';
}
