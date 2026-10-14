import {formatDayShort, formatXof} from './format';
import {RELATION_LABELS} from './network';
import type {
  Contact,
  Goal,
  Habit,
  Note,
  Skill,
  Task,
  Transaction,
} from './types';

export type SearchKind =
  | 'contact'
  | 'task'
  | 'note'
  | 'transaction'
  | 'goal'
  | 'habit'
  | 'skill';

export interface SearchHit {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle: string | null;
  score: number;
}

export interface SearchCorpus {
  contacts?: ReadonlyArray<
    Pick<Contact, 'id' | 'name' | 'note' | 'phone' | 'relation'>
  >;
  tasks?: ReadonlyArray<
    Pick<Task, 'id' | 'title' | 'notes' | 'day' | 'startTime'>
  >;
  notes?: ReadonlyArray<Pick<Note, 'id' | 'title' | 'body'>>;
  transactions?: ReadonlyArray<
    Pick<Transaction, 'id' | 'label' | 'note' | 'day' | 'amountXof'>
  >;
  goals?: ReadonlyArray<Pick<Goal, 'id' | 'title' | 'notes'>>;
  habits?: ReadonlyArray<Pick<Habit, 'id' | 'title'>>;
  skills?: ReadonlyArray<Pick<Skill, 'id' | 'name' | 'note'>>;
}

export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function tokenize(query: string): string[] {
  return normalize(query)
    .split(/\s+/)
    .filter(t => t.length > 0);
}

function scoreOf(
  tokens: readonly string[],
  title: string,
  others: ReadonlyArray<string | null | undefined>,
): number {
  const nt = normalize(title);
  const rest = others.map(o => (o ? normalize(o) : '')).join(' ');
  let score = 0;
  for (const token of tokens) {
    if (nt.startsWith(token)) {
      score += 3;
    } else if (nt.includes(` ${token}`)) {
      score += 2.5;
    } else if (nt.includes(token)) {
      score += 2;
    } else if (rest.includes(token)) {
      score += 1;
    } else {
      return 0;
    }
  }
  return score;
}

const KIND_ORDER: Record<SearchKind, number> = {
  contact: 0,
  task: 1,
  goal: 2,
  habit: 3,
  note: 4,
  transaction: 5,
  skill: 6,
};

function snippet(text: string): string | null {
  const line = text.trim().split('\n')[0];
  if (!line) {
    return null;
  }
  return line.length > 80 ? `${line.slice(0, 77)}...` : line;
}

export function searchAll(
  query: string,
  corpus: SearchCorpus,
  limit = 50,
): SearchHit[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) {
    return [];
  }
  const hits: SearchHit[] = [];
  const push = (
    kind: SearchKind,
    id: string,
    title: string,
    subtitle: string | null,
    others: ReadonlyArray<string | null | undefined>,
  ): void => {
    const score = scoreOf(tokens, title, others);
    if (score > 0) {
      hits.push({kind, id, title, subtitle, score});
    }
  };

  for (const c of corpus.contacts ?? []) {
    push('contact', c.id, c.name, RELATION_LABELS[c.relation], [c.note, c.phone]);
  }
  for (const t of corpus.tasks ?? []) {
    push(
      'task',
      t.id,
      t.title,
      `${formatDayShort(t.day)}${t.startTime ? ` · ${t.startTime}` : ''}`,
      [t.notes],
    );
  }
  for (const g of corpus.goals ?? []) {
    push('goal', g.id, g.title, null, [g.notes]);
  }
  for (const h of corpus.habits ?? []) {
    push('habit', h.id, h.title, null, []);
  }
  for (const n of corpus.notes ?? []) {
    push('note', n.id, n.title, snippet(n.body), [n.body]);
  }
  for (const t of corpus.transactions ?? []) {
    push(
      'transaction',
      t.id,
      t.label,
      `${formatDayShort(t.day)} · ${formatXof(t.amountXof, {sign: true})}`,
      [t.note],
    );
  }
  for (const s of corpus.skills ?? []) {
    push('skill', s.id, s.name, null, [s.note]);
  }

  return hits
    .sort(
      (a, b) =>
        b.score - a.score ||
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
        a.title.localeCompare(b.title, 'fr'),
    )
    .slice(0, limit);
}
