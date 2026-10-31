// UK VAT registration number format check.
//
// Formats (European Commission VIES table): GB + 9 digits, GB + 12 digits
// (branch traders), GBGD + 3 digits (government departments), GBHA + 3 digits
// (health authorities). Northern Ireland businesses trading goods with the EU
// use XI instead of GB.
//
// Check digits: HMRC says the last two digits of a 9-digit number come from a
// "standard formula" ("modulus 97"). The formula below is the one in HMRC's own
// open-source code (hmrc/vat-registration-frontend, VrnConstraints.scala):
// weights 8..2 on the first 7 digits, plus the 2 check digits as a number; the
// number passes if that total, or the total + 55, is divisible by 97.
//
// A format check can't confirm that a number is registered. Only HMRC can.

export type VatCheck =
  | { ok: true; kind: 'standard' | 'branch'; prefix: 'GB' | 'XI'; number: string; display: string }
  | { ok: true; kind: 'government' | 'health'; prefix: 'GB' | 'XI'; number: string; display: string }
  | { ok: false; reason: 'empty' | 'format' | 'check-digits' | 'eu'; input: string };

const EU_PREFIXES = new Set([
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES', 'FI', 'FR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT',
  'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
]);

export function checkDigitsValid(nineDigits: string): boolean {
  if (!/^\d{9}$/.test(nineDigits)) return false;
  const weights = [8, 7, 6, 5, 4, 3, 2];
  const total = weights.reduce((sum, w, i) => sum + w * Number(nineDigits[i]), 0) + Number(nineDigits.slice(7));
  return total % 97 === 0 || (total + 55) % 97 === 0;
}

export function checkVatNumber(input: string): VatCheck {
  const s = input.replace(/[\s.-]+/g, '').toUpperCase();
  if (!s) return { ok: false, reason: 'empty', input };
  const prefixMatch = /^(GB|XI)?(.*)$/.exec(s)!;
  const prefix = (prefixMatch[1] ?? 'GB') as 'GB' | 'XI';
  const rest = prefixMatch[2];
  if (!prefixMatch[1] && EU_PREFIXES.has(s.slice(0, 2)) && /^[A-Z]{2}/.test(s)) return { ok: false, reason: 'eu', input };

  const special = /^(GD|HA)(\d{3})$/.exec(rest);
  if (special) {
    return { ok: true, kind: special[1] === 'GD' ? 'government' : 'health', prefix, number: rest, display: `${prefix}${rest}` };
  }
  if (!/^\d{9}(\d{3})?$/.test(rest)) return { ok: false, reason: 'format', input };
  if (!checkDigitsValid(rest.slice(0, 9))) return { ok: false, reason: 'check-digits', input };
  const display = `${prefix} ${rest.slice(0, 3)} ${rest.slice(3, 7)} ${rest.slice(7, 9)}${rest.length === 12 ? ` ${rest.slice(9)}` : ''}`;
  return { ok: true, kind: rest.length === 12 ? 'branch' : 'standard', prefix, number: rest, display };
}
