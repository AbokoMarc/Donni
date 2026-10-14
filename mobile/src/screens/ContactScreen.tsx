import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import type {RouteProp} from '@react-navigation/native';
import {
  AutoText,
  Avatar,
  Card,
  ConfirmSheet,
  EmptyState,
  GhostButton,
  MessageCircle,
  ModuleHeader,
  Phone,
  PrimaryButton,
  Screen,
  SectionTitle,
  SelectField,
  Text,
  TimeField,
  Trash2,
} from '../components';
import type {Option} from '../components';
import {
  DEFAULT_CONTACT_TIME,
  RELATION_LABELS,
  contactStatus,
  decodeFrequency,
  dayFromIso,
  encodeFrequency,
  formatDayLong,
  formatDayMonth,
  frequencyOptions,
  nextContactAfter,
  timeFromIso,
} from '../domain';
import type {Contact, ContactRelation, InteractionChannel} from '../domain';
import {useLiveQuery} from '../db';
import {useNow, useRuntime} from '../hooks/runtime';
import type {RootParams} from '../navigation/types';
import {colors} from '../theme';
import {reachContact} from './contactActions';

const RELATION_OPTIONS: Array<Option<ContactRelation>> = (Object.keys(RELATION_LABELS) as ContactRelation[]).map(k => ({
  value: k,
  label: RELATION_LABELS[k],
}));

const CHANNEL_LABELS: Record<InteractionChannel, string> = {
  call: 'Appel',
  whatsapp: 'WhatsApp',
  meeting: 'Rencontre',
  other: 'Autre échange',
};

export function ContactScreen() {
  const nav = useNavigation();
  const {params} = useRoute<RouteProp<RootParams, 'Contact'>>();
  const {repo} = useRuntime();
  const now = useNow();
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const contactQuery = useLiveQuery(['contacts'], q => q.contacts().then(all => all.find(c => c.id === params.contactId) ?? null), [params.contactId]);
  const interactionsQuery = useLiveQuery(['contactInteractions'], q => q.interactionsOfContact(params.contactId), [params.contactId]);
  const contact = contactQuery.data;
  const interactions = interactionsQuery.data ?? [];

  if (!contact) {
    return (
      <Screen>
        <ModuleHeader title="Contact" editing={false} onToggleEdit={() => undefined} onBack={() => nav.goBack()} editLabel="Modifier" />
        <EmptyState title="Contact introuvable" message="Ce contact a été supprimé ou n’est pas encore synchronisé." />
      </Screen>
    );
  }

  const status = contactStatus(contact, now);
  const patch = (data: Partial<Contact>) => void repo.tables.contacts.update(contact.id, data);

  const changeFrequency = (value: string) => {
    const spec = decodeFrequency(value);
    const base = contact.lastContactAt ? new Date(contact.lastContactAt) : now;
    const from = base.getTime() > now.getTime() ? base : now;
    patch({
      frequencyKind: spec.kind,
      frequencyDay: spec.day,
      nextContactAt: nextContactAfter(spec.kind, spec.day, contact.frequencyTime, from),
    });
  };

  const changeTime = (time: string) => {
    patch({
      frequencyTime: time,
      nextContactAt: nextContactAfter(contact.frequencyKind, contact.frequencyDay, time, now),
    });
  };

  const reach = async (channel: 'call' | 'whatsapp') => {
    setMessage(await reachContact(repo, contact, channel));
  };

  const frequencyValue = encodeFrequency({kind: contact.frequencyKind, day: contact.frequencyDay});

  return (
    <Screen>
      <ModuleHeader title={contact.name} editing={editing} onToggleEdit={() => setEditing(e => !e)} onBack={() => nav.goBack()} />

      <Card style={styles.head}>
        <Avatar name={contact.name} size={56} />
        <View style={styles.grow}>
          <Text variant="bodyStrong">{RELATION_LABELS[contact.relation]}</Text>
          <Text variant="small" color={status.state === 'overdue' ? colors.negative : colors.inkSoft}>
            {status.label}
          </Text>
          {contact.phone ? (
            <Text variant="caption" color={colors.inkSoft}>
              {contact.phone}
            </Text>
          ) : null}
        </View>
      </Card>

      {contact.phone ? (
        <View style={styles.reach}>
          <View style={styles.reachCell}>
            <PrimaryButton label="Appeler" icon={Phone} onPress={() => void reach('call')} />
          </View>
          <View style={styles.reachCell}>
            <GhostButton label="WhatsApp" icon={MessageCircle} onPress={() => void reach('whatsapp')} />
          </View>
        </View>
      ) : null}
      {message ? (
        <Text variant="small" color={colors.negative} accessibilityLiveRegion="polite" style={styles.message}>
          {message}
        </Text>
      ) : null}

      {editing ? (
        <View style={styles.form}>
          <AutoText label="Nom" bold value={contact.name} onCommit={v => v && patch({name: v})} />
          <AutoText label="Téléphone" value={contact.phone ?? ''} keyboardType="phone-pad" placeholder="+237 6 00 00 00 00" onCommit={v => patch({phone: v || null})} />
          <SelectField label="Relation" value={contact.relation} options={RELATION_OPTIONS} onChange={v => patch({relation: v})} />
          <SelectField label="Relance" value={frequencyValue} options={frequencyOptions()} onChange={changeFrequency} />
          {contact.frequencyKind !== 'none' ? <TimeField label="Heure de relance" value={contact.frequencyTime ?? DEFAULT_CONTACT_TIME} onChange={changeTime} /> : null}
          <AutoText label="Note" multiline value={contact.note ?? ''} placeholder="Note" onCommit={v => patch({note: v || null})} />
          <GhostButton label="Supprimer ce contact" icon={Trash2} onPress={() => setConfirmDelete(true)} />
        </View>
      ) : (
        <>
          {contact.nextContactAt ? (
            <Card tone="alt" style={styles.next}>
              <Text variant="label" color={colors.label}>
                Prochaine relance
              </Text>
              <Text variant="body">{`${formatDayLong(dayFromIso(contact.nextContactAt))} à ${timeFromIso(contact.nextContactAt)}`}</Text>
            </Card>
          ) : null}
          {contact.note ? (
            <Card style={styles.next}>
              <Text variant="body">{contact.note}</Text>
            </Card>
          ) : null}
        </>
      )}

      <SectionTitle count={interactions.length}>Historique</SectionTitle>
      {interactions.length === 0 ? (
        <EmptyState title="Aucun échange" message="Les appels et messages lancés depuis DONNI sont consignés ici." />
      ) : (
        <View style={styles.list}>
          {interactions.map(i => (
            <Card key={i.id} style={styles.interaction}>
              <View style={styles.grow}>
                <Text variant="bodyStrong">{CHANNEL_LABELS[i.channel]}</Text>
                {i.note ? (
                  <Text variant="caption" color={colors.inkSoft}>
                    {i.note}
                  </Text>
                ) : null}
              </View>
              <Text variant="caption" color={colors.inkSoft}>
                {`${formatDayMonth(dayFromIso(i.at))} · ${timeFromIso(i.at)}`}
              </Text>
            </Card>
          ))}
        </View>
      )}
      {!editing ? (
        <GhostButton
          label="Consigner une rencontre"
          onPress={() => void repo.recordInteraction(contact.id, 'meeting')}
          style={styles.meeting}
        />
      ) : null}

      <ConfirmSheet
        visible={confirmDelete}
        title="Supprimer ce contact ?"
        message={`« ${contact.name} » et son historique seront supprimés.`}
        confirmLabel="Supprimer"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          for (const i of interactions) {
            await repo.tables.contactInteractions.softDelete(i.id);
          }
          await repo.tables.contacts.softDelete(contact.id);
          nav.goBack();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: {flexDirection: 'row', alignItems: 'center', gap: 14},
  grow: {flex: 1, gap: 2},
  reach: {flexDirection: 'row', gap: 10, marginTop: 14},
  reachCell: {flex: 1},
  message: {marginTop: 10},
  form: {gap: 14, marginTop: 16},
  next: {marginTop: 14, gap: 4},
  list: {gap: 10},
  interaction: {flexDirection: 'row', alignItems: 'center', gap: 10},
  meeting: {marginTop: 16},
});
