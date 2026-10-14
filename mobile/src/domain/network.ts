import {
  addDays,
  combine,
  dayFromIso,
  daysBetweenInstants,
  toDay,
  toIso,
  weekdayOf,
} from './dates';
import {formatAgo, formatDayMonth, formatDayShort} from './format';
import type {Contact, ContactRelation, FrequencyKind} from './types';

export const RELATION_LABELS: Record<ContactRelation, string> = {
  famille: 'Famille',
  ami: 'Ami',
  mentor: 'Mentor',
  collegue: 'Collègue',
  client: 'Client',
  partenaire: 'Partenaire',
  autre: 'Autre',
};

const WEEKDAYS = [
  'Dimanche',
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
];

export const DEFAULT_CONTACT_TIME = '10:00';
export const FOLLOW_UP_AFTER_DAYS = 21;

export interface FrequencySpec {
  kind: FrequencyKind;
  day: number | null;
}

export function encodeFrequency(spec: FrequencySpec): string {
  return spec.kind === 'none' || spec.day === null
    ? 'none'
    : `${spec.kind}:${spec.day}`;
}

export function decodeFrequency(value: string): FrequencySpec {
  if (value === 'none') {
    return {kind: 'none', day: null};
  }
  const [kind, day] = value.split(':');
  return {kind: kind as FrequencyKind, day: Number(day)};
}

function ordinalDay(day: number): string {
  return day === 1 ? '1er du mois' : `le ${day} du mois`;
}

export function frequencyLabel(spec: FrequencySpec): string {
  if (spec.kind === 'none' || spec.day === null) {
    return 'Aucune relance';
  }
  if (spec.kind === 'weekly') {
    return `Hebdo · ${WEEKDAYS[spec.day]}`;
  }
  if (spec.kind === 'biweekly') {
    return `Bimensuel · ${WEEKDAYS[spec.day]}`;
  }
  return `Mensuel · ${ordinalDay(spec.day)}`;
}

export function frequencyOptions(): Array<{value: string; label: string}> {
  const out = [{value: 'none', label: 'Aucune relance'}];
  const order = [0, 1, 2, 3, 4, 5, 6];
  for (const d of order) {
    out.push({
      value: encodeFrequency({kind: 'weekly', day: d}),
      label: frequencyLabel({kind: 'weekly', day: d}),
    });
  }
  for (const d of order) {
    out.push({
      value: encodeFrequency({kind: 'biweekly', day: d}),
      label: frequencyLabel({kind: 'biweekly', day: d}),
    });
  }
  for (const d of [1, 5, 10, 15, 20, 25]) {
    out.push({
      value: encodeFrequency({kind: 'monthly', day: d}),
      label: frequencyLabel({kind: 'monthly', day: d}),
    });
  }
  return out;
}

function nextWeekday(from: Date, weekday: number, time: string): Date {
  const startDay = toDay(from);
  for (let i = 0; i <= 7; i++) {
    const day = addDays(startDay, i);
    if (weekdayOf(day) === weekday) {
      const candidate = combine(day, time);
      if (candidate.getTime() > from.getTime()) {
        return candidate;
      }
    }
  }
  return combine(addDays(startDay, 7), time);
}

export function nextContactAfter(
  kind: FrequencyKind,
  day: number | null,
  time: string | null,
  from: Date,
): string | null {
  if (kind === 'none' || day === null) {
    return null;
  }
  const t = time ?? DEFAULT_CONTACT_TIME;
  if (kind === 'weekly') {
    return toIso(nextWeekday(from, day, t));
  }
  if (kind === 'biweekly') {
    const base = new Date(from.getTime());
    base.setDate(base.getDate() + 7);
    return toIso(nextWeekday(base, day, t));
  }
  const thisMonth = new Date(from.getFullYear(), from.getMonth(), day);
  const candidate = combine(toDay(thisMonth), t);
  if (candidate.getTime() > from.getTime()) {
    return toIso(candidate);
  }
  return toIso(combine(toDay(new Date(from.getFullYear(), from.getMonth() + 1, day)), t));
}

export function applyInteraction(
  contact: Pick<
    Contact,
    'lastContactAt' | 'frequencyKind' | 'frequencyDay' | 'frequencyTime'
  >,
  at: Date,
): {lastContactAt: string; nextContactAt: string | null} {
  const last =
    contact.lastContactAt && new Date(contact.lastContactAt) > at
      ? new Date(contact.lastContactAt)
      : at;
  return {
    lastContactAt: toIso(last),
    nextContactAt: nextContactAfter(
      contact.frequencyKind,
      contact.frequencyDay,
      contact.frequencyTime,
      last,
    ),
  };
}

export type ContactState = 'overdue' | 'planned' | 'tracking' | 'none';

export interface ContactStatus {
  state: ContactState;
  label: string;
  daysSince: number | null;
}

export function contactStatus(
  contact: Pick<Contact, 'lastContactAt' | 'nextContactAt'>,
  now: Date,
): ContactStatus {
  const daysSince = contact.lastContactAt
    ? daysBetweenInstants(contact.lastContactAt, now)
    : null;
  if (contact.nextContactAt) {
    const next = new Date(contact.nextContactAt);
    if (next.getTime() <= now.getTime()) {
      return {
        state: 'overdue',
        label:
          daysSince === null
            ? 'À relancer · jamais contacté'
            : `À relancer · dernier échange ${formatAgo(daysSince)}`,
        daysSince,
      };
    }
    return {
      state: 'planned',
      label: `Prévu · ${formatDayShort(dayFromIso(contact.nextContactAt))}`,
      daysSince,
    };
  }
  if (contact.lastContactAt) {
    return {
      state: 'tracking',
      label: `En suivi · Dernière activité ${formatDayMonth(
        dayFromIso(contact.lastContactAt),
      )}`,
      daysSince,
    };
  }
  return {state: 'none', label: 'Aucun échange enregistré', daysSince};
}

export interface FollowUp<T> {
  contact: T;
  daysSince: number | null;
  score: number;
}

type FollowUpContact = Pick<
  Contact,
  'lastContactAt' | 'nextContactAt' | 'createdAt'
>;

export function contactsToFollowUp<T extends FollowUpContact>(
  contacts: readonly T[],
  now: Date,
  limit = 2,
): Array<FollowUp<T>> {
  const out: Array<FollowUp<T>> = [];
  for (const contact of contacts) {
    const daysSince = contact.lastContactAt
      ? daysBetweenInstants(contact.lastContactAt, now)
      : null;
    let score = -1;
    if (contact.nextContactAt) {
      const next = new Date(contact.nextContactAt);
      if (next.getTime() <= now.getTime()) {
        score = 1000 + (now.getTime() - next.getTime()) / 86_400_000;
      }
    } else if (daysSince !== null && daysSince >= FOLLOW_UP_AFTER_DAYS) {
      score = daysSince;
    } else if (
      daysSince === null &&
      daysBetweenInstants(contact.createdAt, now) >= 7
    ) {
      score = 1;
    }
    if (score >= 0) {
      out.push({contact, daysSince, score});
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function whatsappUrl(phone: string): string {
  return `https://wa.me/${phone.replace(/\D/g, '')}`;
}

export function telUrl(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}
