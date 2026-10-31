// Company search and company details, from the monthly index with an optional
// live refresh from the Companies House API. Pure logic; runtime.ts wires it up.

import { normalizeCompanyName } from './company-name/normalize.ts';
import type { CompanyRow, IndexManifest, NameEntry } from './company-index/format.ts';
import { lookupCompany, searchNames, type LoadText } from './company-index/lookup.ts';
import { parseCompanyNumber } from './company-number.ts';

export interface LiveProfile {
  name: string;
  number: string;
  status: string;
  incorporatedOn: string;
  accountsDue: string;
  confirmationStatementDue: string;
}

export type CompanySearchResult =
  | { kind: 'number'; number: string }
  | { kind: 'names'; query: string; results: NameEntry[]; indexSnapshot: string | null }
  | { kind: 'error'; error: 'empty' | 'unavailable' };

export async function searchCompanies(
  rawQuery: string,
  loadText: LoadText,
  manifest: IndexManifest | null,
): Promise<CompanySearchResult> {
  const query = rawQuery.replace(/\s+/g, ' ').trim();
  if (!query) return { kind: 'error', error: 'empty' };
  // Something that looks like a company number goes straight to that company.
  const number = /\d/.test(query) ? parseCompanyNumber(query) : null;
  if (number && /^[A-Z]{0,2}\d+$/.test(query.replace(/\s+/g, '').toUpperCase())) return { kind: 'number', number };
  if (!manifest) return { kind: 'error', error: 'unavailable' };
  const prefix = normalizeCompanyName(query);
  if (!prefix) return { kind: 'error', error: 'empty' };
  return { kind: 'names', query, results: await searchNames(manifest, prefix, loadText, 25), indexSnapshot: manifest.snapshot };
}

export interface CompanyDetails {
  company: CompanyRow | LiveProfile;
  source: 'live' | 'index';
  indexSnapshot: string | null;
}

export async function companyDetails(
  number: string,
  loadText: LoadText,
  manifest: IndexManifest | null,
  fetchLive?: (number: string) => Promise<LiveProfile | null>,
): Promise<CompanyDetails | null> {
  if (fetchLive) {
    try {
      const live = await fetchLive(number);
      if (live) return { company: live, source: 'live', indexSnapshot: manifest?.snapshot ?? null };
    } catch {
      // Fall back to the index.
    }
  }
  const row = manifest ? await lookupCompany(manifest, number, loadText) : null;
  return row ? { company: row, source: 'index', indexSnapshot: manifest?.snapshot ?? null } : null;
}

// Companies House Public Data API: company profile. Returns null for 404.
export function companiesHouseProfile(apiKey: string): (number: string) => Promise<LiveProfile | null> {
  return async (number) => {
    const res = await fetch(`https://api.company-information.service.gov.uk/company/${encodeURIComponent(number)}`, {
      headers: { Authorization: `Basic ${btoa(`${apiKey}:`)}` },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Companies House profile returned HTTP ${res.status}`);
    const body = (await res.json()) as {
      company_name?: string;
      company_number?: string;
      company_status?: string;
      date_of_creation?: string;
      accounts?: { next_accounts?: { due_on?: string } };
      confirmation_statement?: { next_due?: string };
    };
    return {
      name: body.company_name ?? '',
      number: body.company_number ?? number,
      status: body.company_status ?? '',
      incorporatedOn: body.date_of_creation ?? '',
      accountsDue: body.accounts?.next_accounts?.due_on ?? '',
      confirmationStatementDue: body.confirmation_statement?.next_due ?? '',
    };
  };
}

// Whole days from `today` to an ISO date (negative when overdue).
export function daysUntil(isoDate: string, today = new Date()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const due = Date.UTC(+isoDate.slice(0, 4), +isoDate.slice(5, 7) - 1, +isoDate.slice(8, 10));
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((due - now) / 86_400_000);
}
