import {AppRegistry} from 'react-native';
import notifee from '@notifee/react-native';
import App from './src/App';
import {name as appName} from './app.json';
import {handleBackgroundNotificationEvent} from './src/notifications/handlers';
import {registerFcmBackgroundHandler} from './src/notifications/fcm';

notifee.onBackgroundEvent(handleBackgroundNotificationEvent);
registerFcmBackgroundHandler();

AppRegistry.registerComponent(appName, () => App);
