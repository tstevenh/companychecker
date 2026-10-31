// Writes a built index to a bucket, then switches current.json to it. Shards go
// up first and the manifest last, so the site never sees a half-uploaded
// snapshot. Older snapshots are deleted afterwards (the previous one is kept so
// a bad import can be rolled back by pointing current.json at it again).

import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import {
  CURRENT_MANIFEST_KEY,
  manifestKey,
  shardKey,
  snapshotPrefix,
  type IndexManifest,
  type ShardKind,
} from '../../src/lib/company-index/format.ts';
import type { BuiltShards } from '../../src/lib/company-index/shards.ts';

export interface ObjectStore {
  put(key: string, body: string, contentType: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
  delete(keys: string[]): Promise<void>;
}

export interface BuiltIndex {
  snapshot: string;
  names: BuiltShards;
  companies: BuiltShards;
}

const KEEP_PREVIOUS_SNAPSHOTS = 1;

async function inBatches<T>(items: T[], size: number, task: (item: T) => Promise<void>) {
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) await task(items[next++]);
  });
  await Promise.all(workers);
}

export function toManifest(index: BuiltIndex, generatedAt = new Date().toISOString()): IndexManifest {
  return {
    version: 1,
    snapshot: index.snapshot,
    generatedAt,
    names: { count: index.names.count, firstKeys: index.names.firstKeys },
    companies: { count: index.companies.count, firstKeys: index.companies.firstKeys },
  };
}

export async function publishIndex(
  store: ObjectStore,
  index: BuiltIndex,
  options: { concurrency?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<{ manifest: IndexManifest; uploaded: number; deleted: number }> {
  const uploads: { key: string; body: string }[] = [];
  for (const kind of ['names', 'companies'] as ShardKind[]) {
    index[kind].shards.forEach((body, i) => uploads.push({ key: shardKey(index.snapshot, kind, i), body }));
  }

  let done = 0;
  await inBatches(uploads, options.concurrency ?? 16, async ({ key, body }) => {
    await store.put(key, body, 'text/tab-separated-values; charset=utf-8');
    done++;
    if (done % 500 === 0 || done === uploads.length) options.onProgress?.(done, uploads.length);
  });

  const manifest = toManifest(index);
  const manifestJson = JSON.stringify(manifest);
  await store.put(manifestKey(index.snapshot), manifestJson, 'application/json');
  await store.put(CURRENT_MANIFEST_KEY, manifestJson, 'application/json');

  // Snapshot folders are named by date, so sorting them sorts by age.
  const snapshots = [...new Set((await store.list('snapshots/')).map((key) => key.split('/')[1]))].sort();
  const keep = new Set([index.snapshot, ...snapshots.filter((s) => s < index.snapshot).slice(-KEEP_PREVIOUS_SNAPSHOTS)]);
  const stale = snapshots.filter((s) => !keep.has(s));
  let deleted = 0;
  for (const snapshot of stale) {
    const keys = await store.list(snapshotPrefix(snapshot));
    await store.delete(keys);
    deleted += keys.length;
  }

  return { manifest, uploaded: uploads.length + 2, deleted };
}

// Writes the bucket layout to a local folder (for dry runs and inspection).
export function folderStore(root: string): ObjectStore {
  return {
    async put(key, body) {
      const path = join(root, key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, body);
    },
    async list(prefix) {
      const files = (await readdir(root, { recursive: true, withFileTypes: true }))
        .filter((entry) => entry.isFile())
        .map((entry) => relative(root, join(entry.parentPath, entry.name)).split('\\').join('/'));
      return files.filter((key) => key.startsWith(prefix));
    },
    async delete(keys) {
      await Promise.all(keys.map((key) => rm(join(root, key), { force: true })));
    },
  };
}

// Cloudflare R2 through its S3-compatible API.
export async function r2Store(config: {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}): Promise<ObjectStore> {
  const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  const Bucket = config.bucket;
  return {
    async put(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }));
    },
    async list(prefix) {
      const keys: string[] = [];
      let ContinuationToken: string | undefined;
      do {
        const page = await client.send(new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken }));
        for (const item of page.Contents ?? []) if (item.Key) keys.push(item.Key);
        ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (ContinuationToken);
      return keys;
    },
    async delete(keys) {
      for (let i = 0; i < keys.length; i += 1000) {
        const Objects = keys.slice(i, i + 1000).map((Key) => ({ Key }));
        await client.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects } }));
      }
    },
  };
}
