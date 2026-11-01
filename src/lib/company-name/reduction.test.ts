import { describe, expect, it } from 'vitest';
import { reductionParts } from './reduction';

const ignored = (name: string) =>
  reductionParts(name)
    .filter((p) => p.ignored)
    .map((p) => p.text);

describe('reductionParts', () => {
  it('strikes endings, "The" and trailing matters', () => {
    expect(ignored('The Acme Company Limited')).toEqual(['The', 'Company', 'Limited']);
    expect(ignored('Acme UK Ltd')).toEqual(['UK', 'Ltd']);
  });

  it('strikes punctuation inside kept words', () => {
    expect(ignored('A.C.M.E. Ltd')).toEqual(['.', '.', '.', '.', 'Ltd']);
  });

  it('keeps words that change the key', () => {
    expect(ignored('Copper Bakery Ltd')).toEqual(['Ltd']);
    expect(ignored('Smith & Jones')).toEqual([]);
  });

  it('round-trips the original text', () => {
    for (const name of ['The Acme Company Limited', 'A.C.M.E. Ltd', 'Copper  Bakery']) {
      expect(reductionParts(name).map((p) => p.text).join('')).toBe(name.replace(/\s+/g, ' '));
    }
  });
});
