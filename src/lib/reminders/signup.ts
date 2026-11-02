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

// A confirmation email is sent at most once every 10 minutes per sign-up, so
// the form can't be used to flood someone's inbox.
export const CONFIRM_RESEND_MS = 10 * 60 * 1000;

// Cap on companies per email address.
export const MAX_COMPANIES_PER_EMAIL = 20;

export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function isToken(s: string): boolean {
  return /^[0-9a-f]{48}$/.test(s);
}
