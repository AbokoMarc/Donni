import React from 'react';
import {ActivityIndicator, Pressable, StyleSheet, View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';
import {colors, MIN_TOUCH, radii} from '../theme';
import {Text} from './Text';
import type {LucideIcon} from './icons';
import {Plus} from './icons';

interface ButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: LucideIcon;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  icon: Icon,
  style,
  accessibilityHint,
}: ButtonProps) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{disabled: !!inactive, busy: !!loading}}
      disabled={inactive}
      onPress={onPress}
      style={({pressed}) => [
        styles.primary,
        inactive && styles.inactive,
        pressed && styles.pressed,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={colors.onInk} />
      ) : (
        <View style={styles.row}>
          {Icon ? <Icon size={20} color={colors.onInk} strokeWidth={1.75} /> : null}
          <Text variant="bodyStrong" color={colors.onInk} style={styles.primaryText}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export function GhostButton({label, onPress, disabled, icon: Icon, style}: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{disabled: !!disabled}}
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [styles.ghost, disabled && styles.inactive, pressed && styles.pressed, style]}>
      <View style={styles.row}>
        {Icon ? <Icon size={20} color={colors.ink} strokeWidth={1.75} /> : null}
        <Text variant="bodyStrong" style={styles.primaryText}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

interface CompactButtonProps {
  label: string;
  onPress: () => void;
  icon?: LucideIcon;
  tone?: 'ink' | 'soft';
  accessibilityLabel?: string;
}

export function CompactButton({label, onPress, icon: Icon, tone = 'ink', accessibilityLabel}: CompactButtonProps) {
  const ink = tone === 'ink';
  const fg = ink ? colors.onInk : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      hitSlop={{top: 6, bottom: 6, left: 4, right: 4}}
      style={({pressed}) => [
        styles.compact,
        {backgroundColor: ink ? colors.ink : colors.surfaceAlt},
        pressed && styles.pressed,
      ]}>
      {Icon ? <Icon size={16} color={fg} strokeWidth={1.75} /> : null}
      <Text variant="label" color={fg}>
        {label}
      </Text>
    </Pressable>
  );
}

interface IconButtonProps {
  icon: LucideIcon;
  onPress: () => void;
  label: string;
  filled?: boolean;
  tone?: 'ink' | 'danger' | 'muted';
  size?: number;
  disabled?: boolean;
}

export function IconButton({icon: Icon, onPress, label, filled, tone = 'ink', size = 20, disabled}: IconButtonProps) {
  const color = tone === 'danger' ? colors.negative : tone === 'muted' ? colors.inkSoft : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{disabled: !!disabled}}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({pressed}) => [styles.iconButton, filled && styles.iconFilled, pressed && styles.pressed, disabled && styles.inactive]}>
      <Icon size={size} color={color} strokeWidth={1.75} />
    </Pressable>
  );
}

export function DashedAddButton({label, onPress}: {label: string; onPress: () => void}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({pressed}) => [styles.dashed, pressed && styles.pressed]}>
      <Plus size={20} color={colors.ink} strokeWidth={2} />
      <Text variant="bodyStrong" style={styles.dashedText}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  primary: {
    minHeight: 52,
    borderRadius: radii.field,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  primaryText: {fontSize: 17},
  ghost: {
    minHeight: 52,
    borderRadius: radii.field,
    borderWidth: 1,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  row: {flexDirection: 'row', alignItems: 'center', gap: 8},
  inactive: {opacity: 0.5},
  pressed: {opacity: 0.85},
  compact: {
    minHeight: 36,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconButton: {
    width: MIN_TOUCH - 4,
    height: MIN_TOUCH - 4,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconFilled: {backgroundColor: colors.surfaceAlt},
  dashed: {
    minHeight: 56,
    borderRadius: radii.card,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.ink,
    backgroundColor: colors.sunken,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  dashedText: {fontSize: 17},
});
