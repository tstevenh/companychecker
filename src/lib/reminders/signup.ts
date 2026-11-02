// Checks on the reminder sign-up form. Pure logic.

// Deliberately loose: one @, something before it, a dot in the domain, no
// spaces. Resend and the confirmation email do the real checking.
export function parseEmail(input: string): string | null {
  const email = input.trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  const at = email.lastIndexOf('@');
  // The domain part is case-insensitive; the local part is left as typed.
  return email.slice(0, at) + email.slice(at).toLowerCase();
}

// Only live companies have deadlines worth reminding about. The API says
// "active"; the monthly bulk file says "Active" or "Active - Proposal to Strike off".
export function acceptsReminders(status: string): boolean {
  return /^active\b/i.test(status.trim());
}

// Limits on confirmation emails, so the form can't be used to flood someone's
// inbox or use up the daily sending allowance. They count every confirmation
// to an address, whichever company it was for.
export const CONFIRM_RESEND_MS = 10 * 60 * 1000;
export const MAX_CONFIRMATIONS_PER_EMAIL_PER_DAY = 3;
export const MAX_CONFIRMATIONS_PER_IP_PER_DAY = 10;

export interface RecentConfirmations {
  // To this address in the last 10 minutes, and in the last 24 hours.
  emailRecent: number;
  emailDay: number;
  // From this IP address in the last 24 hours.
  ipDay: number;
}

export function confirmationAllowed(recent: RecentConfirmations): boolean {
  return (
    recent.emailRecent === 0 &&
    recent.emailDay < MAX_CONFIRMATIONS_PER_EMAIL_PER_DAY &&
    recent.ipDay < MAX_CONFIRMATIONS_PER_IP_PER_DAY
  );
}

// SHA-256 of the day and the IP address: enough to count sends from one
// address today, but not to link them to another day.
export async function hashIp(ip: string, day: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${day}|${ip}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Cap on companies per email address.
export const MAX_COMPANIES_PER_EMAIL = 20;

export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function isToken(s: string): boolean {
  return /^[0-9a-f]{48}$/.test(s);
}
