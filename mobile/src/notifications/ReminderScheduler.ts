import {addDays, startOfWeek, toDay} from '../domain/dates';
import {deriveReminders, REMINDER_WINDOW_DAYS, ReminderPlanner} from '../domain/reminders';
import type {Repository} from '../db/repository';
import type {NotificationPort} from './port';

export interface SchedulerOptions {
  now?: () => Date;
  windowDays?: number;
}

/**
 * Garde la table `reminders` et les alarmes Android alignées sur les données :
 * 1. recalcule les rappels attendus à partir des tâches, habitudes, objectifs et contacts ;
 * 2. met la table à jour ;
 * 3. compare la table aux notifications déjà enregistrées auprès d'Android.
 * Chaque étape est idempotente, `refresh` peut donc être appelé à tout moment.
 */
export class ReminderScheduler {
  private readonly repo: Repository;
  private readonly port: NotificationPort;
  private readonly now: () => Date;
  private readonly planner: ReminderPlanner;
  private readonly windowDays: number;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(repo: Repository, port: NotificationPort, options: SchedulerOptions = {}) {
    this.repo = repo;
    this.port = port;
    this.now = options.now ?? (() => new Date());
    this.windowDays = options.windowDays ?? REMINDER_WINDOW_DAYS;
    this.planner = new ReminderPlanner(this.windowDays);
  }

  refresh(): Promise<void> {
    const run = this.chain.then(async () => {
      await this.deriveRows();
      await this.reconcileTriggers();
    });
    this.chain = run.catch(() => undefined);
    return run;
  }

  async deriveRows(): Promise<void> {
    const now = this.now();
    const today = toDay(now);
    const lastDay = addDays(today, this.windowDays);
    const {q, tables, store} = this.repo;
    const [tasks, habits, habitLogs, goals, contacts, settings, existing] = await Promise.all([
      q.tasksForReminders(today),
      q.habits(),
      q.habitLogsInRange(startOfWeek(today), lastDay),
      tables.goals.list(),
      q.contacts(),
      q.settings(),
      store.select('reminders', {includeDeleted: true}),
    ]);
    const derived = deriveReminders({now, tasks, habits, habitLogs, goals, contacts, settings});
    const diff = this.planner.diffRows(existing, derived, now);
    const changes =
      diff.insert.length + diff.update.length + diff.revive.length + diff.remove.length + diff.markFired.length;
    if (changes === 0) {
      return;
    }
    await store.transaction(async tx => {
      for (const d of diff.insert) {
        await tx.insert('reminders', {
          id: d.id,
          targetType: d.targetType,
          targetId: d.targetId,
          label: d.label,
          fireAt: d.fireAt,
          kind: d.kind,
          status: 'scheduled',
        });
      }
      for (const d of diff.revive) {
        await tx.upsert('reminders', {
          id: d.id,
          targetType: d.targetType,
          targetId: d.targetId,
          label: d.label,
          fireAt: d.fireAt,
          kind: d.kind,
          status: 'scheduled',
        });
      }
      for (const u of diff.update) {
        await tx.update('reminders', u.id, u.patch);
      }
      for (const id of diff.remove) {
        await tx.softDelete('reminders', id);
      }
      for (const id of diff.markFired) {
        await tx.update('reminders', id, {status: 'fired'});
      }
    }, 'derive');
  }

  async reconcileTriggers(): Promise<void> {
    const permissions = await this.port.permissions();
    if (!permissions.notifications) {
      return;
    }
    const now = this.now();
    const [rows, registered] = await Promise.all([
      this.repo.tables.reminders.list({orderBy: '"fire_at"'}),
      this.port.registered(),
    ]);
    const diff = this.planner.diffTriggers(rows, registered, now);
    if (diff.cancel.length > 0) {
      await this.port.cancel(diff.cancel);
    }
    for (const row of diff.schedule) {
      await this.port.schedule(row);
    }
    for (const row of diff.displayNow) {
      await this.port.show({
        id: row.id,
        title: titleFor(row.targetType),
        body: row.label,
        channel: 'reminders',
        data: {reminderId: row.id, targetType: row.targetType, targetId: row.targetId ?? ''},
      });
    }
  }
}

export function titleFor(targetType: string): string {
  switch (targetType) {
    case 'task':
      return 'Tâche';
    case 'habit':
      return 'Habitude';
    case 'goal':
      return 'Objectif';
    case 'contact':
      return 'Réseau';
    case 'budget':
      return 'Budget';
    default:
      return 'DONNI';
  }
}
