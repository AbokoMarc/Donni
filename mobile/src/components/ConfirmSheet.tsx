import React from 'react';
import {StyleSheet, View} from 'react-native';
import {colors} from '../theme';
import {BottomSheet} from './BottomSheet';
import {GhostButton, PrimaryButton} from './Buttons';
import {Text} from './Text';

interface ConfirmSheetProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Annuler',
  onConfirm,
  onCancel,
}: ConfirmSheetProps) {
  return (
    <BottomSheet visible={visible} title={title} onClose={onCancel}>
      {message ? (
        <Text variant="body" color={colors.inkSoft} style={styles.message}>
          {message}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <GhostButton label={cancelLabel} onPress={onCancel} style={styles.flex} />
        <PrimaryButton label={confirmLabel} onPress={onConfirm} style={styles.flex} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  message: {marginBottom: 20},
  actions: {flexDirection: 'row', gap: 12, marginTop: 4},
  flex: {flex: 1},
});
