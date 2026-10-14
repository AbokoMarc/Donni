import React, {useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import type {BottomTabBarProps} from '@react-navigation/bottom-tabs';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {BarChart3, FileText, Home, Plus, Settings} from '../components/icons';
import type {LucideIcon} from '../components/icons';
import {QuickCapture} from '../components/QuickCapture';
import {colors} from '../theme';

const ICONS: Record<string, {icon: LucideIcon; label: string}> = {
  Accueil: {icon: Home, label: 'Accueil'},
  Bilan: {icon: BarChart3, label: 'Bilan'},
  Notes: {icon: FileText, label: 'Notes'},
  Reglages: {icon: Settings, label: 'Réglages'},
};

export function TabBar({state, navigation}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [capturing, setCapturing] = useState(false);
  return (
    <View style={[styles.wrap, {paddingBottom: insets.bottom}]}>
      <View style={styles.bar}>
        {state.routes.map((route, index) => {
          const spec = ICONS[route.name];
          const focused = state.index === index;
          const Icon = spec.icon;
          return (
            <React.Fragment key={route.key}>
              {index === 2 ? (
                <View style={styles.fabSlot}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Capture rapide"
                    onPress={() => setCapturing(true)}
                    style={({pressed}) => [styles.fab, pressed && styles.pressed]}>
                    <Plus size={26} color={colors.onInk} strokeWidth={2} />
                  </Pressable>
                </View>
              ) : null}
              <Pressable
                accessibilityRole="tab"
                accessibilityLabel={spec.label}
                accessibilityState={{selected: focused}}
                onPress={() => {
                  const event = navigation.emit({type: 'tabPress', target: route.key, canPreventDefault: true});
                  if (!focused && !event.defaultPrevented) {
                    navigation.navigate(route.name);
                  }
                }}
                style={styles.tab}>
                <Icon size={26} color={focused ? colors.ink : colors.muted} strokeWidth={focused ? 2.25 : 1.75} />
                <View style={[styles.indicator, focused && styles.indicatorOn]} />
              </Pressable>
            </React.Fragment>
          );
        })}
      </View>
      <QuickCapture visible={capturing} onClose={() => setCapturing(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.borderSoft},
  bar: {flexDirection: 'row', height: 60},
  tab: {flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44, gap: 6},
  indicator: {width: 20, height: 3, borderRadius: 2, backgroundColor: 'transparent'},
  indicatorOn: {backgroundColor: colors.accent},
  fabSlot: {width: 72, alignItems: 'center', justifyContent: 'center'},
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {opacity: 0.85},
});
