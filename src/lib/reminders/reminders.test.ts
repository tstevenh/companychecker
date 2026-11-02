import { describe, expect, it, vi } from 'vitest';
import { remindersDue, sentKey, stageFor } from './schedule.ts';
import { confirmationEmail, reminderEmail, sendEmail } from './email.ts';
import {
  acceptsReminders,
  confirmationAllowed,
  hashIp,
  isToken,
  MAX_CONFIRMATIONS_PER_EMAIL_PER_DAY,
  MAX_CONFIRMATIONS_PER_IP_PER_DAY,
  newToken,
  parseEmail,
} from './signup.ts';

const today = new Date('2026-11-02T07:00:00Z');

describe('stageFor', () => {
  it('picks the nearest stage the deadline falls in', () => {
    expect(stageFor(45)).toBe(null);
    expect(stageFor(30)).toBe(30);
    expect(stageFor(8)).toBe(30);
    expect(stageFor(7)).toBe(7);
    expect(stageFor(0)).toBe(7);
    expect(stageFor(-1)).toBe(null);
  });
});

describe('remindersDue', () => {
  const deadlines = [
    { kind: 'confirmation-statement' as const, dueOn: '2026-11-09' }, // 7 days
    { kind: 'accounts' as const, dueOn: '2026-11-25' }, // 23 days
  ];

  it('returns each deadline inside a reminder window', () => {
    expect(remindersDue(deadlines, new Set(), today)).toEqual([
      { kind: 'confirmation-statement', dueOn: '2026-11-09', stage: 7, daysLeft: 7 },
      { kind: 'accounts', dueOn: '2026-11-25', stage: 30, daysLeft: 23 },
    ]);
  });

  it('skips stages already sent', () => {
    const sent = new Set([sentKey('accounts', '2026-11-25', 30)]);
    expect(remindersDue(deadlines, sent, today).map((r) => r.kind)).toEqual(['confirmation-statement']);
  });

  it('sends the week stage even when the month stage was sent for the same date', () => {
    const sent = new Set([sentKey('confirmation-statement', '2026-11-09', 30)]);
    expect(remindersDue(deadlines, sent, today)[0].stage).toBe(7);
  });

  it('ignores missing, overdue and far-off dates', () => {
    const others = [
      { kind: 'accounts' as const, dueOn: '' },
      { kind: 'accounts' as const, dueOn: '2026-11-01' },
      { kind: 'accounts' as const, dueOn: '2027-03-01' },
    ];
    expect(remindersDue(others, new Set(), today)).toEqual([]);
  });
});

describe('parseEmail', () => {
  it('accepts ordinary addresses and lower-cases the domain', () => {
    expect(parseEmail('  Jo.Bloggs@Example.CO.UK ')).toBe('Jo.Bloggs@example.co.uk');
  });

  it('rejects things that are not addresses', () => {
    for (const bad of ['', 'jo', 'jo@example', 'jo @example.com', '@example.com', `${'a'.repeat(250)}@x.com`]) {
      expect(parseEmail(bad)).toBe(null);
    }
  });
});

describe('acceptsReminders', () => {
  it('accepts active companies from the API and the bulk file', () => {
    expect(acceptsReminders('active')).toBe(true);
    expect(acceptsReminders('Active - Proposal to Strike off')).toBe(true);
    expect(acceptsReminders('dissolved')).toBe(false);
    expect(acceptsReminders('Liquidation')).toBe(false);
  });
});

describe('confirmationAllowed', () => {
  const none = { emailRecent: 0, emailDay: 0, ipDay: 0 };

  it('allows a first confirmation', () => {
    expect(confirmationAllowed(none)).toBe(true);
  });

  it('blocks a second email to the same address within 10 minutes, whatever the company', () => {
    expect(confirmationAllowed({ ...none, emailRecent: 1, emailDay: 1 })).toBe(false);
  });

  it('caps confirmations per address and per IP each day', () => {
    expect(confirmationAllowed({ ...none, emailDay: MAX_CONFIRMATIONS_PER_EMAIL_PER_DAY - 1 })).toBe(true);
    expect(confirmationAllowed({ ...none, emailDay: MAX_CONFIRMATIONS_PER_EMAIL_PER_DAY })).toBe(false);
    expect(confirmationAllowed({ ...none, ipDay: MAX_CONFIRMATIONS_PER_IP_PER_DAY })).toBe(false);
  });
});

describe('hashIp', () => {
  it('gives the same hash within a day and a different one the next day', async () => {
    const a = await hashIp('203.0.113.7', '2026-11-02');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashIp('203.0.113.7', '2026-11-02')).toBe(a);
    expect(await hashIp('203.0.113.7', '2026-11-03')).not.toBe(a);
  });
});

describe('tokens', () => {
  it('are 48 hex characters and different each time', () => {
    const a = newToken();
    expect(isToken(a)).toBe(true);
    expect(a).not.toBe(newToken());
    expect(isToken('../etc')).toBe(false);
  });
});

describe('emails', () => {
  const company = { name: 'ACME <WIDGETS> LTD', number: '01234567' };

  it('escapes the company name in HTML and links the confirm page', () => {
    const email = confirmationEmail(company, 'https://companynamechecker.co.uk/reminders/confirm/?t=abc');
    expect(email.subject).toBe('Confirm deadline reminders for ACME <WIDGETS> LTD');
    expect(email.html).toContain('ACME &lt;WIDGETS&gt; LTD');
    expect(email.html).not.toContain('<WIDGETS>');
    expect(email.text).toContain('https://companynamechecker.co.uk/reminders/confirm/?t=abc');
  });

  it('names a single deadline in the subject', () => {
    const email = reminderEmail(
      company,
      [{ kind: 'confirmation-statement', dueOn: '2026-11-09', stage: 7, daysLeft: 7 }],
      'https://x.test/u',
    );
    expect(email.subject).toBe('ACME <WIDGETS> LTD: confirmation statement due in 7 days');
    expect(email.text).toContain('due 9 November 2026 (7 days left)');
    expect(email.text).toContain('personal code with the company');
    expect(email.text).toContain('Stop these reminders: https://x.test/u');
  });

  it('counts several deadlines in the subject and leaves out ID verification for accounts only', () => {
    const accounts = reminderEmail(company, [{ kind: 'accounts', dueOn: '2026-11-02', stage: 7, daysLeft: 0 }], 'u');
    expect(accounts.subject).toBe('ACME <WIDGETS> LTD: annual accounts due today');
    expect(accounts.text).not.toContain('personal code');

    const both = reminderEmail(
      company,
      [
        { kind: 'accounts', dueOn: '2026-11-25', stage: 30, daysLeft: 23 },
        { kind: 'confirmation-statement', dueOn: '2026-11-09', stage: 7, daysLeft: 7 },
      ],
      'u',
    );
    expect(both.subject).toBe('ACME <WIDGETS> LTD: 2 Companies House deadlines coming up');
    expect(both.text.indexOf('Confirmation statement')).toBeLessThan(both.text.indexOf('Annual accounts'));
  });
});

describe('sendEmail', () => {
  it('posts to Resend with one-click unsubscribe headers', async () => {
    const fetchFn = vi.fn(async () => new Response('{}', { status: 200 }));
    await sendEmail(
      'key',
      { to: 'a@b.co', from: 'X <r@x.test>', subject: 's', text: 't', html: 'h', unsubscribeUrl: 'https://x.test/u' },
      fetchFn as unknown as typeof fetch,
    );
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    const body = JSON.parse(String(init.body));
    expect(body.to).toEqual(['a@b.co']);
    expect(body.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });

  it('throws with the status when Resend refuses', async () => {
    const fetchFn = async () => new Response('rate limited', { status: 429 });
    await expect(
      sendEmail('key', { to: 'a@b.co', from: 'f', subject: 's', text: 't', html: 'h' }, fetchFn as typeof fetch),
    ).rejects.toMatchObject({ status: 429 });
  });
});
