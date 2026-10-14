import type {RegisteredTrigger} from '../domain/reminders';
import type {Reminder} from '../domain/types';

export interface NotificationPermissions {
  notifications: boolean;
  exactAlarms: boolean;
}

export type NotificationChannel = 'reminders' | 'alerts';

export interface ImmediateNotification {
  id: string;
  title: string;
  body: string;
  channel: NotificationChannel;
  data?: Record<string, string>;
}

export interface BatteryState {
  restricted: boolean;
}

/** Frontière avec Android : tout ce qui touche à Notifee passe par cette interface. */
export interface NotificationPort {
  ensureChannels(): Promise<void>;
  permissions(): Promise<NotificationPermissions>;
  requestPermissions(): Promise<NotificationPermissions>;
  registered(): Promise<RegisteredTrigger[]>;
  schedule(row: Reminder): Promise<void>;
  cancel(ids: readonly string[]): Promise<void>;
  show(notification: ImmediateNotification): Promise<void>;
  batteryState(): Promise<BatteryState>;
  openAlarmSettings(): Promise<void>;
  openBatterySettings(): Promise<void>;
}
