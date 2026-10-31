// Worker-side wiring for the name check: R2 for the company index, the Workers
// Cache API for short-lived caching, and the Companies House key from secrets.

import { env } from 'cloudflare:workers';
import type { IndexManifest } from '../company-index/format.ts';
import { checkName, companiesHouseSearch, loadManifest, type LiveCompany, type NameCheckDeps } from '../name-check.ts';

const MANIFEST_TTL_MS = 10 * 60 * 1000;
const LIVE_CACHE_SECONDS = 10 * 60;

type RuntimeEnv = { COMPANY_INDEX?: R2Bucket; COMPANIES_HOUSE_API_KEY?: string };
const runtime = env as unknown as RuntimeEnv;

// Shards never change once written (each snapshot has its own folder), so an
// isolate can keep the ones it has read.
const shardCache = new Map<string, string>();
const MAX_CACHED_SHARDS = 200;
let manifestCache: { manifest: IndexManifest | null; loadedAt: number } | null = null;

async function readObject(key: string): Promise<string | null> {
  if (!runtime.COMPANY_INDEX) return null;
  const object = await runtime.COMPANY_INDEX.get(key);
  return object ? object.text() : null;
}

async function loadText(key: string): Promise<string | null> {
  const cached = shardCache.get(key);
  if (cached !== undefined) return cached;
  const text = await readObject(key);
  if (text !== null && key.startsWith('snapshots/')) {
    if (shardCache.size >= MAX_CACHED_SHARDS) shardCache.delete(shardCache.keys().next().value!);
    shardCache.set(key, text);
  }
  return text;
}

async function currentManifest(): Promise<IndexManifest | null> {
  if (manifestCache && Date.now() - manifestCache.loadedAt < MANIFEST_TTL_MS) return manifestCache.manifest;
  const manifest = await loadManifest(readObject).catch(() => null);
  manifestCache = { manifest, loadedAt: Date.now() };
  return manifest;
}

// Live search results cached for 10 minutes in the colo's cache, keyed by name.
function cachedLiveSearch(apiKey: string): (name: string) => Promise<LiveCompany[]> {
  const search = companiesHouseSearch(apiKey);
  return async (name) => {
    const cacheKey = new Request(`https://cache.internal/ch-search?q=${encodeURIComponent(name.toUpperCase())}`);
    const cache = (caches as unknown as { default: Cache }).default;
    const hit = await cache.match(cacheKey);
    if (hit) return hit.json();
    const results = await search(name);
    await cache.put(
      cacheKey,
      new Response(JSON.stringify(results), {
        headers: { 'content-type': 'application/json', 'cache-control': `max-age=${LIVE_CACHE_SECONDS}` },
      }),
    );
    return results;
  };
}

export async function runNameCheck(name: string) {
  const deps: NameCheckDeps = {
    loadText,
    searchLive: runtime.COMPANIES_HOUSE_API_KEY ? cachedLiveSearch(runtime.COMPANIES_HOUSE_API_KEY) : undefined,
  };
  return checkName(name, deps, await currentManifest());
}
