// Worker-side wiring for deadline reminders: sign-ups in D1, the Turnstile
// spam check, emails through Resend, and the hourly job that sends reminders.

import { env } from 'cloudflare:workers';
import { SITE } from '../../data/site.ts';
import { companiesHouseProfile, type LiveProfile } from '../company-lookup.ts';
import { parseCompanyNumber } from '../company-number.ts';
import { confirmationEmail, EmailError, reminderEmail, sendEmail, type OutgoingEmail } from '../reminders/email.ts';
import { remindersDue, sentKey, type Deadline } from '../reminders/schedule.ts';
import {
  acceptsReminders,
  hashIp,
  isToken,
  LIMIT_COUNTS_SQL,
  limitHit,
  MAX_COMPANIES_PER_EMAIL,
  newToken,
  parseEmail,
  RESERVE_SEND_SQL,
  reserveSendParams,
  type LimitCounts,
} from '../reminders/signup.ts';
import { runCompanyDetails } from './runtime.ts';

type ReminderEnv = {
  DB?: D1Database;
  COMPANIES_HOUSE_API_KEY?: string;
  RESEND_API_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
  IP_HASH_SECRET?: string;
  EMAIL_FROM?: string;
};
const runtime = env as unknown as ReminderEnv;

// Cloudflare's published Turnstile test keys, which always pass. Local
// development always uses them: the real widget only accepts the live hostname.
const TEST_SITE_KEY = '1x00000000000000000000AA';
const TEST_SECRET_KEY = '1x0000000000000000000000000000000AA';

const UNCONFIRMED_DAYS = 7;

export function turnstileSiteKey(): string {
  return import.meta.env.DEV ? TEST_SITE_KEY : runtime.TURNSTILE_SITE_KEY || '';
}

// Keys the hash of each sign-up's IP address (see hashIp).
function ipHashSecret(): string {
  return runtime.IP_HASH_SECRET || (import.meta.env.DEV ? 'local-development-only' : '');
}

export function remindersAvailable(): boolean {
  return Boolean(runtime.DB && turnstileSiteKey() && ipHashSecret() && (runtime.RESEND_API_KEY || import.meta.env.DEV));
}

async function verifyTurnstile(token: string, ip: string | null): Promise<boolean> {
  const secret = import.meta.env.DEV ? TEST_SECRET_KEY : runtime.TURNSTILE_SECRET_KEY;
  if (!secret || !token) return false;
  const form = new FormData();
  form.set('secret', secret);
  form.set('response', token);
  if (ip) form.set('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  if (!res.ok) return false;
  return ((await res.json()) as { success?: boolean }).success === true;
}

// Without a Resend key in local development, emails are printed to the log.
async function deliver(email: OutgoingEmail): Promise<void> {
  if (!runtime.RESEND_API_KEY) {
    if (!import.meta.env.DEV) throw new Error('RESEND_API_KEY is not set');
    console.log(`[email to ${email.to}] ${email.subject}\n${email.text}`);
    return;
  }
  await sendEmail(runtime.RESEND_API_KEY, email);
}

function outgoing(to: string, content: { subject: string; text: string; html: string }, unsubscribeUrl?: string): OutgoingEmail {
  return {
    ...content,
    to,
    from: runtime.EMAIL_FROM || `${SITE.name} <reminders@companynamechecker.co.uk>`,
    replyTo: SITE.contactEmail,
    unsubscribeUrl,
  };
}

const confirmUrl = (token: string) => `${SITE.url}/reminders/confirm/?t=${token}`;
const unsubscribeUrl = (token: string) => `${SITE.url}/reminders/unsubscribe/?t=${token}`;
const oneClickUrl = (token: string) => `${SITE.url}/reminders/one-click-unsubscribe/?t=${token}`;

// ---- Sign-up ---------------------------------------------------------------

export type SignUpError =
  | 'email'
  | 'company'
  | 'inactive'
  | 'challenge'
  | 'already'
  | 'too-many'
  | 'recent'
  | 'daily'
  | 'rate'
  | 'unavailable';
export type SignUpResult = { ok: true; companyName: string } | { ok: false; error: SignUpError; companyName?: string };

export interface SignUpInput {
  email: string;
  companyNumber: string;
  offers: boolean;
  turnstileToken: string;
  ip: string | null;
}

interface SubscriptionRow {
  token: string;
  email: string;
  company_number: string;
  company_name: string;
  confirm_sent_at: string | null;
  confirmed_at: string | null;
}

export async function signUp(input: SignUpInput, now = new Date()): Promise<SignUpResult> {
  const db = runtime.DB;
  if (!db || !remindersAvailable()) return { ok: false, error: 'unavailable' };
  const email = parseEmail(input.email);
  if (!email) return { ok: false, error: 'email' };
  const number = parseCompanyNumber(input.companyNumber);
  if (!number) return { ok: false, error: 'company' };
  if (!(await verifyTurnstile(input.turnstileToken, input.ip))) return { ok: false, error: 'challenge' };

  const details = await runCompanyDetails(number);
  if (!details) return { ok: false, error: 'company' };
  const companyName = details.company.name;
  if (!acceptsReminders(details.company.status)) return { ok: false, error: 'inactive' };

  const existing = await db
    .prepare('SELECT * FROM subscriptions WHERE email = ? AND company_number = ?')
    .bind(email, number)
    .first<SubscriptionRow>();

  // Each limit gets its own message, so the form never looks like it sent an
  // email when it didn't.
  if (existing?.confirmed_at) return { ok: false, error: 'already', companyName };
  const confirmedCount = await db
    .prepare('SELECT COUNT(*) AS n FROM subscriptions WHERE email = ? AND confirmed_at IS NOT NULL')
    .bind(email)
    .first<number>('n');
  if ((confirmedCount ?? 0) >= MAX_COMPANIES_PER_EMAIL) return { ok: false, error: 'too-many' };

  const stamp = now.toISOString();
  const ipHash = input.ip ? await hashIp(input.ip, stamp.slice(0, 10), ipHashSecret()) : null;
  const params = reserveSendParams({ email, ipHash, now });
  // Reserve the send in one statement, so two sign-ups at the same moment
  // can't both slip under the limits.
  const reserved = await db.prepare(RESERVE_SEND_SQL).bind(...params).first<{ rowid: number }>();
  if (!reserved) {
    const counts = await db.prepare(LIMIT_COUNTS_SQL).bind(...params.slice(0, 5)).first<LimitCounts>();
    return { ok: false, error: counts ? limitHit(counts) : 'rate' };
  }

  const token = existing?.token ?? newToken();
  await db
    .prepare(
      `INSERT INTO subscriptions (token, email, company_number, company_name, offers, created_at, confirm_sent_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
       ON CONFLICT (email, company_number) DO UPDATE SET
         company_name = excluded.company_name, offers = excluded.offers, confirm_sent_at = excluded.confirm_sent_at`,
    )
    .bind(token, email, number, companyName, input.offers ? 1 : 0, stamp)
    .run();

  try {
    await deliver(outgoing(email, confirmationEmail({ name: companyName, number }, confirmUrl(token))));
  } catch (err) {
    console.error('Confirmation email failed', err);
    // Release the reservation and let the person try again straight away.
    await db.batch([
      db.prepare('UPDATE subscriptions SET confirm_sent_at = NULL WHERE token = ?').bind(token),
      db.prepare('DELETE FROM confirmation_sends WHERE rowid = ?').bind(reserved.rowid),
    ]);
    return { ok: false, error: 'unavailable' };
  }
  return { ok: true, companyName };
}

// ---- Confirm and unsubscribe -------------------------------------------------

export interface SubscriptionView {
  companyName: string;
  companyNumber: string;
  confirmed: boolean;
}

export async function findSubscription(token: string): Promise<SubscriptionView | null> {
  if (!runtime.DB || !isToken(token)) return null;
  const row = await runtime.DB.prepare('SELECT * FROM subscriptions WHERE token = ?').bind(token).first<SubscriptionRow>();
  return row ? { companyName: row.company_name, companyNumber: row.company_number, confirmed: Boolean(row.confirmed_at) } : null;
}

export async function confirmSubscription(token: string, now = new Date()): Promise<SubscriptionView | null> {
  if (!runtime.DB || !isToken(token)) return null;
  await runtime.DB.prepare('UPDATE subscriptions SET confirmed_at = ? WHERE token = ? AND confirmed_at IS NULL')
    .bind(now.toISOString(), token)
    .run();
  return findSubscription(token);
}

// Deletes the sign-up and its sent log. Returns false when there was nothing
// to delete (already unsubscribed, or a bad link).
export async function unsubscribe(token: string): Promise<boolean> {
  if (!runtime.DB || !isToken(token)) return false;
  const [deleted] = await runtime.DB.batch([
    runtime.DB.prepare('DELETE FROM subscriptions WHERE token = ?').bind(token),
    runtime.DB.prepare('DELETE FROM reminders_sent WHERE token = ?').bind(token),
  ]);
  return (deleted.meta.changes ?? 0) > 0;
}

// RFC 8058 one-click unsubscribe, posted by Gmail, Yahoo and others straight
// from the inbox. src/worker.ts routes it here, outside Astro, because Astro
// rejects cross-site form posts.
export async function oneClickUnsubscribe(token: string): Promise<Response> {
  await unsubscribe(token);
  return new Response('Unsubscribed', { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

// ---- The reminder job ----------------------------------------------------------

// Each run checks a slice of companies, so one run stays well inside the
// Workers Free limit of 50 outgoing requests (Companies House + Resend calls).
// It runs hourly through the day (wrangler.jsonc), so about 13 × 40 checks a day.
const REQUEST_BUDGET = 40;
const ROWS_PER_RUN = 300;

interface DueRow extends SubscriptionRow {
  checked_on: string | null;
}

export async function runReminderJob(now = new Date()): Promise<void> {
  const db = runtime.DB;
  const apiKey = runtime.COMPANIES_HOUSE_API_KEY;
  if (!db || !apiKey) {
    console.warn('Reminder job skipped: DB or COMPANIES_HOUSE_API_KEY missing');
    return;
  }
  const today = now.toISOString().slice(0, 10);
  const staleBefore = new Date(now.getTime() - UNCONFIRMED_DAYS * 86_400_000).toISOString();
  await db.prepare('DELETE FROM subscriptions WHERE confirmed_at IS NULL AND created_at < ?').bind(staleBefore).run();
  const dayAgo = new Date(now.getTime() - 86_400_000).toISOString();
  await db.prepare('DELETE FROM confirmation_sends WHERE sent_at < ?').bind(dayAgo).run();

  const { results } = await db
    .prepare(
      `SELECT * FROM subscriptions
       WHERE confirmed_at IS NOT NULL AND (checked_on IS NULL OR checked_on < ?)
       ORDER BY company_number LIMIT ?`,
    )
    .bind(today, ROWS_PER_RUN)
    .all<DueRow>();

  const byCompany = new Map<string, DueRow[]>();
  for (const row of results) byCompany.set(row.company_number, [...(byCompany.get(row.company_number) ?? []), row]);

  const fetchProfile = companiesHouseProfile(apiKey);
  let budget = REQUEST_BUDGET;
  let checked = 0;
  let sent = 0;

  for (const [number, rows] of byCompany) {
    // One Companies House call, plus up to one email per subscriber.
    if (budget < 1 + rows.length) break;
    budget -= 1;
    let profile: LiveProfile | null;
    try {
      profile = await fetchProfile(number);
    } catch (err) {
      console.error(`Companies House lookup failed for ${number}`, err);
      continue; // Try again next run.
    }

    if (profile && acceptsReminders(profile.status)) {
      const deadlines: Deadline[] = [
        { kind: 'confirmation-statement', dueOn: profile.confirmationStatementDue },
        { kind: 'accounts', dueOn: profile.accountsDue },
      ];
      for (const row of rows) {
        const { results: sentRows } = await db
          .prepare('SELECT kind, due_on, stage FROM reminders_sent WHERE token = ?')
          .bind(row.token)
          .all<{ kind: string; due_on: string; stage: number }>();
        const due = remindersDue(deadlines, new Set(sentRows.map((r) => sentKey(r.kind, r.due_on, r.stage))), now);
        if (due.length === 0) continue;
        budget -= 1;
        try {
          const company = { name: profile.name || row.company_name, number };
          await deliver(outgoing(row.email, reminderEmail(company, due, unsubscribeUrl(row.token)), oneClickUrl(row.token)));
        } catch (err) {
          console.error(`Reminder email failed for ${number}`, err);
          // Over Resend's daily or per-second limit: stop and pick up next run.
          if (err instanceof EmailError && err.status === 429) return;
          continue;
        }
        sent += 1;
        await db.batch(
          due.map((d) =>
            db
              .prepare('INSERT OR IGNORE INTO reminders_sent (token, kind, due_on, stage, sent_at) VALUES (?, ?, ?, ?, ?)')
              .bind(row.token, d.kind, d.dueOn, d.stage, now.toISOString()),
          ),
        );
      }
    }
    // Dissolved or missing companies are just marked checked; their sign-ups
    // stay so reminders resume if the company is restored.
    await db
      .prepare('UPDATE subscriptions SET checked_on = ?, company_name = COALESCE(?, company_name) WHERE company_number = ? AND confirmed_at IS NOT NULL')
      .bind(today, profile?.name || null, number)
      .run();
    checked += 1;
  }
  console.log(`Reminder job: checked ${checked} companies, sent ${sent} emails`);
}
