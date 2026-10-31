// UK company numbers are 8 characters: 8 digits (England and Wales), or a
// two-letter prefix such as SC, NI, OC, SO, NC or FC followed by 6 digits.
// People often type them without leading zeros or with spaces.

export function parseCompanyNumber(input: string): string | null {
  const s = input.replace(/\s+/g, '').toUpperCase();
  if (/^\d{1,8}$/.test(s)) return s.padStart(8, '0');
  const prefixed = /^([A-Z]{2})(\d{1,6})$/.exec(s);
  if (prefixed) return prefixed[1] + prefixed[2].padStart(6, '0');
  return null;
}
