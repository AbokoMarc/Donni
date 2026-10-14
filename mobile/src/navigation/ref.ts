import {createNavigationContainerRef} from '@react-navigation/native';
import type {NotificationTarget} from '../notifications/handlers';
import type {RootParams} from './types';

export const navigationRef = createNavigationContainerRef<RootParams>();

export function openTarget(target: NotificationTarget | null): void {
  if (!target || !navigationRef.isReady()) {
    return;
  }
  switch (target.targetType) {
    case 'task':
      navigationRef.navigate('Temps');
      break;
    case 'habit':
      navigationRef.navigate('Habitudes');
      break;
    case 'goal':
      if (target.targetId) {
        navigationRef.navigate('Objectif', {goalId: target.targetId});
      } else {
        navigationRef.navigate('Direction');
      }
      break;
    case 'contact':
      if (target.targetId) {
        navigationRef.navigate('Contact', {contactId: target.targetId});
      } else {
        navigationRef.navigate('Reseau');
      }
      break;
    case 'budget':
      navigationRef.navigate('Argent');
      break;
    default:
      break;
  }
}
