import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {colors, radii} from '../theme';
import {useRuntime, useSyncState} from '../hooks/runtime';
import type {RootParams} from '../navigation/types';
import {Text} from './Text';
import {Check, RefreshCw} from './icons';

/** Indication discrète de l'état de synchronisation ; ne s'affiche que si l'utilisateur a un compte ou un conflit. */
export function SyncBanner() {
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  const {sync} = useRuntime();
  const state = useSyncState();
  if (state.status === 'local') {
    return null;
  }
  const attention = state.status === 'conflicts' || state.status === 'expired' || state.status === 'error';
  const Icon = state.status === 'synced' ? Check : RefreshCw;
  const action = () => {
    if (state.status === 'conflicts') {
      nav.navigate('Conflits');
    } else if (state.status === 'expired') {
      nav.navigate('Compte');
    } else {
      void sync.syncNow();
    }
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${state.label}. Appuyer pour synchroniser`}
      onPress={action}
      style={[styles.banner, attention && styles.attention]}>
      <View style={styles.row}>
        <Icon size={14} color={attention ? colors.label : colors.inkSoft} strokeWidth={2} />
        <Text variant="caption" color={attention ? colors.label : colors.inkSoft}>
          {state.label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignSelf: 'flex-start',
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    marginBottom: 4,
  },
  attention: {backgroundColor: colors.surfaceAlt},
  row: {flexDirection: 'row', alignItems: 'center', gap: 6},
});
