import type { APIRoute } from 'astro';
import { SITE } from '../../data/site.ts';
import { confirmationEmail, reminderEmail } from '../../lib/reminders/email.ts';

export const prerender = false;

// Local preview of the emails: /dev/email/?kind=confirm|reminder|both.
// Not available on the live site.
export const GET: APIRoute = ({ url }) => {
  if (!import.meta.env.DEV) return new Response('Not found', { status: 404 });
  const company = { name: 'ACME WIDGETS LTD', number: '01234567' };
  const kind = url.searchParams.get('kind');
  const email =
    kind === 'reminder'
      ? reminderEmail(company, [{ kind: 'confirmation-statement', dueOn: '2026-11-09', stage: 7, daysLeft: 7 }], '#unsubscribe')
      : kind === 'both'
        ? reminderEmail(
            company,
            [
              { kind: 'confirmation-statement', dueOn: '2026-11-09', stage: 7, daysLeft: 7 },
              { kind: 'accounts', dueOn: '2026-11-25', stage: 30, daysLeft: 23 },
            ],
            '#unsubscribe',
          )
        : confirmationEmail(company, '#confirm');
  // Load the logo and fonts from this dev server, since they may not be live yet.
  return new Response(email.html.replaceAll(`${SITE.url}/email/`, '/email/'), { headers: { 'content-type': 'text/html; charset=utf-8' } });
};
