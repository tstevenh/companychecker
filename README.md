# companynamechecker.co.uk

Source for [companynamechecker.co.uk](https://companynamechecker.co.uk): a free, independent toolkit for checking UK company names and keeping track of Companies House deadlines.

## How it fits together (all on free tiers)

| Part | Where |
|---|---|
| Website pages and tools | One Cloudflare Worker: static pages served as assets, plus the on-demand `/check/` page and `/api/name-check/` |
| Every live UK company (~5.7 million) | Lookup files ("shards") in Cloudflare R2, rebuilt monthly |
| Deadline reminder sign-ups | Cloudflare D1, with emails sent through Resend and a cron trigger in the same Worker |
| Monthly rebuild | GitHub Actions |

There's no database server. A name check normalises the name, fetches the one ~64 KB shard it would be in, and looks it up.

## What's here

| Path | What it is |
|---|---|
| `src/pages/`, `src/layouts/`, `src/components/` | Astro pages, layout and components |
| `src/pages/check.astro`, `src/pages/api/name-check.ts` | The name checker (rendered on demand in the Worker) |
| `src/lib/name-check.ts`, `src/lib/server/runtime.ts` | Name-check logic, and its wiring to R2, the cache and the Companies House API |
| `src/data/site.ts` | Operator name and contact email (fill in before launch) |
| `wrangler.jsonc` | Worker config: R2 binding `COMPANY_INDEX`, D1 binding `DB`, the reminder cron, vars |
| `src/worker.ts` | Worker entry: Astro's handler, the inbox one-click unsubscribe, and the cron job |
| `src/lib/reminders/`, `src/lib/server/reminders.ts` | Reminder schedule and email content (pure, tested), and their wiring to D1, Turnstile and Resend |
| `src/pages/reminders/` | Sign-up page, confirm page and unsubscribe page |
| `migrations/` | D1 schema |
| `scripts/dev/seed-local-index.ts` | Loads a locally built index into the local R2 emulator for `npm run dev` |
| `src/data/facts.json` | Every fee, rule, date and price shown on the site. The schema in `src/content.config.ts` makes the build fail if a fact has no official source or check date |
| `src/data/data-updates.json` | Public changelog shown on `/data-updates/` |
| `src/lib/company-name/normalize.ts` | The Companies House "same as" rules (Schedule 3, SI 2015/17). Shared by the builder and the Worker |
| `src/lib/company-index/` | Shard format, shard builder and lookups |
| `scripts/import/build-index.ts` | Downloads Basic Company Data, builds the shards, publishes them to R2 or a folder |
| `scripts/import/publish.ts` | Uploads shards, switches `current.json`, removes old snapshots |
| `.github/workflows/build-company-index.yml` | Scheduled monthly rebuild |
| `data/last-import.json` | Written by each successful build |

## Requirements

- Node.js **22.23.4 or newer** (Astro 7 requires it)
- `unzip` on the PATH (for `.zip` input)
- For publishing: a Cloudflare R2 bucket and an R2 API token with read and write access to it

## Common commands

| Command | What it does |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Local dev server |
| `npm run build` | Build the static site to `dist/` |
| `npm test` | Run the tests (no setup needed) |
| `npm run index:latest` | Download the newest snapshot, build the index and publish it to R2 (reads `.env`) |
| `npm run deploy` | Build and deploy the Worker to Cloudflare (`wrangler deploy`) |

To build into a local folder instead of R2:

```sh
node scripts/import/build-index.ts --zip BasicCompanyData-2026-10-01-part7_7.zip --partial --out ./index-out
```

See the comment at the top of `scripts/import/build-index.ts` for every option.

## Running the name checker locally

`npm run dev` runs the site in the real Workers runtime, with a local R2 emulator. To give it data:

```sh
node scripts/import/build-index.ts --zip BasicCompanyData-2026-10-01-part7_7.zip --partial --out ./index-out
node scripts/dev/seed-local-index.ts ./index-out
```

To try the live Companies House check, add `COMPANIES_HOUSE_API_KEY=...` to a `.dev.vars` file (git-ignored).

## Deadline reminders

People sign up on `/reminders/` or a company page with an email and company number. They get a confirmation email and must press a button on `/reminders/confirm/` before anything else is sent. A cron trigger runs `runReminderJob` hourly from 07:15 to 19:15 UTC. Each run checks a slice of companies against the live Companies House API and emails about 30 and 7 days before the confirmation statement and accounts are due. Each run stays under the Workers Free limit of 50 outgoing requests. Unsubscribing deletes the row, and unconfirmed sign-ups are deleted after 7 days.

The form only appears once D1, a Turnstile site key and (in production) a Resend key are set. Setup:

1. Create the database, then paste the `database_id` it prints into `wrangler.jsonc`:
   ```sh
   npx wrangler d1 create companynamechecker
   npx wrangler d1 migrations apply companynamechecker --remote
   ```
2. In Resend, add and verify the domain (Resend can add the DNS records in Cloudflare), create an API key, then `npx wrangler secret put RESEND_API_KEY`.
3. In Cloudflare, create a Turnstile widget for the domain. Put the site key in `TURNSTILE_SITE_KEY` in `wrangler.jsonc`, then `npx wrangler secret put TURNSTILE_SECRET_KEY`.
4. Set `IP_HASH_SECRET` to a long random string: `openssl rand -hex 32 | npx wrangler secret put IP_HASH_SECRET`. It keys the hash of sign-up IP addresses used for the per-IP limit.
5. `npm run deploy`.

Locally, `npx wrangler d1 migrations apply companynamechecker --local` creates the tables. `npm run dev` always uses Cloudflare's Turnstile test keys, which pass on localhost. With `RESEND_API_KEY` in `.dev.vars` it sends real emails; without it, it prints them to the log.

## Before launch

1. Fill in `operator` and `contactEmail` in `src/data/site.ts`. The privacy, terms and about pages show red placeholders until you do.
2. Buy the domain and add it to Cloudflare.
3. In Cloudflare: enable R2, create the bucket `companynamechecker-index`, and create an R2 API token. Set a billing notification.
4. Add the four `R2_*` secrets to this GitHub repo, then run the "Build company index" workflow once by hand.
5. Run `npx wrangler secret put COMPANIES_HOUSE_API_KEY`, then `npm run deploy`, and attach the domain to the Worker (Workers > Settings > Domains & Routes).

## The company index

```
current.json                          manifest of the live snapshot
snapshots/<date>/manifest.json        same manifest, kept per snapshot
snapshots/<date>/names/<i>.tsv        normalised name, number, name, status
snapshots/<date>/companies/<i>.tsv    number, name, status, incorporated, accounts due, confirmation statement due
```

- Lines are sorted by their first field. The manifest lists the first key of every shard, so a binary search picks the one shard to read.
- Companies with the same normalised name always land in the same shard.
- Shards are uploaded first and `current.json` last, so the site never sees a half-published snapshot. The previous snapshot is kept for rollback; older ones are deleted.
- A build that reads fewer than 4 million companies refuses to publish, because it is almost certainly a broken download. `--partial` allows small inputs for testing.

**Measured on a real part file (604,714 companies):**
- about 10 seconds to build;
- about 300 MB of memory, so about 3 GB for a full snapshot (the workflow allows 6 GB);
- 1,227 shards totalling about 80 MB, so roughly 0.75 GB and 11,500 shards for a full snapshot;
- every sampled company found by name and by number, at about 0.2 ms per lookup.

## Monthly rebuild

The workflow runs daily from the 5th to the 12th of each month. It skips snapshots that are already published.

**Repository secrets:** `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.

Each successful build commits `data/last-import.json`. That commit also stops GitHub disabling the schedule after 60 days without activity. If the workflow is ever disabled, run `npm run index:latest` locally with the same values in `.env`.

## Public repo rules

This repository is public. Never commit `.env`, API keys, research data or planning documents. Keys belong in `.env` locally and in GitHub Secrets for workflows.
