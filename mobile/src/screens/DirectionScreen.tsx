import React, {useMemo, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {
  BottomSheet,
  Card,
  ChevronRight,
  DashedAddButton,
  DateField,
  EmptyState,
  ModuleHeader,
  Pill,
  PrimaryButton,
  ProgressBar,
  Screen,
  SectionTitle,
  Text,
  TextField,
} from '../components';
import {GOAL_STATUS_LABELS, averageProgress, formatDayMonth, goalProgress} from '../domain';
import type {Goal, GoalStep} from '../domain';
import {useLiveQuery} from '../db';
import {useRuntime} from '../hooks/runtime';
import type {RootParams} from '../navigation/types';
import {colors} from '../theme';

export function DirectionScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);

  const goalsQuery = useLiveQuery(['goals'], q => q.goals());
  const stepsQuery = useLiveQuery(['goalSteps'], q => q.allSteps());
  const goals = goalsQuery.data ?? [];
  const steps = stepsQuery.data ?? [];

  const stepsByGoal = useMemo(() => {
    const map = new Map<string, GoalStep[]>();
    for (const s of steps) {
      map.set(s.goalId, [...(map.get(s.goalId) ?? []), s]);
    }
    return map;
  }, [steps]);

  const progressOf = (g: Goal) => goalProgress(g, stepsByGoal.get(g.id) ?? []);
  const active = goals.filter(g => g.status !== 'done');
  const finished = goals.filter(g => g.status === 'done');
  const overall = averageProgress(goals.map(progressOf));

  const row = (g: Goal) => (
    <Card key={g.id} style={styles.goal} onPress={() => nav.navigate('Objectif', {goalId: g.id})} accessibilityLabel={`${g.title}, ${progressOf(g)} %`}>
      <View style={styles.head}>
        <Text variant="bodyStrong" style={styles.grow} numberOfLines={2}>
          {g.title}
        </Text>
        <ChevronRight size={20} color={colors.inkSoft} strokeWidth={1.75} />
      </View>
      <ProgressBar value={progressOf(g)} label={g.title} />
      <View style={styles.meta}>
        <Pill label={GOAL_STATUS_LABELS[g.status]} tone={g.status === 'done' ? 'positive' : 'soft'} />
        <Text variant="caption" color={colors.inkSoft}>
          {`${progressOf(g)} %${g.dueDate ? ` · avant le ${formatDayMonth(g.dueDate)}` : ''}`}
        </Text>
      </View>
    </Card>
  );

  return (
    <Screen>
      <ModuleHeader title="Direction" editing={editing} onToggleEdit={() => setEditing(e => !e)} onBack={() => nav.goBack()} />
      <Card style={styles.overall}>
        <Text variant="body">Progression globale</Text>
        <Text variant="figureLarge">{`${overall}%`}</Text>
        <ProgressBar value={overall} height={10} label="Progression globale" />
      </Card>

      <SectionTitle count={active.length}>Objectifs en cours</SectionTitle>
      {active.length === 0 ? (
        <EmptyState title="Aucun objectif en cours" message="Définissez un cap pour les prochains mois." />
      ) : (
        <View style={styles.list}>{active.map(row)}</View>
      )}
      {editing ? <DashedAddButton label="Ajouter un objectif" onPress={() => setAdding(true)} /> : null}

      {finished.length > 0 ? (
        <>
          <SectionTitle count={finished.length}>Atteints</SectionTitle>
          <View style={styles.list}>{finished.map(row)}</View>
        </>
      ) : null}

      <NewGoalSheet visible={adding} onClose={() => setAdding(false)} onCreated={id => nav.navigate('Objectif', {goalId: id})} />
    </Screen>
  );
}

function NewGoalSheet({visible, onClose, onCreated}: {visible: boolean; onClose: () => void; onCreated: (id: string) => void}) {
  const {repo} = useRuntime();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (title.trim() === '') {
      setError('Donnez un titre à l’objectif.');
      return;
    }
    const goal = await repo.tables.goals.insert({title: title.trim(), status: 'todo', dueDate: due});
    setTitle('');
    setDue(null);
    setError(null);
    onClose();
    onCreated(goal.id);
  };

  return (
    <BottomSheet visible={visible} title="Nouvel objectif" onClose={onClose}>
      <View style={styles.form}>
        <TextField label="Titre" value={title} onChangeText={setTitle} error={error} />
        <DateField label="Échéance" value={due} onChange={setDue} />
        <PrimaryButton label="Ajouter" onPress={() => void save()} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  overall: {gap: 8, paddingVertical: 18},
  list: {gap: 10, marginBottom: 12},
  goal: {gap: 10},
  head: {flexDirection: 'row', alignItems: 'center', gap: 8},
  grow: {flex: 1},
  meta: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  form: {gap: 16, paddingBottom: 8},
});
