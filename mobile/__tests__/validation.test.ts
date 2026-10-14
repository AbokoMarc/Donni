import {
  COUNTRIES,
  normalizePhone,
  parseAmount,
  validateAmount,
  validateFullName,
  validatePassword,
  validatePhone,
} from '../src/domain/validation';

describe('numéro de téléphone', () => {
  it('normalise vers E.164', () => {
    expect(normalizePhone('6 90 12 34 56')).toBe('+237690123456');
    expect(normalizePhone('06 90 12 34 56', '+237')).toBe('+237690123456');
    expect(normalizePhone('+33 6 12 34 56 78')).toBe('+33612345678');
    expect(normalizePhone('0033612345678')).toBe('+33612345678');
  });
  it('valide les numéros camerounais', () => {
    expect(validatePhone('690123456').ok).toBe(true);
    expect(validatePhone('6 90 12 34 56').ok).toBe(true);
    expect(validatePhone('290123456').ok).toBe(false);
    expect(validatePhone('69012').ok).toBe(false);
    expect(validatePhone('').message).toBe('Saisissez votre numéro WhatsApp.');
  });
  it('valide pour un autre pays', () => {
    const fr = COUNTRIES.find(c => c.code === 'FR');
    expect(fr).toBeTruthy();
    expect(validatePhone('6 12 34 56 78', fr).ok).toBe(true);
  });
});

describe('mot de passe et nom', () => {
  it('impose 8 à 72 caractères', () => {
    expect(validatePassword('1234567').ok).toBe(false);
    expect(validatePassword('12345678').ok).toBe(true);
    expect(validatePassword('a'.repeat(73)).ok).toBe(false);
  });
  it('impose 2 à 80 caractères au nom', () => {
    expect(validateFullName(' A ').ok).toBe(false);
    expect(validateFullName('Marc').ok).toBe(true);
    expect(validateFullName('x'.repeat(81)).ok).toBe(false);
  });
  it('lit les montants', () => {
    expect(validateAmount('12 500').ok).toBe(true);
    expect(validateAmount('12,5').ok).toBe(false);
    expect(parseAmount('12 500')).toBe(12500);
  });
});
