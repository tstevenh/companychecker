// Every tool and guide on the site, in one place. The footer, the guides hub and
// "related" links all read from here, so internal links stay consistent.

export interface SitePage {
  href: string;
  title: string;
  description: string;
  kind: 'tool' | 'guide';
}

export const PAGES: SitePage[] = [
  {
    href: '/',
    title: 'Company name checker',
    description: 'Check whether a UK company name is available under the Companies House "same as" rules.',
    kind: 'tool',
  },
  {
    href: '/company-search/',
    title: 'Company search',
    description: 'Look up any live UK company by name or company number: status, incorporation date and filing deadlines.',
    kind: 'tool',
  },
  {
    href: '/business-name-generator/',
    title: 'Business name generator',
    description: 'Get name ideas from your keywords, each one checked against every live UK company.',
    kind: 'tool',
  },
  {
    href: '/domain-name-checker/',
    title: 'Domain name checker',
    description: 'See whether the .co.uk, .uk and .com domains for your business name are free.',
    kind: 'tool',
  },
  {
    href: '/vat-number-checker/',
    title: 'VAT number checker',
    description: 'Check that a UK VAT number is in a valid format, then confirm it with HMRC.',
    kind: 'tool',
  },
  {
    href: '/company-name-rules/',
    title: 'Company name rules',
    description: 'How Companies House decides whether two names are the "same as" each other, with worked examples.',
    kind: 'guide',
  },
  {
    href: '/register-a-limited-company/',
    title: 'How to register a limited company',
    description: 'What you need to set up a private limited company, what it costs and how long it takes.',
    kind: 'guide',
  },
  {
    href: '/companies-house-identity-verification/',
    title: 'Companies House identity verification',
    description: 'Who has to verify, the deadlines, and how to do it with GOV.UK One Login or an agent.',
    kind: 'guide',
  },
  {
    href: '/companies-house-personal-code/',
    title: 'Companies House personal code',
    description: 'What your personal code is, where to find it, and when directors and PSCs must give it.',
    kind: 'guide',
  },
  {
    href: '/companies-house-fees/',
    title: 'Companies House fees',
    description: 'Every Companies House fee in one table: registering, confirmation statements, name changes and copies.',
    kind: 'guide',
  },
  {
    href: '/business-bank-account-for-limited-company/',
    title: 'Business bank accounts',
    description: 'Six UK business accounts for a new limited company, compared on fees, FSCS protection and who can open one.',
    kind: 'guide',
  },
  {
    href: '/confirmation-statement/',
    title: 'Confirmation statement',
    description: 'What a confirmation statement is, when yours is due, what it costs, and a deadline checker.',
    kind: 'guide',
  },
  {
    href: '/dormant-company/',
    title: 'Dormant companies',
    description: 'What counts as dormant, and what a dormant company still has to file with Companies House and HMRC.',
    kind: 'guide',
  },
  {
    href: '/change-company-name/',
    title: 'How to change a company name',
    description: 'The ways to change your company name, the fees, and what to update afterwards.',
    kind: 'guide',
  },
  {
    href: '/registered-office-address/',
    title: 'Registered office address',
    description: 'The rules for a registered office address, how to change it, and the alternatives to your home address.',
    kind: 'guide',
  },
  {
    href: '/trade-mark-search/',
    title: 'UK trade mark search',
    description: 'How to check a name against the UK trade marks register, and how registering a trade mark works.',
    kind: 'guide',
  },
];

export function pageByHref(href: string): SitePage {
  const page = PAGES.find((p) => p.href === href);
  if (!page) throw new Error(`Unknown page ${href}`);
  return page;
}
