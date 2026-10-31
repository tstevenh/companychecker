import { describe, expect, it } from 'vitest';
import { normalizeCompanyName } from '../company-name/normalize.ts';
import { encodeCompanyLine, encodeNameLine, shardKey, type CompanyRow, type IndexManifest } from './format.ts';
import { findShardIndex, lookupCompany, lookupName } from './lookup.ts';
import { buildShards } from './shards.ts';

// Synthetic companies (not real records).
function company(number: string, name: string, extra: Partial<CompanyRow> = {}): CompanyRow {
  return { number, name, status: 'Active', incorporatedOn: '2024-07-29', accountsDue: '', confirmationStatementDue: '', ...extra };
}

const COMPANIES: CompanyRow[] = [
  company('90000001', 'EXAMPLE WIDGETS LTD', { accountsDue: '2027-04-30', confirmationStatementDue: '2027-08-11' }),
  company('90000002', 'THE SAMPLE BAKERY LIMITED'),
  // Only a final "S" is disregarded, so this is the "same as" SAMPLE BAKERY.
  company('90000003', "SAMPLE BAKERY'S LTD"),
  company('SC000004', 'NORTH STAR TRADING LTD'),
  ...Array.from({ length: 400 }, (_, i) => company(`8${String(i).padStart(7, '0')}`, `FILLER COMPANY ${i} LTD`)),
];

function buildIndex(maxBytes: number) {
  const nameLines = COMPANIES.map((c) => encodeNameLine(normalizeCompanyName(c.name), c)).sort();
  const companyLines = COMPANIES.map(encodeCompanyLine).sort();
  const names = buildShards(nameLines, maxBytes);
  const companies = buildShards(companyLines, maxBytes);
  const files = new Map<string, string>();
  names.shards.forEach((text, i) => files.set(shardKey('2026-10-01', 'names', i), text));
  companies.shards.forEach((text, i) => files.set(shardKey('2026-10-01', 'companies', i), text));
  const manifest: IndexManifest = {
    version: 1,
    snapshot: '2026-10-01',
    generatedAt: '2026-10-08T06:00:00.000Z',
    names: { count: names.count, firstKeys: names.firstKeys },
    companies: { count: companies.count, firstKeys: companies.firstKeys },
  };
  return { manifest, names, companies, load: async (key: string) => files.get(key) ?? null };
}

describe('buildShards', () => {
  it('splits sorted lines into shards near the size limit, keeping every line', () => {
    const { names } = buildIndex(1024);
    expect(names.shards.length).toBeGreaterThan(5);
    expect(names.shards.every((s) => Buffer.byteLength(s) <= 1024 + 200)).toBe(true);
    expect(names.shards.join('').trim().split('\n')).toHaveLength(COMPANIES.length);
    expect([...names.firstKeys].sort()).toEqual(names.firstKeys);
  });

  it('never splits identical keys across shards', () => {
    const lines = Array.from({ length: 50 }, (_, i) => `SAMEKEY\t${String(i).padStart(8, '0')}\tSAME KEY LTD\tActive`);
    const built = buildShards([...lines, 'ZZZ\t1\tZ\tActive'], 200);
    expect(built.shards[0].trim().split('\n')).toHaveLength(50);
    expect(built.firstKeys).toEqual(['SAMEKEY', 'ZZZ']);
  });
});

describe('findShardIndex', () => {
  it('returns the last shard whose first key is not after the key', () => {
    const firstKeys = ['B', 'F', 'M'];
    expect(findShardIndex(firstKeys, 'A')).toBe(0);
    expect(findShardIndex(firstKeys, 'B')).toBe(0);
    expect(findShardIndex(firstKeys, 'E')).toBe(0);
    expect(findShardIndex(firstKeys, 'F')).toBe(1);
    expect(findShardIndex(firstKeys, 'Z')).toBe(2);
  });
});

describe('lookupName', () => {
  it('finds every company whose name is the "same as" the query, across shard sizes', async () => {
    for (const maxBytes of [256, 1024, 64 * 1024]) {
      const { manifest, load } = buildIndex(maxBytes);
      const result = await lookupName(manifest, normalizeCompanyName('Sample Bakery Ltd'), load);
      expect(result.exact.map((e) => e.number).sort()).toEqual(['90000002', '90000003']);
    }
  });

  it('returns no exact match for an unused name, with nearby names for suggestions', async () => {
    const { manifest, load } = buildIndex(64 * 1024);
    const result = await lookupName(manifest, normalizeCompanyName('Sample Brewery Ltd'), load);
    expect(result.exact).toEqual([]);
    expect(result.nearby.map((e) => e.name)).toContain('THE SAMPLE BAKERY LIMITED');
  });
});

describe('lookupCompany', () => {
  it('finds a company and its deadlines by number', async () => {
    const { manifest, load } = buildIndex(512);
    expect(await lookupCompany(manifest, '90000001', load)).toEqual(COMPANIES[0]);
    expect(await lookupCompany(manifest, 'SC000004', load)).toMatchObject({ name: 'NORTH STAR TRADING LTD' });
    expect(await lookupCompany(manifest, '99999999', load)).toBeNull();
  });
});
