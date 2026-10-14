import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {Card, ChevronLeft, GhostButton, IconButton, PrimaryButton, Screen, Text, TextField} from '../components';
import {messageFor} from '../api/errors';
import {useRuntime} from '../hooks/runtime';
import {colors} from '../theme';

export function ServeurScreen() {
  const nav = useNavigation();
  const runtime = useRuntime();
  const [url, setUrl] = useState(runtime.getApiUrl());
  const [status, setStatus] = useState<{ok: boolean; text: string} | null>(null);
  const [checking, setChecking] = useState(false);

  const save = async () => {
    const clean = url.trim();
    if (clean !== '' && !/^https?:\/\//i.test(clean)) {
      setStatus({ok: false, text: 'L’adresse doit commencer par http:// ou https://.'});
      return;
    }
    await runtime.setApiUrl(clean);
    setStatus({ok: true, text: clean === '' ? 'Aucun serveur : DONNI fonctionne uniquement sur ce téléphone.' : 'Adresse enregistrée.'});
    void runtime.sync.syncNow();
  };

  const test = async () => {
    setChecking(true);
    try {
      const origin = /^(https?:\/\/[^/]+)/i.exec(url.trim())?.[1];
      if (!origin) {
        setStatus({ok: false, text: 'Adresse invalide.'});
        return;
      }
      const response = await fetch(`${origin}/actuator/health`);
      setStatus(response.ok ? {ok: true, text: 'Le serveur répond.'} : {ok: false, text: `Le serveur a répondu avec le code ${response.status}.`});
    } catch (error) {
      setStatus({ok: false, text: messageFor(error)});
    } finally {
      setChecking(false);
    }
  };

  return (
    <Screen>
      <View style={styles.top}>
        <IconButton icon={ChevronLeft} label="Retour" onPress={() => nav.goBack()} />
      </View>
      <Text variant="moduleTitle" accessibilityRole="header">
        Serveur
      </Text>
      <Card tone="alt" style={styles.help}>
        <Text variant="caption">
          Le serveur sert uniquement à la synchronisation entre appareils et aux notifications à distance. Vos rappels
          fonctionnent sans lui.
        </Text>
      </Card>
      <TextField
        label="Adresse de l’API"
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="https://donni-api.example.com/api/v1"
      />
      {status ? (
        <Text variant="small" color={status.ok ? colors.positive : colors.negative} accessibilityLiveRegion="polite" style={styles.status}>
          {status.text}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <PrimaryButton label="Enregistrer" onPress={() => void save()} />
        <GhostButton label="Tester la connexion" loading={checking} disabled={url.trim() === ''} onPress={() => void test()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: {minHeight: 44, justifyContent: 'center', alignItems: 'flex-start'},
  help: {marginVertical: 16},
  status: {marginTop: 10},
  actions: {gap: 10, marginTop: 20},
});
