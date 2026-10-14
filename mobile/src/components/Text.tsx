import React from 'react';
import {Text as RNText} from 'react-native';
import type {TextProps as RNTextProps, TextStyle} from 'react-native';
import {colors, MAX_FONT_SCALE, typography} from '../theme';
import type {TextVariant} from '../theme';

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: string;
  align?: TextStyle['textAlign'];
}

export function Text({variant = 'body', color = colors.ink, align, style, ...rest}: TextProps) {
  const spec = typography[variant];
  return (
    <RNText
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      {...rest}
      style={[spec, {color, textAlign: align}, style]}
    />
  );
}
