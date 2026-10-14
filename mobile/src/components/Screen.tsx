import React from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import type {ScrollViewProps, StyleProp, ViewStyle} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {colors, SCREEN_MARGIN} from '../theme';

interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  footer?: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  scrollProps?: Omit<ScrollViewProps, 'contentContainerStyle' | 'children'>;
  bottomInset?: boolean;
}

export function Screen({
  children,
  scroll = true,
  footer,
  contentStyle,
  scrollProps,
  bottomInset = true,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const padding = {
    paddingTop: insets.top + 12,
    paddingBottom: footer ? 12 : bottomInset ? insets.bottom + 24 : 24,
  };
  return (
    <View style={styles.root}>
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          {...scrollProps}
          contentContainerStyle={[styles.content, padding, contentStyle]}>
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.fill, padding, contentStyle]}>{children}</View>
      )}
      {footer ? (
        <View style={[styles.footer, {paddingBottom: insets.bottom + 12}]}>{footer}</View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  fill: {flex: 1},
  content: {paddingHorizontal: SCREEN_MARGIN},
  footer: {
    paddingHorizontal: SCREEN_MARGIN,
    paddingTop: 12,
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSoft,
  },
});
