import { describe, expect, it } from 'vitest';
import { CURRENT_MANIFEST_KEY, type IndexManifest } from '../../src/lib/company-index/format.ts';
import { buildShards } from '../../src/lib/company-index/shards.ts';
import { publishIndex, type BuiltIndex, type ObjectStore } from './publish.ts';
import { toCompanyRow, toIsoDate } from './transform.ts';

function memoryStore() {
  const objects = new Map<string, string>();
  const order: string[] = [];
  const store: ObjectStore = {
    async put(key, body) {
      objects.set(key, body);
      order.push(key);
    },
    async list(prefix) {
      return [...objects.keys()].filter((key) => key.startsWith(prefix));
    },
    async delete(keys) {
      keys.forEach((key) => objects.delete(key));
    },
  };
  return { store, objects, order };
}

function index(snapshot: string): BuiltIndex {
  return {
    snapshot,
    names: buildShards(['ACME\t1\tACME LTD\tActive', 'ZETA\t2\tZETA LTD\tActive'], 30),
    companies: buildShards(['1\tACME LTD\tActive\t\t\t', '2\tZETA LTD\tActive\t\t\t'], 30),
  };
}

describe('publishIndex', () => {
  it('uploads shards before switching current.json', async () => {
    const { store, objects, order } = memoryStore();
    await publishIndex(store, index('2026-10-01'));
    expect(order.at(-1)).toBe(CURRENT_MANIFEST_KEY);
    const manifest = JSON.parse(objects.get(CURRENT_MANIFEST_KEY)!) as IndexManifest;
    expect(manifest).toMatchObject({ version: 1, snapshot: '2026-10-01', names: { count: 2 }, companies: { count: 2 } });
    expect(objects.has('snapshots/2026-10-01/names/0.tsv')).toBe(true);
    expect(objects.has('snapshots/2026-10-01/manifest.json')).toBe(true);
  });

  it('keeps the current and previous snapshot, and deletes older ones', async () => {
    const { store, objects } = memoryStore();
    for (const snapshot of ['2026-08-01', '2026-09-01', '2026-10-01']) await publishIndex(store, index(snapshot));
    const snapshots = new Set([...objects.keys()].filter((k) => k.startsWith('snapshots/')).map((k) => k.split('/')[1]));
    expect([...snapshots].sort()).toEqual(['2026-09-01', '2026-10-01']);
  });
});

describe('transform', () => {
  it('converts UK dates and leaves blanks empty', () => {
    expect(toIsoDate('29/07/2024')).toBe('2024-07-29');
    expect(toIsoDate('')).toBe('');
    expect(toIsoDate('2024-07-29')).toBe('');
  });

  it('maps a Companies House record and skips ones without a name or number', () => {
    expect(
      toCompanyRow({
        CompanyName: ' EXAMPLE WIDGETS LTD ',
        CompanyNumber: '90000001',
        CompanyStatus: 'Active',
        IncorporationDate: '29/07/2024',
        'Accounts.NextDueDate': '30/04/2027',
        ConfStmtNextDueDate: '11/08/2027',
      }),
    ).toEqual({
      number: '90000001',
      name: 'EXAMPLE WIDGETS LTD',
      status: 'Active',
      incorporatedOn: '2024-07-29',
      accountsDue: '2027-04-30',
      confirmationStatementDue: '2027-08-11',
    });
    expect(toCompanyRow({ CompanyName: '', CompanyNumber: '1' })).toBeNull();
  });
});
