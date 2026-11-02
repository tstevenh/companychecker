// The confirmation and reminder emails, as plain text and simple HTML, plus a
// small Resend client. Pure apart from `sendEmail`, which takes its fetch.

import facts from '../../data/facts.json';
import { SITE } from '../../data/site.ts';
import { formatDate } from '../facts.ts';
import type { DueReminder } from './schedule.ts';

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

export interface Company {
  name: string;
  number: string;
}

const KIND_LABELS = {
  'confirmation-statement': 'Confirmation statement',
  accounts: 'Annual accounts',
} as const;

const FILE_LINKS = {
  'confirmation-statement': 'https://www.gov.uk/file-your-confirmation-statement-with-companies-house',
  accounts: 'https://www.gov.uk/file-your-company-annual-accounts',
} as const;

const idvFact = facts.find((f) => f.id === 'idv-existing-directors-deadline');

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function daysText(days: number): string {
  if (days === 0) return 'due today';
  return `${days} day${days === 1 ? '' : 's'} left`;
}

function isoToDate(iso: string): string {
  return formatDate(new Date(`${iso}T00:00:00Z`));
}

// Wraps paragraphs in a plain, readable layout. Mail clients ignore most CSS,
// so everything is inline and nothing depends on it.
function layout(paragraphs: string[], footer: string): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px">${p}</p>`).join('');
  return (
    `<!doctype html><html lang="en-GB"><body style="margin:0;padding:24px;background:#fbfbfa">` +
    `<div style="max-width:560px;margin:0 auto;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:#0d0e12">` +
    `${body}<p style="margin:32px 0 0;font-size:13px;color:#5d6069">${footer}</p></div></body></html>`
  );
}

function link(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="color:#2a3ee8">${escapeHtml(label)}</a>`;
}

export function confirmationEmail(company: Company, confirmUrl: string): EmailContent {
  const who = `${company.name} (${company.number})`;
  return {
    subject: `Confirm deadline reminders for ${company.name}`,
    text: [
      `You asked ${SITE.name} to email you before ${who}'s Companies House filing deadlines.`,
      `Confirm here: ${confirmUrl}`,
      `If this wasn't you, ignore this email and we won't send anything else.`,
      `${SITE.name} · ${SITE.url}`,
    ].join('\n\n'),
    html: layout(
      [
        `You asked ${escapeHtml(SITE.name)} to email you before <strong>${escapeHtml(who)}</strong>'s Companies House filing deadlines.`,
        link(confirmUrl, 'Confirm my reminders'),
        `If this wasn't you, ignore this email and we won't send anything else.`,
      ],
      `${escapeHtml(SITE.name)} · ${link(SITE.url, SITE.url.replace('https://', ''))}`,
    ),
  };
}

export function reminderEmail(company: Company, items: DueReminder[], unsubscribeUrl: string): EmailContent {
  const sorted = [...items].sort((a, b) => a.daysLeft - b.daysLeft);
  const first = sorted[0];
  const subject =
    sorted.length === 1
      ? `${company.name}: ${KIND_LABELS[first.kind].toLowerCase()} due ${first.daysLeft === 0 ? 'today' : `in ${first.daysLeft} day${first.daysLeft === 1 ? '' : 's'}`}`
      : `${company.name}: ${sorted.length} Companies House deadlines coming up`;
  const companyUrl = `${SITE.url}/company/?number=${encodeURIComponent(company.number)}`;
  const hasStatement = sorted.some((i) => i.kind === 'confirmation-statement');
  const idvLine = hasStatement && idvFact ? `Identity verification: existing directors give their Companies House personal code ${String(idvFact.value).charAt(0).toLowerCase()}${String(idvFact.value).slice(1)}.` : null;
  const idvGuide = `${SITE.url}/companies-house-identity-verification/`;

  const textItems = sorted.map(
    (i) => `${KIND_LABELS[i.kind]}: due ${isoToDate(i.dueOn)} (${daysText(i.daysLeft)}). File it: ${FILE_LINKS[i.kind]}`,
  );
  const htmlItems = sorted.map(
    (i) =>
      `<strong>${KIND_LABELS[i.kind]}</strong>: due ${isoToDate(i.dueOn)} (${daysText(i.daysLeft)}).<br>${link(FILE_LINKS[i.kind], 'File it on GOV.UK')}`,
  );
  const intro = `Coming up for ${company.name} (${company.number}):`;
  const outro = `Dates come from Companies House today. If you've already filed, ignore this; the next reminder will follow the new date.`;

  return {
    subject,
    text: [
      intro,
      ...textItems,
      ...(idvLine ? [`${idvLine} Guide: ${idvGuide}`] : []),
      outro,
      `See the company's dates: ${companyUrl}`,
      `Stop these reminders: ${unsubscribeUrl}`,
    ].join('\n\n'),
    html: layout(
      [
        escapeHtml(intro),
        ...htmlItems,
        ...(idvLine ? [`${escapeHtml(idvLine)} ${link(idvGuide, 'What directors need to do')}`] : []),
        escapeHtml(outro),
        link(companyUrl, "See the company's dates"),
      ],
      `You get this because you asked ${escapeHtml(SITE.name)} for reminders about this company. ${link(unsubscribeUrl, 'Stop these reminders')}.`,
    ),
  };
}

export interface OutgoingEmail extends EmailContent {
  to: string;
  from: string;
  replyTo?: string;
  // Adds List-Unsubscribe headers, which Gmail and Yahoo require for bulk mail.
  unsubscribeUrl?: string;
}

export class EmailError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// Resend's send endpoint: https://resend.com/docs/api-reference/emails/send-email
export async function sendEmail(apiKey: string, email: OutgoingEmail, fetchFn: typeof fetch = fetch): Promise<void> {
  const res = await fetchFn('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: email.from,
      to: [email.to],
      subject: email.subject,
      text: email.text,
      html: email.html,
      ...(email.replyTo && { reply_to: email.replyTo }),
      ...(email.unsubscribeUrl && {
        headers: {
          'List-Unsubscribe': `<${email.unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }),
    }),
  });
  if (!res.ok) throw new EmailError(`Resend returned HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`, res.status);
}
