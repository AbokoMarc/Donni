import React from 'react';
import {Linking, Pressable, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {
  Avatar,
  Card,
  Clock,
  Compass,
  IconButton,
  Search,
  Droplet,
  Dumbbell,
  GraduationCap,
  MessageCircle,
  Moon,
  Pill,
  ProgressBar,
  Screen,
  Smile,
  Sparkles,
  SyncBanner,
  Text,
  Users,
  Wallet,
  CompactButton,
} from '../components';
import type {LucideIcon} from '../components';
import {minutesOfDay, toDay} from '../domain/dates';
import {
  contactsToFollowUp,
  creditTotal,
  debtTotal,
  describeMetric,
  featuredSkill,
  formatAgo,
  formatAgoMinutes,
  formatDayLong,
  formatXof,
  formatXofCompact,
  goalProgress,
  RELATION_LABELS,
  totalBalance,
  whatsappUrl,
  slotRange,
  timelinePosition,
  averageProgress,
} from '../domain';
import type {Contact, EnergyLog, Goal, GoalStep, Skill, Task} from '../domain';
import {useLiveQuery} from '../db';
import {useNow, useRuntime, useSession} from '../hooks/runtime';
import type {RootParams} from '../navigation/types';
import {colors, SCREEN_MARGIN} from '../theme';

type Nav = NativeStackNavigationProp<RootParams>;

const TICKS = [7, 10, 13, 16, 19, 22];

function ModuleCard({
  icon: Icon,
  title,
  onPress,
  children,
}: {
  icon: LucideIcon;
  title: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card onPress={onPress} accessibilityLabel={`Ouvrir ${title}`} style={styles.card}>
      <View style={styles.cardHead}>
        <Icon size={18} color={colors.ink} strokeWidth={1.75} />
        <Text variant="label" style={styles.cardTitle}>
          {title.toUpperCase()}
        </Text>
      </View>
      {children}
    </Card>
  );
}

function TimeCard({tasks, now, onPress}: {tasks: Task[]; now: Date; onPress: () => void}) {
  const nowMin = minutesOfDay(now);
  const pos = timelinePosition(nowMin);
  const upcoming = tasks
    .filter(t => t.status !== 'done' && t.status !== 'skipped')
    .map(t => ({t, range: slotRange(t)}))
    .filter(x => x.range && x.range.end > nowMin)
    .sort((a, b) => (a.range!.start < b.range!.start ? -1 : 1))[0];
  const hour = Math.floor(nowMin / 60);
  const activeTick = [...TICKS].reverse().find(h => h <= hour) ?? TICKS[0];
  return (
    <ModuleCard icon={Clock} title="Temps" onPress={onPress}>
      <View style={styles.timeline}>
        <View style={styles.track} />
        <View style={[styles.marker, {left: `${pos * 100}%`}]} />
      </View>
      <View style={styles.ticks}>
        {TICKS.map(h => (
          <Text
            key={h}
            variant="caption"
            color={colors.inkSoft}
            style={h === activeTick ? styles.tickActive : undefined}>
            {`${h}h`}
          </Text>
        ))}
      </View>
      <Text variant="small" color={colors.inkSoft} style={styles.timeFoot}>
        {upcoming
          ? `${upcoming.range!.start <= nowMin ? 'En cours' : 'Ensuite'} · ${upcoming.t.title}${
              upcoming.t.startTime ? ` · ${upcoming.t.startTime}` : ''
            }`
          : tasks.length === 0
          ? 'Aucun créneau prévu aujourd’hui'
          : 'Journée terminée'}
      </Text>
    </ModuleCard>
  );
}

const ENERGY_ICONS: Array<{metric: string; label: string; icon: LucideIcon}> = [
  {metric: 'sleep', label: 'Sommeil', icon: Moon},
  {metric: 'mood', label: 'Humeur', icon: Smile},
  {metric: 'sport', label: 'Sport', icon: Dumbbell},
  {metric: 'water', label: 'Eau', icon: Droplet},
];

function EnergyCard({logs, onPress}: {logs: EnergyLog[]; onPress: () => void}) {
  return (
    <ModuleCard icon={Sparkles} title="Énergie" onPress={onPress}>
      <View style={styles.energyRow}>
        {ENERGY_ICONS.map(({metric, label, icon: Icon}) => {
          const log = logs.find(l => l.metric === metric);
          const text = log ? describeMetric(log).value : '–';
          return (
            <View key={metric} style={styles.energyItem} accessible accessibilityLabel={`${label} : ${text}`}>
              <Icon size={26} color={colors.ink} strokeWidth={1.5} />
              <Text variant="caption" color={colors.inkSoft}>
                {label}
              </Text>
              <Text variant="caption" style={styles.energyValue} numberOfLines={1}>
                {text}
              </Text>
            </View>
          );
        })}
      </View>
    </ModuleCard>
  );
}

export function HomeScreen() {
  const nav = useNavigation<Nav>();
  const runtime = useRuntime();
  const {user} = useSession();
  const now = useNow();
  const today = toDay(now);

  const tasks = useLiveQuery(['tasks'], q => q.tasksForDay(today), [today]);
  const money = useLiveQuery(['accounts', 'transactions'], async q => ({
    accounts: await q.accounts(),
    sums: await q.balanceSums(),
  }));
  const energy = useLiveQuery(['energy'], q => q.energyForDay(today), [today]);
  const contacts = useLiveQuery(['contacts'], q => q.contacts());
  const goalsData = useLiveQuery(['goals', 'goalSteps'], async q => ({goals: await q.goals(), steps: await q.allSteps()}));
  const skills = useLiveQuery(['skills'], q => q.skills());
  const settings = useLiveQuery(['settings'], q => q.settings());
  const whatsapp = useLiveQuery(['reminders'], q => q.lastWhatsappReminder());

  const go = (route: keyof RootParams) => () => (nav.navigate as (r: keyof RootParams) => void)(route);

  const followUps = contactsToFollowUp<Contact>(contacts.data ?? [], now, 2);
  const skill: Skill | null = featuredSkill(skills.data ?? []);

  const relaunch = (contact: Contact) => {
    if (contact.phone) {
      void runtime.repo.recordInteraction(contact.id, 'whatsapp');
      void Linking.openURL(whatsappUrl(contact.phone));
    } else {
      nav.navigate('Contact', {contactId: contact.id});
    }
  };

  const goalCards: Array<{goal: Goal; progress: number}> = (goalsData.data?.goals ?? [])
    .filter(g => g.status !== 'done')
    .slice(0, 2)
    .map(goal => ({
      goal,
      progress: goalProgress(
        goal,
        (goalsData.data?.steps ?? []).filter((s: GoalStep) => s.goalId === goal.id),
      ),
    }));

  const balance = money.data ? totalBalance(money.data.accounts, money.data.sums) : 0;
  const debt = money.data ? debtTotal(money.data.accounts) : 0;
  const credit = money.data ? creditTotal(money.data.accounts) : 0;
  const lastWhatsapp = whatsapp.data;

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.titleWrap}>
          <Text variant="title" accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit>
            DONNI life OS
          </Text>
        </View>
        <View style={styles.headerActions}>
          <IconButton icon={Search} label="Rechercher" onPress={go('Recherche')} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Compte et réglages"
            onPress={go('Compte')}>
            <Avatar name={user?.fullName ?? 'D'} size={48} tone="soft" />
          </Pressable>
        </View>
      </View>
      <Text variant="body" color={colors.border} style={styles.date}>
        {`${formatDayLong(today)} · Vue du jour`}
      </Text>
      <SyncBanner />

      <View style={styles.list}>
        <TimeCard tasks={tasks.data ?? []} now={now} onPress={go('Temps')} />

        <ModuleCard icon={Wallet} title="Argent" onPress={go('Argent')}>
          <Text variant="figure">{formatXof(balance)}</Text>
          <View style={styles.pills}>
            <Pill label={`Dette ${formatXofCompact(debt)}`} tone="outline" />
            <Pill label={`Crédit ${formatXofCompact(credit)}`} tone="outline" />
          </View>
        </ModuleCard>

        <EnergyCard logs={energy.data ?? []} onPress={go('Energie')} />

        <ModuleCard icon={Users} title="Réseau" onPress={go('Reseau')}>
          {followUps.length === 0 ? (
            <Text variant="small" color={colors.inkSoft}>
              {(contacts.data ?? []).length === 0
                ? 'Ajoutez les personnes importantes pour ne plus les perdre de vue.'
                : 'Personne à relancer pour le moment.'}
            </Text>
          ) : (
            followUps.map(({contact, daysSince}, i) => (
              <View key={contact.id} style={[styles.contactRow, i > 0 && styles.contactSep]}>
                <Avatar name={contact.name} size={40} tone="soft" />
                <View style={styles.contactText}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {contact.name}
                  </Text>
                  <Text variant="caption" color={colors.inkSoft} numberOfLines={1}>
                    {`${RELATION_LABELS[contact.relation]}${
                      daysSince !== null ? ` · ${formatAgo(daysSince)}` : ''
                    }`}
                  </Text>
                </View>
                <CompactButton
                  label="Relancer"
                  tone="soft"
                  accessibilityLabel={`Relancer ${contact.name}`}
                  onPress={() => relaunch(contact)}
                />
              </View>
            ))
          )}
        </ModuleCard>

        <ModuleCard icon={Compass} title="Direction" onPress={go('Direction')}>
          {goalCards.length === 0 ? (
            <Text variant="small" color={colors.inkSoft}>
              Aucun objectif en cours.
            </Text>
          ) : (
            goalCards.map(({goal, progress}) => (
              <View key={goal.id} style={styles.goalRow}>
                <View style={styles.goalHead}>
                  <Text variant="bodyStrong" numberOfLines={1} style={styles.flex}>
                    {goal.title}
                  </Text>
                  <Text variant="label">{`${progress}%`}</Text>
                </View>
                <ProgressBar value={progress} height={6} label={goal.title} />
              </View>
            ))
          )}
          {goalCards.length > 1 ? (
            <Text variant="caption" color={colors.inkSoft}>
              {`Progression moyenne ${averageProgress(goalCards.map(g => g.progress))} %`}
            </Text>
          ) : null}
        </ModuleCard>

        <ModuleCard icon={GraduationCap} title="Compétences" onPress={go('Competences')}>
          {skill ? (
            <View style={styles.skill}>
              <View style={styles.skillLeft}>
                <Text variant="figure" style={styles.skillPct}>{`${skill.level}%`}</Text>
                <ProgressBar value={skill.level} height={5} label={skill.name} />
              </View>
              <View style={styles.skillRight}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {skill.name}
                </Text>
                {skill.monthlyTargetXof ? (
                  <>
                    <Text variant="bodyStrong">{formatXofCompact(skill.monthlyTargetXof)}</Text>
                    <Text variant="caption" color={colors.inkSoft}>
                      Objectif mensuel
                    </Text>
                  </>
                ) : null}
              </View>
            </View>
          ) : (
            <Text variant="small" color={colors.inkSoft}>
              Suivez votre progression sur une compétence.
            </Text>
          )}
        </ModuleCard>

        {settings.data?.whatsappOptIn ? (
          <ModuleCard icon={MessageCircle} title="WhatsApp" onPress={go('Notifications')}>
            {lastWhatsapp ? (
              <View style={styles.whatsapp}>
                <Text variant="small" numberOfLines={1} style={styles.flex}>
                  {lastWhatsapp.label}
                </Text>
                <Text variant="caption" color={colors.inkSoft}>
                  {lastWhatsapp.whatsappSentAt
                    ? formatAgoMinutes((now.getTime() - Date.parse(lastWhatsapp.whatsappSentAt)) / 60000)
                    : ''}
                </Text>
              </View>
            ) : (
              <Text variant="small" color={colors.inkSoft}>
                Aucun rappel envoyé sur WhatsApp pour l’instant.
              </Text>
            )}
          </ModuleCard>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerActions: {flexDirection: 'row', alignItems: 'center', gap: 8},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12},
  titleWrap: {flex: 1},
  date: {marginTop: 4, marginBottom: 12},
  list: {gap: 14, marginTop: 8},
  card: {gap: 12, paddingHorizontal: SCREEN_MARGIN - 4},
  cardHead: {flexDirection: 'row', alignItems: 'center', gap: 8},
  cardTitle: {letterSpacing: 0.6},
  timeline: {height: 14, justifyContent: 'center'},
  track: {height: 2, backgroundColor: colors.borderSoft, borderRadius: 1},
  marker: {position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: colors.ink, marginLeft: -5},
  ticks: {flexDirection: 'row', justifyContent: 'space-between'},
  tickActive: {color: colors.ink, fontFamily: 'Inter-Bold'},
  timeFoot: {marginTop: 2},
  pills: {flexDirection: 'row', gap: 8, flexWrap: 'wrap'},
  energyRow: {flexDirection: 'row', justifyContent: 'space-between'},
  energyItem: {flex: 1, alignItems: 'center', gap: 4},
  energyValue: {fontFamily: 'Inter-SemiBold'},
  contactRow: {flexDirection: 'row', alignItems: 'center', gap: 12},
  contactSep: {borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSoft, paddingTop: 12},
  contactText: {flex: 1},
  goalRow: {gap: 6},
  goalHead: {flexDirection: 'row', alignItems: 'center', gap: 8},
  flex: {flex: 1},
  skill: {flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20},
  skillLeft: {flex: 1, gap: 6},
  skillPct: {fontSize: 26, lineHeight: 30},
  skillRight: {alignItems: 'flex-end'},
  whatsapp: {flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E4EFE1', borderRadius: 10, padding: 10},
});
