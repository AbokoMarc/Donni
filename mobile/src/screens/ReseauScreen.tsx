import React, {useMemo, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {
  Avatar,
  BottomSheet,
  Card,
  DashedAddButton,
  EmptyState,
  IconButton,
  MessageCircle,
  ModuleHeader,
  Phone,
  PrimaryButton,
  Screen,
  SectionTitle,
  SelectField,
  Text,
  TextField,
} from '../components';
import type {Option} from '../components';
import {RELATION_LABELS, contactStatus} from '../domain';
import type {Contact, ContactRelation} from '../domain';
import {useLiveQuery} from '../db';
import {useNow, useRuntime} from '../hooks/runtime';
import type {RootParams} from '../navigation/types';
import {colors} from '../theme';
import {reachContact} from './contactActions';
import type {ContactChannel} from './contactActions';

const RELATION_OPTIONS: Array<Option<ContactRelation>> = (Object.keys(RELATION_LABELS) as ContactRelation[]).map(k => ({
  value: k,
  label: RELATION_LABELS[k],
}));

export function ReseauScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  const {repo} = useRuntime();
  const now = useNow();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const contactsQuery = useLiveQuery(['contacts'], q => q.contacts());
  const contacts = contactsQuery.data ?? [];
  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle ? contacts.filter(c => c.name.toLowerCase().includes(needle)) : contacts;
  }, [contacts, search]);
  const overdue = useMemo(() => contacts.filter(c => contactStatus(c, now).state === 'overdue'), [contacts, now]);

  const reach = async (contact: Contact, channel: ContactChannel) => {
    setMessage(await reachContact(repo, contact, channel));
  };

  const row = (c: Contact) => {
    const status = contactStatus(c, now);
    return (
      <Card key={c.id} style={styles.row} onPress={() => nav.navigate('Contact', {contactId: c.id})} accessibilityLabel={`${c.name}, ${status.label}`}>
        <Avatar name={c.name} />
        <View style={styles.grow}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {c.name}
          </Text>
          <Text variant="caption" color={status.state === 'overdue' ? colors.negative : colors.inkSoft} numberOfLines={2}>
            {`${RELATION_LABELS[c.relation]} · ${status.label}`}
          </Text>
        </View>
        {c.phone ? (
          <View style={styles.actions}>
            <IconButton icon={Phone} label={`Appeler ${c.name}`} onPress={() => void reach(c, 'call')} />
            <IconButton icon={MessageCircle} label={`Écrire à ${c.name} sur WhatsApp`} onPress={() => void reach(c, 'whatsapp')} />
          </View>
        ) : null}
      </Card>
    );
  };

  return (
    <Screen>
      <ModuleHeader title="Réseau" editing={editing} onToggleEdit={() => setEditing(e => !e)} onBack={() => nav.goBack()} />
      {message ? (
        <Text variant="small" color={colors.negative} accessibilityLiveRegion="polite" style={styles.message}>
          {message}
        </Text>
      ) : null}

      {overdue.length > 0 ? (
        <>
          <SectionTitle count={overdue.length}>À relancer</SectionTitle>
          <View style={styles.list}>{overdue.map(row)}</View>
        </>
      ) : null}

      <SectionTitle count={contacts.length}>Contacts</SectionTitle>
      {contacts.length > 5 ? <TextField value={search} onChangeText={setSearch} placeholder="Rechercher un contact" accessibilityLabel="Rechercher un contact" containerStyle={styles.search} /> : null}
      {contacts.length === 0 ? (
        <EmptyState title="Aucun contact" message="Ajoutez les personnes qui comptent pour suivre vos échanges." />
      ) : (
        <View style={styles.list}>{shown.map(row)}</View>
      )}
      {editing ? <DashedAddButton label="Ajouter un contact" onPress={() => setAdding(true)} /> : null}

      <NewContactSheet visible={adding} onClose={() => setAdding(false)} onCreated={id => nav.navigate('Contact', {contactId: id})} />
    </Screen>
  );
}

function NewContactSheet({visible, onClose, onCreated}: {visible: boolean; onClose: () => void; onCreated: (id: string) => void}) {
  const {repo} = useRuntime();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState<ContactRelation>('ami');
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (name.trim() === '') {
      setError('Indiquez un nom.');
      return;
    }
    const created = await repo.tables.contacts.insert({
      name: name.trim(),
      phone: phone.trim() || null,
      relation,
      frequencyKind: 'none',
    });
    setName('');
    setPhone('');
    setError(null);
    onClose();
    onCreated(created.id);
  };

  return (
    <BottomSheet visible={visible} title="Nouveau contact" onClose={onClose}>
      <View style={styles.form}>
        <TextField label="Nom" value={name} onChangeText={setName} error={error} autoCapitalize="words" />
        <TextField label="Téléphone (format international)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+237 6 00 00 00 00" />
        <SelectField label="Relation" value={relation} options={RELATION_OPTIONS} onChange={setRelation} />
        <PrimaryButton label="Ajouter" onPress={() => void save()} />
      </View>
    </BottomSheet>
  );
}


const styles = StyleSheet.create({
  message: {marginBottom: 10},
  list: {gap: 10, marginBottom: 12},
  row: {flexDirection: 'row', alignItems: 'center', gap: 12},
  grow: {flex: 1, gap: 2},
  actions: {flexDirection: 'row'},
  search: {marginBottom: 12},
  form: {gap: 16, paddingBottom: 8},
});
