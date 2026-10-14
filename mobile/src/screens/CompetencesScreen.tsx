import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {
  AutoText,
  BottomSheet,
  Card,
  ConfirmSheet,
  DashedAddButton,
  EmptyState,
  IconButton,
  Minus,
  ModuleHeader,
  Plus,
  PrimaryButton,
  ProgressBar,
  Screen,
  Text,
  TextField,
  Trash2,
} from '../components';
import {formatXof} from '../domain';
import type {Skill} from '../domain';
import {useLiveQuery} from '../db';
import {useRuntime} from '../hooks/runtime';
import {colors} from '../theme';

const LEVEL_STEP = 5;

function parseXof(text: string): number | null {
  const cleaned = text.replace(/[\s  ]/g, '');
  if (cleaned === '') {
    return null;
  }
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

export function CompetencesScreen() {
  const nav = useNavigation();
  const {repo} = useRuntime();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Skill | null>(null);
  const skillsQuery = useLiveQuery(['skills'], q => q.skills());
  const skills = skillsQuery.data ?? [];

  const setLevel = (skill: Skill, level: number) => void repo.tables.skills.update(skill.id, {level: Math.max(0, Math.min(100, level))});

  return (
    <Screen>
      <ModuleHeader title="Compétences" editing={editing} onToggleEdit={() => setEditing(e => !e)} onBack={() => nav.goBack()} />
      {skills.length === 0 ? (
        <EmptyState title="Aucune compétence" message="Suivez le niveau des compétences qui font progresser vos revenus." />
      ) : (
        <View style={styles.list}>
          {skills.map(s => (
            <Card key={s.id} style={styles.skill}>
              <View style={styles.head}>
                {editing ? (
                  <AutoText label="Nom de la compétence" bold style={styles.grow} value={s.name} onCommit={v => v && void repo.tables.skills.update(s.id, {name: v})} />
                ) : (
                  <Text variant="bodyStrong" style={styles.grow}>
                    {s.name}
                  </Text>
                )}
                <Text variant="figure">{`${s.level}%`}</Text>
              </View>
              <ProgressBar value={s.level} label={s.name} />
              {s.monthlyTargetXof && !editing ? (
                <Text variant="caption" color={colors.inkSoft}>
                  {`Objectif mensuel : ${formatXof(s.monthlyTargetXof)}`}
                </Text>
              ) : null}
              {s.note && !editing ? (
                <Text variant="caption" color={colors.inkSoft}>
                  {s.note}
                </Text>
              ) : null}
              {editing ? (
                <>
                  <View style={styles.stepper}>
                    <IconButton icon={Minus} label={`Diminuer le niveau de ${s.name}`} onPress={() => setLevel(s, s.level - LEVEL_STEP)} />
                    <Text variant="small" color={colors.inkSoft}>
                      Niveau
                    </Text>
                    <IconButton icon={Plus} label={`Augmenter le niveau de ${s.name}`} onPress={() => setLevel(s, s.level + LEVEL_STEP)} />
                  </View>
                  <AutoText
                    label="Objectif mensuel en FCFA"
                    keyboardType="numeric"
                    placeholder="Objectif mensuel (FCFA)"
                    value={s.monthlyTargetXof === null ? '' : String(s.monthlyTargetXof)}
                    onCommit={v => void repo.tables.skills.update(s.id, {monthlyTargetXof: parseXof(v)})}
                  />
                  <AutoText label="Note" multiline placeholder="Note" value={s.note ?? ''} onCommit={v => void repo.tables.skills.update(s.id, {note: v || null})} />
                  <IconButton icon={Trash2} tone="danger" label={`Supprimer ${s.name}`} onPress={() => setDeleting(s)} />
                </>
              ) : null}
            </Card>
          ))}
        </View>
      )}
      {editing ? <DashedAddButton label="Ajouter une compétence" onPress={() => setAdding(true)} /> : null}

      <NewSkillSheet visible={adding} onClose={() => setAdding(false)} />
      <ConfirmSheet
        visible={deleting !== null}
        title="Supprimer cette compétence ?"
        message={deleting ? `« ${deleting.name} » sera supprimée.` : undefined}
        confirmLabel="Supprimer"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) {
            void repo.tables.skills.softDelete(deleting.id);
          }
          setDeleting(null);
        }}
      />
    </Screen>
  );
}

function NewSkillSheet({visible, onClose}: {visible: boolean; onClose: () => void}) {
  const {repo} = useRuntime();
  const [name, setName] = useState('');
  const [level, setLevelText] = useState('0');
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const n = Number(level);
    if (name.trim() === '') {
      setError('Indiquez le nom de la compétence.');
      return;
    }
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      setError('Le niveau doit être compris entre 0 et 100.');
      return;
    }
    await repo.tables.skills.insert({name: name.trim(), level: Math.round(n)});
    setName('');
    setLevelText('0');
    setError(null);
    onClose();
  };

  return (
    <BottomSheet visible={visible} title="Nouvelle compétence" onClose={onClose}>
      <View style={styles.form}>
        <TextField label="Nom" value={name} onChangeText={setName} error={error} />
        <TextField label="Niveau actuel (0 à 100)" value={level} onChangeText={setLevelText} keyboardType="number-pad" />
        <PrimaryButton label="Ajouter" onPress={() => void save()} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: {gap: 10, marginBottom: 12},
  skill: {gap: 10},
  head: {flexDirection: 'row', alignItems: 'center', gap: 12},
  grow: {flex: 1},
  stepper: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  form: {gap: 16, paddingBottom: 8},
});
