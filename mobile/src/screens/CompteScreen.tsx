import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {
  Avatar,
  BottomSheet,
  Card,
  ChevronLeft,
  ConfirmSheet,
  GhostButton,
  IconButton,
  PrimaryButton,
  Screen,
  Text,
  TextField,
} from '../components';
import {messageFor} from '../api/errors';
import {useRuntime, useSession} from '../hooks/runtime';
import {forgetDevice} from '../notifications/fcm';
import {colors} from '../theme';
import {AuthScreen} from './AuthScreen';

export function CompteScreen() {
  const nav = useNavigation();
  const runtime = useRuntime();
  const session = useSession();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (!session.user) {
    return (
      <View style={styles.fill}>
        <AuthScreen embedded />
      </View>
    );
  }

  const closeSheets = () => {
    setPasswordOpen(false);
    setDeleteOpen(false);
    setCurrent('');
    setNext('');
    setError(null);
  };

  const changePassword = async () => {
    if (next.length < 8) {
      setError('Le nouveau mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    setBusy(true);
    try {
      await runtime.session.changePassword(current, next);
      closeSheets();
      setNotice('Mot de passe modifié.');
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  };

  const deleteAccount = async () => {
    setBusy(true);
    try {
      await forgetDevice(runtime);
      await runtime.session.deleteAccount(current);
      closeSheets();
      nav.goBack();
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setLogoutOpen(false);
    await forgetDevice(runtime);
    await runtime.session.logout();
  };

  return (
    <Screen>
      <View style={styles.top}>
        <IconButton icon={ChevronLeft} label="Retour" onPress={() => nav.goBack()} />
      </View>
      <Text variant="moduleTitle" accessibilityRole="header">
        Compte
      </Text>
      <Card style={styles.card}>
        <Avatar name={session.user.fullName} size={52} />
        <View style={styles.grow}>
          <Text variant="bodyStrong">{session.user.fullName}</Text>
          <Text variant="caption" color={colors.inkSoft}>
            {session.user.phone}
          </Text>
        </View>
      </Card>
      {notice ? (
        <Text variant="small" color={colors.positive} accessibilityLiveRegion="polite" style={styles.notice}>
          {notice}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <GhostButton label="Changer le mot de passe" onPress={() => setPasswordOpen(true)} />
        <GhostButton label="Se déconnecter" onPress={() => setLogoutOpen(true)} />
        <GhostButton label="Supprimer mon compte" onPress={() => setDeleteOpen(true)} />
      </View>
      <Text variant="caption" color={colors.inkSoft} style={styles.note}>
        Se déconnecter ou supprimer le compte conserve vos données sur ce téléphone.
      </Text>

      <BottomSheet visible={passwordOpen} title="Changer le mot de passe" onClose={closeSheets}>
        <View style={styles.form}>
          <TextField label="Mot de passe actuel" value={current} onChangeText={setCurrent} secureToggle autoCapitalize="none" />
          <TextField label="Nouveau mot de passe" value={next} onChangeText={setNext} secureToggle autoCapitalize="none" hint="8 caractères minimum." error={error} />
          <PrimaryButton label="Enregistrer" loading={busy} onPress={() => void changePassword()} />
        </View>
      </BottomSheet>

      <BottomSheet visible={deleteOpen} title="Supprimer mon compte" onClose={closeSheets}>
        <View style={styles.form}>
          <Text variant="body">
            Le compte et les données stockées sur le serveur seront supprimés définitivement. Les données de ce téléphone sont conservées.
          </Text>
          <TextField label="Mot de passe" value={current} onChangeText={setCurrent} secureToggle autoCapitalize="none" error={error} />
          <PrimaryButton label="Supprimer définitivement" loading={busy} disabled={current === ''} onPress={() => void deleteAccount()} />
        </View>
      </BottomSheet>

      <ConfirmSheet
        visible={logoutOpen}
        title="Se déconnecter ?"
        message="Vos données restent sur ce téléphone. Vos rappels continuent de fonctionner."
        confirmLabel="Se déconnecter"
        onCancel={() => setLogoutOpen(false)}
        onConfirm={() => void logout()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: {flex: 1},
  top: {minHeight: 44, justifyContent: 'center', alignItems: 'flex-start'},
  card: {flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 16},
  grow: {flex: 1, gap: 2},
  notice: {marginTop: 12},
  actions: {gap: 10, marginTop: 20},
  note: {marginTop: 14},
  form: {gap: 16, paddingBottom: 8},
});
