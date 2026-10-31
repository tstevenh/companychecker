// schema.org structured data helpers (JSON-LD).

import { SITE } from '../data/site';

const stripTags = (html: string) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

export function siteSchema() {
  return [
    { '@context': 'https://schema.org', '@type': 'Organization', '@id': `${SITE.url}/#organization`, name: SITE.name, url: `${SITE.url}/` },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': `${SITE.url}/#website`,
      name: SITE.name,
      url: `${SITE.url}/`,
      publisher: { '@id': `${SITE.url}/#organization` },
      inLanguage: 'en-GB',
    },
  ];
}

export function breadcrumbSchema(crumbs: { name: string; href: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      item: new URL(crumb.href, SITE.url).href,
    })),
  };
}

export function faqSchema(items: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: stripTags(item.a) },
    })),
  };
}

export function articleSchema(page: { title: string; description: string; href: string; updated: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: page.title,
    description: page.description,
    mainEntityOfPage: new URL(page.href, SITE.url).href,
    dateModified: page.updated,
    author: { '@id': `${SITE.url}/#organization` },
    publisher: { '@id': `${SITE.url}/#organization` },
    inLanguage: 'en-GB',
  };
}

export function toolSchema(page: { name: string; description: string; href: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: page.name,
    description: page.description,
    url: new URL(page.href, SITE.url).href,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Any',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'GBP' },
    publisher: { '@id': `${SITE.url}/#organization` },
  };
}
