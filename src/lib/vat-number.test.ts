import { describe, expect, it } from 'vitest';
import { checkDigitsValid, checkVatNumber } from './vat-number.ts';

// Build a valid 9-digit number from 7 digits using the same formula, so the
// tests don't depend on any real business's VAT number.
function withCheckDigits(seven: string, plus55 = false): string {
  const weights = [8, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((s, w, i) => s + w * Number(seven[i]), 0) + (plus55 ? 55 : 0);
  const check = (97 - (sum % 97)) % 97;
  return seven + String(check).padStart(2, '0');
}

describe('checkDigitsValid', () => {
  it('accepts numbers whose check digits fit either formula', () => {
    expect(checkDigitsValid(withCheckDigits('1234567'))).toBe(true);
    expect(checkDigitsValid(withCheckDigits('7654321', true))).toBe(true);
  });

  it('rejects a number with a changed digit', () => {
    const valid = withCheckDigits('1234567');
    const changed = (Number(valid[0]) + 1) % 10 + valid.slice(1);
    expect(checkDigitsValid(changed)).toBe(false);
  });
});

describe('checkVatNumber', () => {
  const valid = withCheckDigits('1234567');

  it('accepts a 9-digit number with or without GB, spaces and dots', () => {
    for (const input of [valid, `GB${valid}`, `gb ${valid.slice(0, 3)} ${valid.slice(3, 7)} ${valid.slice(7)}`, `GB.${valid}`]) {
      expect(checkVatNumber(input)).toMatchObject({ ok: true, kind: 'standard', prefix: 'GB', number: valid });
    }
  });

  it('formats the number the usual way', () => {
    expect(checkVatNumber(valid)).toMatchObject({ display: `GB ${valid.slice(0, 3)} ${valid.slice(3, 7)} ${valid.slice(7)}` });
  });

  it('accepts 12-digit branch numbers and the XI prefix', () => {
    expect(checkVatNumber(`GB${valid}001`)).toMatchObject({ ok: true, kind: 'branch' });
    expect(checkVatNumber(`XI${valid}`)).toMatchObject({ ok: true, prefix: 'XI' });
  });

  it('accepts government department and health authority numbers by pattern', () => {
    expect(checkVatNumber('GBGD001')).toMatchObject({ ok: true, kind: 'government' });
    expect(checkVatNumber('GBHA599')).toMatchObject({ ok: true, kind: 'health' });
  });

  it('explains why a number fails', () => {
    expect(checkVatNumber('')).toMatchObject({ ok: false, reason: 'empty' });
    expect(checkVatNumber('GB12345')).toMatchObject({ ok: false, reason: 'format' });
    expect(checkVatNumber('GB123456789')).toMatchObject({ ok: false, reason: 'check-digits' });
    expect(checkVatNumber('DE123456789')).toMatchObject({ ok: false, reason: 'eu' });
  });
});
