import { lineKey, type ShardSet } from './format.ts';

export const DEFAULT_MAX_SHARD_BYTES = 64 * 1024;

export interface BuiltShards extends ShardSet {
  shards: string[];
}

// Splits lines (already sorted by key) into shards of about maxBytes. Lines with
// the same key always stay in one shard, so a lookup reads a single file.
export function buildShards(sortedLines: string[], maxBytes = DEFAULT_MAX_SHARD_BYTES): BuiltShards {
  const shards: string[] = [];
  const firstKeys: string[] = [];
  let current: string[] = [];
  let currentBytes = 0;
  let previousKey: string | undefined;

  for (const line of sortedLines) {
    const key = lineKey(line);
    const bytes = Buffer.byteLength(line) + 1;
    if (current.length > 0 && currentBytes + bytes > maxBytes && key !== previousKey) {
      shards.push(current.join('\n') + '\n');
      current = [];
      currentBytes = 0;
    }
    if (current.length === 0) firstKeys.push(key);
    current.push(line);
    currentBytes += bytes;
    previousKey = key;
  }
  if (current.length > 0) shards.push(current.join('\n') + '\n');

  return { count: sortedLines.length, firstKeys, shards };
}
