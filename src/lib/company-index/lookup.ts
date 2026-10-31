import {
  decodeCompanyLine,
  decodeNameLine,
  lineKey,
  shardKey,
  type CompanyRow,
  type IndexManifest,
  type NameEntry,
  type ShardKind,
} from './format.ts';

// Index of the shard that would hold `key`: the last shard whose first key is
// <= key. Keys sorting before every shard fall into shard 0.
export function findShardIndex(firstKeys: string[], key: string): number {
  let low = 0;
  let high = firstKeys.length - 1;
  let found = 0;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (firstKeys[mid] <= key) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

function shardLines(text: string): string[] {
  return text.split('\n').filter((line) => line !== '');
}

// First position in sorted lines whose key is >= key.
function lowerBound(lines: string[], key: string): number {
  let low = 0;
  let high = lines.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (lineKey(lines[mid]) < key) low = mid + 1;
    else high = mid;
  }
  return low;
}

export interface NameMatch {
  // Companies whose name normalises to exactly the same key ("same as").
  exact: NameEntry[];
  // Alphabetically neighbouring names in the same shard, for "similar names".
  nearby: NameEntry[];
}

export function matchName(shardText: string, key: string, nearbyCount = 5): NameMatch {
  const lines = shardLines(shardText);
  const start = lowerBound(lines, key);
  let end = start;
  while (end < lines.length && lineKey(lines[end]) === key) end++;
  return {
    exact: lines.slice(start, end).map(decodeNameLine),
    nearby: [
      ...lines.slice(Math.max(0, start - nearbyCount), start),
      ...lines.slice(end, end + nearbyCount),
    ].map(decodeNameLine),
  };
}

export function findCompany(shardText: string, number: string): CompanyRow | null {
  const lines = shardLines(shardText);
  const index = lowerBound(lines, number);
  return index < lines.length && lineKey(lines[index]) === number ? decodeCompanyLine(lines[index]) : null;
}

export type LoadText = (key: string) => Promise<string | null>;

async function loadShard(manifest: IndexManifest, kind: ShardKind, key: string, load: LoadText): Promise<string> {
  const index = findShardIndex(manifest[kind].firstKeys, key);
  const text = await load(shardKey(manifest.snapshot, kind, index));
  if (text === null) throw new Error(`Missing shard ${kind}/${index} for snapshot ${manifest.snapshot}`);
  return text;
}

export async function lookupName(manifest: IndexManifest, key: string, load: LoadText): Promise<NameMatch> {
  return matchName(await loadShard(manifest, 'names', key, load), key);
}

export async function lookupCompany(manifest: IndexManifest, number: string, load: LoadText): Promise<CompanyRow | null> {
  return findCompany(await loadShard(manifest, 'companies', number, load), number);
}
