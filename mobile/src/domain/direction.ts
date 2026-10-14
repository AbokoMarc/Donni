import type {Goal, GoalStatus, GoalStep, Skill} from './types';

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  todo: 'À faire',
  doing: 'En cours',
  done: 'Terminé',
};

const clamp = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

export function goalProgress(
  goal: Pick<Goal, 'status' | 'progressManual'>,
  steps: ReadonlyArray<Pick<GoalStep, 'done'>>,
): number {
  if (steps.length > 0) {
    return clamp((steps.filter(s => s.done).length / steps.length) * 100);
  }
  if (goal.progressManual != null) {
    return clamp(goal.progressManual);
  }
  return goal.status === 'done' ? 100 : 0;
}

export function averageProgress(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return clamp(values.reduce((a, b) => a + b, 0) / values.length);
}

export function featuredSkill<T extends Pick<Skill, 'updatedAt'>>(
  skills: readonly T[],
): T | null {
  let best: T | null = null;
  for (const s of skills) {
    if (best === null || s.updatedAt > best.updatedAt) {
      best = s;
    }
  }
  return best;
}
