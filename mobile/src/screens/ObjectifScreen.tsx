import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import type {RouteProp} from '@react-navigation/native';
import {
  AutoText,
  Card,
  Check,
  ConfirmSheet,
  DateField,
  EmptyState,
  GhostButton,
  IconButton,
  ModuleHeader,
  Plus,
  ProgressBar,
  Screen,
  SectionTitle,
  SelectField,
  Text,
  TextField,
  Trash2,
} from '../components';
import type {Option} from '../components';
import {GOAL_STATUS_LABELS, formatDayLong, goalProgress} from '../domain';
import type {GoalStatus} from '../domain';
import {useLiveQuery} from '../db';
import {useRuntime} from '../hooks/runtime';
import type {RootParams} from '../navigation/types';
import {colors} from '../theme';

const STATUS_OPTIONS: Array<Option<GoalStatus>> = (Object.keys(GOAL_STATUS_LABELS) as GoalStatus[]).map(k => ({
  value: k,
  label: GOAL_STATUS_LABELS[k],
}));

export function ObjectifScreen() {
  const nav = useNavigation();
  const {params} = useRoute<RouteProp<RootParams, 'Objectif'>>();
  const {repo} = useRuntime();
  const [editing, setEditing] = useState(false);
  const [newStep, setNewStep] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const goalQuery = useLiveQuery(['goals'], q => q.goals().then(all => all.find(g => g.id === params.goalId) ?? null), [params.goalId]);
  const stepsQuery = useLiveQuery(['goalSteps'], q => q.stepsOfGoal(params.goalId), [params.goalId]);
  const habitsQuery = useLiveQuery(['habits'], q => q.habits().then(all => all.filter(h => h.goalId === params.goalId)), [params.goalId]);
  const notesQuery = useLiveQuery(['notes'], q => q.notesFor('goal', params.goalId), [params.goalId]);

  const goal = goalQuery.data;
  const steps = stepsQuery.data ?? [];
  const habits = habitsQuery.data ?? [];
  const notes = notesQuery.data ?? [];

  if (!goal) {
    return (
      <Screen>
        <ModuleHeader title="Objectif" editing={false} onToggleEdit={() => undefined} onBack={() => nav.goBack()} />
        <EmptyState title="Objectif introuvable" message="Cet objectif a été supprimé ou n’est pas encore synchronisé." />
      </Screen>
    );
  }

  const progress = goalProgress(goal, steps);

  const addStep = async () => {
    const title = newStep.trim();
    if (title === '') {
      return;
    }
    await repo.tables.goalSteps.insert({goalId: goal.id, title, done: false, position: steps.length});
    setNewStep('');
  };

  const changeStatus = (status: GoalStatus) => void repo.tables.goals.update(goal.id, {status});

  return (
    <Screen>
      <ModuleHeader title={goal.title} editing={editing} onToggleEdit={() => setEditing(e => !e)} onBack={() => nav.goBack()} />

      <Card style={styles.progress}>
        <Text variant="figureLarge">{`${progress}%`}</Text>
        <ProgressBar value={progress} height={10} label={goal.title} />
        <Text variant="caption" color={colors.inkSoft}>
          {`${GOAL_STATUS_LABELS[goal.status]}${goal.dueDate ? ` · échéance ${formatDayLong(goal.dueDate)}` : ''}`}
        </Text>
      </Card>

      {editing ? (
        <View style={styles.form}>
          <AutoText label="Titre" bold value={goal.title} onCommit={v => v && void repo.tables.goals.update(goal.id, {title: v})} />
          <SelectField label="Statut" value={goal.status} options={STATUS_OPTIONS} onChange={changeStatus} />
          <DateField label="Échéance" value={goal.dueDate} onChange={v => void repo.tables.goals.update(goal.id, {dueDate: v})} />
          {steps.length === 0 ? (
            <AutoText
              label="Progression manuelle en pourcentage"
              keyboardType="numeric"
              value={goal.progressManual === null ? '' : String(goal.progressManual)}
              placeholder="Progression manuelle (0 à 100)"
              onCommit={v => {
                const n = Number(v.replace(',', '.'));
                void repo.tables.goals.update(goal.id, {progressManual: v === '' || !Number.isFinite(n) ? null : Math.max(0, Math.min(100, Math.round(n)))});
              }}
            />
          ) : null}
          <AutoText label="Notes" multiline value={goal.notes ?? ''} placeholder="Notes" onCommit={v => void repo.tables.goals.update(goal.id, {notes: v || null})} />
        </View>
      ) : goal.notes ? (
        <Card tone="alt" style={styles.notes}>
          <Text variant="body">{goal.notes}</Text>
        </Card>
      ) : null}

      <SectionTitle count={steps.length}>Étapes</SectionTitle>
      <View style={styles.list}>
        {steps.map(s => (
          <Card key={s.id} style={styles.step}>
            <IconButton
              icon={Check}
              filled={s.done}
              label={s.done ? `Rouvrir l’étape ${s.title}` : `Terminer l’étape ${s.title}`}
              onPress={() => void repo.tables.goalSteps.update(s.id, {done: !s.done})}
            />
            {editing ? (
              <AutoText label="Étape" style={styles.grow} value={s.title} onCommit={v => v && void repo.tables.goalSteps.update(s.id, {title: v})} />
            ) : (
              <Text variant="body" style={[styles.grow, s.done && styles.done]}>
                {s.title}
              </Text>
            )}
            {editing ? <IconButton icon={Trash2} tone="danger" label={`Supprimer l’étape ${s.title}`} onPress={() => void repo.tables.goalSteps.softDelete(s.id)} /> : null}
          </Card>
        ))}
      </View>
      <View style={styles.addStep}>
        <TextField containerStyle={styles.grow} value={newStep} onChangeText={setNewStep} placeholder="Nouvelle étape" accessibilityLabel="Nouvelle étape" onSubmitEditing={() => void addStep()} returnKeyType="done" />
        <IconButton icon={Plus} label="Ajouter l’étape" onPress={() => void addStep()} />
      </View>

      {habits.length > 0 ? (
        <>
          <SectionTitle count={habits.length}>Habitudes liées</SectionTitle>
          <View style={styles.list}>
            {habits.map(h => (
              <Card key={h.id}>
                <Text variant="body">{h.title}</Text>
              </Card>
            ))}
          </View>
        </>
      ) : null}
      {notes.length > 0 ? (
        <>
          <SectionTitle count={notes.length}>Notes liées</SectionTitle>
          <View style={styles.list}>
            {notes.map(n => (
              <Card key={n.id} style={styles.linked}>
                <Text variant="bodyStrong">{n.title}</Text>
                {n.body ? (
                  <Text variant="caption" color={colors.inkSoft} numberOfLines={2}>
                    {n.body}
                  </Text>
                ) : null}
              </Card>
            ))}
          </View>
        </>
      ) : null}

      {editing ? <GhostButton label="Supprimer cet objectif" icon={Trash2} style={styles.delete} onPress={() => setConfirmDelete(true)} /> : null}

      <ConfirmSheet
        visible={confirmDelete}
        title="Supprimer cet objectif ?"
        message="Ses étapes seront supprimées ; les habitudes liées sont conservées."
        confirmLabel="Supprimer"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          for (const s of steps) {
            await repo.tables.goalSteps.softDelete(s.id);
          }
          for (const h of habits) {
            await repo.tables.habits.update(h.id, {goalId: null});
          }
          await repo.tables.goals.softDelete(goal.id);
          nav.goBack();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  progress: {gap: 8, paddingVertical: 18},
  form: {gap: 14, marginTop: 16},
  notes: {marginTop: 14},
  list: {gap: 10, marginBottom: 12},
  step: {flexDirection: 'row', alignItems: 'center', gap: 8},
  grow: {flex: 1},
  done: {textDecorationLine: 'line-through', color: colors.inkSoft},
  addStep: {flexDirection: 'row', alignItems: 'center', gap: 8},
  linked: {gap: 2},
  delete: {marginTop: 24},
});
