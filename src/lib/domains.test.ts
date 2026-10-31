import { describe, expect, it } from 'vitest';
import { checkDomains, domainLabel } from './domains.ts';

describe('domainLabel', () => {
  it('turns a business name into a domain label', () => {
    expect(domainLabel('Acme Widgets Ltd')).toBe('acmewidgets');
    expect(domainLabel('Smith & Sons Limited')).toBe('smithandsons');
    expect(domainLabel('Café Nero')).toBe('cafenero');
    expect(domainLabel('www.acme.co.uk')).toBe('acme');
    expect(domainLabel('Hi-Fi Audio')).toBe('hi-fiaudio');
  });

  it('rejects names that leave too little or too much', () => {
    expect(domainLabel('!')).toBeNull();
    expect(domainLabel('a'.repeat(64))).toBeNull();
  });
});

describe('checkDomains', () => {
  it('reads 200 as registered, 404 as available and anything else as unknown', async () => {
    const fake = (async (url: string | URL | Request) => {
      const u = String(url);
      if (u.endsWith('.co.uk')) return new Response('{}', { status: 200 });
      if (u.endsWith('.com')) return new Response('', { status: 404 });
      return new Response('', { status: 429 });
    }) as typeof fetch;
    const result = await checkDomains('Acme Widgets Ltd', fake);
    expect(result).toEqual({
      label: 'acmewidgets',
      results: [
        { domain: 'acmewidgets.co.uk', tld: 'co.uk', status: 'registered' },
        { domain: 'acmewidgets.uk', tld: 'uk', status: 'unknown' },
        { domain: 'acmewidgets.com', tld: 'com', status: 'available' },
      ],
    });
  });

  it('treats network errors as unknown', async () => {
    const failing = (async () => {
      throw new Error('offline');
    }) as typeof fetch;
    const result = await checkDomains('Acme', failing);
    expect(result!.results.every((r) => r.status === 'unknown')).toBe(true);
  });
});
