import {formatDecimal, formatHours} from './format';
import type {EnergyLog} from './types';

export const GLASS_LITERS = 0.25;

export const glassesToLiters = (glasses: number): number =>
  glasses * GLASS_LITERS;

export const litersToGlasses = (liters: number): number =>
  Math.round(liters / GLASS_LITERS);

export interface MoodOption {
  key: string;
  label: string;
  score: number;
}

export const MOOD_OPTIONS: MoodOption[] = [
  {key: 'exhausted', label: 'Épuisé', score: 2},
  {key: 'stressed', label: 'Stressé', score: 3},
  {key: 'neutral', label: 'Neutre', score: 5},
  {key: 'calm', label: 'Calme', score: 7},
  {key: 'energetic', label: 'Énergique', score: 8},
  {key: 'joyful', label: 'Joyeux', score: 9},
];

export type MetricShape = 'hours' | 'glasses' | 'count' | 'scale' | 'mood';

export interface MetricPreset {
  metric: string;
  label: string;
  shape: MetricShape;
  unit: string | null;
  target: number | null;
}

export const METRIC_PRESETS: MetricPreset[] = [
  {metric: 'sleep', label: 'Sommeil', shape: 'hours', unit: 'h', target: 7},
  {metric: 'mood', label: 'Humeur', shape: 'mood', unit: null, target: null},
  {metric: 'sport', label: 'Sport', shape: 'count', unit: 'séances', target: 1},
  {metric: 'water', label: 'Eau', shape: 'glasses', unit: 'verres', target: 8},
  {metric: 'focus', label: 'Concentration', shape: 'scale', unit: '/10', target: null},
  {metric: 'stress', label: 'Stress', shape: 'scale', unit: '/10', target: null},
  {metric: 'recovery', label: 'Récupération', shape: 'scale', unit: '/10', target: null},
];

export function presetFor(metric: string): MetricPreset | null {
  return METRIC_PRESETS.find(p => p.metric === metric) ?? null;
}

export function shapeOf(log: Pick<EnergyLog, 'metric' | 'unit'>): MetricShape {
  const preset = presetFor(log.metric);
  if (preset) {
    return preset.shape;
  }
  return log.unit === '/10' ? 'scale' : 'count';
}

/** Pourcentage 0..100, ou null quand la métrique n'a pas de cible. */
export function metricProgress(
  log: Pick<EnergyLog, 'value' | 'target'>,
): number | null {
  if (log.value == null || log.target == null || log.target <= 0) {
    return null;
  }
  return Math.max(0, Math.min(100, Math.round((log.value / log.target) * 100)));
}

export function dailyProgress(
  logs: ReadonlyArray<Pick<EnergyLog, 'value' | 'target'>>,
): number | null {
  const values = logs
    .map(metricProgress)
    .filter((v): v is number => v !== null);
  if (values.length === 0) {
    return null;
  }
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

export interface MetricDescription {
  value: string;
  status: string;
}

function plural(n: number, one: string, many: string): string {
  return n > 1 ? many : one;
}

export function describeMetric(
  log: Pick<
    EnergyLog,
    'metric' | 'unit' | 'value' | 'valueText' | 'target' | 'label'
  >,
): MetricDescription {
  const shape = shapeOf(log);
  const value = log.value;
  const reached =
    value != null && log.target != null && value >= log.target;
  if (shape === 'mood') {
    return {
      value: log.valueText ?? 'Non renseignée',
      status: log.valueText ? "Humeur notée aujourd'hui" : "Pas encore notée aujourd'hui",
    };
  }
  if (value == null) {
    return {value: 'Non renseigné', status: "Pas encore saisi aujourd'hui"};
  }
  if (shape === 'hours') {
    const target = log.target != null ? ` / ${formatHours(log.target)}` : '';
    const status =
      log.target == null
        ? `${formatHours(value)} de sommeil`
        : `${reached ? 'Cible atteinte' : 'Cible non atteinte'} · ${formatHours(
            value,
          )} de sommeil`;
    return {value: `${formatHours(value)}${target}`, status};
  }
  if (shape === 'glasses') {
    const liters = formatDecimal(glassesToLiters(value));
    const targetPart =
      log.target != null
        ? ` / ${formatDecimal(glassesToLiters(log.target))} L`
        : '';
    const status =
      log.target != null
        ? `${liters} L bus sur ${formatDecimal(glassesToLiters(log.target))} L visés`
        : `${liters} L bus`;
    return {
      value: `${value}${log.target != null ? `/${log.target}` : ''} ${plural(
        value,
        'verre',
        'verres',
      )} · ${liters} L${targetPart}`,
      status,
    };
  }
  if (shape === 'scale') {
    return {
      value: `${formatDecimal(value, 1)}/10`,
      status: `${log.label} : ${formatDecimal(value, 1)} sur 10`,
    };
  }
  const unit = log.unit ?? '';
  const target = log.target != null ? `/${log.target}` : '';
  return {
    value: `${value}${target}${unit ? ' ' + unit : ''}`,
    status:
      log.metric === 'sport'
        ? `${value} ${plural(value, 'séance réalisée', 'séances réalisées')} aujourd'hui`
        : `${log.label} : ${value}${unit ? ' ' + unit : ''}`,
  };
}

export interface MetricAverage {
  average: number;
  count: number;
}

export function averageByMetric(
  logs: ReadonlyArray<Pick<EnergyLog, 'metric' | 'value'>>,
): Record<string, MetricAverage> {
  const acc: Record<string, {sum: number; count: number}> = {};
  for (const l of logs) {
    if (l.value == null) {
      continue;
    }
    const e = (acc[l.metric] ??= {sum: 0, count: 0});
    e.sum += l.value;
    e.count += 1;
  }
  const out: Record<string, MetricAverage> = {};
  for (const [metric, e] of Object.entries(acc)) {
    out[metric] = {average: e.sum / e.count, count: e.count};
  }
  return out;
}

export type TrendDirection = 'up' | 'down' | 'stable';

/** Compare la moyenne de la seconde moitié à celle de la première. */
export function trendDirection(
  values: readonly number[],
  tolerance = 0.05,
): TrendDirection | null {
  if (values.length < 4) {
    return null;
  }
  const mid = Math.floor(values.length / 2);
  const mean = (xs: readonly number[]): number =>
    xs.reduce((a, b) => a + b, 0) / xs.length;
  const first = mean(values.slice(0, mid));
  const second = mean(values.slice(values.length - mid));
  const base = Math.max(Math.abs(first), 1e-9);
  const delta = (second - first) / base;
  if (delta > tolerance) {
    return 'up';
  }
  if (delta < -tolerance) {
    return 'down';
  }
  return 'stable';
}

export const TEN_SCALE_METRICS = ['mood', 'focus', 'recovery'];
