import React, {useCallback, useEffect, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {Card, EmptyState, GhostButton, IconButton, ChevronLeft, PrimaryButton, Screen, Text} from '../components';
import type {ConflictRecord} from '../sync';
import {useRuntime, useSyncState} from '../hooks/runtime';
import {colors} from '../theme';

const ENTITY_LABELS: Record<string, string> = {
  tasks: 'Tâche',
  reminders: 'Rappel',
  goals: 'Objectif',
  goalSteps: 'Étape d’objectif',
  habits: 'Habitude',
  habitLogs: 'Validation d’habitude',
  accounts: 'Compte',
  transactions: 'Transaction',
  budgets: 'Budget',
  energy: 'Mesure d’énergie',
  contacts: 'Contact',
  contactInteractions: 'Échange',
  skills: 'Compétence',
  notes: 'Note',
  weeklyReviews: 'Bilan hebdomadaire',
  settings: 'Réglages',
};

const FIELD_LABELS: Record<string, string> = {
  title: 'Titre',
  name: 'Nom',
  label: 'Libellé',
  status: 'Statut',
  day: 'Jour',
  startTime: 'Début',
  endTime: 'Fin',
  amountXof: 'Montant',
  notes: 'Notes',
  note: 'Note',
  body: 'Contenu',
  phone: 'Téléphone',
  level: 'Niveau',
  dueDate: 'Échéance',
  value: 'Valeur',
  limitXof: 'Plafond',
  done: 'Terminé',
  count: 'Nombre',
};

function show(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return 'vide';
  }
  if (typeof value === 'boolean') {
    return value ? 'oui' : 'non';
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function differences(c: ConflictRecord): Array<{key: string; mine: string; server: string}> {
  const keys = new Set([...Object.keys(c.local.data), ...Object.keys(c.server.data)]);
  const out: Array<{key: string; mine: string; server: string}> = [];
  for (const key of keys) {
    const a = c.local.data[key];
    const b = c.server.data[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      out.push({key, mine: show(a), server: show(b)});
    }
  }
  return out;
}

export function ConflitsScreen() {
  const nav = useNavigation();
  const {storage, sync} = useRuntime();
  const {conflicts: count} = useSyncState();
  const [items, setItems] = useState<ConflictRecord[]>([]);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => setItems(await storage.listConflicts()), [storage]);
  useEffect(() => {
    void load();
  }, [load, count]);

  const resolve = async (c: ConflictRecord, choice: 'mine' | 'server') => {
    setBusy(c.id);
    try {
      await sync.resolveConflict(c.id, choice);
      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <View style={styles.top}>
        <IconButton icon={ChevronLeft} label="Retour" onPress={() => nav.goBack()} />
      </View>
      <Text variant="moduleTitle" accessibilityRole="header">
        Conflits
      </Text>
      <Text variant="small" color={colors.inkSoft} style={styles.sub}>
        Une même donnée a été modifiée sur deux appareils. Rien n’est écrasé sans votre choix.
      </Text>
      {items.length === 0 ? (
        <EmptyState title="Aucun conflit" message="Toutes vos données sont à jour." />
      ) : (
        <View style={styles.list}>
          {items.map(c => {
            const diffs = differences(c);
            return (
              <Card key={c.id} style={styles.card}>
                <Text variant="bodyStrong">{ENTITY_LABELS[c.entity] ?? c.entity}</Text>
                {c.local.deleted ? <Text variant="small">Supprimé sur ce téléphone.</Text> : null}
                {c.server.deleted ? <Text variant="small">Supprimé sur le serveur.</Text> : null}
                {diffs.map(d => (
                  <View key={d.key} style={styles.diff}>
                    <Text variant="label" color={colors.label}>
                      {FIELD_LABELS[d.key] ?? d.key}
                    </Text>
                    <Text variant="small">{`Ce téléphone : ${d.mine}`}</Text>
                    <Text variant="small">{`Serveur : ${d.server}`}</Text>
                  </View>
                ))}
                <View style={styles.actions}>
                  <View style={styles.cell}>
                    <PrimaryButton label="Garder la mienne" disabled={busy === c.id} onPress={() => void resolve(c, 'mine')} />
                  </View>
                  <View style={styles.cell}>
                    <GhostButton label="Garder le serveur" disabled={busy === c.id} onPress={() => void resolve(c, 'server')} />
                  </View>
                </View>
              </Card>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: {minHeight: 44, justifyContent: 'center', alignItems: 'flex-start'},
  sub: {marginTop: 4, marginBottom: 16},
  list: {gap: 12},
  card: {gap: 10},
  diff: {gap: 2},
  actions: {flexDirection: 'row', gap: 10, marginTop: 6},
  cell: {flex: 1},
});
