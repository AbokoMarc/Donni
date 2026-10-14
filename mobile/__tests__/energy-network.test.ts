import {
  averageByMetric,
  dailyProgress,
  describeMetric,
  glassesToLiters,
  litersToGlasses,
  metricProgress,
  trendDirection,
} from '../src/domain/energy';
import {
  applyInteraction,
  contactStatus,
  contactsToFollowUp,
  decodeFrequency,
  encodeFrequency,
  frequencyLabel,
  nextContactAfter,
  telUrl,
  whatsappUrl,
} from '../src/domain/network';
import {makeContact} from './helpers';

describe('énergie', () => {
  it('convertit verres et litres', () => {
    expect(glassesToLiters(5)).toBe(1.25);
    expect(litersToGlasses(2)).toBe(8);
  });
  it('calcule les progressions', () => {
    expect(metricProgress({value: 5.5, target: 6})).toBe(92);
    expect(metricProgress({value: 9, target: 6})).toBe(100);
    expect(metricProgress({value: 3, target: null})).toBeNull();
    expect(dailyProgress([{value: 6, target: 6}, {value: 4, target: 8}, {value: 5, target: null}])).toBe(75);
    expect(dailyProgress([])).toBeNull();
  });
  it('décrit les métriques', () => {
    const sleep = describeMetric({metric: 'sleep', unit: 'h', value: 5.5, valueText: null, target: 6, label: 'Sommeil'});
    expect(sleep.value).toBe('5h30 / 6h00');
    expect(sleep.status).toBe('Cible non atteinte · 5h30 de sommeil');
    const water = describeMetric({metric: 'water', unit: 'verres', value: 5, valueText: null, target: 8, label: 'Eau'});
    expect(water.value).toBe('5/8 verres · 1,25 L / 2 L');
    expect(water.status).toBe('1,25 L bus sur 2 L visés');
    const mood = describeMetric({metric: 'mood', unit: null, value: 7, valueText: 'Calme', target: null, label: 'Humeur'});
    expect(mood.value).toBe('Calme');
    const empty = describeMetric({metric: 'sport', unit: 'séances', value: null, valueText: null, target: 4, label: 'Sport'});
    expect(empty.value).toBe('Non renseigné');
  });
  it('moyenne et tendance sur données réelles', () => {
    const avg = averageByMetric([
      {metric: 'mood', value: 6},
      {metric: 'mood', value: 8},
      {metric: 'mood', value: null},
      {metric: 'sleep', value: 7},
    ]);
    expect(avg.mood).toEqual({average: 7, count: 2});
    expect(avg.sleep.count).toBe(1);
    expect(trendDirection([1, 1])).toBeNull();
    expect(trendDirection([5, 5, 7, 7])).toBe('up');
    expect(trendDirection([7, 7, 5, 5])).toBe('down');
    expect(trendDirection([6, 6, 6, 6])).toBe('stable');
  });
});

describe('réseau', () => {
  it('planifie la prochaine relance hebdomadaire', () => {
    const from = new Date(2026, 9, 7, 12, 0);
    const iso = nextContactAfter('weekly', 0, '10:00', from) as string;
    expect(new Date(iso).getDay()).toBe(0);
    expect(new Date(iso).getDate()).toBe(11);
    expect(new Date(iso).getHours()).toBe(10);
    const sameDayLater = nextContactAfter('weekly', 3, '15:00', from) as string;
    expect(new Date(sameDayLater).getDate()).toBe(7);
    const sameDayEarlier = nextContactAfter('weekly', 3, '09:00', from) as string;
    expect(new Date(sameDayEarlier).getDate()).toBe(14);
  });
  it('planifie bimensuel et mensuel', () => {
    const from = new Date(2026, 9, 7, 12, 0);
    const bi = new Date(nextContactAfter('biweekly', 2, null, from) as string);
    expect(bi.getDay()).toBe(2);
    expect(bi.getDate()).toBe(20);
    const monthly = new Date(nextContactAfter('monthly', 1, '10:00', from) as string);
    expect(monthly.getMonth()).toBe(10);
    expect(monthly.getDate()).toBe(1);
    const monthlyLater = new Date(nextContactAfter('monthly', 15, '10:00', from) as string);
    expect(monthlyLater.getMonth()).toBe(9);
    expect(nextContactAfter('none', null, null, from)).toBeNull();
  });
  it('met à jour le contact après un échange', () => {
    const contact = makeContact({frequencyKind: 'monthly', frequencyDay: 1, frequencyTime: '10:00'});
    const at = new Date(2026, 9, 7, 9, 0);
    const out = applyInteraction(contact, at);
    expect(out.lastContactAt).toBe(at.toISOString().replace('.000Z', 'Z'));
    expect(new Date(out.nextContactAt as string).getMonth()).toBe(10);
    const older = applyInteraction({...contact, lastContactAt: '2026-10-09T08:00:00Z'}, at);
    expect(older.lastContactAt).toBe('2026-10-09T08:00:00Z');
  });
  it('décrit l\'état du contact', () => {
    const now = new Date(2026, 9, 10, 9, 0);
    const planned = contactStatus({lastContactAt: null, nextContactAt: new Date(2026, 9, 12, 10).toISOString()}, now);
    expect(planned.state).toBe('planned');
    expect(planned.label).toBe('Prévu · Lun. 12 oct.');
    const overdue = contactStatus({lastContactAt: new Date(2026, 9, 1, 9).toISOString(), nextContactAt: new Date(2026, 9, 9, 10).toISOString()}, now);
    expect(overdue.state).toBe('overdue');
    expect(overdue.label).toBe('À relancer · dernier échange il y a 9j');
    const tracking = contactStatus({lastContactAt: new Date(2026, 9, 9, 9).toISOString(), nextContactAt: null}, now);
    expect(tracking.label).toBe('En suivi · Dernière activité 09 oct.');
    expect(contactStatus({lastContactAt: null, nextContactAt: null}, now).state).toBe('none');
  });
  it('sélectionne les contacts à relancer', () => {
    const now = new Date(2026, 9, 10, 9, 0);
    const a = makeContact({name: 'A', nextContactAt: new Date(2026, 9, 9, 10).toISOString(), lastContactAt: new Date(2026, 9, 2, 10).toISOString()});
    const b = makeContact({name: 'B', nextContactAt: new Date(2026, 9, 5, 10).toISOString()});
    const c = makeContact({name: 'C', lastContactAt: new Date(2026, 8, 1, 10).toISOString()});
    const d = makeContact({name: 'D', lastContactAt: new Date(2026, 9, 8, 10).toISOString()});
    const e = makeContact({name: 'E', nextContactAt: new Date(2026, 9, 20, 10).toISOString()});
    const out = contactsToFollowUp([a, b, c, d, e], now, 5);
    expect(out.map(x => x.contact.name)).toEqual(['B', 'A', 'C']);
    expect(contactsToFollowUp([a, b, c], now, 2)).toHaveLength(2);
  });
  it('encode les fréquences et construit les liens', () => {
    expect(frequencyLabel({kind: 'weekly', day: 0})).toBe('Hebdo · Dimanche');
    expect(frequencyLabel({kind: 'monthly', day: 1})).toBe('Mensuel · 1er du mois');
    expect(decodeFrequency(encodeFrequency({kind: 'biweekly', day: 2}))).toEqual({kind: 'biweekly', day: 2});
    expect(decodeFrequency('none').kind).toBe('none');
    expect(whatsappUrl('+237 690 12 34 56')).toBe('https://wa.me/237690123456');
    expect(telUrl('+237 690 12 34 56')).toBe('tel:+237690123456');
  });
});
