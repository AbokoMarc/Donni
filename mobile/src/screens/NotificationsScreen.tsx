import React, {useCallback, useEffect, useState} from 'react';
import {AppState, StyleSheet, Switch, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {Card, ChevronLeft, GhostButton, IconButton, Pill, PrimaryButton, Screen, SectionTitle, Text, TimeField} from '../components';
import {useLiveQuery} from '../db';
import {useRuntime, useSession} from '../hooks/runtime';
import {notifeePort} from '../notifications/notifee';
import type {BatteryState, NotificationPermissions} from '../notifications/port';
import {colors} from '../theme';

export function NotificationsScreen() {
  const nav = useNavigation();
  const {repo, scheduler} = useRuntime();
  const session = useSession();
  const [permissions, setPermissions] = useState<NotificationPermissions | null>(null);
  const [battery, setBattery] = useState<BatteryState | null>(null);
  const [sent, setSent] = useState(false);
  const settingsQuery = useLiveQuery(['settings'], q => q.settings());
  const settings = settingsQuery.data;

  const refresh = useCallback(async () => {
    setPermissions(await notifeePort.permissions());
    setBattery(await notifeePort.batteryState());
  }, []);

  useEffect(() => {
    void refresh();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        void refresh();
      }
    });
    return () => sub.remove();
  }, [refresh]);

  const request = async () => {
    setPermissions(await notifeePort.requestPermissions());
    await scheduler.refresh();
  };

  const test = async () => {
    await notifeePort.show({
      id: `test:${Date.now()}`,
      title: 'Notification de test',
      body: 'Les rappels DONNI s’affichent correctement sur ce téléphone.',
      channel: 'reminders',
    });
    setSent(true);
  };

  const quietActive = settings?.quietStart !== null && settings?.quietEnd !== null && settings !== undefined;

  return (
    <Screen>
      <View style={styles.top}>
        <IconButton icon={ChevronLeft} label="Retour" onPress={() => nav.goBack()} />
      </View>
      <Text variant="moduleTitle" accessibilityRole="header">
        Notifications
      </Text>
      <Text variant="small" color={colors.inkSoft} style={styles.sub}>
        Les rappels sont programmés sur ce téléphone : ils sonnent même sans connexion ni serveur.
      </Text>

      <SectionTitle>Autorisations</SectionTitle>
      <Card style={styles.card}>
        <View style={styles.line}>
          <Text variant="body" style={styles.grow}>
            Notifications
          </Text>
          <Pill label={permissions?.notifications ? 'Autorisées' : 'Non autorisées'} tone={permissions?.notifications ? 'positive' : 'warning'} />
        </View>
        {permissions && !permissions.notifications ? <PrimaryButton label="Autoriser les notifications" onPress={() => void request()} /> : null}
        <View style={styles.line}>
          <Text variant="body" style={styles.grow}>
            Alarmes exactes
          </Text>
          <Pill label={permissions?.exactAlarms ? 'Autorisées' : 'Non autorisées'} tone={permissions?.exactAlarms ? 'positive' : 'warning'} />
        </View>
        {permissions && !permissions.exactAlarms ? (
          <>
            <Text variant="caption" color={colors.inkSoft}>
              Sans cette autorisation, Android peut retarder les rappels de quelques minutes.
            </Text>
            <GhostButton label="Ouvrir les réglages des alarmes" onPress={() => void notifeePort.openAlarmSettings()} />
          </>
        ) : null}
        <View style={styles.line}>
          <Text variant="body" style={styles.grow}>
            Économiseur de batterie
          </Text>
          <Pill label={battery?.restricted ? 'Restreint' : 'Sans restriction'} tone={battery?.restricted ? 'warning' : 'positive'} />
        </View>
        {battery?.restricted ? (
          <>
            <Text variant="caption" color={colors.inkSoft}>
              Certains téléphones arrêtent les applications en arrière-plan. Retirez la restriction pour DONNI afin de ne manquer aucun rappel.
            </Text>
            <GhostButton label="Ouvrir les réglages de batterie" onPress={() => void notifeePort.openBatterySettings()} />
          </>
        ) : null}
      </Card>

      <SectionTitle>Heures calmes</SectionTitle>
      <Card style={styles.card}>
        <Text variant="caption" color={colors.inkSoft}>
          Les rappels tombant dans cette plage sont repoussés à la fin des heures calmes.
        </Text>
        <View style={styles.times}>
          <View style={styles.grow}>
            <TimeField label="Début" value={settings?.quietStart ?? null} onChange={v => void repo.saveSettings({quietStart: v})} />
          </View>
          <View style={styles.grow}>
            <TimeField label="Fin" value={settings?.quietEnd ?? null} onChange={v => void repo.saveSettings({quietEnd: v})} />
          </View>
        </View>
        {quietActive ? <GhostButton label="Désactiver les heures calmes" onPress={() => void repo.saveSettings({quietStart: null, quietEnd: null})} /> : null}
      </Card>

      <SectionTitle>Résumé du matin</SectionTitle>
      <Card style={styles.card}>
        <Text variant="caption" color={colors.inkSoft}>
          Une notification quotidienne récapitule vos créneaux du jour.
        </Text>
        <TimeField label="Heure du résumé" value={settings?.dailyBriefAt ?? null} onChange={v => void repo.saveSettings({dailyBriefAt: v})} />
        {settings?.dailyBriefAt ? <GhostButton label="Désactiver le résumé" onPress={() => void repo.saveSettings({dailyBriefAt: null})} /> : null}
      </Card>

      <SectionTitle>WhatsApp</SectionTitle>
      <Card style={styles.card}>
        <View style={styles.line}>
          <Text variant="body" style={styles.grow}>
            Recevoir aussi mes rappels sur WhatsApp
          </Text>
          <Switch
            accessibilityLabel="Recevoir aussi mes rappels sur WhatsApp"
            disabled={session.state !== 'active'}
            value={settings?.whatsappOptIn ?? false}
            onValueChange={v => void repo.saveSettings({whatsappOptIn: v})}
            trackColor={{false: colors.sunken, true: colors.ink}}
            thumbColor={colors.onInk}
          />
        </View>
        <Text variant="caption" color={colors.inkSoft}>
          {session.state === 'active'
            ? 'Option facultative, envoyée par le serveur via l’API officielle WhatsApp Business. Les notifications du téléphone restent actives.'
            : 'Disponible une fois connecté à un compte et à un serveur configuré avec WhatsApp.'}
        </Text>
      </Card>

      <GhostButton label="Envoyer une notification de test" onPress={() => void test()} style={styles.test} />
      {sent ? (
        <Text variant="caption" color={colors.inkSoft} align="center" accessibilityLiveRegion="polite">
          Notification envoyée.
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: {minHeight: 44, justifyContent: 'center', alignItems: 'flex-start'},
  sub: {marginTop: 4},
  card: {gap: 12},
  line: {flexDirection: 'row', alignItems: 'center', gap: 12},
  grow: {flex: 1},
  times: {flexDirection: 'row', gap: 10},
  test: {marginTop: 24, marginBottom: 8},
});
