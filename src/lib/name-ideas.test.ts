import { describe, expect, it } from 'vitest';
import { normalizeCompanyName } from './company-name/normalize.ts';
import { encodeNameLine, shardKey, type IndexManifest } from './company-index/format.ts';
import { buildShards } from './company-index/shards.ts';
import { candidateNames, nameIdeas, parseKeywords } from './name-ideas.ts';

describe('parseKeywords', () => {
  it('splits, cleans, title-cases and de-duplicates up to three keywords', () => {
    expect(parseKeywords(' bakery, sourdough  BAKERY  !! x london ')).toEqual(['Bakery', 'Sourdough', 'London']);
  });
});

describe('candidateNames', () => {
  it('combines keywords with prefixes and suffixes, differently per page', () => {
    const first = candidateNames(['Bakery']);
    expect(first).toContain('Bakery Studio');
    expect(first).toContain('Bright Bakery');
    expect(candidateNames(['Bakery'], 1)[0]).not.toBe(first[0]);
  });

  it('never uses endings that the "same as" rules ignore', () => {
    for (const name of candidateNames(['Bakery', 'Bread'])) {
      expect(normalizeCompanyName(name)).not.toBe(normalizeCompanyName('Bakery'));
    }
  });
});

describe('nameIdeas', () => {
  it('marks ideas already registered as taken and lists available ones first', async () => {
    // Synthetic company (not a real record).
    const row = { number: '90000001', name: 'BAKERY STUDIO LIMITED', status: 'Active', incorporatedOn: '', accountsDue: '', confirmationStatementDue: '' };
    const names = buildShards([encodeNameLine(normalizeCompanyName(row.name), row)]);
    const manifest: IndexManifest = {
      version: 1,
      snapshot: '2026-10-01',
      generatedAt: '',
      names: { count: 1, firstKeys: names.firstKeys },
      companies: { count: 0, firstKeys: [''] },
    };
    const files = new Map([[shardKey('2026-10-01', 'names', 0), names.shards[0]]]);
    const ideas = await nameIdeas(['Bakery'], manifest, async (k) => files.get(k) ?? null);
    expect(ideas.length).toBeGreaterThan(10);
    const taken = ideas.find((i) => i.name === 'Bakery Studio Ltd');
    expect(taken).toMatchObject({ available: false, takenBy: 'BAKERY STUDIO LIMITED' });
    expect(ideas[0].available).toBe(true);
    expect(ideas.at(-1)!.available).toBe(false);
  });
});
