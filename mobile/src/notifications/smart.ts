import {rescheduleTask} from '../domain/reminders';
import type {SnoozeChoice} from '../domain/reminders';
import type {Repository} from '../db/repository';

export type SmartAction = SnoozeChoice | 'ignore';

export const SMART_ACTION_IDS: readonly SmartAction[] = ['now', 'evening', 'tomorrow', 'ignore'];

export function isSmartAction(id: string | undefined): id is SmartAction {
  return id !== undefined && (SMART_ACTION_IDS as readonly string[]).includes(id);
}

/**
 * Applique le choix de l'utilisateur sur un rappel intelligent. La tâche n'est jamais
 * déplacée sans action explicite : « Ignorer » ne fait que clore le rappel.
 */
export async function applySmartAction(
  repo: Repository,
  reminderId: string,
  action: SmartAction,
  now: Date = new Date(),
): Promise<void> {
  const reminder = await repo.tables.reminders.get(reminderId);
  if (!reminder) {
    return;
  }
  if (action === 'ignore') {
    await repo.tables.reminders.update(reminderId, {status: 'dismissed'});
    return;
  }
  if (reminder.targetType === 'task' && reminder.targetId) {
    const task = await repo.tables.tasks.get(reminder.targetId);
    if (task) {
      const next = rescheduleTask(task, action, now);
      await repo.tables.tasks.update(task.id, next);
    }
  }
  await repo.tables.reminders.update(reminderId, {status: 'snoozed'});
}
