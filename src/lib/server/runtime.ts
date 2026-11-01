// Worker-side wiring for the name check: R2 for the company index, the Workers
// Cache API for short-lived caching, and the Companies House key from secrets.

import { env } from 'cloudflare:workers';
import type { IndexManifest } from '../company-index/format.ts';
import { lookupName } from '../company-index/lookup.ts';
import { normalizeCompanyName } from '../company-name/normalize.ts';
import { checkName, companiesHouseSearch, loadManifest, type LiveCompany, type NameCheckDeps } from '../name-check.ts';
import { companiesHouseProfile, companyDetails, searchCompanies, type LiveProfile } from '../company-lookup.ts';
import { nameIdeas } from '../name-ideas.ts';
import { checkDomains } from '../domains.ts';

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

// Live company profiles cached for an hour: due dates only change when a
// company files.
function cachedProfile(apiKey: string): (number: string) => Promise<LiveProfile | null> {
  const fetchProfile = companiesHouseProfile(apiKey);
  return async (number) => {
    const cacheKey = new Request(`https://cache.internal/ch-company/${encodeURIComponent(number)}`);
    const cache = (caches as unknown as { default: Cache }).default;
    const hit = await cache.match(cacheKey);
    if (hit) return hit.json();
    const profile = await fetchProfile(number);
    await cache.put(
      cacheKey,
      new Response(JSON.stringify(profile), { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=3600' } }),
    );
    return profile;
  };
}

// Domain lookups cached for an hour per domain, so repeat checks don't hit the
// registries again (their terms ask for low-volume use).
const cachedFetch: typeof fetch = async (input, init) => {
  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(`https://cache.internal/rdap?u=${encodeURIComponent(String(input))}`);
  const hit = await cache.match(key);
  if (hit) return new Response(null, { status: Number(hit.headers.get('x-rdap-status')) });
  const res = await fetch(input, init);
  if (res.status === 200 || res.status === 404) {
    await cache.put(key, new Response('', { headers: { 'x-rdap-status': String(res.status), 'cache-control': 'max-age=3600' } }));
  }
  return res;
};

export async function runDomainCheck(name: string) {
  return checkDomains(name, cachedFetch);
}

export async function runNameIdeas(keywords: string[], page: number) {
  const manifest = await currentManifest();
  return manifest ? nameIdeas(keywords, manifest, loadText, page) : null;
}

export async function runCompanySearch(query: string) {
  return searchCompanies(query, loadText, await currentManifest());
}

export async function runCompanyDetails(number: string) {
  const apiKey = runtime.COMPANIES_HOUSE_API_KEY;
  return companyDetails(number, loadText, await currentManifest(), apiKey ? cachedProfile(apiKey) : undefined);
}

export async function runNameCheck(name: string) {
  const deps: NameCheckDeps = {
    loadText,
    searchLive: runtime.COMPANIES_HOUSE_API_KEY ? cachedLiveSearch(runtime.COMPANIES_HOUSE_API_KEY) : undefined,
  };
  return checkName(name, deps, await currentManifest());
}

// Where a name would sit in the register: companies with the same normalised
// name and the alphabetical neighbours either side. Index only, never the live
// Companies House API, so it is cheap enough to call as the visitor types.
export async function runRegister(name: string) {
  const key = normalizeCompanyName(name.slice(0, 160));
  if (!key) return { key, exact: [], nearby: [], snapshot: null };
  const manifest = await currentManifest();
  if (!manifest) return null;
  const match = await lookupName(manifest, key, loadText);
  return { key, ...match, snapshot: manifest.snapshot };
}
