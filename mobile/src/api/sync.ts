import type {SyncApi} from '../sync/SyncService';
import type {ApiClient} from './client';

export function createSyncApi(client: ApiClient): SyncApi {
  return {
    sync: request => client.request('POST', '/sync', {body: request}),
  };
}

export function registerDevice(
  client: ApiClient,
  fcmToken: string,
  appVersion?: string,
): Promise<void> {
  return client.request<void>('PUT', '/devices', {body: {fcmToken, appVersion}});
}

export function unregisterDevice(client: ApiClient, fcmToken: string): Promise<void> {
  return client.request<void>('DELETE', `/devices/${encodeURIComponent(fcmToken)}`);
}
