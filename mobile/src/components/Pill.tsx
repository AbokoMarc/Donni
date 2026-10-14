import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {colors, radii} from '../theme';
import {Text} from './Text';
import type {LucideIcon} from './icons';

export type PillTone = 'ink' | 'soft' | 'outline' | 'positive' | 'warning' | 'neutral';

interface PillProps {
  label: string;
  tone?: PillTone;
  icon?: LucideIcon;
  onPress?: () => void;
  accessibilityLabel?: string;
}

const TONES: Record<PillTone, {bg: string; fg: string; border?: string}> = {
  ink: {bg: colors.ink, fg: colors.onInk},
  soft: {bg: colors.surfaceAlt, fg: colors.ink},
  outline: {bg: 'transparent', fg: colors.ink, border: colors.ink},
  positive: {bg: '#E4EFE1', fg: colors.positive},
  warning: {bg: '#F3DFC6', fg: '#7A4A12'},
  neutral: {bg: colors.sunken, fg: colors.inkSoft},
};

export function Pill({label, tone = 'soft', icon: Icon, onPress, accessibilityLabel}: PillProps) {
  const t = TONES[tone];
  const body = (
    <View
      style={[
        styles.pill,
        {backgroundColor: t.bg},
        t.border ? {borderWidth: 1, borderColor: t.border} : null,
      ]}>
      {Icon ? <Icon size={14} color={t.fg} strokeWidth={1.75} /> : null}
      <Text variant="caption" color={t.fg} style={styles.text}>
        {label}
      </Text>
    </View>
  );
  if (!onPress) {
    return body;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      hitSlop={{top: 8, bottom: 8, left: 4, right: 4}}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  text: {fontFamily: 'Inter-Medium'},
});
