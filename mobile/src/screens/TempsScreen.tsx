import React, {useMemo, useState} from 'react';
import {StyleSheet, Switch, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {
  AutoText,
  BottomSheet,
  Card,
  Clock,
  Coffee,
  ConfirmSheet,
  DashedAddButton,
  EmptyState,
  IconButton,
  Menu,
  ModuleHeader,
  PrimaryButton,
  ProgressBar,
  ReorderableList,
  Screen,
  SelectField,
  StatTile,
  Text,
  TextField,
  TimeField,
  Timer,
  Trash2,
  Check,
} from '../components';
import type {Option} from '../components';
import {
  computeDuration,
  computeEnd,
  dayStats,
  findOverlaps,
  formatDayLong,
  formatDuration,
  formatDurationSpaced,
  formatTimeOfDay,
  minutesOfDay,
  parseTime,
  reorderSlots,
  slotProgress,
  slotRange,
  slotState,
  sortSlots,
  toDay,
} from '../domain';
import type {Task, TaskKind} from '../domain';
import {useLiveQuery} from '../db';
import {useNow, useRuntime} from '../hooks/runtime';
import {colors} from '../theme';

const KIND_OPTIONS: Array<Option<TaskKind>> = [
  {value: 'task', label: 'Tâche'},
  {value: 'focus', label: 'Travail en profondeur'},
  {value: 'event', label: 'Réunion ou événement'},
  {value: 'routine', label: 'Routine'},
  {value: 'break', label: 'Pause'},
];

const STATE_LABELS = {
  done: 'Terminé',
  skipped: 'Ignoré',
  inProgress: 'En cours',
  upcoming: 'À venir',
  late: 'En retard',
  untimed: 'Sans horaire',
} as const;

function nextHalfHour(now: Date): string {
  const m = minutesOfDay(now);
  return formatTimeOfDay(Math.ceil((m + 1) / 30) * 30);
}

export function TempsScreen() {
  const nav = useNavigation();
  const {repo} = useRuntime();
  const now = useNow();
  const today = toDay(now);
  const nowMin = minutesOfDay(now);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null);
  const [adding, setAdding] = useState(false);
  const [durationFor, setDurationFor] = useState<Task | null>(null);

  const tasksQuery = useLiveQuery(['tasks'], q => q.tasksForDay(today), [today]);
  const settingsQuery = useLiveQuery(['settings'], q => q.settings());
  const tasks = useMemo(() => sortSlots(tasksQuery.data ?? []), [tasksQuery.data]);
  const stats = useMemo(() => dayStats(tasks, nowMin), [tasks, nowMin]);
  const overlaps = useMemo(() => findOverlaps(tasks), [tasks]);
  const overlapping = useMemo(() => new Set(overlaps.flat()), [overlaps]);

  const update = (task: Task, patch: Partial<Task>) => {
    setMessage(null);
    void repo.tables.tasks.update(task.id, patch);
  };

  const changeStart = (task: Task, start: string) => {
    const duration = slotRange(task);
    const length = duration ? duration.end - duration.start : task.durationMin;
    update(task, {
      startTime: start,
      endTime: length ? computeEnd(start, length) : null,
      durationMin: length ?? null,
    });
  };

  const changeEnd = (task: Task, end: string) => {
    if (!task.startTime) {
      update(task, {startTime: end, endTime: null});
      return;
    }
    const duration = computeDuration(task.startTime, end);
    if (duration === null) {
      setMessage('L’heure de fin doit être après l’heure de début.');
      return;
    }
    update(task, {endTime: end, durationMin: duration});
  };

  const changeDuration = (task: Task, minutes: number) => {
    if (!task.startTime) {
      return;
    }
    update(task, {endTime: computeEnd(task.startTime, minutes), durationMin: minutes});
  };

  const toggleDone = (task: Task) => {
    update(task, {status: task.status === 'done' ? 'todo' : 'done'});
  };

  const reorder = (from: number, to: number) => {
    const timed = tasks.filter(t => slotRange(t) !== null);
    const placements = reorderSlots(timed, from, to);
    if (placements.length > 0) {
      void repo.applyPlacements(placements);
    }
  };

  const timed = tasks.filter(t => slotRange(t) !== null);
  const untimed = tasks.filter(t => slotRange(t) === null);
  const focusMode = settingsQuery.data?.focusMode ?? false;

  const focusSwitch = (
    <View style={styles.focus}>
      <Text variant="small">Mode Focus</Text>
      <Switch
        accessibilityLabel="Mode Focus : ne conserver que les rappels de tâches"
        value={focusMode}
        onValueChange={value => void repo.saveSettings({focusMode: value})}
        trackColor={{false: colors.sunken, true: colors.ink}}
        thumbColor={colors.onInk}
      />
    </View>
  );

  return (
    <Screen>
      <ModuleHeader
        title="Temps"
        editing={editing}
        onToggleEdit={() => setEditing(e => !e)}
        onBack={() => nav.goBack()}
        rightExtra={focusSwitch}
      />

      {!editing ? (
        <>
          <Card style={styles.progressCard}>
            <Text variant="body">Progression du jour</Text>
            <Text variant="figureLarge">{`${stats.progress}%`}</Text>
            <ProgressBar value={stats.progress} height={10} label="Progression du jour" />
            <Text variant="caption" color={colors.inkSoft}>
              {`${formatDuration(stats.availableMin)} disponibles aujourd’hui · ${formatDuration(
                stats.plannedMin,
              )} planifiées`}
            </Text>
          </Card>
          <View style={styles.tiles}>
            <StatTile icon={Timer} label="Focus" value={formatDuration(stats.focusMin)} />
            <StatTile icon={Coffee} label="Pause" value={formatDuration(stats.breakMin)} />
            <StatTile icon={Clock} label="Restant" value={formatDuration(stats.remainingMin)} />
          </View>

          <Text variant="overline" color={colors.inkSoft} style={styles.overline}>
            Chronologie
          </Text>
          {tasks.length === 0 ? (
            <EmptyState
              title="Journée libre"
              message="Aucun créneau n’est planifié aujourd’hui. Appuyez sur Modifier pour en ajouter."
            />
          ) : (
            <View style={styles.list}>
              {tasks.map(task => {
                const state = slotState(task, nowMin);
                const range = slotRange(task);
                const progress = slotProgress(task, nowMin);
                const parts = [
                  range ? formatDurationSpaced(range.end - range.start) : null,
                  STATE_LABELS[state],
                  state === 'inProgress' ? `${progress} % accompli` : null,
                ].filter(Boolean);
                return (
                  <Card key={task.id} style={styles.row}>
                    <Text variant="cardTitle" style={styles.time}>
                      {task.startTime ?? '--:--'}
                    </Text>
                    <View style={styles.rowText}>
                      <Text
                        variant="bodyStrong"
                        style={state === 'done' ? styles.done : undefined}
                        numberOfLines={2}>
                        {task.title}
                      </Text>
                      <Text variant="caption" color={colors.inkSoft}>
                        {parts.join(' · ')}
                      </Text>
                    </View>
                  </Card>
                );
              })}
            </View>
          )}
        </>
      ) : (
        <>
          <Text variant="body" color={colors.inkSoft} style={styles.dateLine}>
            {`${formatDayLong(today)} · Aujourd’hui — Édition activée`}
          </Text>
          <Card tone="alt" style={styles.help}>
            <Text variant="caption">
              Toutes les entrées sont modifiables. Faites glisser la poignée pour réordonner les créneaux
              horaires ; l’appui sur une heure ouvre le sélecteur.
            </Text>
          </Card>
          {message ? (
            <Text variant="small" color={colors.negative} accessibilityLiveRegion="polite" style={styles.message}>
              {message}
            </Text>
          ) : null}

          <ReorderableList
            items={timed}
            keyOf={t => t.id}
            onReorder={reorder}
            renderItem={(task, _index, handle, dragging) => (
              <Card outlined style={[styles.slot, dragging && styles.slotDragging]}>
                <View style={styles.slotTop}>
                  <View
                    {...handle}
                    accessible
                    accessibilityRole="adjustable"
                    accessibilityLabel={`Réordonner ${task.title}`}
                    style={styles.handle}>
                    <Menu size={22} color={colors.ink} strokeWidth={1.75} />
                  </View>
                  <View style={styles.slotBody}>
                    <View style={styles.timeRow}>
                      <TimeField label="Heure début" compact value={task.startTime} onChange={v => changeStart(task, v)} />
                      <TimeField label="Heure fin" compact value={task.endTime ?? (task.startTime && task.durationMin ? computeEnd(task.startTime, task.durationMin) : null)} onChange={v => changeEnd(task, v)} />
                    </View>
                    <AutoText label="Titre" bold value={task.title} onCommit={v => v && update(task, {title: v})} />
                    <View style={styles.metaRow}>
                      <Text variant="small" color={colors.inkSoft}>
                        {`Durée ${formatDurationSpaced(slotRange(task) ? slotRange(task)!.end - slotRange(task)!.start : 0)}`}
                      </Text>
                      {overlapping.has(task.id) ? (
                        <Text variant="caption" color={colors.negative}>
                          Chevauche un autre créneau
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <View style={styles.slotActions}>
                    <IconButton
                      icon={Check}
                      filled={task.status === 'done'}
                      onPress={() => toggleDone(task)}
                      label={task.status === 'done' ? `Marquer ${task.title} comme à faire` : `Marquer ${task.title} comme fait`}
                    />
                    <IconButton icon={Clock} onPress={() => setDurationFor(task)} label={`Modifier la durée de ${task.title}`} />
                    <IconButton icon={Trash2} tone="danger" onPress={() => setPendingDelete(task)} label={`Supprimer ${task.title}`} />
                  </View>
                </View>
              </Card>
            )}
          />

          {untimed.map(task => (
            <Card key={task.id} outlined style={styles.slot}>
              <View style={styles.slotTop}>
                <View style={styles.slotBody}>
                  <AutoText label="Titre" bold value={task.title} onCommit={v => v && update(task, {title: v})} />
                  <TimeField label="Heure début" value={task.startTime} onChange={v => changeStart(task, v)} />
                </View>
                <IconButton icon={Trash2} tone="danger" onPress={() => setPendingDelete(task)} label={`Supprimer ${task.title}`} />
              </View>
            </Card>
          ))}

          <View style={styles.add}>
            <DashedAddButton label="Ajouter créneau" onPress={() => setAdding(true)} />
          </View>
          <Text variant="caption" color={colors.inkSoft} align="center" style={styles.tip}>
            Conseil : appuyer sur une heure pour ouvrir le sélecteur
          </Text>
        </>
      )}

      <AddSlotSheet
        visible={adding}
        day={today}
        defaultStart={timed.length > 0 ? timed[timed.length - 1].endTime ?? nextHalfHour(now) : nextHalfHour(now)}
        position={tasks.length}
        onClose={() => setAdding(false)}
      />
      <DurationSheet
        task={durationFor}
        onClose={() => setDurationFor(null)}
        onSave={minutes => {
          if (durationFor) {
            changeDuration(durationFor, minutes);
          }
          setDurationFor(null);
        }}
      />
      <ConfirmSheet
        visible={pendingDelete !== null}
        title="Supprimer ce créneau ?"
        message={pendingDelete ? `« ${pendingDelete.title} » sera supprimé, ainsi que son rappel.` : undefined}
        confirmLabel="Supprimer"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) {
            void repo.tables.tasks.softDelete(pendingDelete.id);
          }
          setPendingDelete(null);
        }}
      />
    </Screen>
  );
}

function AddSlotSheet({
  visible,
  day,
  defaultStart,
  position,
  onClose,
}: {
  visible: boolean;
  day: string;
  defaultStart: string;
  position: number;
  onClose: () => void;
}) {
  const {repo} = useRuntime();
  const [title, setTitle] = useState('');
  const [start, setStart] = useState<string | null>(null);
  const [minutes, setMinutes] = useState('60');
  const [kind, setKind] = useState<TaskKind>('task');
  const [remind, setRemind] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const begin = start ?? defaultStart;

  const reset = () => {
    setTitle('');
    setStart(null);
    setMinutes('60');
    setKind('task');
    setRemind('0');
    setError(null);
  };

  const save = async () => {
    const length = Number(minutes);
    if (title.trim().length === 0) {
      setError('Donnez un titre au créneau.');
      return;
    }
    if (!Number.isFinite(length) || length < 5 || length > 720) {
      setError('La durée doit être comprise entre 5 minutes et 12 heures.');
      return;
    }
    if (parseTime(begin) + length > 1439) {
      setError('Le créneau doit se terminer avant minuit.');
      return;
    }
    const before = Number(remind);
    await repo.tables.tasks.insert({
      title: title.trim(),
      day,
      kind,
      startTime: begin,
      endTime: computeEnd(begin, length),
      durationMin: length,
      position,
      remindBeforeMin: Number.isFinite(before) && before > 0 ? before : null,
    });
    reset();
    onClose();
  };

  return (
    <BottomSheet visible={visible} title="Nouveau créneau" onClose={onClose}>
      <View style={styles.sheetForm}>
        <TextField label="Titre" value={title} onChangeText={setTitle} placeholder="Ex. Deep work" error={error} />
        <TimeField label="Heure début" value={begin} onChange={setStart} />
        <TextField label="Durée (minutes)" value={minutes} onChangeText={setMinutes} keyboardType="number-pad" />
        <SelectField label="Type" value={kind} options={KIND_OPTIONS} onChange={setKind} />
        <TextField
          label="Rappel avant (minutes)"
          value={remind}
          onChangeText={setRemind}
          keyboardType="number-pad"
          hint="0 pour être prévenu à l’heure de début."
        />
        <PrimaryButton label="Ajouter" onPress={() => void save()} />
      </View>
    </BottomSheet>
  );
}

function DurationSheet({
  task,
  onClose,
  onSave,
}: {
  task: Task | null;
  onClose: () => void;
  onSave: (minutes: number) => void;
}) {
  const current = task ? slotRange(task) : null;
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  React.useEffect(() => {
    setValue(current ? String(current.end - current.start) : '60');
    setError(null);
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <BottomSheet visible={task !== null} title="Durée du créneau" onClose={onClose}>
      <View style={styles.sheetForm}>
        <TextField label="Durée (minutes)" value={value} onChangeText={setValue} keyboardType="number-pad" error={error} />
        <PrimaryButton
          label="Enregistrer"
          onPress={() => {
            const minutes = Number(value);
            if (!Number.isFinite(minutes) || minutes < 5 || minutes > 720) {
              setError('Entre 5 minutes et 12 heures.');
              return;
            }
            if (task?.startTime && parseTime(task.startTime) + minutes > 1439) {
              setError('Le créneau doit se terminer avant minuit.');
              return;
            }
            onSave(minutes);
          }}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  focus: {flexDirection: 'row', alignItems: 'center', gap: 8},
  progressCard: {gap: 8, paddingVertical: 18},
  tiles: {flexDirection: 'row', gap: 10, marginTop: 14},
  overline: {marginTop: 28, marginBottom: 12},
  list: {gap: 10},
  row: {flexDirection: 'row', alignItems: 'center', gap: 16},
  time: {width: 62},
  rowText: {flex: 1, gap: 2},
  done: {textDecorationLine: 'line-through', color: colors.inkSoft},
  dateLine: {marginBottom: 12},
  help: {marginBottom: 16},
  message: {marginBottom: 10},
  slot: {marginBottom: 12, padding: 12},
  slotDragging: {borderColor: colors.ink},
  slotTop: {flexDirection: 'row', alignItems: 'flex-start', gap: 8},
  handle: {width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt, borderRadius: 10},
  slotBody: {flex: 1, gap: 8},
  timeRow: {flexDirection: 'row', gap: 8},
  metaRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8},
  slotActions: {alignItems: 'center'},
  add: {marginTop: 8},
  tip: {marginTop: 14},
  sheetForm: {gap: 16, paddingBottom: 8},
});
