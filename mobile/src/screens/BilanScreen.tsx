import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {
  Card,
  ChevronLeft,
  ChevronRight,
  GhostButton,
  IconButton,
  ProgressBar,
  Screen,
  SectionTitle,
  Text,
} from '../components';
import {
  addDays,
  formatDayMonth,
  formatDecimal,
  formatDuration,
  formatXof,
  startOfWeek,
  toDay,
} from '../domain';
import {useLiveQuery} from '../db';
import {useNow, useRuntime} from '../hooks/runtime';
import {colors} from '../theme';

export function BilanScreen() {
  const {repo} = useRuntime();
  const today = toDay(useNow());
  const currentWeek = startOfWeek(today);
  const [week, setWeek] = useState(currentWeek);
  const [saved, setSaved] = useState(false);

  const reviewQuery = useLiveQuery(['tasks', 'transactions', 'energy', 'goals', 'contactInteractions', 'budgets'], q => q.weeklyReview(week), [week]);
  const storedQuery = useLiveQuery(['weeklyReviews'], async () => {
    const rows = await repo.tables.weeklyReviews.list({where: '"week_start" = ?', params: [week], limit: 1});
    return rows[0] ?? null;
  }, [week]);
  const review = reviewQuery.data;
  const stored = storedQuery.data;

  const move = (delta: number) => {
    setSaved(false);
    setWeek(w => addDays(w, delta * 7));
  };

  const save = async () => {
    if (!review) {
      return;
    }
    const payload = review as unknown as Record<string, unknown>;
    if (stored) {
      await repo.tables.weeklyReviews.update(stored.id, {payload});
    } else {
      await repo.tables.weeklyReviews.insert({weekStart: week, payload});
    }
    setSaved(true);
  };

  return (
    <Screen>
      <Text variant="moduleTitle" accessibilityRole="header">
        Bilan
      </Text>
      <Text variant="small" color={colors.inkSoft} style={styles.sub}>
        DONNI · life OS
      </Text>

      <View style={styles.nav}>
        <IconButton icon={ChevronLeft} label="Semaine précédente" onPress={() => move(-1)} />
        <Text variant="bodyStrong" accessibilityLiveRegion="polite">
          {week === currentWeek ? 'Cette semaine' : `Semaine du ${formatDayMonth(week)}`}
        </Text>
        <IconButton icon={ChevronRight} label="Semaine suivante" disabled={week >= currentWeek} onPress={() => move(1)} />
      </View>
      {review ? (
        <>
          <Text variant="caption" color={colors.inkSoft} align="center">
            {`${formatDayMonth(review.weekStart)} au ${formatDayMonth(review.weekEnd)}`}
          </Text>

          <SectionTitle>Temps</SectionTitle>
          <Card style={styles.card}>
            <Text variant="figureLarge">{review.time.ratio === null ? 'Aucun planning' : `${review.time.ratio}%`}</Text>
            {review.time.ratio !== null ? <ProgressBar value={review.time.ratio} label="Planning réalisé" /> : null}
            <Text variant="caption" color={colors.inkSoft}>
              {`${formatDuration(review.time.doneMin)} réalisées sur ${formatDuration(review.time.plannedMin)} planifiées`}
            </Text>
          </Card>

          <SectionTitle>Argent</SectionTitle>
          <Card style={styles.card}>
            <Row label="Entrées" value={formatXof(review.money.incomeXof, {sign: true})} />
            <Row label="Sorties" value={formatXof(-review.money.expenseXof)} />
            {review.money.budgetXof !== null && review.money.monthExpenseXof !== null ? (
              <Row label="Budget du mois" value={`${formatXof(review.money.monthExpenseXof)} sur ${formatXof(review.money.budgetXof)}`} />
            ) : null}
          </Card>

          <SectionTitle>Énergie et direction</SectionTitle>
          <Card style={styles.card}>
            <Row label="Énergie moyenne" value={review.energy.average === null ? 'Non renseignée' : `${formatDecimal(review.energy.average, 1)}/10`} />
            <Row label="Objectifs terminés" value={`${review.goals.done} sur ${review.goals.total}`} />
            <Row label="Échanges avec le réseau" value={String(review.network.interactions)} />
          </Card>

          {review.observations.length > 0 ? (
            <>
              <SectionTitle>Observations</SectionTitle>
              <Card tone="alt" style={styles.card}>
                {review.observations.map(o => (
                  <Text key={o} variant="body">
                    {o}
                  </Text>
                ))}
              </Card>
            </>
          ) : null}

          <GhostButton label={stored ? 'Mettre à jour le bilan enregistré' : 'Enregistrer ce bilan'} onPress={() => void save()} style={styles.save} />
          {saved || stored ? (
            <Text variant="caption" color={colors.inkSoft} align="center" accessibilityLiveRegion="polite">
              {saved ? 'Bilan enregistré.' : 'Un bilan est déjà enregistré pour cette semaine.'}
            </Text>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

function Row({label, value}: {label: string; value: string}) {
  return (
    <View style={styles.row}>
      <Text variant="body" color={colors.inkSoft} style={styles.rowLabel}>
        {label}
      </Text>
      <Text variant="bodyStrong">{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sub: {marginTop: 2, letterSpacing: 0.4},
  nav: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 4},
  card: {gap: 10},
  row: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12},
  rowLabel: {flex: 1},
  save: {marginTop: 24, marginBottom: 8},
});
