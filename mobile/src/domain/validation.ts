export interface Country {
  code: string;
  label: string;
  dial: string;
  minDigits: number;
  maxDigits: number;
}

export const COUNTRIES: Country[] = [
  {code: 'CM', label: 'Cameroun', dial: '+237', minDigits: 9, maxDigits: 9},
  {code: 'GA', label: 'Gabon', dial: '+241', minDigits: 7, maxDigits: 9},
  {code: 'CG', label: 'Congo', dial: '+242', minDigits: 9, maxDigits: 9},
  {code: 'CD', label: 'RD Congo', dial: '+243', minDigits: 9, maxDigits: 9},
  {code: 'TD', label: 'Tchad', dial: '+235', minDigits: 8, maxDigits: 8},
  {code: 'CF', label: 'Centrafrique', dial: '+236', minDigits: 8, maxDigits: 8},
  {code: 'SN', label: 'Sénégal', dial: '+221', minDigits: 9, maxDigits: 9},
  {code: 'CI', label: "Côte d'Ivoire", dial: '+225', minDigits: 10, maxDigits: 10},
  {code: 'BJ', label: 'Bénin', dial: '+229', minDigits: 8, maxDigits: 10},
  {code: 'TG', label: 'Togo', dial: '+228', minDigits: 8, maxDigits: 8},
  {code: 'FR', label: 'France', dial: '+33', minDigits: 9, maxDigits: 9},
  {code: 'BE', label: 'Belgique', dial: '+32', minDigits: 8, maxDigits: 9},
];

export const DEFAULT_COUNTRY = COUNTRIES[0];

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function normalizePhone(
  input: string,
  dial: string = DEFAULT_COUNTRY.dial,
): string {
  const trimmed = input.trim();
  const digits = onlyDigits(trimmed);
  if (trimmed.startsWith('+')) {
    return `+${digits}`;
  }
  if (trimmed.startsWith('00')) {
    return `+${digits.slice(2)}`;
  }
  const dialDigits = onlyDigits(dial);
  const national = digits.replace(/^0+/, '');
  return `+${dialDigits}${national}`;
}

export interface Validation {
  ok: boolean;
  message: string | null;
}

const OK: Validation = {ok: true, message: null};
const fail = (message: string): Validation => ({ok: false, message});

export function validatePhone(
  input: string,
  country: Country = DEFAULT_COUNTRY,
): Validation {
  const digits = onlyDigits(input);
  if (digits.length === 0) {
    return fail('Saisissez votre numéro WhatsApp.');
  }
  const national = digits.replace(/^0+/, '');
  if (national.length < country.minDigits || national.length > country.maxDigits) {
    return fail('Numéro invalide.');
  }
  if (country.code === 'CM' && !national.startsWith('6')) {
    return fail('Un numéro camerounais commence par 6.');
  }
  return OK;
}

export function validatePassword(input: string): Validation {
  if (input.length < 8) {
    return fail('8 caractères minimum.');
  }
  if (input.length > 72) {
    return fail('72 caractères maximum.');
  }
  return OK;
}

export function validateFullName(input: string): Validation {
  const len = input.trim().length;
  if (len < 2) {
    return fail('Saisissez votre nom complet.');
  }
  if (len > 80) {
    return fail('80 caractères maximum.');
  }
  return OK;
}

export function validateResetCode(input: string): Validation {
  return /^\d{4,8}$/.test(input.trim()) ? OK : fail('Code invalide.');
}

export function validateAmount(input: string): Validation {
  const cleaned = input.replace(/[\s  ]/g, '');
  return /^\d{1,12}$/.test(cleaned) ? OK : fail('Montant invalide.');
}

export function parseAmount(input: string): number {
  return Number(input.replace(/[\s  ]/g, ''));
}
