import {
  applyQuietHours,
  BRIEF_TARGET_ID,
  deriveReminders,
  ReminderPlanner,
  rescheduleTask,
} from '../src/domain/reminders';
import type {DerivedReminder} from '../src/domain/reminders';
import type {Reminder} from '../src/domain/types';
import {base, makeContact, makeGoal, makeHabit, makeTask} from './helpers';

const now = new Date(2026, 9, 7, 8, 0, 0);
const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m, 0);
const noSettings = {quietStart: null, quietEnd: null, dailyBriefAt: null};

function derive(over: Partial<Parameters<typeof deriveReminders>[0]>) {
  return deriveReminders({
    now,
    tasks: [],
    habits: [],
    habitLogs: [],
    goals: [],
    contacts: [],
    settings: noSettings,
    ...over,
  });
}

describe('heures calmes', () => {
  it('décale à la fin de la plage qui passe minuit', () => {
    expect(applyQuietHours(at(7, 23, 30), '22:00', '07:00')).toEqual(at(8, 7));
    expect(applyQuietHours(at(7, 5, 0), '22:00', '07:00')).toEqual(at(7, 7));
    expect(applyQuietHours(at(7, 12, 0), '22:00', '07:00')).toEqual(at(7, 12));
  });
  it('gère une plage dans la journée et l\'absence de plage', () => {
    expect(applyQuietHours(at(7, 13, 30), '13:00', '14:00')).toEqual(at(7, 14));
    expect(applyQuietHours(at(7, 14, 0), '13:00', '14:00')).toEqual(at(7, 14));
    expect(applyQuietHours(at(7, 3, 0), null, null)).toEqual(at(7, 3));
    expect(applyQuietHours(at(7, 3, 0), '08:00', '08:00')).toEqual(at(7, 3));
  });
});

describe('deriveReminders : tâches', () => {
  it('programme le rappel de début et le suivi de fin', () => {
    const t = makeTask({title: 'Sport', day: '2026-10-07', startTime: '18:00', endTime: '19:00'});
    const out = derive({tasks: [t]});
    expect(out).toHaveLength(2);
    const start = out.find(r => r.kind === 'plain') as DerivedReminder;
    expect(new Date(start.fireAt)).toEqual(at(7, 18));
    expect(start.label).toBe('Sport · 18:00');
    expect(start.targetId).toBe(t.id);
    const smart = out.find(r => r.kind === 'smart') as DerivedReminder;
    expect(new Date(smart.fireAt)).toEqual(at(7, 19));
    expect(smart.label).toBe('Tu avais prévu 1h00 de Sport. Veux-tu la reprogrammer ?');
  });
  it('applique l\'avance de rappel', () => {
    const t = makeTask({title: 'Appel', startTime: '10:00', remindBeforeMin: 15});
    const [r] = derive({tasks: [t]});
    expect(new Date(r.fireAt)).toEqual(at(7, 9, 45));
    expect(r.label).toBe('Appel dans 15 min');
  });
  it('ignore terminées, passées, sans heure et pauses', () => {
    const tasks = [
      makeTask({startTime: '18:00', status: 'done'}),
      makeTask({startTime: '07:00'}),
      makeTask({startTime: null}),
      makeTask({startTime: '18:00', kind: 'break'}),
      makeTask({startTime: '18:00', day: '2026-11-30'}),
    ];
    expect(derive({tasks})).toEqual([]);
  });
  it('est stable : mêmes entrées, mêmes identifiants', () => {
    const t = makeTask({startTime: '18:00', endTime: '19:00'});
    const a = derive({tasks: [t]});
    const b = derive({tasks: [{...t, title: 'Autre'}]});
    expect(a.map(r => r.id)).toEqual(b.map(r => r.id));
    const moved = derive({tasks: [{...t, startTime: '19:30', endTime: '20:00'}]});
    expect(moved.find(r => r.kind === 'plain')?.id).toBe(a.find(r => r.kind === 'plain')?.id);
  });
  it('étend les récurrences sur 14 jours', () => {
    const t = makeTask({day: '2026-10-07', startTime: '18:00', recurrence: 'daily'});
    const out = derive({tasks: [t]});
    expect(out).toHaveLength(15);
    expect(new Date(out[14].fireAt)).toEqual(at(21, 18));
    const weekly = derive({tasks: [{...t, recurrence: 'weekly:1'}]});
    expect(weekly.map(r => new Date(r.fireAt).getDate())).toEqual([7, 12, 19]);
  });
  it('décale hors heures calmes sauf priorité haute', () => {
    const quiet = {...noSettings, quietStart: '22:00', quietEnd: '07:00'};
    const t = makeTask({day: '2026-10-08', startTime: '06:30', priority: 1});
    expect(new Date(derive({tasks: [t], settings: quiet})[0].fireAt)).toEqual(at(8, 7));
    const urgent = makeTask({day: '2026-10-08', startTime: '06:30', priority: 2});
    expect(new Date(derive({tasks: [urgent], settings: quiet})[0].fireAt)).toEqual(at(8, 6, 30));
  });
});

describe('deriveReminders : autres cibles', () => {
  it('habitudes : saute les périodes accomplies', () => {
    const h = makeHabit({title: 'Lire', remindAt: '20:00'});
    const out = derive({habits: [h], habitLogs: [{habitId: h.id, day: '2026-10-07', count: 1}]});
    expect(out).toHaveLength(14);
    expect(new Date(out[0].fireAt)).toEqual(at(8, 20));
    const weekly = makeHabit({cadence: 'weekly', targetPerPeriod: 2, remindAt: '08:30'});
    const w = derive({habits: [weekly], habitLogs: [{habitId: weekly.id, day: '2026-10-06', count: 2}]});
    expect(w.every(r => new Date(r.fireAt) >= at(12, 0))).toBe(true);
  });
  it('habitudes archivées ou sans heure : rien', () => {
    expect(derive({habits: [makeHabit({archived: true, remindAt: '20:00'}), makeHabit({remindAt: null})]})).toEqual([]);
  });
  it('objectifs : veille et jour de l\'échéance', () => {
    const g = makeGoal({title: 'Certification', dueDate: '2026-10-10'});
    const out = derive({goals: [g, makeGoal({dueDate: '2026-10-10', status: 'done'})]});
    expect(out.map(r => r.label)).toEqual([
      'Échéance demain : Certification',
      "Échéance aujourd'hui : Certification",
    ]);
    expect(new Date(out[0].fireAt)).toEqual(at(9, 9));
  });
  it('contacts : à la date de relance', () => {
    const c = makeContact({name: 'Idrissa', nextContactAt: at(12, 10).toISOString(), lastContactAt: at(1, 10).toISOString()});
    const [r] = derive({contacts: [c]});
    expect(r.label).toBe('Relancer Idrissa : dernier échange il y a 11 jours');
    expect(r.targetType).toBe('contact');
  });
  it('résumé du matin : un par jour avec le nombre de tâches', () => {
    const t = makeTask({day: '2026-10-08', startTime: '10:00'});
    const out = derive({tasks: [t], settings: {...noSettings, dailyBriefAt: '07:30'}});
    const briefs = out.filter(r => r.targetType === 'custom');
    expect(briefs).toHaveLength(14);
    expect(briefs[0].targetId).toBe(BRIEF_TARGET_ID);
    expect(briefs[0].label).toBe("Résumé du matin : 1 tâche prévue aujourd'hui.");
    expect(briefs[1].label).toBe("Résumé du matin : aucune tâche prévue aujourd'hui.");
  });
});

function row(d: DerivedReminder, o: Partial<Reminder> = {}): Reminder {
  return {
    ...base({id: d.id}),
    targetType: d.targetType,
    targetId: d.targetId,
    label: d.label,
    fireAt: d.fireAt,
    status: 'scheduled',
    viaWhatsapp: false,
    whatsappSentAt: null,
    kind: d.kind,
    ...o,
  };
}

describe('ReminderPlanner.diffRows', () => {
  const planner = new ReminderPlanner();
  const t = makeTask({title: 'Sport', startTime: '18:00'});
  const [d] = derive({tasks: [t]});

  it('insère les rappels manquants', () => {
    const diff = planner.diffRows([], [d], now);
    expect(diff.insert).toEqual([d]);
  });
  it('est idempotent', () => {
    const diff = planner.diffRows([row(d)], [d], now);
    expect(diff).toEqual({insert: [], update: [], revive: [], remove: [], markFired: []});
  });
  it('remplace 18:00 par 19:30', () => {
    const moved = derive({tasks: [{...t, startTime: '19:30'}]})[0];
    const diff = planner.diffRows([row(d)], [moved], now);
    expect(diff.insert).toEqual([]);
    expect(diff.update).toHaveLength(1);
    expect(diff.update[0].patch.fireAt).toBe(moved.fireAt);
    expect(new Date(diff.update[0].patch.fireAt)).toEqual(at(7, 19, 30));
  });
  it('supprime les rappels qui ne sont plus attendus', () => {
    const diff = planner.diffRows([row(d)], [], now);
    expect(diff.remove).toEqual([d.id]);
  });
  it('conserve les rappels déjà déclenchés et les budgets', () => {
    const fired = row(d, {status: 'fired'});
    const budget = row({...d, id: 'b1', targetType: 'budget'});
    const diff = planner.diffRows([fired, budget], [], now);
    expect(diff.remove).toEqual([]);
  });
  it('réarme un rappel déjà déclenché dont l\'heure change', () => {
    const moved = derive({tasks: [{...t, startTime: '19:30'}]})[0];
    const diff = planner.diffRows([row(d, {status: 'fired'})], [moved], now);
    expect(diff.update[0].patch.status).toBe('scheduled');
  });
  it('ressuscite une ligne supprimée', () => {
    const diff = planner.diffRows([row(d, {deletedAt: '2026-10-07T07:00:00Z'})], [d], now);
    expect(diff.revive).toEqual([d]);
    expect(diff.insert).toEqual([]);
  });
  it('marque comme déclenchés les rappels échus depuis plus d\'une minute', () => {
    const old = row({...d, id: 'old'}, {fireAt: new Date(now.getTime() - 120_000).toISOString()});
    const fresh = row({...d, id: 'fresh'}, {fireAt: new Date(now.getTime() - 20_000).toISOString()});
    const diff = planner.diffRows([old, fresh], [d], now);
    expect(diff.markFired).toEqual(['old']);
  });
});

describe('ReminderPlanner.diffTriggers', () => {
  const planner = new ReminderPlanner();
  const t = makeTask({title: 'Sport', startTime: '18:00'});
  const [d] = derive({tasks: [t]});
  const ts = Date.parse(d.fireAt);

  it('programme ce qui manque', () => {
    const diff = planner.diffTriggers([row(d)], [], now);
    expect(diff.schedule.map(r => r.id)).toEqual([d.id]);
    expect(diff.cancel).toEqual([]);
  });
  it('ne fait rien quand tout est à jour', () => {
    const diff = planner.diffTriggers([row(d)], [{id: d.id, timestamp: ts, label: d.label}], now);
    expect(diff).toEqual({schedule: [], cancel: [], displayNow: []});
  });
  it('reprogramme si l\'heure ou le libellé diffère', () => {
    const diff = planner.diffTriggers([row(d)], [{id: d.id, timestamp: ts - 1000, label: d.label}], now);
    expect(diff.schedule).toHaveLength(1);
    const labelDiff = planner.diffTriggers([row(d)], [{id: d.id, timestamp: ts, label: 'x'}], now);
    expect(labelDiff.schedule).toHaveLength(1);
  });
  it('annule les orphelins et les lignes non planifiées', () => {
    const diff = planner.diffTriggers(
      [row(d, {status: 'dismissed'})],
      [{id: d.id, timestamp: ts, label: d.label}, {id: 'zzz', timestamp: ts, label: ''}],
      now,
    );
    expect(diff.cancel.sort()).toEqual([d.id, 'zzz'].sort());
  });
  it('affiche tout de suite un rappel tout juste échu', () => {
    const justNow = row({...d, id: 'late'}, {fireAt: new Date(now.getTime() - 5000).toISOString()});
    const diff = planner.diffTriggers([justNow], [], now);
    expect(diff.displayNow.map(r => r.id)).toEqual(['late']);
    expect(diff.schedule).toEqual([]);
  });
  it('ignore au-delà de 14 jours', () => {
    const far = row({...d, id: 'far'}, {fireAt: new Date(2026, 10, 30, 9).toISOString()});
    expect(planner.diffTriggers([far], [], now).schedule).toEqual([]);
  });
});

describe('Smart Reminder', () => {
  const task = {startTime: '18:00', endTime: '19:00', durationMin: null};
  it('Maintenant : dans dix minutes, durée conservée', () => {
    const out = rescheduleTask(task, 'now', at(7, 18, 30));
    expect(out).toEqual({day: '2026-10-07', startTime: '18:40', endTime: '19:40', status: 'todo'});
  });
  it('Maintenant passe minuit', () => {
    const out = rescheduleTask(task, 'now', at(7, 23, 55));
    expect(out.day).toBe('2026-10-08');
    expect(out.startTime).toBe('00:05');
  });
  it('Ce soir : 19:00, ou deux heures plus tard si déjà passé', () => {
    expect(rescheduleTask(task, 'evening', at(7, 15, 0)).startTime).toBe('19:00');
    const late = rescheduleTask(task, 'evening', at(7, 19, 30));
    expect(late.startTime).toBe('21:30');
    expect(late.endTime).toBe('22:30');
  });
  it('Demain : même heure', () => {
    const out = rescheduleTask(task, 'tomorrow', at(7, 19, 30));
    expect(out).toEqual({day: '2026-10-08', startTime: '18:00', endTime: '19:00', status: 'todo'});
  });
  it('sans durée connue, pas d\'heure de fin', () => {
    expect(rescheduleTask({startTime: '18:00', endTime: null, durationMin: null}, 'now', at(7, 9)).endTime).toBeNull();
  });
});

describe('mode focus', () => {
  it('ne garde que les rappels de tâches', () => {
    const now = new Date(2026, 9, 7, 8, 0, 0);
    const task = makeTask({title: 'Deep work', day: '2026-10-07', startTime: '09:00'});
    const contact = makeContact({name: 'Aminata', nextContactAt: new Date(2026, 9, 7, 17, 0, 0).toISOString()});
    const base = {now, tasks: [task], habits: [], habitLogs: [], goals: [], contacts: [contact]};
    const normal = deriveReminders({...base, settings: {quietStart: null, quietEnd: null, dailyBriefAt: null}});
    const focused = deriveReminders({
      ...base,
      settings: {quietStart: null, quietEnd: null, dailyBriefAt: null, focusMode: true},
    });
    expect(normal.map(r => r.targetType).sort()).toEqual(['contact', 'task']);
    expect(focused.every(r => r.targetType === 'task')).toBe(true);
  });
});
