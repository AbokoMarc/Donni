import React, {useMemo, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {
  AutoText,
  BottomSheet,
  Card,
  Check,
  ConfirmSheet,
  DashedAddButton,
  EmptyState,
  IconButton,
  ModuleHeader,
  Pill,
  PrimaryButton,
  Screen,
  SelectField,
  Text,
  TextField,
  TimeField,
  Trash2,
} from '../components';
import type {Option} from '../components';
import {addDays, bestStreak, currentStreak, periodProgress, toDay} from '../domain';
import type {Habit, HabitCadence, HabitLog} from '../domain';
import {useLiveQuery} from '../db';
import {useNow, useRuntime} from '../hooks/runtime';
import {colors} from '../theme';

const CADENCE_OPTIONS: Array<Option<HabitCadence>> = [
  {value: 'daily', label: 'Chaque jour'},
  {value: 'weekly', label: 'Chaque semaine'},
];

const HISTORY_DAYS = 400;

export function HabitudesScreen() {
  const nav = useNavigation();
  const {repo} = useRuntime();
  const today = toDay(useNow());
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Habit | null>(null);

  const habitsQuery = useLiveQuery(['habits'], q => q.habits());
  const logsQuery = useLiveQuery(['habitLogs'], q => q.habitLogsInRange(addDays(today, -HISTORY_DAYS), today), [today]);
  const habits = habitsQuery.data ?? [];

  const logsByHabit = useMemo(() => {
    const map = new Map<string, HabitLog[]>();
    for (const l of logsQuery.data ?? []) {
      map.set(l.habitId, [...(map.get(l.habitId) ?? []), l]);
    }
    return map;
  }, [logsQuery.data]);

  const countToday = (habit: Habit): number => (logsByHabit.get(habit.id) ?? []).find(l => l.day === today)?.count ?? 0;

  return (
    <Screen>
      <ModuleHeader title="Habitudes" editing={editing} onToggleEdit={() => setEditing(e => !e)} onBack={() => nav.goBack()} />
      {habits.length === 0 ? (
        <EmptyState title="Aucune habitude" message="Créez une habitude et cochez-la chaque jour pour construire une série." />
      ) : (
        <View style={styles.list}>
          {habits.map(h => {
            const logs = logsByHabit.get(h.id) ?? [];
            const progress = periodProgress(h, logs, today);
            const streak = currentStreak(h, logs, today);
            const unit = h.cadence === 'weekly' ? 'semaine' : 'jour';
            return (
              <Card key={h.id} style={styles.habit}>
                <View style={styles.head}>
                  <IconButton
                    icon={Check}
                    filled={progress.done}
                    label={`${h.title} : ${progress.count} sur ${progress.target}`}
                    onPress={() => void repo.setHabitCount(h.id, today, countToday(h) + 1)}
                  />
                  <View style={styles.grow}>
                    {editing ? (
                      <AutoText label="Titre" bold value={h.title} onCommit={v => v && void repo.tables.habits.update(h.id, {title: v})} />
                    ) : (
                      <Text variant="bodyStrong">{h.title}</Text>
                    )}
                    <Text variant="caption" color={colors.inkSoft}>
                      {`${progress.count}/${progress.target} · ${h.cadence === 'weekly' ? 'cette semaine' : 'aujourd’hui'}`}
                    </Text>
                  </View>
                  {streak > 0 ? <Pill label={`${streak} ${unit}${streak > 1 ? 's' : ''}`} tone={progress.done ? 'positive' : 'soft'} /> : null}
                </View>
                {countToday(h) > 0 ? (
                  <Text variant="caption" color={colors.inkSoft} onPress={() => void repo.setHabitCount(h.id, today, countToday(h) - 1)} accessibilityRole="button" accessibilityLabel={`Retirer une validation de ${h.title}`}>
                    Annuler la dernière validation
                  </Text>
                ) : null}
                {editing ? (
                  <View style={styles.form}>
                    <SelectField label="Rythme" value={h.cadence} options={CADENCE_OPTIONS} onChange={v => void repo.tables.habits.update(h.id, {cadence: v})} />
                    <AutoText
                      label="Occurrences par période"
                      keyboardType="number-pad"
                      value={String(h.targetPerPeriod)}
                      onCommit={v => {
                        const n = Math.round(Number(v));
                        if (Number.isFinite(n) && n >= 1 && n <= 50) {
                          void repo.tables.habits.update(h.id, {targetPerPeriod: n});
                        }
                      }}
                    />
                    <TimeField label="Rappel" value={h.remindAt} onChange={v => void repo.tables.habits.update(h.id, {remindAt: v})} />
                    {h.remindAt ? <Text variant="caption" color={colors.negative} onPress={() => void repo.tables.habits.update(h.id, {remindAt: null})} accessibilityRole="button">Retirer le rappel</Text> : null}
                    <Text variant="caption" color={colors.inkSoft}>{`Meilleure série : ${bestStreak(h, logs)}`}</Text>
                    <IconButton icon={Trash2} tone="danger" label={`Supprimer ${h.title}`} onPress={() => setDeleting(h)} />
                  </View>
                ) : null}
              </Card>
            );
          })}
        </View>
      )}
      {editing ? <DashedAddButton label="Ajouter une habitude" onPress={() => setAdding(true)} /> : null}

      <NewHabitSheet visible={adding} onClose={() => setAdding(false)} />
      <ConfirmSheet
        visible={deleting !== null}
        title="Supprimer cette habitude ?"
        message={deleting ? `« ${deleting.title} » et son historique seront supprimés.` : undefined}
        confirmLabel="Supprimer"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          const habit = deleting;
          setDeleting(null);
          if (habit) {
            for (const l of logsByHabit.get(habit.id) ?? []) {
              await repo.tables.habitLogs.softDelete(l.id);
            }
            await repo.tables.habits.softDelete(habit.id);
          }
        }}
      />
    </Screen>
  );
}

function NewHabitSheet({visible, onClose}: {visible: boolean; onClose: () => void}) {
  const {repo} = useRuntime();
  const [title, setTitle] = useState('');
  const [cadence, setCadence] = useState<HabitCadence>('daily');
  const [target, setTarget] = useState('1');
  const [remindAt, setRemindAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const n = Math.round(Number(target));
    if (title.trim() === '') {
      setError('Donnez un nom à l’habitude.');
      return;
    }
    if (!Number.isFinite(n) || n < 1 || n > 50) {
      setError('Le nombre d’occurrences doit être compris entre 1 et 50.');
      return;
    }
    await repo.tables.habits.insert({title: title.trim(), cadence, targetPerPeriod: n, remindAt});
    setTitle('');
    setTarget('1');
    setRemindAt(null);
    setError(null);
    onClose();
  };

  return (
    <BottomSheet visible={visible} title="Nouvelle habitude" onClose={onClose}>
      <View style={styles.formSheet}>
        <TextField label="Nom" value={title} onChangeText={setTitle} error={error} />
        <SelectField label="Rythme" value={cadence} options={CADENCE_OPTIONS} onChange={setCadence} />
        <TextField label="Occurrences par période" value={target} onChangeText={setTarget} keyboardType="number-pad" />
        <TimeField label="Rappel (facultatif)" value={remindAt} onChange={setRemindAt} />
        <PrimaryButton label="Ajouter" onPress={() => void save()} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: {gap: 10, marginBottom: 12},
  habit: {gap: 10},
  head: {flexDirection: 'row', alignItems: 'center', gap: 10},
  grow: {flex: 1, gap: 2},
  form: {gap: 12},
  formSheet: {gap: 16, paddingBottom: 8},
});
