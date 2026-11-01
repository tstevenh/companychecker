// Where each registration route sends people. Kept in one place so an approved
// affiliate link replaces the plain one everywhere at once.
export const REGISTER_LINKS = {
  companiesHouse: 'https://www.gov.uk/limited-company-formation/register-your-company',
  tide: 'https://www.tide.co/company-registration/',
  anna: 'https://anna.money/register-a-company/',
};

// rel for links to a provider we may be paid by. "sponsored" tells search
// engines the link is commercial.
export const PROVIDER_REL = 'sponsored nofollow noopener';

// Business accounts compared on /business-bank-account-for-limited-company/.
// Tide and ANNA may pay us, so their links carry PROVIDER_REL.
export const BANK_LINKS = {
  tide: 'https://www.tide.co/business-current-account/',
  anna: 'https://anna.money/business-account/limited-companies/',
  starling: 'https://www.starlingbank.com/business-account/',
  monzo: 'https://monzo.com/business-banking/plans-pricing',
  mettle: 'https://www.mettle.co.uk/',
  wise: 'https://wise.com/gb/business/',
};
