import notifee, {EventType} from '@notifee/react-native';
import type {Event} from '@notifee/react-native';
import {getRuntime} from '../runtime';
import {applySmartAction, isSmartAction} from './smart';

export interface NotificationTarget {
  targetType: string;
  targetId: string;
}

export function targetOf(data: Record<string, unknown> | undefined): NotificationTarget | null {
  const targetType = typeof data?.targetType === 'string' ? data.targetType : '';
  const targetId = typeof data?.targetId === 'string' ? data.targetId : '';
  return targetType ? {targetType, targetId} : null;
}

/** Traite les actions du rappel intelligent ; renvoie la cible à ouvrir quand l'utilisateur touche la notification. */
export async function processNotificationEvent(event: Event): Promise<NotificationTarget | null> {
  const {type, detail} = event;
  const notification = detail.notification;
  const reminderId = typeof notification?.data?.reminderId === 'string' ? notification.data.reminderId : null;

  if (type === EventType.ACTION_PRESS && reminderId && isSmartAction(detail.pressAction?.id)) {
    const runtime = await getRuntime();
    await applySmartAction(runtime.repo, reminderId, detail.pressAction.id);
    await runtime.scheduler.refresh();
    if (notification?.id) {
      await notifee.cancelNotification(notification.id);
    }
    return null;
  }

  if (type === EventType.DISMISSED && reminderId && notification?.data?.kind === 'smart') {
    const runtime = await getRuntime();
    await applySmartAction(runtime.repo, reminderId, 'ignore');
    return null;
  }

  if (type === EventType.PRESS) {
    return targetOf(notification?.data);
  }
  return null;
}

export async function handleBackgroundNotificationEvent(event: Event): Promise<void> {
  await processNotificationEvent(event);
}
