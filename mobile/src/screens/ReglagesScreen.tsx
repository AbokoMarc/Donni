import React from 'react';
import {StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {Avatar, Card, ChevronRight, GhostButton, Pill, PrimaryButton, RefreshCw, Screen, Text} from '../components';
import type {LucideIcon} from '../components';
import {Settings as SettingsIcon, Users, Clock, Lock, Wallet} from '../components';
import {APP_VERSION} from '../config';
import {formatAgoMinutes} from '../domain';
import {useRuntime, useSession, useSyncState} from '../hooks/runtime';
import type {RootParams} from '../navigation/types';
import {colors} from '../theme';

type Nav = NativeStackNavigationProp<RootParams>;

function Entry({icon: Icon, title, detail, onPress}: {icon: LucideIcon; title: string; detail?: string; onPress: () => void}) {
  return (
    <Card style={styles.entry} onPress={onPress} accessibilityLabel={detail ? `${title}, ${detail}` : title}>
      <Icon size={22} color={colors.ink} strokeWidth={1.75} />
      <View style={styles.grow}>
        <Text variant="bodyStrong">{title}</Text>
        {detail ? (
          <Text variant="caption" color={colors.inkSoft}>
            {detail}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={20} color={colors.inkSoft} strokeWidth={1.75} />
    </Card>
  );
}

export function ReglagesScreen() {
  const nav = useNavigation<Nav>();
  const {sync} = useRuntime();
  const session = useSession();
  const state = useSyncState();

  const lastSync = state.lastSyncedAt
    ? formatAgoMinutes((Date.now() - new Date(state.lastSyncedAt).getTime()) / 60_000)
    : null;

  return (
    <Screen>
      <Text variant="moduleTitle" accessibilityRole="header">
        Réglages
      </Text>
      <Text variant="small" color={colors.inkSoft} style={styles.sub}>
        DONNI · life OS
      </Text>

      <Card style={styles.account}>
        <Avatar name={session.user?.fullName ?? 'D'} size={52} />
        <View style={styles.grow}>
          <Text variant="bodyStrong">{session.user?.fullName ?? 'Utilisation sans compte'}</Text>
          <Text variant="caption" color={colors.inkSoft}>
            {session.user?.phone ?? 'Les données restent sur ce téléphone.'}
          </Text>
        </View>
        <Pill label={state.label} tone={state.status === 'synced' ? 'positive' : state.status === 'conflicts' || state.status === 'error' || state.status === 'expired' ? 'warning' : 'soft'} />
      </Card>

      {session.state === 'active' ? (
        <View style={styles.syncRow}>
          <GhostButton label="Synchroniser maintenant" icon={RefreshCw} onPress={() => void sync.syncNow()} />
          {lastSync ? (
            <Text variant="caption" color={colors.inkSoft} align="center">
              {`Dernière synchronisation ${lastSync}`}
            </Text>
          ) : null}
          {state.lastError ? (
            <Text variant="caption" color={colors.negative} align="center">
              {state.lastError}
            </Text>
          ) : null}
        </View>
      ) : session.state === 'expired' ? (
        <View style={styles.syncRow}>
          <PrimaryButton label="Se reconnecter" onPress={() => nav.navigate('Compte')} />
        </View>
      ) : (
        <View style={styles.syncRow}>
          <PrimaryButton label="Créer un compte ou se connecter" onPress={() => nav.navigate('Compte')} />
        </View>
      )}

      <View style={styles.list}>
        <Entry icon={Users} title="Compte" detail={session.user ? 'Mot de passe, déconnexion, suppression' : 'Connexion et création de compte'} onPress={() => nav.navigate('Compte')} />
        <Entry icon={Clock} title="Notifications et rappels" detail="Autorisations, heures calmes, résumé du matin" onPress={() => nav.navigate('Notifications')} />
        <Entry
          icon={Lock}
          title="Conflits de synchronisation"
          detail={state.conflicts > 0 ? `${state.conflicts} à résoudre` : 'Aucun'}
          onPress={() => nav.navigate('Conflits')}
        />
        <Entry icon={SettingsIcon} title="Serveur" detail="Adresse de l’API DONNI" onPress={() => nav.navigate('Serveur')} />
        <Entry icon={Wallet} title="Habitudes" detail="Suivi quotidien et séries" onPress={() => nav.navigate('Habitudes')} />
      </View>

      <Text variant="caption" color={colors.inkSoft} align="center" style={styles.version}>
        {`DONNI ${APP_VERSION}`}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sub: {marginTop: 2, letterSpacing: 0.4, marginBottom: 16},
  account: {flexDirection: 'row', alignItems: 'center', gap: 12},
  grow: {flex: 1, gap: 2},
  syncRow: {marginTop: 14, gap: 8},
  list: {gap: 10, marginTop: 20},
  entry: {flexDirection: 'row', alignItems: 'center', gap: 14},
  version: {marginTop: 28},
});
