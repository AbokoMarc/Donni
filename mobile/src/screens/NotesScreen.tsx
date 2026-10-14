import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {
  BottomSheet,
  Card,
  ConfirmSheet,
  DashedAddButton,
  EmptyState,
  GhostButton,
  PrimaryButton,
  Screen,
  Text,
  TextField,
  Trash2,
} from '../components';
import {dayFromIso, formatDayMonth} from '../domain';
import type {Note} from '../domain';
import {useLiveQuery} from '../db';
import {useRuntime} from '../hooks/runtime';
import {colors} from '../theme';

export function NotesScreen() {
  const {repo} = useRuntime();
  const [editing, setEditing] = useState<Note | 'new' | null>(null);
  const notesQuery = useLiveQuery(['notes'], q => q.notes(200));
  const notes = notesQuery.data ?? [];

  return (
    <Screen>
      <Text variant="moduleTitle" accessibilityRole="header">
        Notes
      </Text>
      <Text variant="small" color={colors.inkSoft} style={styles.sub}>
        DONNI · life OS
      </Text>
      <View style={styles.add}>
        <DashedAddButton label="Nouvelle note" onPress={() => setEditing('new')} />
      </View>
      {notes.length === 0 ? (
        <EmptyState title="Aucune note" message="Gardez ici vos idées, vos comptes rendus et vos décisions." />
      ) : (
        <View style={styles.list}>
          {notes.map(n => (
            <Card key={n.id} style={styles.note} onPress={() => setEditing(n)} accessibilityLabel={`Note ${n.title}`}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {n.title}
              </Text>
              {n.body ? (
                <Text variant="small" color={colors.inkSoft} numberOfLines={3}>
                  {n.body}
                </Text>
              ) : null}
              <Text variant="caption" color={colors.inkSoft}>
                {formatDayMonth(dayFromIso(n.updatedAt))}
              </Text>
            </Card>
          ))}
        </View>
      )}
      <NoteSheet note={editing} onClose={() => setEditing(null)} repoSave={repo} />
    </Screen>
  );
}

function NoteSheet({note, onClose, repoSave}: {note: Note | 'new' | null; onClose: () => void; repoSave: ReturnType<typeof useRuntime>['repo']}) {
  const existing = note !== null && note !== 'new' ? note : null;
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  React.useEffect(() => {
    setTitle(existing?.title ?? '');
    setBody(existing?.body ?? '');
    setError(null);
  }, [existing?.id, note === 'new']); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (title.trim() === '') {
      setError('Donnez un titre à la note.');
      return;
    }
    if (existing) {
      await repoSave.tables.notes.update(existing.id, {title: title.trim(), body});
    } else {
      await repoSave.tables.notes.insert({title: title.trim(), body});
    }
    onClose();
  };

  return (
    <BottomSheet visible={note !== null} title={existing ? 'Modifier la note' : 'Nouvelle note'} onClose={onClose}>
      <View style={styles.form}>
        <TextField label="Titre" value={title} onChangeText={setTitle} error={error} />
        <TextField label="Contenu" value={body} onChangeText={setBody} multiline textAlignVertical="top" />
        <PrimaryButton label="Enregistrer" onPress={() => void save()} />
        {existing ? <GhostButton label="Supprimer la note" icon={Trash2} onPress={() => setConfirm(true)} /> : null}
      </View>
      <ConfirmSheet
        visible={confirm}
        title="Supprimer cette note ?"
        confirmLabel="Supprimer"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          if (existing) {
            void repoSave.tables.notes.softDelete(existing.id);
          }
          onClose();
        }}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sub: {marginTop: 2, letterSpacing: 0.4},
  add: {marginTop: 16, marginBottom: 14},
  list: {gap: 10},
  note: {gap: 4},
  form: {gap: 16, paddingBottom: 8},
});
