import React, {useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {AccountMismatchError} from '../auth/SessionService';
import {messageFor} from '../api/errors';
import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  normalizePhone,
  validateFullName,
  validatePassword,
  validatePhone,
  validateResetCode,
} from '../domain/validation';
import {
  BottomSheet,
  ConfirmSheet,
  Lock,
  PrimaryButton,
  Screen,
  Text,
  TextField,
  ChevronDown,
} from '../components';
import {useRuntime} from '../hooks/runtime';
import {colors, radii} from '../theme';

type Mode = 'register' | 'login' | 'forgot' | 'reset';

const COPY: Record<Mode, {button: string; switchLabel?: string}> = {
  register: {button: 'Commencer avec DONNI', switchLabel: 'J’ai déjà un compte'},
  login: {button: 'Se connecter', switchLabel: 'Créer un compte'},
  forgot: {button: 'Recevoir un code'},
  reset: {button: 'Changer le mot de passe'},
};

export function AuthScreen({embedded = false}: {embedded?: boolean} = {}) {
  const runtime = useRuntime();
  const {session} = runtime;
  const [mode, setMode] = useState<Mode>('register');
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [countryOpen, setCountryOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mismatch, setMismatch] = useState(false);
  const [serverOpen, setServerOpen] = useState(false);
  const [serverDraft, setServerDraft] = useState(runtime.getApiUrl());

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (mode === 'register') {
      const v = validateFullName(fullName);
      if (!v.ok) {
        next.fullName = v.message ?? '';
      }
    }
    const p = validatePhone(phone, country);
    if (!p.ok) {
      next.phone = p.message ?? '';
    }
    if (mode !== 'forgot') {
      const w = validatePassword(password);
      if (!w.ok) {
        next.password = w.message ?? '';
      }
    }
    if (mode === 'reset') {
      const c = validateResetCode(code);
      if (!c.ok) {
        next.code = c.message ?? '';
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const serverMissing = runtime.getApiUrl() === '';

  const submit = async (replaceLocalData = false) => {
    setBanner(null);
    if (!validate()) {
      return;
    }
    if (serverMissing) {
      setBanner('Aucun serveur n’est configuré. Renseignez son adresse ci-dessous ou continuez sans compte.');
      return;
    }
    const normalized = normalizePhone(phone, country.dial);
    setBusy(true);
    try {
      if (mode === 'register') {
        await session.register({fullName: fullName.trim(), phone: normalized, password}, replaceLocalData);
      } else if (mode === 'login') {
        await session.login({phone: normalized, password}, replaceLocalData);
      } else if (mode === 'forgot') {
        await session.forgotPassword(normalized);
        setMode('reset');
        setBanner('Si ce numéro est enregistré, un code vient d’être envoyé sur WhatsApp.');
      } else {
        await session.resetPassword(normalized, code.trim(), password);
        setMode('login');
        setPassword('');
        setCode('');
        setBanner('Mot de passe modifié. Vous pouvez vous connecter.');
      }
    } catch (error) {
      if (error instanceof AccountMismatchError) {
        setMismatch(true);
      } else {
        setBanner(messageFor(error));
      }
    } finally {
      setBusy(false);
    }
  };

  const change = (next: Mode) => {
    setMode(next);
    setErrors({});
    setBanner(null);
  };

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.brand}>
        <Text variant="display" align="center" accessibilityRole="header" style={styles.wordmark}>
          DONNI
        </Text>
        <Text variant="body" align="center" style={styles.tagline}>
          Ton temps. Ton argent. Ta direction.
        </Text>
      </View>

      <View style={styles.form}>
        {mode === 'register' ? (
          <TextField
            label="Nom complet"
            placeholder="Votre nom complet"
            value={fullName}
            onChangeText={setFullName}
            error={errors.fullName}
            autoCapitalize="words"
            textContentType="name"
            autoComplete="name"
          />
        ) : null}
        <TextField
          label="Numéro WhatsApp"
          placeholder="6 xx xx xx xx"
          value={phone}
          onChangeText={setPhone}
          error={errors.phone}
          keyboardType="phone-pad"
          autoComplete="tel"
          prefix={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Indicatif ${country.label} ${country.dial}`}
              onPress={() => setCountryOpen(true)}
              style={styles.dial}>
              <Text variant="bodyStrong">{country.dial}</Text>
              <ChevronDown size={14} color={colors.border} strokeWidth={1.75} />
            </Pressable>
          }
        />
        {mode === 'reset' ? (
          <TextField
            label="Code reçu"
            placeholder="123456"
            value={code}
            onChangeText={setCode}
            error={errors.code}
            keyboardType="number-pad"
          />
        ) : null}
        {mode !== 'forgot' ? (
          <TextField
            label={mode === 'reset' ? 'Nouveau mot de passe' : 'Mot de passe'}
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            error={errors.password}
            secureToggle
            autoCapitalize="none"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        ) : null}

        {banner ? (
          <Text variant="small" color={colors.label} accessibilityLiveRegion="polite">
            {banner}
          </Text>
        ) : null}

        <PrimaryButton label={COPY[mode].button} onPress={() => void submit()} loading={busy} />

        {mode === 'login' ? (
          <Pressable accessibilityRole="button" onPress={() => change('forgot')} style={styles.linkWrap}>
            <Text variant="small" color={colors.label} style={styles.link}>
              Mot de passe oublié ?
            </Text>
          </Pressable>
        ) : null}
        {COPY[mode].switchLabel ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => change(mode === 'register' ? 'login' : 'register')}
            style={styles.linkWrap}>
            <Text variant="small" color={colors.label} style={styles.link}>
              {COPY[mode].switchLabel}
            </Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => change('login')} style={styles.linkWrap}>
            <Text variant="small" color={colors.label} style={styles.link}>
              Retour à la connexion
            </Text>
          </Pressable>
        )}
      </View>

      <View style={styles.bottom}>
        <Text variant="caption" align="center" color={colors.inkSoft}>
          En continuant, vous acceptez nos Conditions d’utilisation · Politique de confidentialité
        </Text>
        {embedded ? null : (
          <Pressable
            accessibilityRole="button"
            onPress={() => void session.continueWithoutAccount()}
            style={styles.linkWrap}>
            <Text variant="small" color={colors.ink} style={styles.link}>
              Continuer sans compte
            </Text>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" onPress={() => setServerOpen(true)} style={styles.linkWrap}>
          <Text variant="caption" color={colors.inkSoft} style={styles.link}>
            Adresse du serveur
          </Text>
        </Pressable>
        <View style={styles.secure}>
          <Lock size={13} color={colors.label} strokeWidth={1.75} />
          <Text variant="caption" color={colors.label}>
            Sécurisé · Vos données sont protégées
          </Text>
        </View>
      </View>

      <BottomSheet visible={countryOpen} title="Indicatif du pays" onClose={() => setCountryOpen(false)}>
        {COUNTRIES.map(c => (
          <Pressable
            key={c.code}
            accessibilityRole="button"
            onPress={() => {
              setCountry(c);
              setCountryOpen(false);
            }}
            style={styles.countryRow}>
            <Text variant="body">{c.label}</Text>
            <Text variant="bodyStrong">{c.dial}</Text>
          </Pressable>
        ))}
      </BottomSheet>

      <BottomSheet visible={serverOpen} title="Adresse du serveur" onClose={() => setServerOpen(false)}>
        <TextField
          label="URL de l’API"
          value={serverDraft}
          onChangeText={setServerDraft}
          placeholder="https://mon-serveur.example.com/api/v1"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          hint="Laissez vide pour utiliser DONNI uniquement sur ce téléphone."
        />
        <View style={styles.sheetAction}>
          <PrimaryButton
            label="Enregistrer"
            onPress={() => {
              void runtime.setApiUrl(serverDraft).then(() => setServerOpen(false));
            }}
          />
        </View>
      </BottomSheet>

      <ConfirmSheet
        visible={mismatch}
        title="Données d’un autre compte"
        message="Les données enregistrées sur ce téléphone appartiennent à un autre compte. Les remplacer par celles de ce compte supprimera les données locales."
        confirmLabel="Remplacer"
        onCancel={() => setMismatch(false)}
        onConfirm={() => {
          setMismatch(false);
          void submit(true);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {flexGrow: 1, paddingTop: 36},
  brand: {alignItems: 'center', marginTop: 24, marginBottom: 36, gap: 14},
  wordmark: {color: colors.ink},
  tagline: {fontSize: 17},
  form: {gap: 22},
  dial: {flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 6},
  linkWrap: {alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 8},
  link: {textDecorationLine: 'underline'},
  bottom: {marginTop: 28, gap: 4, alignItems: 'center'},
  secure: {flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 12},
  countryRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSoft,
  },
  sheetAction: {marginTop: 16, borderRadius: radii.field},
});
