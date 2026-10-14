import messaging from '@react-native-firebase/messaging';
import type {FirebaseMessagingTypes} from '@react-native-firebase/messaging';
import {registerDevice, unregisterDevice} from '../api/sync';
import {APP_VERSION} from '../config';
import {getRuntime} from '../runtime';
import type {Runtime} from '../runtime';
import {notifeePort} from './notifee';

type RemoteMessage = FirebaseMessagingTypes.RemoteMessage;

async function handleRemoteMessage(message: RemoteMessage, foreground: boolean): Promise<void> {
  const type = message.data?.type;
  if (type === 'sync_available') {
    const runtime = await getRuntime();
    await runtime.sync.syncNow();
    return;
  }
  const alreadyDisplayed = !foreground && message.notification !== undefined;
  if (alreadyDisplayed) {
    return;
  }
  const title = message.notification?.title;
  const body = message.notification?.body;
  if (title && body) {
    await notifeePort.show({id: message.messageId ?? `remote:${Date.now()}`, title, body, channel: 'alerts'});
  }
}

/** Sans configuration Firebase, tous les appels échouent proprement et FCM reste inactif. */
export function registerFcmBackgroundHandler(): void {
  try {
    messaging().setBackgroundMessageHandler(message => handleRemoteMessage(message, false));
  } catch {
    // Firebase n'est pas configuré pour cette compilation
  }
}

let currentToken: string | null = null;
let unsubscribers: Array<() => void> = [];

export async function startFcm(runtime: Runtime): Promise<void> {
  stopFcm();
  try {
    const token = await messaging().getToken();
    currentToken = token;
    await registerDevice(runtime.api, token, APP_VERSION);
    unsubscribers = [
      messaging().onTokenRefresh(next => {
        currentToken = next;
        void registerDevice(runtime.api, next, APP_VERSION).catch(() => undefined);
      }),
      messaging().onMessage(message => handleRemoteMessage(message, true)),
    ];
  } catch {
    currentToken = null;
  }
}

export function stopFcm(): void {
  unsubscribers.forEach(u => u());
  unsubscribers = [];
}

export async function forgetDevice(runtime: Runtime): Promise<void> {
  const token = currentToken;
  stopFcm();
  currentToken = null;
  if (token) {
    try {
      await unregisterDevice(runtime.api, token);
    } catch {
      // le serveur supprimera le jeton lors d'un envoi refusé
    }
  }
}
