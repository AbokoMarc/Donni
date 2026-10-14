import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';
import {colors, radii} from '../theme';

interface CardProps {
  children: React.ReactNode;
  tone?: 'surface' | 'alt';
  outlined?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function Card({
  children,
  tone = 'surface',
  outlined = false,
  onPress,
  accessibilityLabel,
  style,
}: CardProps) {
  const base = [
    styles.card,
    tone === 'alt' && styles.alt,
    outlined && styles.outlined,
    style,
  ];
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({pressed}) => [base, pressed && styles.pressed]}>
        {children}
      </Pressable>
    );
  }
  return <View style={base}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: 16,
  },
  alt: {backgroundColor: colors.surfaceAlt},
  outlined: {borderWidth: 1, borderColor: colors.border},
  pressed: {opacity: 0.85},
});
