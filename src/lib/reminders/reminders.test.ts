import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { remindersDue, sentKey, stageFor } from './schedule.ts';
import { confirmationEmail, reminderEmail, sendEmail } from './email.ts';
import {
  acceptsReminders,
  hashIp,
  isToken,
  LIMIT_COUNTS_SQL,
  limitHit,
  newToken,
  parseEmail,
  RESERVE_SEND_SQL,
  reserveSendParams,
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

describe('reserving a confirmation send', () => {
  // The real migration and statement, run against SQLite (which D1 is).
  function freshDb() {
    const db = new DatabaseSync(':memory:');
    db.exec(readFileSync(new URL('../../../migrations/0002_confirmation_sends.sql', import.meta.url), 'utf8'));
    return db;
  }
  const at = (minutes: number) => new Date(Date.UTC(2026, 10, 2, 8) + minutes * 60_000);
  const reserve = (db: DatabaseSync, email: string, ipHash: string | null, minutes: number) =>
    db.prepare(RESERVE_SEND_SQL).get(...reserveSendParams({ email, ipHash, now: at(minutes) })) !== undefined;

  it('allows one send per address every 10 minutes, whatever the company', () => {
    const db = freshDb();
    expect(reserve(db, 'a@x.co', 'ip1', 0)).toBe(true);
    expect(reserve(db, 'a@x.co', 'ip2', 5)).toBe(false);
    expect(reserve(db, 'a@x.co', 'ip2', 11)).toBe(true);
  });

  it('allows 3 sends per address in 24 hours', () => {
    const db = freshDb();
    for (const m of [0, 20, 40]) expect(reserve(db, 'a@x.co', null, m)).toBe(true);
    expect(reserve(db, 'a@x.co', null, 60)).toBe(false);
    expect(reserve(db, 'a@x.co', null, 24 * 60 + 1)).toBe(true);
  });

  it('allows 10 sends per IP hash, to any addresses', () => {
    const db = freshDb();
    for (let i = 0; i < 10; i++) expect(reserve(db, `p${i}@x.co`, 'ip1', i)).toBe(true);
    expect(reserve(db, 'p10@x.co', 'ip1', 11)).toBe(false);
    expect(reserve(db, 'p10@x.co', 'ip2', 11)).toBe(true);
  });
  it('reports which limit stopped a send', () => {
    const db = freshDb();
    const hit = (email: string, ipHash: string | null, minutes: number) =>
      limitHit(
        db.prepare(LIMIT_COUNTS_SQL).get(...reserveSendParams({ email, ipHash, now: at(minutes) }).slice(0, 5)) as never,
      );
    reserve(db, 'a@x.co', 'ip1', 0);
    expect(hit('a@x.co', 'ip1', 5)).toBe('recent');
    reserve(db, 'a@x.co', 'ip1', 20);
    reserve(db, 'a@x.co', 'ip1', 40);
    expect(hit('a@x.co', 'ip1', 60)).toBe('daily');
    for (let i = 0; i < 7; i++) reserve(db, `p${i}@x.co`, 'ip1', 61 + i);
    expect(hit('new@x.co', 'ip1', 70)).toBe('rate');
  });
});

describe('hashIp', () => {
  it('is stable within a day, changes with the day and needs the secret', async () => {
    const a = await hashIp('203.0.113.7', '2026-11-02', 'secret');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashIp('203.0.113.7', '2026-11-02', 'secret')).toBe(a);
    expect(await hashIp('203.0.113.7', '2026-11-03', 'secret')).not.toBe(a);
    expect(await hashIp('203.0.113.7', '2026-11-02', 'other')).not.toBe(a);
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
