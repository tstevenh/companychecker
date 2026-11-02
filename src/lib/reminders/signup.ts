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
// inbox or use up the daily sending allowance. The address limits count every
// confirmation to that address, whichever company it was for: one per 10
// minutes and 3 in any 24 hours. The IP limit is 10 per UTC day.
export const CONFIRM_RESEND_MS = 10 * 60 * 1000;
export const MAX_CONFIRMATIONS_PER_EMAIL_PER_DAY = 3;
export const MAX_CONFIRMATIONS_PER_IP_PER_DAY = 10;

// Records a confirmation send only if it is within every limit, in a single
// statement so concurrent sign-ups can't both pass. Returns the new rowid, or
// no row when a limit was hit. An IP hash is only ever today's (see hashIp),
// so counting by hash counts today's sends from that IP.
export const RESERVE_SEND_SQL = `INSERT INTO confirmation_sends (email, ip_hash, sent_at)
SELECT ?1, ?2, ?3
WHERE NOT EXISTS (SELECT 1 FROM confirmation_sends WHERE email = ?1 AND sent_at > ?4)
  AND (SELECT COUNT(*) FROM confirmation_sends WHERE email = ?1 AND sent_at > ?5) < ?6
  AND (?2 IS NULL OR (SELECT COUNT(*) FROM confirmation_sends WHERE ip_hash = ?2) < ?7)
RETURNING rowid`;

export const COUNT_IP_SENDS_SQL = 'SELECT COUNT(*) AS n FROM confirmation_sends WHERE ip_hash = ?1';

export function reserveSendParams(p: { email: string; ipHash: string | null; now: Date }) {
  const t = p.now.getTime();
  return [
    p.email,
    p.ipHash,
    p.now.toISOString(),
    new Date(t - CONFIRM_RESEND_MS).toISOString(),
    new Date(t - 86_400_000).toISOString(),
    MAX_CONFIRMATIONS_PER_EMAIL_PER_DAY,
    MAX_CONFIRMATIONS_PER_IP_PER_DAY,
  ] as const;
}

async function hmac(key: Uint8Array, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message)));
}

// HMAC of the IP address under a key for the day, which is itself derived from
// a secret kept outside the database. Without the secret the hashes can't be
// reversed by trying every IP address, and hashes from different days can't be
// linked to each other.
export async function hashIp(ip: string, day: string, secret: string): Promise<string> {
  const dayKey = await hmac(new TextEncoder().encode(secret), day);
  return Array.from(await hmac(dayKey, ip), (b) => b.toString(16).padStart(2, '0')).join('');
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
