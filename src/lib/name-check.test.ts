import { describe, expect, it } from 'vitest';
import { normalizeCompanyName } from './company-name/normalize.ts';
import { encodeNameLine, shardKey, type IndexManifest } from './company-index/format.ts';
import { buildShards } from './company-index/shards.ts';
import { checkName, type LiveCompany } from './name-check.ts';

// Synthetic companies (not real records).
const rows = [
  { number: '90000001', name: 'EXAMPLE WIDGETS LTD' },
  { number: '90000002', name: 'THE SAMPLE BAKERY LIMITED' },
].map((r) => ({ ...r, status: 'Active', incorporatedOn: '', accountsDue: '', confirmationStatementDue: '' }));

const names = buildShards(rows.map((r) => encodeNameLine(normalizeCompanyName(r.name), r)).sort());
const files = new Map(names.shards.map((text, i) => [shardKey('2026-10-01', 'names', i), text]));
const manifest: IndexManifest = {
  version: 1,
  snapshot: '2026-10-01',
  generatedAt: '2026-10-08T06:00:00.000Z',
  names: { count: names.count, firstKeys: names.firstKeys },
  companies: { count: 0, firstKeys: [''] },
};
const loadText = async (key: string) => files.get(key) ?? null;

describe('checkName', () => {
  it('reports a name as taken when the index has a same-as company', async () => {
    const result = await checkName('Sample Bakery Ltd', { loadText }, manifest);
    expect(result).toMatchObject({ verdict: 'taken', key: 'SAMPLEBAKERY', checkedLive: false });
    if ('error' in result) throw new Error('unexpected error');
    expect(result.sameAs.map((c) => c.number)).toEqual(['90000002']);
  });

  it('confirms an available name with a live search, ignoring dissolved companies', async () => {
    const live: LiveCompany[] = [
      { name: 'BRAND NEW NAME LIMITED', number: '99999999', status: 'dissolved' },
      { name: 'BRAND NEW NAMES TRADING LTD', number: '99999998', status: 'active' },
    ];
    const result = await checkName('Brand New Name Ltd', { loadText, searchLive: async () => live }, manifest);
    expect(result).toMatchObject({ verdict: 'available', checkedLive: true, sameAs: [] });
  });

  it('catches a company registered since the snapshot through the live search', async () => {
    const live: LiveCompany[] = [{ name: 'BRAND NEW NAME LTD', number: '99999997', status: 'active' }];
    const result = await checkName('Brand New Name Limited', { loadText, searchLive: async () => live }, manifest);
    expect(result).toMatchObject({ verdict: 'taken', checkedLive: true });
  });

  it('falls back to the index answer when the live search fails', async () => {
    const result = await checkName('Brand New Name Ltd', {
      loadText,
      searchLive: async () => {
        throw new Error('HTTP 429');
      },
    }, manifest);
    expect(result).toMatchObject({ verdict: 'available', checkedLive: false });
  });

  it('says it could not check when neither the index nor the live search is available', async () => {
    const result = await checkName('Brand New Name Ltd', { loadText }, null);
    expect(result).toMatchObject({ verdict: 'unknown', indexSnapshot: null });
  });

  it('rejects empty, overlong and letterless input', async () => {
    expect(await checkName('   ', { loadText }, manifest)).toEqual({ error: 'empty' });
    expect(await checkName('A'.repeat(161), { loadText }, manifest)).toEqual({ error: 'too-long' });
    expect(await checkName('*** --- ***', { loadText }, manifest)).toEqual({ error: 'no-letters' });
  });
});
