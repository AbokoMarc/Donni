import React from 'react';
import {StyleSheet, View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';
import {colors, radii} from '../theme';
import {Text} from './Text';
import type {LucideIcon} from './icons';
import {Card} from './Card';
import {initialOf} from '../domain/format';

export function Avatar({name, size = 48, icon: Icon, tone = 'ink'}: {name?: string; size?: number; icon?: LucideIcon; tone?: 'ink' | 'soft'}) {
  const ink = tone === 'ink';
  const fg = ink ? colors.surfaceAlt : colors.ink;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.avatar,
        {width: size, height: size, borderRadius: size / 2, backgroundColor: ink ? colors.ink : colors.surfaceAlt},
      ]}>
      {Icon ? (
        <Icon size={size * 0.46} color={fg} strokeWidth={1.75} />
      ) : (
        <Text variant="bodyStrong" color={fg} style={{fontSize: size * 0.42}}>
          {initialOf(name ?? '')}
        </Text>
      )}
    </View>
  );
}

export function StatTile({icon: Icon, label, value, style}: {icon: LucideIcon; label: string; value: string; style?: StyleProp<ViewStyle>}) {
  return (
    <Card style={[styles.tile, style]}>
      <View style={styles.tileHead}>
        <Icon size={18} color={colors.ink} strokeWidth={1.75} />
        <Text variant="small">{label}</Text>
      </View>
      <Text variant="figure" style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </Card>
  );
}

export function EmptyState({title, message, children}: {title: string; message?: string; children?: React.ReactNode}) {
  return (
    <View style={styles.empty}>
      <Text variant="cardTitle" align="center">
        {title}
      </Text>
      {message ? (
        <Text variant="small" color={colors.inkSoft} align="center" style={styles.emptyMessage}>
          {message}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

export function SectionTitle({children, count}: {children: string; count?: number}) {
  return (
    <View style={styles.section}>
      <Text variant="cardTitle" style={styles.sectionText}>
        {children}
      </Text>
      {count !== undefined ? (
        <View style={styles.count}>
          <Text variant="caption" style={styles.countText}>
            {count}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {alignItems: 'center', justifyContent: 'center'},
  tile: {flex: 1, paddingVertical: 14, paddingHorizontal: 14, gap: 10},
  tileHead: {flexDirection: 'row', alignItems: 'center', gap: 8},
  tileValue: {fontSize: 24, lineHeight: 30},
  empty: {paddingVertical: 32, paddingHorizontal: 16, alignItems: 'center', gap: 8},
  emptyMessage: {maxWidth: 300},
  divider: {height: StyleSheet.hairlineWidth, backgroundColor: colors.borderSoft},
  section: {flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 24, marginBottom: 12},
  sectionText: {fontSize: 20, lineHeight: 26},
  count: {
    minWidth: 28,
    height: 24,
    paddingHorizontal: 8,
    borderRadius: radii.field / 2,
    borderWidth: 1,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {fontFamily: 'Inter-SemiBold'},
});
