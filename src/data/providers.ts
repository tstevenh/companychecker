// Where each registration route sends people. Kept in one place so an approved
// affiliate link replaces the plain one everywhere at once.
export const REGISTER_LINKS = {
  companiesHouse: 'https://www.gov.uk/limited-company-formation/register-your-company',
  tide: 'https://www.tide.co/company-registration/',
  anna: 'https://anna.money/register-a-company/',
};

// No affiliate programme has approved the site yet, so no link earns us
// anything. When one does: swap in its link above, set this to true, and the
// "Affiliate link" labels, the disclosure page and rel="sponsored" follow.
export const AFFILIATE_LINKS_ACTIVE = false;

// rel for links to providers such as Tide and ANNA. "sponsored" tells search
// engines a link is paid, so it is only used once affiliate links are live.
export const PROVIDER_REL = AFFILIATE_LINKS_ACTIVE ? 'sponsored nofollow noopener' : 'nofollow noopener';

// Business accounts compared on /business-bank-account-for-limited-company/.
// Tide and ANNA links carry PROVIDER_REL, as they're the ones that could become affiliate links.
export const BANK_LINKS = {
  tide: 'https://www.tide.co/business-current-account/',
  anna: 'https://anna.money/business-account/limited-companies/',
  starling: 'https://www.starlingbank.com/business-account/',
  monzo: 'https://monzo.com/business-banking/plans-pricing',
  mettle: 'https://www.mettle.co.uk/',
  wise: 'https://wise.com/gb/business/',
};
