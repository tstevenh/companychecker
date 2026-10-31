// The company index: every live UK company, split into small sorted text files
// ("shards") stored in Cloudflare R2. The monthly builder writes them; the site's
// Worker reads one shard per lookup.
//
// Layout in the bucket:
//   current.json                              manifest of the live snapshot
//   snapshots/<date>/manifest.json            the same manifest, kept per snapshot
//   snapshots/<date>/names/<i>.tsv            sorted by normalised name
//   snapshots/<date>/companies/<i>.tsv        sorted by company number
//
// Each shard is plain text, one record per line, fields separated by tabs.
// Lines are sorted with plain string comparison, and the manifest lists the
// first key of every shard, so a binary search finds the one shard to fetch.

export const CURRENT_MANIFEST_KEY = 'current.json';
export const MANIFEST_VERSION = 1;

export type ShardKind = 'names' | 'companies';

export interface ShardSet {
  count: number;
  firstKeys: string[];
}

export interface IndexManifest {
  version: typeof MANIFEST_VERSION;
  snapshot: string;
  generatedAt: string;
  names: ShardSet;
  companies: ShardSet;
}

export function snapshotPrefix(snapshot: string): string {
  return `snapshots/${snapshot}/`;
}

export function shardKey(snapshot: string, kind: ShardKind, index: number): string {
  return `${snapshotPrefix(snapshot)}${kind}/${index}.tsv`;
}

export function manifestKey(snapshot: string): string {
  return `${snapshotPrefix(snapshot)}manifest.json`;
}

export interface CompanyRow {
  number: string;
  name: string;
  status: string;
  incorporatedOn: string;
  accountsDue: string;
  confirmationStatementDue: string;
}

export interface NameEntry {
  key: string;
  number: string;
  name: string;
  status: string;
}

// Tabs and line breaks would corrupt a line; they never belong in a name.
function field(value: string): string {
  return value.replace(/[\t\r\n]+/g, ' ');
}

export function encodeNameLine(key: string, row: CompanyRow): string {
  return [key, row.number, row.name, row.status].map(field).join('\t');
}

export function decodeNameLine(line: string): NameEntry {
  const [key, number, name, status] = line.split('\t');
  return { key, number, name, status };
}

export function encodeCompanyLine(row: CompanyRow): string {
  return [row.number, row.name, row.status, row.incorporatedOn, row.accountsDue, row.confirmationStatementDue]
    .map(field)
    .join('\t');
}

export function decodeCompanyLine(line: string): CompanyRow {
  const [number, name, status, incorporatedOn, accountsDue, confirmationStatementDue] = line.split('\t');
  return { number, name, status, incorporatedOn, accountsDue, confirmationStatementDue };
}

// The key of a line is its first field.
export function lineKey(line: string): string {
  const tab = line.indexOf('\t');
  return tab === -1 ? line : line.slice(0, tab);
}
