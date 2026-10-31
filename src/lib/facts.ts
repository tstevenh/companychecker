import type { CollectionEntry } from 'astro:content';

type Fact = CollectionEntry<'facts'>['data'];

const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const longDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

export function formatFactValue(fact: Fact): string {
  if (fact.unit === 'GBP' && typeof fact.value === 'number') {
    return fact.value === 0 ? 'Free' : gbp.format(fact.value).replace('.00', '');
  }
  if (fact.unit === 'date' && typeof fact.value === 'string') {
    return longDate.format(new Date(fact.value));
  }
  if (fact.unit === 'characters') return `${fact.value} characters`;
  if (fact.unit === 'years') return `${fact.value} years`;
  if (fact.unit === 'months') return `${fact.value} months`;
  if (fact.unit === 'days') return `${fact.value} day${fact.value === 1 ? '' : 's'}`;
  return String(fact.value);
}

export function formatDate(date: Date): string {
  return longDate.format(date);
}

export const CATEGORY_LABELS: Record<Fact['category'], string> = {
  'companies-house-fees': 'Companies House fees',
  'identity-verification': 'Identity verification',
  'company-name-rules': 'Company name rules',
  'companies-house-api': 'Companies House API',
  'registration-providers': 'Registration providers',
  'company-formation': 'Setting up a company',
  'confirmation-statement': 'Confirmation statements',
  'dormant-company': 'Dormant companies',
  'change-of-name': 'Changing a company name',
  'registered-office': 'Registered office address',
  'companies-house-search': 'Companies House search',
  'vat-number': 'VAT numbers',
  'trade-marks': 'Trade marks',
  'domains': 'Domain names',
};
