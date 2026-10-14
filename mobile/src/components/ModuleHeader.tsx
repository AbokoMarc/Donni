import React from 'react';
import {StyleSheet, View} from 'react-native';
import {colors} from '../theme';
import {CompactButton, IconButton} from './Buttons';
import {Pill} from './Pill';
import {Text} from './Text';
import {ChevronLeft, Lock, Pencil} from './icons';

interface ModuleHeaderProps {
  title: string;
  editing: boolean;
  onToggleEdit: () => void;
  onBack?: () => void;
  subtitle?: string;
  editLabel?: string;
  doneLabel?: string;
  hideDone?: boolean;
  rightExtra?: React.ReactNode;
}

export function ModuleHeader({
  title,
  editing,
  onToggleEdit,
  onBack,
  subtitle = 'DONNI · life OS',
  editLabel = 'Modifier',
  doneLabel = 'Terminé',
  hideDone,
  rightExtra,
}: ModuleHeaderProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        {onBack ? <IconButton icon={ChevronLeft} onPress={onBack} label="Retour" /> : <View />}
        <View style={styles.right}>
          {rightExtra}
          {editing ? (
            hideDone ? null : <CompactButton label={doneLabel} tone="soft" onPress={onToggleEdit} />
          ) : (
            <CompactButton label={editLabel} icon={Pencil} onPress={onToggleEdit} />
          )}
        </View>
      </View>
      <Text variant="moduleTitle" accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      <Text variant="small" color={colors.inkSoft} style={styles.subtitle}>
        {subtitle}
        {editing ? ' · MODE MODIFICATION' : ''}
      </Text>
      {!editing ? (
        <View style={styles.mode}>
          <Pill label="Lecture seule" icon={Lock} tone="outline" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {marginBottom: 20},
  top: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44},
  right: {flexDirection: 'row', alignItems: 'center', gap: 8},
  title: {marginTop: 4},
  subtitle: {marginTop: 2, letterSpacing: 0.4},
  mode: {marginTop: 12},
});
