import React, {useMemo, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {
  AutoText,
  BarChart,
  BottomSheet,
  Card,
  ConfirmSheet,
  DashedAddButton,
  DateField,
  EmptyState,
  IconButton,
  LineChart,
  ModuleHeader,
  PrimaryButton,
  ProgressBar,
  Screen,
  SectionTitle,
  SelectField,
  StatTile,
  Text,
  TextField,
  Trash2,
  Wallet,
  ArrowDown,
  ArrowUp,
} from '../components';
import type {Option} from '../components';
import {
  CATEGORY_LABELS,
  EXPENSE_CATEGORIES,
  addDays,
  budgetUsage,
  creditTotal,
  debtTotal,
  flowByWeek,
  flowOf,
  formatDayMonth,
  formatMonthLabel,
  formatXof,
  monthOf,
  monthRange,
  toDay,
  totalBalance,
  walletBalances,
} from '../domain';
import type {Account, Transaction, TransactionCategory} from '../domain';
import {useLiveQuery} from '../db';
import {useNow, useRuntime} from '../hooks/runtime';
import {colors} from '../theme';

const WEEKS = 6;

function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[\s  ]/g, '').replace(',', '.');
  if (cleaned === '' || !/^-?\d+(\.\d+)?$/.test(cleaned)) {
    return null;
  }
  return Math.round(Number(cleaned));
}

export function ArgentScreen() {
  const nav = useNavigation();
  const {repo} = useRuntime();
  const now = useNow();
  const today = toDay(now);
  const month = monthOf(today);
  const {from: monthFrom, to: monthTo} = monthRange(month);
  const chartFrom = addDays(today, -7 * (WEEKS - 1));

  const [editing, setEditing] = useState(false);
  const [addingTx, setAddingTx] = useState(false);
  const [addingAccount, setAddingAccount] = useState<'debt' | 'credit' | 'wallet' | null>(null);
  const [addingBudget, setAddingBudget] = useState(false);
  const [deleting, setDeleting] = useState<{kind: 'account' | 'transaction' | 'budget'; id: string; label: string} | null>(null);

  const accountsQuery = useLiveQuery(['accounts'], q => q.accounts());
  const sumsQuery = useLiveQuery(['transactions', 'accounts'], q => q.balanceSums());
  const txQuery = useLiveQuery(['transactions'], q => q.transactions({from: chartFrom < monthFrom ? chartFrom : monthFrom, to: monthTo}), [
    chartFrom,
    monthFrom,
    monthTo,
  ]);
  const recentQuery = useLiveQuery(['transactions'], q => q.transactions({limit: 30}));
  const budgetsQuery = useLiveQuery(['budgets'], q => q.budgetsForMonth(month), [month]);

  const accounts = accountsQuery.data ?? [];
  const sums = sumsQuery.data ?? {};
  const txs = txQuery.data ?? [];
  const recent = recentQuery.data ?? [];
  const budgets = budgetsQuery.data ?? [];

  const balance = totalBalance(accounts, sums);
  const balances = walletBalances(accounts, sums);
  const debt = debtTotal(accounts);
  const credit = creditTotal(accounts);
  const monthFlow = useMemo(() => flowOf(txs.filter(t => t.day >= monthFrom && t.day <= monthTo)), [txs, monthFrom, monthTo]);
  const weeks = useMemo(() => flowByWeek(txs, chartFrom, today), [txs, chartFrom, today]);
  const wallets = accounts.filter(a => a.kind === 'wallet');
  const debts = accounts.filter(a => a.kind === 'debt');
  const credits = accounts.filter(a => a.kind === 'credit');

  const confirmDelete = () => {
    if (!deleting) {
      return;
    }
    const {kind, id} = deleting;
    const table = kind === 'account' ? repo.tables.accounts : kind === 'transaction' ? repo.tables.transactions : repo.tables.budgets;
    void table.softDelete(id);
    setDeleting(null);
  };

  const updateAmount = (account: Account, text: string) => {
    const value = parseAmount(text);
    if (value === null) {
      return;
    }
    void repo.tables.accounts.update(account.id, {amountXof: account.kind === 'debt' ? Math.abs(value) : value});
  };

  const accountLabel = (id: string | null) => accounts.find(a => a.id === id)?.label ?? 'Portefeuille';

  return (
    <Screen>
      <ModuleHeader title="Argent" editing={editing} onToggleEdit={() => setEditing(e => !e)} onBack={() => nav.goBack()} />

      <Card style={styles.balance}>
        <Text variant="body" color={colors.inkSoft}>
          Solde total
        </Text>
        <Text variant="figureLarge" color={balance < 0 ? colors.negative : colors.ink}>
          {formatXof(balance)}
        </Text>
        <Text variant="caption" color={colors.inkSoft}>
          {`${formatMonthLabel(month)} : ${formatXof(monthFlow.income, {sign: true})} · ${formatXof(-monthFlow.expense)}`}
        </Text>
      </Card>

      <View style={styles.tiles}>
        <StatTile icon={ArrowDown} label="Dette" value={formatXof(debt)} />
        <StatTile icon={ArrowUp} label="Crédit" value={formatXof(credit)} />
      </View>

      <SectionTitle>Entrées et sorties</SectionTitle>
      <Card>
        {editing ? (
          <LineChart
            labels={weeks.map(w => w.label)}
            series={[
              {name: 'Entrées', values: weeks.map(w => w.income), color: colors.accent},
              {name: 'Sorties', values: weeks.map(w => w.expense), color: colors.ink},
            ]}
            accessibilitySummary={`Entrées et sorties des ${WEEKS} dernières semaines`}
          />
        ) : (
          <BarChart
            data={weeks.map(w => ({label: w.label, a: w.income, b: w.expense}))}
            aLabel="Entrées"
            bLabel="Sorties"
            accessibilitySummary={`Entrées et sorties des ${WEEKS} dernières semaines`}
          />
        )}
      </Card>

      <SectionTitle count={wallets.length}>Comptes</SectionTitle>
      {wallets.length === 0 ? (
        <EmptyState title="Aucun compte" message="Ajoutez un portefeuille pour suivre votre solde." />
      ) : (
        <View style={styles.list}>
          {wallets.map(a => (
            <Card key={a.id} style={styles.accountRow}>
              <Wallet size={22} color={colors.ink} strokeWidth={1.75} />
              <View style={styles.grow}>
                {editing ? (
                  <>
                    <AutoText label="Nom du compte" bold value={a.label} onCommit={v => v && void repo.tables.accounts.update(a.id, {label: v})} />
                    <AutoText
                      label={`Solde initial de ${a.label}`}
                      value={String(a.amountXof)}
                      keyboardType="numeric"
                      onCommit={v => updateAmount(a, v)}
                    />
                  </>
                ) : (
                  <>
                    <Text variant="bodyStrong">{a.label}</Text>
                    {a.provider ? (
                      <Text variant="caption" color={colors.inkSoft}>
                        {a.provider}
                      </Text>
                    ) : null}
                  </>
                )}
              </View>
              <Text variant="bodyStrong">{formatXof(balances[a.id] ?? 0)}</Text>
              {editing ? <IconButton icon={Trash2} tone="danger" label={`Supprimer ${a.label}`} onPress={() => setDeleting({kind: 'account', id: a.id, label: a.label})} /> : null}
            </Card>
          ))}
        </View>
      )}
      {editing ? <DashedAddButton label="Ajouter un compte" onPress={() => setAddingAccount('wallet')} /> : null}

      <LiabilityList
        title="Dettes"
        items={debts}
        editing={editing}
        onAdd={() => setAddingAccount('debt')}
        onAmount={updateAmount}
        onDelete={a => setDeleting({kind: 'account', id: a.id, label: a.label})}
      />
      <LiabilityList
        title="Crédits"
        items={credits}
        editing={editing}
        onAdd={() => setAddingAccount('credit')}
        onAmount={updateAmount}
        onDelete={a => setDeleting({kind: 'account', id: a.id, label: a.label})}
      />

      <SectionTitle count={budgets.length}>Budgets du mois</SectionTitle>
      {budgets.length === 0 ? (
        <EmptyState title="Aucun budget" message="Fixez un plafond mensuel pour être prévenu à 80 % et à 100 %." />
      ) : (
        <View style={styles.list}>
          {budgets.map(b => {
            const usage = budgetUsage(b, txs);
            const label = b.category ? CATEGORY_LABELS[b.category] : 'Budget global';
            return (
              <Card key={b.id} style={styles.budget}>
                <View style={styles.budgetHead}>
                  <Text variant="bodyStrong">{label}</Text>
                  {editing ? <IconButton icon={Trash2} tone="danger" label={`Supprimer le budget ${label}`} onPress={() => setDeleting({kind: 'budget', id: b.id, label})} /> : null}
                </View>
                <ProgressBar value={Math.min(100, Math.round(usage.ratio * 100))} label={`Budget ${label}`} />
                <Text variant="caption" color={usage.level === 100 ? colors.negative : colors.inkSoft}>
                  {`${formatXof(usage.spent)} sur ${formatXof(usage.limit)}`}
                </Text>
                {editing ? (
                  <AutoText
                    label={`Plafond ${label}`}
                    value={String(b.limitXof)}
                    keyboardType="numeric"
                    onCommit={v => {
                      const n = parseAmount(v);
                      if (n !== null && n > 0) {
                        void repo.tables.budgets.update(b.id, {limitXof: n, alertedLevel: 0});
                      }
                    }}
                  />
                ) : null}
              </Card>
            );
          })}
        </View>
      )}
      {editing ? <DashedAddButton label="Ajouter un budget" onPress={() => setAddingBudget(true)} /> : null}

      <SectionTitle>Transactions</SectionTitle>
      {recent.length === 0 ? (
        <EmptyState title="Aucune transaction" message="Les entrées et les sorties apparaîtront ici." />
      ) : (
        <View style={styles.list}>
          {recent.map(t => (
            <TransactionRow
              key={t.id}
              tx={t}
              account={accountLabel(t.accountId)}
              editing={editing}
              onDelete={() => setDeleting({kind: 'transaction', id: t.id, label: t.label})}
            />
          ))}
        </View>
      )}
      {editing ? (
        <View style={styles.addTx}>
          <DashedAddButton label="Ajouter une transaction" onPress={() => setAddingTx(true)} />
        </View>
      ) : null}

      <TransactionSheet visible={addingTx} accounts={wallets} today={today} onClose={() => setAddingTx(false)} />
      <AccountSheet kind={addingAccount} onClose={() => setAddingAccount(null)} />
      <BudgetSheet visible={addingBudget} month={month} onClose={() => setAddingBudget(false)} />
      <ConfirmSheet
        visible={deleting !== null}
        title="Supprimer cet élément ?"
        message={deleting ? `« ${deleting.label} » sera supprimé.` : undefined}
        confirmLabel="Supprimer"
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </Screen>
  );
}

function LiabilityList({
  title,
  items,
  editing,
  onAdd,
  onAmount,
  onDelete,
}: {
  title: string;
  items: Account[];
  editing: boolean;
  onAdd: () => void;
  onAmount: (a: Account, text: string) => void;
  onDelete: (a: Account) => void;
}) {
  const {repo} = useRuntime();
  if (items.length === 0 && !editing) {
    return null;
  }
  return (
    <>
      <SectionTitle count={items.length}>{title}</SectionTitle>
      <View style={styles.list}>
        {items.map(a => (
          <Card key={a.id} style={styles.accountRow}>
            <View style={styles.grow}>
              {editing ? (
                <>
                  <AutoText label="Libellé" bold value={a.label} onCommit={v => v && void repo.tables.accounts.update(a.id, {label: v})} />
                  <AutoText label={`Montant de ${a.label}`} value={String(Math.abs(a.amountXof))} keyboardType="numeric" onCommit={v => onAmount(a, v)} />
                  <DateField label="Échéance" value={a.dueDate} onChange={v => void repo.tables.accounts.update(a.id, {dueDate: v})} />
                </>
              ) : (
                <>
                  <Text variant="bodyStrong">{a.label}</Text>
                  <Text variant="caption" color={colors.inkSoft}>
                    {[a.counterparty, a.dueDate ? `échéance ${formatDayMonth(a.dueDate)}` : null].filter(Boolean).join(' · ')}
                  </Text>
                </>
              )}
            </View>
            <Text variant="bodyStrong">{formatXof(a.kind === 'debt' ? -Math.abs(a.amountXof) : Math.abs(a.amountXof))}</Text>
            {editing ? <IconButton icon={Trash2} tone="danger" label={`Supprimer ${a.label}`} onPress={() => onDelete(a)} /> : null}
          </Card>
        ))}
      </View>
      {editing ? <DashedAddButton label={`Ajouter ${title === 'Dettes' ? 'une dette' : 'un crédit'}`} onPress={onAdd} /> : null}
    </>
  );
}

function TransactionRow({tx, account, editing, onDelete}: {tx: Transaction; account: string; editing: boolean; onDelete: () => void}) {
  const income = tx.amountXof >= 0;
  return (
    <Card style={styles.accountRow}>
      <View style={styles.grow}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {tx.label}
        </Text>
        <Text variant="caption" color={colors.inkSoft}>
          {`${formatDayMonth(tx.day)} · ${CATEGORY_LABELS[tx.category]} · ${account}`}
        </Text>
      </View>
      <Text variant="bodyStrong" color={income ? colors.positive : colors.ink}>
        {formatXof(tx.amountXof, {sign: true})}
      </Text>
      {editing ? <IconButton icon={Trash2} tone="danger" label={`Supprimer ${tx.label}`} onPress={onDelete} /> : null}
    </Card>
  );
}

const CATEGORY_OPTIONS: Array<Option<TransactionCategory>> = EXPENSE_CATEGORIES.map(c => ({value: c, label: CATEGORY_LABELS[c]}));

function TransactionSheet({visible, accounts, today, onClose}: {visible: boolean; accounts: Account[]; today: string; onClose: () => void}) {
  const {repo} = useRuntime();
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<'out' | 'in'>('out');
  const [category, setCategory] = useState<TransactionCategory>('autres');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const accountOptions: Array<Option<string>> = accounts.map(a => ({value: a.id, label: a.label}));
  const selectedAccount = accountId ?? accounts[0]?.id ?? null;

  const save = async () => {
    const n = parseAmount(amount);
    if (label.trim() === '') {
      setError('Indiquez un libellé.');
      return;
    }
    if (n === null || n <= 0) {
      setError('Saisissez un montant supérieur à zéro.');
      return;
    }
    await repo.tables.transactions.insert({
      label: label.trim(),
      amountXof: direction === 'out' ? -n : n,
      category: direction === 'in' ? 'revenus' : category,
      accountId: selectedAccount,
      day: day ?? today,
    });
    setLabel('');
    setAmount('');
    setError(null);
    setDay(null);
    onClose();
  };

  return (
    <BottomSheet visible={visible} title="Nouvelle transaction" onClose={onClose}>
      <View style={styles.form}>
        <SelectField
          label="Sens"
          value={direction}
          options={[
            {value: 'out', label: 'Dépense'},
            {value: 'in', label: 'Entrée d’argent'},
          ]}
          onChange={setDirection}
        />
        <TextField label="Libellé" value={label} onChangeText={setLabel} error={error} />
        <TextField label="Montant (FCFA)" value={amount} onChangeText={setAmount} keyboardType="numeric" />
        {direction === 'out' ? <SelectField label="Catégorie" value={category} options={CATEGORY_OPTIONS} onChange={setCategory} /> : null}
        {accountOptions.length > 0 ? <SelectField label="Compte" value={selectedAccount} options={accountOptions} onChange={setAccountId} /> : null}
        <DateField label="Date" value={day ?? today} onChange={setDay} />
        <PrimaryButton label="Ajouter" onPress={() => void save()} />
      </View>
    </BottomSheet>
  );
}

function AccountSheet({kind, onClose}: {kind: 'debt' | 'credit' | 'wallet' | null; onClose: () => void}) {
  const {repo} = useRuntime();
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [counterparty, setCounterparty] = useState('');
  const [due, setDue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const titles = {wallet: 'Nouveau compte', debt: 'Nouvelle dette', credit: 'Nouveau crédit'} as const;

  const save = async () => {
    if (!kind) {
      return;
    }
    const n = parseAmount(amount === '' ? '0' : amount);
    if (label.trim() === '' || n === null) {
      setError('Renseignez un libellé et un montant valides.');
      return;
    }
    await repo.tables.accounts.insert({
      label: label.trim(),
      kind,
      amountXof: kind === 'debt' ? Math.abs(n) : n,
      counterparty: counterparty.trim() || null,
      dueDate: kind === 'wallet' ? null : due,
    });
    setLabel('');
    setAmount('');
    setCounterparty('');
    setDue(null);
    setError(null);
    onClose();
  };

  return (
    <BottomSheet visible={kind !== null} title={kind ? titles[kind] : undefined} onClose={onClose}>
      <View style={styles.form}>
        <TextField label="Libellé" value={label} onChangeText={setLabel} error={error} />
        <TextField label={kind === 'wallet' ? 'Solde initial (FCFA)' : 'Montant (FCFA)'} value={amount} onChangeText={setAmount} keyboardType="numeric" />
        {kind && kind !== 'wallet' ? (
          <>
            <TextField label={kind === 'debt' ? 'Créancier' : 'Débiteur'} value={counterparty} onChangeText={setCounterparty} />
            <DateField label="Échéance" value={due} onChange={setDue} />
          </>
        ) : null}
        <PrimaryButton label="Ajouter" onPress={() => void save()} />
      </View>
    </BottomSheet>
  );
}

function BudgetSheet({visible, month, onClose}: {visible: boolean; month: string; onClose: () => void}) {
  const {repo} = useRuntime();
  const [category, setCategory] = useState<TransactionCategory | 'all'>('all');
  const [limit, setLimit] = useState('');
  const [error, setError] = useState<string | null>(null);
  const options: Array<Option<TransactionCategory | 'all'>> = [{value: 'all', label: 'Budget global'}, ...CATEGORY_OPTIONS];

  const save = async () => {
    const n = parseAmount(limit);
    if (n === null || n <= 0) {
      setError('Saisissez un plafond supérieur à zéro.');
      return;
    }
    await repo.tables.budgets.insert({month, category: category === 'all' ? null : category, limitXof: n, alertedLevel: 0});
    setLimit('');
    setError(null);
    onClose();
  };

  return (
    <BottomSheet visible={visible} title={`Budget de ${formatMonthLabel(month)}`} onClose={onClose}>
      <View style={styles.form}>
        <SelectField label="Catégorie" value={category} options={options} onChange={setCategory} />
        <TextField label="Plafond (FCFA)" value={limit} onChangeText={setLimit} keyboardType="numeric" error={error} />
        <PrimaryButton label="Ajouter" onPress={() => void save()} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  balance: {gap: 6, paddingVertical: 18},
  tiles: {flexDirection: 'row', gap: 10, marginTop: 14},
  list: {gap: 10, marginBottom: 12},
  accountRow: {flexDirection: 'row', alignItems: 'center', gap: 12},
  grow: {flex: 1, gap: 4},
  budget: {gap: 8},
  budgetHead: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  addTx: {marginTop: 12},
  form: {gap: 16, paddingBottom: 8},
});
