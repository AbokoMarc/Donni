import notifee, {
  AndroidImportance,
  AndroidNotificationSetting,
  AuthorizationStatus,
  TriggerType,
} from '@notifee/react-native';
import type {TimestampTrigger} from '@notifee/react-native';
import type {RegisteredTrigger} from '../domain/reminders';
import type {Reminder} from '../domain/types';
import {titleFor} from './ReminderScheduler';
import type {
  BatteryState,
  ImmediateNotification,
  NotificationChannel,
  NotificationPermissions,
  NotificationPort,
} from './port';

const CHANNELS: Record<NotificationChannel, {id: string; name: string; importance: AndroidImportance}> = {
  reminders: {id: 'donni-reminders', name: 'Rappels', importance: AndroidImportance.HIGH},
  alerts: {id: 'donni-alerts', name: 'Alertes', importance: AndroidImportance.DEFAULT},
};

const SMART_ACTIONS = [
  {title: 'Maintenant', pressAction: {id: 'now'}},
  {title: 'Ce soir', pressAction: {id: 'evening'}},
  {title: 'Demain', pressAction: {id: 'tomorrow'}},
];

function toNotification(row: Reminder) {
  const smart = row.kind === 'smart';
  return {
    id: row.id,
    title: smart ? 'Tâche non terminée' : titleFor(row.targetType),
    body: row.label,
    data: {
      reminderId: row.id,
      targetType: row.targetType,
      targetId: row.targetId ?? '',
      kind: row.kind,
    },
    android: {
      channelId: CHANNELS.reminders.id,
      smallIcon: 'ic_stat_donni',
      pressAction: {id: 'default', launchActivity: 'default'},
      showTimestamp: true,
      ...(smart ? {actions: SMART_ACTIONS} : {}),
    },
  };
}

export const notifeePort: NotificationPort = {
  async ensureChannels() {
    for (const channel of Object.values(CHANNELS)) {
      await notifee.createChannel(channel);
    }
  },

  async permissions(): Promise<NotificationPermissions> {
    const settings = await notifee.getNotificationSettings();
    return {
      notifications: settings.authorizationStatus === AuthorizationStatus.AUTHORIZED,
      exactAlarms: settings.android.alarm !== AndroidNotificationSetting.DISABLED,
    };
  },

  async requestPermissions(): Promise<NotificationPermissions> {
    await notifee.requestPermission();
    return notifeePort.permissions();
  },

  async registered(): Promise<RegisteredTrigger[]> {
    const list = await notifee.getTriggerNotifications();
    const out: RegisteredTrigger[] = [];
    for (const {notification, trigger} of list) {
      if (notification.id && trigger.type === TriggerType.TIMESTAMP) {
        out.push({
          id: notification.id,
          timestamp: (trigger as TimestampTrigger).timestamp,
          label: notification.body ?? '',
        });
      }
    }
    return out;
  },

  async schedule(row) {
    const trigger: TimestampTrigger = {
      type: TriggerType.TIMESTAMP,
      timestamp: Date.parse(row.fireAt),
      alarmManager: {allowWhileIdle: true},
    };
    await notifee.createTriggerNotification(toNotification(row), trigger);
  },

  async cancel(ids) {
    await notifee.cancelTriggerNotifications([...ids]);
  },

  async show(n: ImmediateNotification) {
    await notifee.displayNotification({
      id: n.id,
      title: n.title,
      body: n.body,
      data: n.data,
      android: {
        channelId: CHANNELS[n.channel].id,
        smallIcon: 'ic_stat_donni',
        pressAction: {id: 'default', launchActivity: 'default'},
      },
    });
  },

  async batteryState(): Promise<BatteryState> {
    return {restricted: await notifee.isBatteryOptimizationEnabled()};
  },

  openAlarmSettings() {
    return notifee.openAlarmPermissionSettings();
  },

  openBatterySettings() {
    return notifee.openBatteryOptimizationSettings();
  },
};
