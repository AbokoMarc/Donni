import {AppState} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import {ApiClient} from './api/client';
import type {FetchLike} from './api/client';
import {createAuthApi} from './api/auth';
import {keychainTokenStore} from './api/keychainTokens';
import {createSyncApi} from './api/sync';
import {SessionService} from './auth/SessionService';
import {DEFAULT_API_URL} from './config';
import {createRepository, DataStore, openDatabase} from './db';
import type {Repository} from './db';
import {notifeePort} from './notifications/notifee';
import {ReminderScheduler} from './notifications/ReminderScheduler';
import {startEffects} from './services/effects';
import {SyncService, SyncStorage} from './sync';

const KV_API_URL = 'api.url';

export interface Runtime {
  repo: Repository;
  store: DataStore;
  api: ApiClient;
  session: SessionService;
  storage: SyncStorage;
  sync: SyncService;
  scheduler: ReminderScheduler;
  getApiUrl(): string;
  setApiUrl(url: string): Promise<void>;
}

let pending: Promise<Runtime> | null = null;

/** Un seul exemplaire par processus : l'interface et les gestionnaires d'arrière-plan le partagent. */
export function getRuntime(): Promise<Runtime> {
  if (!pending) {
    pending = build().catch(error => {
      pending = null;
      throw error;
    });
  }
  return pending;
}

async function build(): Promise<Runtime> {
  const db = await openDatabase();
  const store = new DataStore(db);
  await store.init();
  const repo = createRepository(store);
  const storage = new SyncStorage(store);

  let apiUrl = (await store.getKv(KV_API_URL)) ?? DEFAULT_API_URL;
  let session!: SessionService;

  const api = new ApiClient({
    baseUrl: () => apiUrl,
    tokens: keychainTokenStore,
    fetchImpl: fetch as unknown as FetchLike,
    onSessionExpired: () => session.markExpired(),
  });

  const sync = new SyncService({
    storage,
    api: createSyncApi(api),
    onSessionExpired: () => session.markExpired(),
  });

  session = new SessionService({
    auth: createAuthApi(api),
    store,
    storage,
    hasTokens: async () => (await api.currentTokens()) !== null,
    setSyncSession: state => sync.setSession(state),
  });

  const scheduler = new ReminderScheduler(repo, notifeePort);

  await sync.start();
  await notifeePort.ensureChannels();
  await session.restore();
  void scheduler.refresh().catch(() => undefined);

  startEffects({
    repo,
    scheduler,
    port: notifeePort,
    onUserWrite: () => sync.notifyLocalWrite(),
  });

  NetInfo.addEventListener(state => {
    sync.setOnline(state.isConnected !== false && state.isInternetReachable !== false);
  });
  AppState.addEventListener('change', state => {
    if (state === 'active') {
      void scheduler.refresh().catch(() => undefined);
      void sync.syncNow();
    }
  });

  return {
    repo,
    store,
    api,
    session,
    storage,
    sync,
    scheduler,
    getApiUrl: () => apiUrl,
    async setApiUrl(url) {
      apiUrl = url.trim();
      await store.setKv(KV_API_URL, apiUrl);
    },
  };
}
