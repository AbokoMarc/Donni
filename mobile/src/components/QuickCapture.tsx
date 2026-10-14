import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {BottomSheet} from './BottomSheet';
import {PrimaryButton} from './Buttons';
import {SelectField, TextField, TimeField} from './Fields';
import type {Option} from './Fields';
import {toDay} from '../domain/dates';
import {useRuntime} from '../hooks/runtime';

type Kind = 'task' | 'expense' | 'note';

const KINDS: Array<Option<Kind>> = [
  {value: 'task', label: 'Tâche'},
  {value: 'expense', label: 'Dépense'},
  {value: 'note', label: 'Note'},
];

export function QuickCapture({visible, onClose}: {visible: boolean; onClose: () => void}) {
  const {repo} = useRuntime();
  const [kind, setKind] = useState<Kind>('task');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [time, setTime] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTitle('');
    setAmount('');
    setTime(null);
    setError(null);
  };

  const save = async () => {
    const text = title.trim();
    if (text === '') {
      setError(kind === 'expense' ? 'Indiquez un libellé.' : 'Indiquez un titre.');
      return;
    }
    const today = toDay(new Date());
    if (kind === 'task') {
      await repo.tables.tasks.insert({title: text, day: today, startTime: time, kind: 'task'});
    } else if (kind === 'expense') {
      const value = Math.round(Number(amount.replace(/[\s  ]/g, '').replace(',', '.')));
      if (!Number.isFinite(value) || value <= 0) {
        setError('Saisissez un montant supérieur à zéro.');
        return;
      }
      await repo.tables.transactions.insert({label: text, day: today, amountXof: -value, category: 'autres'});
    } else {
      await repo.tables.notes.insert({title: text, body: ''});
    }
    reset();
    onClose();
  };

  return (
    <BottomSheet visible={visible} title="Capture rapide" onClose={onClose}>
      <View style={styles.form}>
        <SelectField label="Type" value={kind} options={KINDS} onChange={k => {
          setKind(k);
          setError(null);
        }} />
        <TextField label={kind === 'expense' ? 'Libellé' : 'Titre'} value={title} onChangeText={setTitle} error={error} autoFocus />
        {kind === 'expense' ? <TextField label="Montant (FCFA)" value={amount} onChangeText={setAmount} keyboardType="numeric" /> : null}
        {kind === 'task' ? <TimeField label="Heure (facultatif)" value={time} onChange={setTime} /> : null}
        <PrimaryButton label="Ajouter" onPress={() => void save()} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({form: {gap: 16, paddingBottom: 8}});
