import React, {useMemo, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {
  BottomSheet,
  Card,
  DashedAddButton,
  EmptyState,
  GhostButton,
  IconButton,
  Minus,
  ModuleHeader,
  Plus,
  PrimaryButton,
  ProgressBar,
  RingProgress,
  Screen,
  SectionTitle,
  SelectField,
  Text,
  Trash2,
} from '../components';
import {
  METRIC_PRESETS,
  MOOD_OPTIONS,
  dailyProgress,
  describeMetric,
  formatDayLong,
  metricProgress,
  presetFor,
  shapeOf,
  toDay,
} from '../domain';
import type {EnergyLog, MetricShape} from '../domain';
import {useLiveQuery} from '../db';
import {useNow, useRuntime} from '../hooks/runtime';
import {colors} from '../theme';

interface Draft {
  value: number | null;
  valueText: string | null;
}

const STEP: Record<MetricShape, number> = {hours: 0.5, glasses: 1, count: 1, scale: 0.5, mood: 0};
const MAX: Record<MetricShape, number> = {hours: 24, glasses: 30, count: 20, scale: 10, mood: 10};

function clamp(shape: MetricShape, value: number): number {
  return Math.min(MAX[shape], Math.max(0, Math.round(value * 2) / 2));
}

export function EnergieScreen() {
  const nav = useNavigation();
  const {repo} = useRuntime();
  const now = useNow();
  const today = toDay(now);
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [adding, setAdding] = useState(false);

  const logsQuery = useLiveQuery(['energy'], q => q.energyForDay(today), [today]);
  const logs = logsQuery.data ?? [];
  const progress = useMemo(() => dailyProgress(logs), [logs]);

  const merged = (log: EnergyLog): EnergyLog => {
    const d = drafts[log.id];
    return d ? {...log, value: d.value, valueText: d.valueText} : log;
  };

  const startEditing = () => {
    setDrafts({});
    setEditing(true);
  };

  const cancel = () => {
    setDrafts({});
    setEditing(false);
  };

  const save = async () => {
    for (const log of logs) {
      const d = drafts[log.id];
      if (d && (d.value !== log.value || d.valueText !== log.valueText)) {
        await repo.tables.energy.update(log.id, {value: d.value, valueText: d.valueText});
      }
    }
    setDrafts({});
    setEditing(false);
  };

  const setDraft = (log: EnergyLog, patch: Partial<Draft>) => {
    setDrafts(prev => {
      const base = prev[log.id] ?? {value: log.value, valueText: log.valueText};
      return {...prev, [log.id]: {...base, ...patch}};
    });
  };

  const step = (log: EnergyLog, direction: 1 | -1) => {
    const current = merged(log);
    const shape = shapeOf(log);
    const next = clamp(shape, (current.value ?? 0) + direction * STEP[shape]);
    setDraft(log, {value: next});
  };

  const pickMood = (log: EnergyLog, key: string) => {
    const mood = MOOD_OPTIONS.find(m => m.key === key);
    if (mood) {
      setDraft(log, {valueText: mood.label, value: mood.score});
    }
  };

  const available = METRIC_PRESETS.filter(p => !logs.some(l => l.metric === p.metric));

  return (
    <Screen>
      <ModuleHeader title="Énergie" editing={editing} hideDone onToggleEdit={startEditing} onBack={() => nav.goBack()} />

      {!editing ? (
        <>
          <Card style={styles.goal}>
            <View style={styles.goalText}>
              <Text variant="body">Objectif du jour</Text>
              <Text variant="caption" color={colors.inkSoft}>
                {formatDayLong(today)}
              </Text>
            </View>
            {progress !== null ? <RingProgress value={progress} size={72} caption={`${progress}%`} /> : null}
          </Card>
          <SectionTitle count={logs.length}>Mesures</SectionTitle>
          {logs.length === 0 ? (
            <EmptyState title="Rien de saisi aujourd’hui" message="Appuyez sur Modifier pour renseigner votre sommeil, votre humeur ou votre eau." />
          ) : (
            <View style={styles.list}>
              {logs.map(log => {
                const text = describeMetric(log);
                const pct = metricProgress(log);
                return (
                  <Card key={log.id} style={styles.metric}>
                    <Text variant="label" color={colors.label}>
                      {log.label}
                    </Text>
                    <Text variant="figure">{text.value}</Text>
                    {pct !== null ? <ProgressBar value={pct} label={log.label} /> : null}
                    <Text variant="caption" color={colors.inkSoft}>
                      {text.status}
                    </Text>
                  </Card>
                );
              })}
            </View>
          )}
        </>
      ) : (
        <>
          <Card tone="alt" style={styles.help}>
            <Text variant="caption">Ajustez les valeurs avec les boutons, puis enregistrez. Annuler abandonne toutes les modifications.</Text>
          </Card>
          <View style={styles.list}>
            {logs.map(log => {
              const current = merged(log);
              const shape = shapeOf(log);
              const text = describeMetric(current);
              return (
                <Card key={log.id} outlined style={styles.metric}>
                  <View style={styles.metricHead}>
                    <Text variant="bodyStrong">{log.label}</Text>
                    <IconButton icon={Trash2} tone="danger" label={`Supprimer ${log.label}`} onPress={() => void repo.tables.energy.softDelete(log.id)} />
                  </View>
                  {shape === 'mood' ? (
                    <SelectField
                      label="Humeur"
                      value={MOOD_OPTIONS.find(m => m.label === current.valueText)?.key ?? null}
                      options={MOOD_OPTIONS.map(m => ({value: m.key, label: m.label}))}
                      onChange={key => pickMood(log, key)}
                    />
                  ) : (
                    <View style={styles.stepper}>
                      <IconButton icon={Minus} label={`Diminuer ${log.label}`} onPress={() => step(log, -1)} />
                      <Text variant="figure" style={styles.stepValue}>
                        {text.value}
                      </Text>
                      <IconButton icon={Plus} label={`Augmenter ${log.label}`} onPress={() => step(log, 1)} />
                    </View>
                  )}
                </Card>
              );
            })}
          </View>
          <DashedAddButton label="Ajouter une mesure" onPress={() => setAdding(true)} />
          <View style={styles.actions}>
            <View style={styles.actionCell}>
              <GhostButton label="Annuler" onPress={cancel} />
            </View>
            <View style={styles.actionCell}>
              <PrimaryButton label="Enregistrer" onPress={() => void save()} />
            </View>
          </View>
        </>
      )}

      <BottomSheet visible={adding} title="Ajouter une mesure" onClose={() => setAdding(false)}>
        <View style={styles.sheet}>
          {available.length === 0 ? (
            <Text variant="body" color={colors.inkSoft}>
              Toutes les mesures proposées sont déjà suivies aujourd’hui.
            </Text>
          ) : (
            available.map(preset => (
              <GhostButton
                key={preset.metric}
                label={preset.label}
                onPress={() => {
                  const shape = presetFor(preset.metric)?.shape ?? 'count';
                  void repo.tables.energy.insert({
                    day: today,
                    metric: preset.metric,
                    label: preset.label,
                    value: shape === 'mood' ? null : 0,
                    valueText: null,
                    target: preset.target,
                    unit: preset.unit,
                  });
                  setAdding(false);
                }}
              />
            ))
          )}
        </View>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  goal: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 18},
  goalText: {gap: 4},
  list: {gap: 10, marginBottom: 12},
  metric: {gap: 8},
  metricHead: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  help: {marginBottom: 16},
  stepper: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  stepValue: {flex: 1, textAlign: 'center'},
  actions: {flexDirection: 'row', gap: 10, marginTop: 20},
  actionCell: {flex: 1},
  sheet: {gap: 10, paddingBottom: 8},
});
