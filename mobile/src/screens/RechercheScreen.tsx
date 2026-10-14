import React, {useDeferredValue, useMemo, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {Card, ChevronLeft, EmptyState, IconButton, Screen, Text, TextField} from '../components';
import {searchAll} from '../domain';
import type {SearchHit, SearchKind} from '../domain';
import {useLiveQuery} from '../db';
import type {RootParams} from '../navigation/types';
import {colors} from '../theme';

const KIND_LABELS: Record<SearchKind, string> = {
  contact: 'Contact',
  task: 'Tâche',
  note: 'Note',
  transaction: 'Transaction',
  goal: 'Objectif',
  habit: 'Habitude',
  skill: 'Compétence',
};

export function RechercheScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const corpusQuery = useLiveQuery(['contacts', 'tasks', 'notes', 'transactions', 'goals', 'habits', 'skills'], q => q.searchCorpus());
  const hits = useMemo(() => (corpusQuery.data ? searchAll(deferred, corpusQuery.data) : []), [corpusQuery.data, deferred]);

  const open = (hit: SearchHit) => {
    switch (hit.kind) {
      case 'contact':
        nav.navigate('Contact', {contactId: hit.id});
        break;
      case 'goal':
        nav.navigate('Objectif', {goalId: hit.id});
        break;
      case 'task':
        nav.navigate('Temps');
        break;
      case 'transaction':
        nav.navigate('Argent');
        break;
      case 'habit':
        nav.navigate('Habitudes');
        break;
      case 'skill':
        nav.navigate('Competences');
        break;
      case 'note':
        nav.navigate('Tabs', {screen: 'Notes'} as never);
        break;
    }
  };

  return (
    <Screen>
      <View style={styles.top}>
        <IconButton icon={ChevronLeft} label="Retour" onPress={() => nav.goBack()} />
      </View>
      <TextField
        value={query}
        onChangeText={setQuery}
        placeholder="Rechercher dans DONNI"
        accessibilityLabel="Rechercher dans DONNI"
        autoFocus
        returnKeyType="search"
        containerStyle={styles.field}
      />
      {deferred.trim() === '' ? (
        <EmptyState title="Recherche globale" message="Contacts, tâches, notes, transactions, objectifs, habitudes et compétences." />
      ) : hits.length === 0 ? (
        <EmptyState title="Aucun résultat" message={`Rien ne correspond à « ${deferred.trim()} ».`} />
      ) : (
        <View style={styles.list}>
          {hits.map(hit => (
            <Card key={`${hit.kind}:${hit.id}`} style={styles.hit} onPress={() => open(hit)} accessibilityLabel={`${KIND_LABELS[hit.kind]} ${hit.title}`}>
              <Text variant="caption" color={colors.label}>
                {KIND_LABELS[hit.kind]}
              </Text>
              <Text variant="bodyStrong" numberOfLines={1}>
                {hit.title}
              </Text>
              {hit.subtitle ? (
                <Text variant="caption" color={colors.inkSoft} numberOfLines={1}>
                  {hit.subtitle}
                </Text>
              ) : null}
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: {minHeight: 44, justifyContent: 'center', alignItems: 'flex-start'},
  field: {marginBottom: 16},
  list: {gap: 10},
  hit: {gap: 2},
});
