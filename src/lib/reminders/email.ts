// The confirmation and reminder emails, as plain text and branded HTML, plus a
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

// ---- Layout ----------------------------------------------------------------
// The site's look (DESIGN.md) in a form mail clients accept: tables, inline
// styles, and a <style> block only for web fonts and dark mode, which clients
// that ignore it simply skip. Gmail shows Helvetica/Arial in place of the
// brand fonts; Apple Mail loads them from the site.

const C = {
  ground: '#fbfbfa',
  paper: '#ffffff',
  ink: '#0d0e12',
  ink2: '#5d6069',
  ink3: '#72757e',
  line: '#e6e6e3',
  cobalt: '#2a3ee8',
  onCobalt: '#ffffff',
};
const DISPLAY = "'Funnel Display','Helvetica Neue',Helvetica,Arial,sans-serif";
const SANS = "Geist,'Helvetica Neue',Helvetica,Arial,sans-serif";
const MONO = "'Geist Mono',ui-monospace,'SF Mono',Menlo,Consolas,monospace";

const HEAD_STYLE = `
@font-face{font-family:'Funnel Display';src:url(${SITE.url}/email/fonts/funnel-display.woff2) format('woff2');font-weight:300 800}
@font-face{font-family:Geist;src:url(${SITE.url}/email/fonts/geist.woff2) format('woff2');font-weight:100 900}
@font-face{font-family:'Geist Mono';src:url(${SITE.url}/email/fonts/geist-mono.woff2) format('woff2');font-weight:100 900}
a{text-decoration-thickness:1px;text-underline-offset:2px}
@media (max-width:600px){.title{font-size:26px!important}.slab-name{font-size:20px!important}}
@media (prefers-color-scheme:dark){
.bg{background:#0c0d11!important}.ink{color:#eef0f4!important}.ink2{color:#a3a7b2!important}.ink3{color:#868a95!important}
.rule{border-color:#eef0f4!important}.hair{border-color:#23262e!important}.link{color:#8f9cff!important}
.fill{background:#3546ee!important}.aside{background:#111318!important;border-color:#23262e!important}.name{color:#8f9cff!important}}`;

function link(href: string, label: string, opts: { quiet?: boolean } = {}): string {
  const color = opts.quiet ? C.ink2 : C.cobalt;
  return `<a href="${escapeHtml(href)}" class="${opts.quiet ? 'ink2' : 'link'}" style="color:${color};text-decoration:underline">${escapeHtml(label)}</a>`;
}

function paragraph(html: string, opts: { muted?: boolean; size?: number; margin?: string } = {}): string {
  const color = opts.muted ? C.ink2 : C.ink;
  return `<p class="${opts.muted ? 'ink2' : 'ink'}" style="margin:${opts.margin ?? '0 0 16px'};font-family:${SANS};font-size:${opts.size ?? 16}px;line-height:1.65;color:${color}">${html}</p>`;
}

// The page H1: Funnel Display, tight tracking.
function title(text: string): string {
  return `<h1 class="title ink" style="margin:0 0 12px;font-family:${DISPLAY};font-size:30px;font-weight:500;line-height:1.08;letter-spacing:-0.03em;color:${C.ink}">${escapeHtml(text)}</h1>`;
}

// The register's "your name" slab: the visitor's company as one cobalt entry.
function companySlab(company: Company): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;border-collapse:separate">` +
    `<tr><td class="fill" style="background:${C.cobalt};border-radius:12px;padding:16px 18px">` +
    `<div style="font-family:${SANS};font-size:12px;font-weight:500;line-height:1.3;color:${C.onCobalt};opacity:0.8">Your company</div>` +
    `<div class="slab-name" style="margin-top:4px;font-family:${DISPLAY};font-size:22px;font-weight:500;line-height:1.2;letter-spacing:-0.02em;color:${C.onCobalt}">${escapeHtml(company.name)}</div>` +
    `<div style="margin-top:4px;font-family:${MONO};font-size:13px;letter-spacing:0.02em;color:${C.onCobalt};opacity:0.85">${escapeHtml(company.number)}</div>` +
    `</td></tr></table>`
  );
}

// The one cobalt pill. A table cell, so Outlook keeps the fill.
function button(href: string, label: string): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;border-collapse:separate"><tr>` +
    `<td class="fill" style="background:${C.cobalt};border-radius:999px">` +
    `<a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 24px;font-family:${SANS};font-size:15px;font-weight:600;line-height:1;color:${C.onCobalt};text-decoration:none;border-radius:999px">${escapeHtml(label)}&nbsp;&rarr;</a>` +
    `</td></tr></table>`
  );
}

// An aside: Paper with a hairline border and 12px corners.
function aside(heading: string, html: string): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border-collapse:separate">` +
    `<tr><td class="aside" style="background:${C.paper};border:1px solid ${C.line};border-radius:12px;padding:18px 20px">` +
    `<div class="ink" style="margin:0 0 6px;font-family:${SANS};font-size:16px;font-weight:600;line-height:1.35;color:${C.ink}">${escapeHtml(heading)}</div>` +
    paragraph(html, { muted: true, size: 15, margin: '0' }) +
    `</td></tr></table>`
  );
}

interface DeadlineRow {
  name: string;
  detail: string;
  status: string;
  href: string;
  linkLabel: string;
}

// A ruled list: 1px ink rule on top, hairlines between rows.
function ruledList(rows: DeadlineRow[]): string {
  const cells = rows
    .map(
      (r) =>
        `<tr><td class="hair" style="padding:16px 0;border-bottom:1px solid ${C.line}">` +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>` +
        `<td valign="top">` +
        `<div class="ink" style="font-family:${DISPLAY};font-size:20px;font-weight:500;line-height:1.2;letter-spacing:-0.02em;color:${C.ink}">${escapeHtml(r.name)}</div>` +
        `<div class="ink2" style="margin-top:4px;font-family:${SANS};font-size:15px;line-height:1.5;color:${C.ink2}">${escapeHtml(r.detail)}</div>` +
        `<div style="margin-top:6px;font-family:${SANS};font-size:15px;line-height:1.5">${link(r.href, r.linkLabel)}</div>` +
        `</td>` +
        `<td valign="top" align="right" class="ink" style="padding-left:16px;white-space:nowrap;font-family:${SANS};font-size:15px;font-weight:600;line-height:1.35;color:${C.ink}">${escapeHtml(r.status)}</td>` +
        `</tr></table></td></tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px"><tr><td class="rule" style="border-top:1px solid ${C.ink};font-size:0;line-height:0">&nbsp;</td></tr>${cells}</table>`;
}

function layout(opts: { subject: string; preheader: string; body: string; footer: string }): string {
  const wordmark =
    `<span class="ink" style="font-family:${DISPLAY};font-size:18px;font-weight:600;letter-spacing:-0.025em;color:${C.ink}">` +
    `company<span class="name" style="color:${C.cobalt}">name</span>checker<span class="ink3" style="color:${C.ink3};font-weight:500">.co.uk</span></span>`;
  return (
    `<!doctype html><html lang="en-GB"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">` +
    `<title>${escapeHtml(opts.subject)}</title><style>${HEAD_STYLE}</style></head>` +
    `<body class="bg" style="margin:0;padding:0;background:${C.ground}">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(opts.preheader)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="bg" style="background:${C.ground}"><tr><td align="center" style="padding:32px 16px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">` +
    // Masthead: logo mark and wordmark, then a hairline.
    `<tr><td class="hair" style="padding:0 0 20px;border-bottom:1px solid ${C.line}">` +
    `<a href="${SITE.url}" style="text-decoration:none">` +
    `<img src="${SITE.url}/email/logo.png" width="28" height="28" alt="" style="display:inline-block;vertical-align:middle;border:0;border-radius:6px">` +
    `&nbsp;&nbsp;<span style="vertical-align:middle">${wordmark}</span></a></td></tr>` +
    `<tr><td style="padding:32px 0 8px;text-align:left">${opts.body}</td></tr>` +
    `<tr><td class="hair" style="padding:20px 0 0;border-top:1px solid ${C.line}">${paragraph(opts.footer, { muted: true, size: 13, margin: '0' })}</td></tr>` +
    `</table></td></tr></table></body></html>`
  );
}

// ---- Emails ------------------------------------------------------------------

export function confirmationEmail(company: Company, confirmUrl: string): EmailContent {
  const who = `${company.name} (${company.number})`;
  const subject = `Confirm deadline reminders for ${company.name}`;
  return {
    subject,
    text: [
      `You asked ${SITE.name} to email you before ${who}'s Companies House filing deadlines.`,
      `Confirm here: ${confirmUrl}`,
      `If this wasn't you, ignore this email and we won't send anything else.`,
      `${SITE.name} · ${SITE.url}`,
    ].join('\n\n'),
    html: layout({
      subject,
      preheader: `One click to start reminders for ${company.name}.`,
      body:
        title('Confirm your reminders') +
        paragraph(
          "We'll email you a month and a week before your confirmation statement and annual accounts are due, with the dates checked against Companies House every day.",
          { muted: true },
        ) +
        companySlab(company) +
        button(confirmUrl, 'Confirm my reminders') +
        paragraph("If this wasn't you, ignore this email and we won't send anything else.", { muted: true, size: 14 }),
      footer: `${escapeHtml(SITE.name)} · ${link(SITE.url, SITE.url.replace('https://', ''), { quiet: true })}`,
    }),
  };
}

export function reminderEmail(company: Company, items: DueReminder[], unsubscribeUrl: string): EmailContent {
  const sorted = [...items].sort((a, b) => a.daysLeft - b.daysLeft);
  const first = sorted[0];
  const subject =
    sorted.length === 1
      ? `${company.name}: ${KIND_LABELS[first.kind].toLowerCase()} due ${first.daysLeft === 0 ? 'today' : `in ${first.daysLeft} day${first.daysLeft === 1 ? '' : 's'}`}`
      : `${company.name}: ${sorted.length} Companies House deadlines coming up`;
  const heading =
    sorted.length === 1
      ? `${KIND_LABELS[first.kind]} ${first.daysLeft === 0 ? 'due today' : `due in ${first.daysLeft} day${first.daysLeft === 1 ? '' : 's'}`}`
      : `${sorted.length} deadlines coming up`;
  const companyUrl = `${SITE.url}/company/?number=${encodeURIComponent(company.number)}`;
  const hasStatement = sorted.some((i) => i.kind === 'confirmation-statement');
  const idvLine = hasStatement && idvFact ? `Identity verification: existing directors give their Companies House personal code ${String(idvFact.value).charAt(0).toLowerCase()}${String(idvFact.value).slice(1)}.` : null;
  const idvGuide = `${SITE.url}/companies-house-identity-verification/`;

  const textItems = sorted.map(
    (i) => `${KIND_LABELS[i.kind]}: due ${isoToDate(i.dueOn)} (${daysText(i.daysLeft)}). File it: ${FILE_LINKS[i.kind]}`,
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
    html: layout({
      subject,
      preheader: textItems.join(' '),
      body:
        title(heading) +
        companySlab(company) +
        ruledList(
          sorted.map((i) => ({
            name: KIND_LABELS[i.kind],
            detail: `Due ${isoToDate(i.dueOn)}`,
            status: i.daysLeft === 0 ? 'Due today' : daysText(i.daysLeft),
            href: FILE_LINKS[i.kind],
            linkLabel: 'File it on GOV.UK',
          })),
        ) +
        (idvLine
          ? aside(
              'Identity verification',
              `Existing directors give their Companies House personal code ${escapeHtml(String(idvFact!.value).charAt(0).toLowerCase() + String(idvFact!.value).slice(1))}. ${link(idvGuide, 'What directors need to do')}`,
            )
          : '') +
        button(companyUrl, "See the company's dates") +
        paragraph(escapeHtml(outro), { muted: true, size: 14 }),
      footer: `You get this because you asked ${escapeHtml(SITE.name)} for reminders about this company. ${link(unsubscribeUrl, 'Stop these reminders', { quiet: true })}.`,
    }),
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
