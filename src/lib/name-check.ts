// The name check behind /check/ and /api/name-check/. Pure logic: the caller
// supplies how to read index files and, optionally, how to search Companies
// House live, so this runs the same in the Worker and in tests.

import { normalizeCompanyName } from './company-name/normalize.ts';
import { CURRENT_MANIFEST_KEY, type IndexManifest, type NameEntry } from './company-index/format.ts';
import { lookupName, type LoadText } from './company-index/lookup.ts';

export const MAX_NAME_LENGTH = 160;

export interface LiveCompany {
  name: string;
  number: string;
  status: string;
}

export interface NameCheckDeps {
  loadText: LoadText;
  // Companies House live search; omitted when no API key is configured.
  searchLive?: (name: string) => Promise<LiveCompany[]>;
}

export interface NameCheckResult {
  name: string;
  key: string;
  // 'available': no company with the same normalised name was found.
  // 'taken': at least one company is the "same as" this name.
  // 'unknown': nothing could be checked (index and live search both unavailable).
  verdict: 'available' | 'taken' | 'unknown';
  sameAs: LiveCompany[];
  similar: NameEntry[];
  indexSnapshot: string | null;
  checkedLive: boolean;
}

export type NameCheckError = { error: 'empty' | 'too-long' | 'no-letters' };

// Statuses that no longer hold a name on the register.
const RELEASED_STATUSES = new Set(['dissolved', 'removed', 'closed', 'converted-closed']);

export async function loadManifest(loadText: LoadText): Promise<IndexManifest | null> {
  const text = await loadText(CURRENT_MANIFEST_KEY);
  return text ? (JSON.parse(text) as IndexManifest) : null;
}

export async function checkName(
  rawName: string,
  deps: NameCheckDeps,
  manifest: IndexManifest | null,
): Promise<NameCheckResult | NameCheckError> {
  const name = rawName.replace(/\s+/g, ' ').trim();
  if (!name) return { error: 'empty' };
  if ([...name].length > MAX_NAME_LENGTH) return { error: 'too-long' };
  const key = normalizeCompanyName(name);
  if (!key) return { error: 'no-letters' };

  let sameAs: LiveCompany[] = [];
  let similar: NameEntry[] = [];
  if (manifest) {
    const match = await lookupName(manifest, key, deps.loadText);
    sameAs = match.exact.map(({ name, number, status }) => ({ name, number, status }));
    similar = match.nearby;
  }

  // The monthly index can be a few weeks old. When it finds nothing, ask
  // Companies House directly to catch names registered since.
  let checkedLive = false;
  if (sameAs.length === 0 && deps.searchLive) {
    try {
      const live = await deps.searchLive(name);
      checkedLive = true;
      sameAs = live.filter((c) => !RELEASED_STATUSES.has(c.status) && normalizeCompanyName(c.name) === key);
    } catch {
      // Fall back to the index answer; the page says which data was used.
    }
  }

  const verdict = sameAs.length > 0 ? 'taken' : manifest || checkedLive ? 'available' : 'unknown';
  return { name, key, verdict, sameAs, similar, indexSnapshot: manifest?.snapshot ?? null, checkedLive };
}

// Companies House Public Data API: search by name. The key is sent as the
// username of HTTP Basic auth with an empty password.
export function companiesHouseSearch(apiKey: string): (name: string) => Promise<LiveCompany[]> {
  return async (name) => {
    const url = new URL('https://api.company-information.service.gov.uk/search/companies');
    url.searchParams.set('q', name);
    url.searchParams.set('items_per_page', '20');
    const res = await fetch(url, { headers: { Authorization: `Basic ${btoa(`${apiKey}:`)}` } });
    if (!res.ok) throw new Error(`Companies House search returned HTTP ${res.status}`);
    const body = (await res.json()) as { items?: { title?: string; company_number?: string; company_status?: string }[] };
    return (body.items ?? []).map((item) => ({
      name: item.title ?? '',
      number: item.company_number ?? '',
      status: item.company_status ?? '',
    }));
  };
}
