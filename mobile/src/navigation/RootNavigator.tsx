import React from 'react';
import {ActivityIndicator, StyleSheet, View} from 'react-native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {useSession} from '../hooks/runtime';
import {colors} from '../theme';
import {ArgentScreen} from '../screens/ArgentScreen';
import {AuthScreen} from '../screens/AuthScreen';
import {BilanScreen} from '../screens/BilanScreen';
import {CompetencesScreen} from '../screens/CompetencesScreen';
import {CompteScreen} from '../screens/CompteScreen';
import {ConflitsScreen} from '../screens/ConflitsScreen';
import {ContactScreen} from '../screens/ContactScreen';
import {DirectionScreen} from '../screens/DirectionScreen';
import {EnergieScreen} from '../screens/EnergieScreen';
import {HabitudesScreen} from '../screens/HabitudesScreen';
import {HomeScreen} from '../screens/HomeScreen';
import {NotesScreen} from '../screens/NotesScreen';
import {NotificationsScreen} from '../screens/NotificationsScreen';
import {ObjectifScreen} from '../screens/ObjectifScreen';
import {RechercheScreen} from '../screens/RechercheScreen';
import {ReglagesScreen} from '../screens/ReglagesScreen';
import {ReseauScreen} from '../screens/ReseauScreen';
import {ServeurScreen} from '../screens/ServeurScreen';
import {TempsScreen} from '../screens/TempsScreen';
import {TabBar} from './TabBar';
import type {RootParams, TabParams} from './types';

const Tab = createBottomTabNavigator<TabParams>();
const Stack = createNativeStackNavigator<RootParams>();

function Tabs() {
  return (
    <Tab.Navigator tabBar={props => <TabBar {...props} />} screenOptions={{headerShown: false}}>
      <Tab.Screen name="Accueil" component={HomeScreen} />
      <Tab.Screen name="Bilan" component={BilanScreen} />
      <Tab.Screen name="Notes" component={NotesScreen} />
      <Tab.Screen name="Reglages" component={ReglagesScreen} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const session = useSession();
  if (!session.ready) {
    return (
      <View style={styles.splash} accessibilityLabel="Chargement">
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }
  if (session.choice === null) {
    return <AuthScreen />;
  }
  return (
    <Stack.Navigator screenOptions={{headerShown: false, contentStyle: {backgroundColor: colors.bg}}}>
      <Stack.Screen name="Tabs" component={Tabs} />
      <Stack.Screen name="Temps" component={TempsScreen} />
      <Stack.Screen name="Argent" component={ArgentScreen} />
      <Stack.Screen name="Energie" component={EnergieScreen} />
      <Stack.Screen name="Reseau" component={ReseauScreen} />
      <Stack.Screen name="Direction" component={DirectionScreen} />
      <Stack.Screen name="Competences" component={CompetencesScreen} />
      <Stack.Screen name="Habitudes" component={HabitudesScreen} />
      <Stack.Screen name="Objectif" component={ObjectifScreen} />
      <Stack.Screen name="Contact" component={ContactScreen} />
      <Stack.Screen name="Recherche" component={RechercheScreen} />
      <Stack.Screen name="Conflits" component={ConflitsScreen} />
      <Stack.Screen name="Serveur" component={ServeurScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="Compte" component={CompteScreen} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  splash: {flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg},
});
