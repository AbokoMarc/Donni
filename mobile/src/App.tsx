import React, {useEffect, useState} from 'react';
import {ActivityIndicator, StatusBar, StyleSheet, View} from 'react-native';
import {DefaultTheme, NavigationContainer} from '@react-navigation/native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import notifee from '@notifee/react-native';
import {Text} from './components';
import {RuntimeProvider, useRuntime, useSession} from './hooks/runtime';
import {RootNavigator} from './navigation/RootNavigator';
import {navigationRef, openTarget} from './navigation/ref';
import {startFcm, stopFcm} from './notifications/fcm';
import {processNotificationEvent, targetOf} from './notifications/handlers';
import {notifeePort} from './notifications/notifee';
import {getRuntime} from './runtime';
import type {Runtime} from './runtime';
import {colors} from './theme';

const KV_ASKED = 'notifications.asked';

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.bg,
    text: colors.ink,
    border: colors.borderSoft,
    primary: colors.ink,
  },
};

function Effects() {
  const runtime = useRuntime();
  const session = useSession();
  const signedIn = session.state === 'active';
  const started = session.ready && session.choice !== null;

  useEffect(() => {
    if (!started) {
      return;
    }
    let cancelled = false;
    void (async () => {
      if ((await runtime.store.getKv(KV_ASKED)) === null) {
        await runtime.store.setKv(KV_ASKED, '1');
        await notifeePort.requestPermissions();
        if (!cancelled) {
          await runtime.scheduler.refresh();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [started, runtime]);

  useEffect(() => {
    if (signedIn) {
      void startFcm(runtime);
      return () => stopFcm();
    }
    return undefined;
  }, [signedIn, runtime]);

  useEffect(() => {
    void notifee.getInitialNotification().then(initial => {
      openTarget(targetOf(initial?.notification.data));
    });
    return notifee.onForegroundEvent(event => {
      void processNotificationEvent(event).then(openTarget);
    });
  }, []);

  return null;
}

export default function App() {
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getRuntime().then(setRuntime, () => setFailed(true));
  }, []);

  if (failed) {
    return (
      <View style={styles.center}>
        <Text variant="cardTitle" align="center">
          DONNI ne peut pas ouvrir sa base de données
        </Text>
        <Text variant="small" color={colors.inkSoft} align="center" style={styles.failure}>
          Fermez l’application et relancez-la. Si le problème persiste, libérez de l’espace de stockage.
        </Text>
      </View>
    );
  }

  if (!runtime) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <RuntimeProvider runtime={runtime}>
        <NavigationContainer ref={navigationRef} theme={navTheme}>
          <RootNavigator />
        </NavigationContainer>
        <Effects />
      </RuntimeProvider>
    </SafeAreaProvider>
  );
}


const styles = StyleSheet.create({
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 32},
  failure: {marginTop: 8},
});
