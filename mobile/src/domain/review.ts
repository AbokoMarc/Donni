import {addDays} from './dates';
import {TEN_SCALE_METRICS} from './energy';
import {formatDecimal, formatDuration, formatXof} from './format';
import {slotDuration} from './time';
import type {EnergyLog, Task, Transaction} from './types';

export interface WeeklyReviewInput {
  weekStart: string;
  tasks: ReadonlyArray<
    Pick<Task, 'status' | 'startTime' | 'endTime' | 'durationMin'>
  >;
  transactions: ReadonlyArray<Pick<Transaction, 'amountXof'>>;
  energy: ReadonlyArray<Pick<EnergyLog, 'metric' | 'value'>>;
  goals: {done: number; total: number};
  interactions: number;
  monthlyBudgetXof: number | null;
  monthExpenseXof: number | null;
}

export interface WeeklyReviewPayload {
  weekStart: string;
  weekEnd: string;
  time: {plannedMin: number; doneMin: number; ratio: number | null};
  money: {
    incomeXof: number;
    expenseXof: number;
    monthExpenseXof: number | null;
    budgetXof: number | null;
  };
  energy: {average: number | null; samples: number};
  goals: {done: number; total: number};
  network: {interactions: number};
  observations: string[];
}

export function buildWeeklyReview(input: WeeklyReviewInput): WeeklyReviewPayload {
  let plannedMin = 0;
  let doneMin = 0;
  for (const t of input.tasks) {
    if (t.status === 'skipped') {
      continue;
    }
    const d = slotDuration(t);
    plannedMin += d;
    if (t.status === 'done') {
      doneMin += d;
    }
  }
  const ratio = plannedMin > 0 ? Math.round((doneMin / plannedMin) * 100) : null;

  let incomeXof = 0;
  let expenseXof = 0;
  for (const t of input.transactions) {
    if (t.amountXof >= 0) {
      incomeXof += t.amountXof;
    } else {
      expenseXof += -t.amountXof;
    }
  }

  const scores = input.energy
    .filter(e => e.value != null && TEN_SCALE_METRICS.includes(e.metric))
    .map(e => e.value as number);
  const average =
    scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
      : null;

  const observations: string[] = [];
  if (ratio !== null) {
    observations.push(`Tu as réalisé ${ratio} % de ton planning cette semaine.`);
  }
  if (input.monthlyBudgetXof && input.monthExpenseXof !== null) {
    const pct = Math.round((input.monthExpenseXof / input.monthlyBudgetXof) * 100);
    observations.push(
      input.monthExpenseXof > input.monthlyBudgetXof
        ? `Ton budget du mois est dépassé de ${formatXof(
            input.monthExpenseXof - input.monthlyBudgetXof,
          )}.`
        : `Tu as utilisé ${pct} % de ton budget du mois.`,
    );
  }
  if (average !== null) {
    observations.push(`Ton score moyen d'énergie est de ${formatDecimal(average, 1)}/10.`);
  }
  if (input.goals.total > 0) {
    observations.push(
      `${input.goals.done} objectif${input.goals.done > 1 ? 's' : ''} terminé${
        input.goals.done > 1 ? 's' : ''
      } sur ${input.goals.total}.`,
    );
  }
  observations.push(
    input.interactions === 0
      ? "Aucun échange avec ton réseau n'est enregistré cette semaine."
      : `${input.interactions} échange${input.interactions > 1 ? 's' : ''} avec ton réseau cette semaine.`,
  );
  if (plannedMin > 0) {
    observations.push(
      `${formatDuration(doneMin)} réalisées sur ${formatDuration(plannedMin)} planifiées.`,
    );
  }

  return {
    weekStart: input.weekStart,
    weekEnd: addDays(input.weekStart, 6),
    time: {plannedMin, doneMin, ratio },
    money: {
      incomeXof,
      expenseXof,
      monthExpenseXof: input.monthExpenseXof,
      budgetXof: input.monthlyBudgetXof,
    },
    energy: {average, samples: scores.length },
    goals: input.goals,
    network: {interactions: input.interactions },
    observations,
  };
}
