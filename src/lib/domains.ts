// Domain availability for a business name: .co.uk, .uk and .com, looked up
// through the registries' RDAP services (IANA bootstrap: Nominet for .uk,
// Verisign for .com). A registered domain returns 200; an unregistered one
// returns 404 (RFC 7480). A 404 isn't a guarantee: some names are reserved or
// blocked, so the page tells people to confirm with a registrar.

export const DOMAIN_TLDS = ['co.uk', 'uk', 'com'] as const;
export type Tld = (typeof DOMAIN_TLDS)[number];

const RDAP_BASE: Record<Tld, string> = {
  'co.uk': 'https://rdap.nominet.uk/uk/domain/',
  uk: 'https://rdap.nominet.uk/uk/domain/',
  com: 'https://rdap.verisign.com/com/v1/domain/',
};

export type DomainStatus = 'available' | 'registered' | 'unknown';

export interface DomainResult {
  domain: string;
  tld: Tld;
  status: DomainStatus;
}

// "Acme Widgets Ltd" -> "acmewidgets". Company endings are dropped, accents
// flattened, and anything outside a-z, 0-9 and hyphens removed.
export function domainLabel(name: string): string | null {
  const label = name
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\b(limited|ltd|plc|llp|cyfyngedig|cyf)\.?\s*$/i, '')
    .replace(/^www\./, '')
    .replace(/\.(co\.uk|uk|com)$/, '')
    .replace(/[^a-z0-9-]+/g, '')
    .replace(/^-+|-+$/g, '');
  return label.length >= 2 && label.length <= 63 ? label : null;
}

export async function lookupDomain(label: string, tld: Tld, fetcher: typeof fetch = fetch): Promise<DomainResult> {
  const domain = `${label}.${tld}`;
  try {
    const res = await fetcher(RDAP_BASE[tld] + domain, { headers: { Accept: 'application/rdap+json' } });
    const status: DomainStatus = res.status === 200 ? 'registered' : res.status === 404 ? 'available' : 'unknown';
    return { domain, tld, status };
  } catch {
    return { domain, tld, status: 'unknown' };
  }
}

export async function checkDomains(name: string, fetcher: typeof fetch = fetch): Promise<{ label: string; results: DomainResult[] } | null> {
  const label = domainLabel(name);
  if (!label) return null;
  const results = await Promise.all(DOMAIN_TLDS.map((tld) => lookupDomain(label, tld, fetcher)));
  return { label, results };
}
