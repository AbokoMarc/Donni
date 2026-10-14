import React from 'react';
import {StyleSheet, View} from 'react-native';
import {colors} from '../theme';

interface ProgressBarProps {
  value: number;
  height?: number;
  color?: string;
  label?: string;
}

export function ProgressBar({value, height = 8, color = colors.ink, label}: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{min: 0, max: 100, now: Math.round(pct)}}
      style={[styles.track, {height, borderRadius: height / 2}]}>
      <View
        style={{
          width: `${pct}%`,
          height,
          borderRadius: height / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {backgroundColor: colors.sunken, overflow: 'hidden'},
});
