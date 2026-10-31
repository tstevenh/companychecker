# companynamechecker.co.uk

Source for [companynamechecker.co.uk](https://companynamechecker.co.uk): a free, independent toolkit for checking UK company names and keeping track of Companies House deadlines.

## How it fits together (all on free tiers)

| Part | Where |
|---|---|
| Website pages | Cloudflare Pages (static Astro build) |
| Name check and deadline tools | Cloudflare Workers (Phase 1) |
| Every live UK company (~5.7 million) | Lookup files ("shards") in Cloudflare R2, rebuilt monthly |
| Small app data: reminder subscribers | Cloudflare D1 (Phase 3) |
| Monthly rebuild | GitHub Actions |

There's no database server. A name check normalises the name, fetches the one ~64 KB shard it would be in, and looks it up.

## What's here

| Path | What it is |
|---|---|
| `src/pages/`, `src/layouts/` | Astro pages and layout |
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

To build into a local folder instead of R2:

```sh
node scripts/import/build-index.ts --zip BasicCompanyData-2026-10-01-part7_7.zip --partial --out ./index-out
```

See the comment at the top of `scripts/import/build-index.ts` for every option.

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
