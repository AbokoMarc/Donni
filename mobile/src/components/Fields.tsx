import React, {useEffect, useState} from 'react';
import {Platform, Pressable, StyleSheet, TextInput, View} from 'react-native';
import type {KeyboardTypeOptions, StyleProp, TextInputProps, ViewStyle} from 'react-native';
import {DateTimePickerAndroid} from '@react-native-community/datetimepicker';
import {colors, MAX_FONT_SCALE, MIN_TOUCH, radii, fonts} from '../theme';
import {parseDay, toDay, combine, formatTimeOfDay, minutesOfDay, parseTime} from '../domain/dates';
import {formatDayNumeric} from '../domain/format';
import {BottomSheet} from './BottomSheet';
import {Text} from './Text';
import {Calendar, Check, ChevronDown, Eye, EyeOff, Pencil} from './icons';

interface TextFieldProps extends Omit<TextInputProps, 'style' | 'onChangeText' | 'value'> {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string | null;
  prefix?: React.ReactNode;
  secureToggle?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  hint?: string;
}

export function TextField({
  label,
  value,
  onChangeText,
  error,
  prefix,
  secureToggle,
  containerStyle,
  hint,
  multiline,
  secureTextEntry,
  ...rest
}: TextFieldProps) {
  const [hidden, setHidden] = useState(true);
  const [focused, setFocused] = useState(false);
  const secure = secureToggle ? hidden : secureTextEntry;
  return (
    <View style={containerStyle}>
      {label ? (
        <Text variant="label" color={colors.label} style={styles.label}>
          {label}
        </Text>
      ) : null}
      <View
        style={[
          styles.input,
          multiline && styles.inputMultiline,
          focused && styles.inputFocused,
          error ? styles.inputError : null,
        ]}>
        {prefix}
        <TextInput
          {...rest}
          value={value}
          onChangeText={onChangeText}
          multiline={multiline}
          secureTextEntry={secure}
          onFocus={e => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={e => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          accessibilityLabel={rest.accessibilityLabel ?? label}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          placeholderTextColor={colors.muted}
          selectionColor={colors.ink}
          style={[styles.text, multiline && styles.textMultiline]}
        />
        {secureToggle ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Afficher le mot de passe' : 'Masquer le mot de passe'}
            onPress={() => setHidden(h => !h)}
            hitSlop={10}>
            {hidden ? (
              <Eye size={22} color={colors.border} strokeWidth={1.75} />
            ) : (
              <EyeOff size={22} color={colors.border} strokeWidth={1.75} />
            )}
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text variant="caption" color={colors.negative} style={styles.message} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color={colors.inkSoft} style={styles.message}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

interface AutoTextProps {
  value: string;
  onCommit: (value: string) => void;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: KeyboardTypeOptions;
  bold?: boolean;
  style?: StyleProp<ViewStyle>;
  editable?: boolean;
}

/** Champ modifiable sur place : l'écriture est validée à la perte du focus. */
export function AutoText({
  value,
  onCommit,
  label,
  placeholder,
  multiline,
  keyboardType,
  bold,
  style,
  editable = true,
}: AutoTextProps) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const next = draft.trim();
    if (next !== value) {
      onCommit(next);
    }
  };
  return (
    <View style={[styles.autoWrap, multiline && styles.autoWrapMultiline, style]}>
      <TextInput
        accessibilityLabel={label}
        value={draft}
        editable={editable}
        multiline={multiline}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        onChangeText={setDraft}
        onEndEditing={commit}
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        selectionColor={colors.ink}
        style={[styles.autoText, bold && styles.autoBold, multiline && styles.textMultiline]}
      />
      {editable ? <Pencil size={16} color={colors.inkSoft} strokeWidth={1.75} /> : null}
    </View>
  );
}

export interface Option<T extends string> {
  value: T;
  label: string;
}

interface SelectFieldProps<T extends string> {
  label?: string;
  value: T | null;
  options: ReadonlyArray<Option<T>>;
  onChange: (value: T) => void;
  placeholder?: string;
  compact?: boolean;
  title?: string;
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder = 'Choisir',
  compact,
  title,
}: SelectFieldProps<T>) {
  const [open, setOpen] = useState(false);
  const current = options.find(o => o.value === value);
  return (
    <View style={compact ? styles.selectCompact : undefined}>
      {label ? (
        <Text variant="label" color={colors.label} style={styles.label}>
          {label}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label ?? title ?? 'Choix'} : ${current?.label ?? placeholder}`}
        onPress={() => setOpen(true)}
        style={[styles.select, compact && styles.selectSmall]}>
        <Text variant="body" color={current ? colors.ink : colors.muted} numberOfLines={1} style={styles.selectText}>
          {current?.label ?? placeholder}
        </Text>
        <ChevronDown size={18} color={colors.ink} strokeWidth={1.75} />
      </Pressable>
      <BottomSheet visible={open} title={title ?? label} onClose={() => setOpen(false)}>
        {options.map(option => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{selected}}
              onPress={() => {
                setOpen(false);
                onChange(option.value);
              }}
              style={styles.option}>
              <Text variant="body" style={selected ? styles.optionSelected : undefined}>
                {option.label}
              </Text>
              {selected ? <Check size={20} color={colors.ink} strokeWidth={2} /> : null}
            </Pressable>
          );
        })}
      </BottomSheet>
    </View>
  );
}

interface TimeFieldProps {
  label?: string;
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  editable?: boolean;
  compact?: boolean;
}

export function TimeField({label, value, onChange, placeholder = '--:--', editable = true, compact}: TimeFieldProps) {
  const open = () => {
    const base = value ? combine(toDay(new Date()), value) : new Date();
    DateTimePickerAndroid.open({
      value: base,
      mode: 'time',
      is24Hour: true,
      onChange: (event, date) => {
        if (event.type === 'set' && date) {
          onChange(formatTimeOfDay(minutesOfDay(date)));
        }
      },
    });
  };
  return (
    <View style={compact ? styles.timeCompact : undefined}>
      {label ? (
        <Text variant="caption" color={colors.inkSoft} style={styles.timeLabel}>
          {label}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label ?? 'Heure'} : ${value ?? 'non définie'}`}
        disabled={!editable}
        onPress={open}
        style={styles.timeBox}>
        <Text variant="bodyStrong" color={value ? colors.ink : colors.muted}>
          {value ?? placeholder}
        </Text>
        {editable ? <Pencil size={14} color={colors.ink} strokeWidth={1.75} /> : null}
      </Pressable>
    </View>
  );
}

interface DateFieldProps {
  label?: string;
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  editable?: boolean;
  minimumDate?: string;
}

export function DateField({label, value, onChange, placeholder = 'Choisir une date', editable = true, minimumDate}: DateFieldProps) {
  const open = () => {
    DateTimePickerAndroid.open({
      value: value ? parseDay(value) : new Date(),
      mode: 'date',
      minimumDate: minimumDate ? parseDay(minimumDate) : undefined,
      onChange: (event, date) => {
        if (event.type === 'set' && date) {
          onChange(toDay(date));
        }
      },
    });
  };
  return (
    <View>
      {label ? (
        <Text variant="label" color={colors.label} style={styles.label}>
          {label}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label ?? 'Date'} : ${value ? formatDayNumeric(value, true) : 'non définie'}`}
        disabled={!editable}
        onPress={open}
        style={[styles.select, !editable && styles.selectReadonly]}>
        <Text variant="body" color={value ? colors.ink : colors.muted} style={styles.selectText}>
          {value ? formatDayNumeric(value, true) : placeholder}
        </Text>
        <Calendar size={18} color={colors.ink} strokeWidth={1.75} />
      </Pressable>
    </View>
  );
}

export function parseMinutes(value: string | null): number | null {
  return value ? parseTime(value) : null;
}

export const keyboard = Platform.select<KeyboardTypeOptions>({default: 'default'});

const styles = StyleSheet.create({
  label: {marginBottom: 6},
  input: {
    minHeight: 52,
    borderRadius: radii.field,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputFocused: {borderColor: colors.ink, borderWidth: 1.5},
  inputError: {borderColor: colors.negative},
  inputMultiline: {alignItems: 'flex-start', paddingVertical: 10, minHeight: 96},
  text: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.ink,
    paddingVertical: 12,
  },
  textMultiline: {textAlignVertical: 'top', minHeight: 72},
  message: {marginTop: 6},
  autoWrap: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  autoWrapMultiline: {alignItems: 'flex-start', paddingVertical: 6},
  autoText: {flex: 1, fontFamily: fonts.regular, fontSize: 16, color: colors.ink, paddingVertical: 8},
  autoBold: {fontFamily: fonts.semibold},
  select: {
    minHeight: 48,
    borderRadius: radii.field,
    borderWidth: 1,
    borderColor: colors.ink,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  selectSmall: {minHeight: 44},
  selectReadonly: {borderColor: colors.borderSoft, backgroundColor: colors.surface},
  selectCompact: {flexShrink: 1},
  selectText: {flex: 1},
  option: {
    minHeight: MIN_TOUCH + 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSoft,
  },
  optionSelected: {fontFamily: fonts.semibold},
  timeLabel: {marginBottom: 4},
  timeCompact: {flex: 1},
  timeBox: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
});
