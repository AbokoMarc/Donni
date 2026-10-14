import {createRepository} from '../src/db/repository';
import {checkBudgets} from '../src/services/effects';
import {applySmartAction} from '../src/notifications/smart';
import {ReminderScheduler} from '../src/notifications/ReminderScheduler';
import type {NotificationPort, ImmediateNotification} from '../src/notifications/port';
import type {RegisteredTrigger} from '../src/domain/reminders';
import type {Reminder} from '../src/domain/types';
import {createTestStore} from './support/nodeSqlite';

class FakePort implements NotificationPort {
  triggers = new Map<string, RegisteredTrigger>();
  shown: ImmediateNotification[] = [];
  granted = true;
  async ensureChannels() {}
  async permissions() {
    return {notifications: this.granted, exactAlarms: true};
  }
  async requestPermissions() {
    return this.permissions();
  }
  async registered() {
    return Array.from(this.triggers.values());
  }
  async schedule(row: Reminder) {
    this.triggers.set(row.id, {id: row.id, timestamp: Date.parse(row.fireAt), label: row.label});
  }
  async cancel(ids: readonly string[]) {
    ids.forEach(id => this.triggers.delete(id));
  }
  async show(n: ImmediateNotification) {
    this.shown.push(n);
  }
  async batteryState() {
    return {restricted: false};
  }
  async openAlarmSettings() {}
  async openBatterySettings() {}
}

const NOW = new Date(2026, 9, 7, 8, 0, 0);

async function setup() {
  const ctx = await createTestStore();
  const repo = createRepository(ctx.store);
  const port = new FakePort();
  const scheduler = new ReminderScheduler(repo, port, {now: () => NOW});
  return {repo, port, scheduler};
}

describe('ReminderScheduler', () => {
  it('programme un rappel local pour une tâche à 18:00', async () => {
    const {repo, port, scheduler} = await setup();
    const task = await repo.tables.tasks.insert({title: 'Sport', day: '2026-10-07', startTime: '18:00'});
    await scheduler.refresh();
    const rows = await repo.tables.reminders.list();
    const start = rows.find(r => r.targetId === task.id && r.kind === 'plain');
    expect(start?.label).toBe('Sport · 18:00');
    expect(port.triggers.size).toBe(1);
    const trigger = Array.from(port.triggers.values())[0];
    expect(trigger.timestamp).toBe(new Date(2026, 9, 7, 18, 0, 0).getTime());
  });

  it('déplacer 18:00 vers 19:30 annule l\'ancienne alarme et programme la nouvelle', async () => {
    const {repo, port, scheduler} = await setup();
    const task = await repo.tables.tasks.insert({title: 'Sport', day: '2026-10-07', startTime: '18:00'});
    await scheduler.refresh();
    const [before] = Array.from(port.triggers.keys());
    await repo.tables.tasks.update(task.id, {startTime: '19:30'});
    await scheduler.refresh();
    expect(port.triggers.size).toBe(1);
    expect(port.triggers.has(before)).toBe(true);
    expect(Array.from(port.triggers.values())[0].timestamp).toBe(new Date(2026, 9, 7, 19, 30, 0).getTime());
  });

  it('supprimer la tâche annule l\'alarme', async () => {
    const {repo, port, scheduler} = await setup();
    const task = await repo.tables.tasks.insert({title: 'Sport', day: '2026-10-07', startTime: '18:00'});
    await scheduler.refresh();
    expect(port.triggers.size).toBe(1);
    await repo.tables.tasks.softDelete(task.id);
    await scheduler.refresh();
    expect(port.triggers.size).toBe(0);
  });

  it('est idempotent : un second passage ne reprogramme rien', async () => {
    const {repo, port, scheduler} = await setup();
    await repo.tables.tasks.insert({title: 'Sport', day: '2026-10-07', startTime: '18:00'});
    await scheduler.refresh();
    const calls: string[] = [];
    const original = port.schedule.bind(port);
    port.schedule = async row => {
      calls.push(row.id);
      await original(row);
    };
    await scheduler.refresh();
    expect(calls).toHaveLength(0);
  });

  it('rattrape les alarmes perdues, par exemple après un redémarrage', async () => {
    const {repo, port, scheduler} = await setup();
    await repo.tables.tasks.insert({title: 'Sport', day: '2026-10-07', startTime: '18:00'});
    await scheduler.refresh();
    port.triggers.clear();
    await scheduler.refresh();
    expect(port.triggers.size).toBe(1);
  });

  it('ne programme rien sans autorisation de notification', async () => {
    const {repo, port, scheduler} = await setup();
    port.granted = false;
    await repo.tables.tasks.insert({title: 'Sport', day: '2026-10-07', startTime: '18:00'});
    await scheduler.refresh();
    expect(port.triggers.size).toBe(0);
    expect((await repo.tables.reminders.list()).length).toBeGreaterThan(0);
  });
});

describe('rappel intelligent', () => {
  it('reprogramme la tâche seulement sur action explicite', async () => {
    const {repo, scheduler} = await setup();
    const task = await repo.tables.tasks.insert({
      title: 'Java',
      day: '2026-10-07',
      startTime: '07:00',
      endTime: '09:00',
      status: 'doing',
    });
    await scheduler.deriveRows();
    const smart = (await repo.tables.reminders.list()).find(r => r.kind === 'smart');
    expect(smart).toBeTruthy();
    await applySmartAction(repo, smart!.id, 'evening', NOW);
    const moved = await repo.tables.tasks.get(task.id);
    expect(moved?.startTime).toBe('19:00');
    expect(moved?.endTime).toBe('21:00');
    expect(moved?.status).toBe('todo');
  });

  it('« Ignorer » ne touche pas à la tâche', async () => {
    const {repo, scheduler} = await setup();
    const task = await repo.tables.tasks.insert({
      title: 'Java',
      day: '2026-10-07',
      startTime: '07:00',
      endTime: '09:00',
    });
    await scheduler.deriveRows();
    const smart = (await repo.tables.reminders.list()).find(r => r.kind === 'smart')!;
    await applySmartAction(repo, smart.id, 'ignore', NOW);
    const same = await repo.tables.tasks.get(task.id);
    expect(same?.startTime).toBe('07:00');
    expect((await repo.tables.reminders.get(smart.id))?.status).toBe('dismissed');
  });
});

describe('alertes de budget', () => {
  it('prévient une fois à 80 % puis une fois à 100 %', async () => {
    const {repo, port} = await setup();
    await repo.tables.budgets.insert({month: '2026-10', limitXof: 10000});
    await repo.tables.transactions.insert({day: '2026-10-03', label: 'Courses', amountXof: -8000, category: 'alimentation'});
    await checkBudgets(repo, port, NOW);
    expect(port.shown).toHaveLength(1);
    expect(port.shown[0].body).toContain('80 %');
    await checkBudgets(repo, port, NOW);
    expect(port.shown).toHaveLength(1);
    await repo.tables.transactions.insert({day: '2026-10-05', label: 'Loyer', amountXof: -2500, category: 'logement'});
    await checkBudgets(repo, port, NOW);
    expect(port.shown).toHaveLength(2);
    expect(port.shown[1].body).toContain('atteinte');
  });
});
