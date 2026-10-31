// Builds the company index from Companies House Basic Company Data and publishes
// it to Cloudflare R2 (or a local folder).
//
//   node scripts/import/build-index.ts --latest --upload     newest snapshot -> R2
//   node scripts/import/build-index.ts --zip file.zip --out ./index-out
//   node scripts/import/build-index.ts --csv file.csv --out ./index-out --partial
//
// Options:
//   --latest                download the newest snapshot from Companies House
//   --zip / --csv <file>    use a local file instead (zips are read with `unzip`)
//   --snapshot YYYY-MM-DD   snapshot date (read from the file name when omitted)
//   --out <folder>          write the bucket layout to a folder
//   --upload                publish to R2 (needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
//                           R2_SECRET_ACCESS_KEY, R2_BUCKET)
//   --partial               allow a small input (one part file); without it, fewer
//                           than 4 million companies is treated as a broken download
//   --summary <file.json>   write a short summary (used by the scheduled workflow)
//   --skip-if-imported      with --latest and --summary: stop early when the summary
//                           already records the newest snapshot

import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { parseArgs } from 'node:util';
import { parse } from 'csv-parse';
import { normalizeCompanyName } from '../../src/lib/company-name/normalize.ts';
import { encodeCompanyLine, encodeNameLine } from '../../src/lib/company-index/format.ts';
import { buildShards } from '../../src/lib/company-index/shards.ts';
import { folderStore, publishIndex, r2Store, type BuiltIndex, type ObjectStore } from './publish.ts';
import { toCompanyRow, type CompanyRecord } from './transform.ts';

const DOWNLOAD_BASE = 'https://download.companieshouse.gov.uk/';
const DOWNLOAD_PAGE = `${DOWNLOAD_BASE}en_output.html`;
// A full snapshot has over 5 million live companies. Fewer than this means a
// truncated download, and publishing it would hide most companies from the site.
const MIN_FULL_SNAPSHOT_ROWS = 4_000_000;

const { values: args } = parseArgs({
  options: {
    latest: { type: 'boolean', default: false },
    zip: { type: 'string' },
    csv: { type: 'string' },
    snapshot: { type: 'string' },
    out: { type: 'string' },
    upload: { type: 'boolean', default: false },
    partial: { type: 'boolean', default: false },
    summary: { type: 'string' },
    'skip-if-imported': { type: 'boolean', default: false },
  },
});

function log(message: string) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function snapshotFrom(fileName: string): string | undefined {
  return /(\d{4}-\d{2}-\d{2})/.exec(fileName)?.[1];
}

function importedSnapshot(summaryPath: string | undefined): string | undefined {
  if (!summaryPath || !existsSync(summaryPath)) return undefined;
  return JSON.parse(readFileSync(summaryPath, 'utf8')).snapshot ?? undefined;
}

async function findLatestSnapshot(): Promise<{ url: string; file: string }> {
  const res = await fetch(DOWNLOAD_PAGE);
  if (!res.ok) throw new Error(`Download page returned HTTP ${res.status}`);
  const match = /href="(BasicCompanyDataAsOneFile-\d{4}-\d{2}-\d{2}\.zip)"/.exec(await res.text());
  if (!match) throw new Error('Could not find BasicCompanyDataAsOneFile-*.zip on the download page');
  return { url: DOWNLOAD_BASE + match[1], file: match[1] };
}

async function download(url: string, destination: string) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status} for ${url}`);
  await pipeline(Readable.fromWeb(res.body as import('node:stream/web').ReadableStream), createWriteStream(destination));
}

function openCsv(source: { zip?: string; csv?: string }): Readable {
  if (source.csv) return createReadStream(source.csv);
  const unzip = spawn('unzip', ['-p', source.zip!], { stdio: ['ignore', 'pipe', 'inherit'] });
  unzip.on('exit', (code) => {
    if (code !== 0) unzip.stdout.destroy(new Error(`unzip exited with code ${code}`));
  });
  return unzip.stdout;
}

async function readIndexLines(csv: Readable) {
  const nameLines: string[] = [];
  const companyLines: string[] = [];
  let skipped = 0;
  const records = csv.pipe(
    parse({ columns: (header: string[]) => header.map((h) => h.trim()), bom: true, relax_column_count: true }),
  );
  for await (const record of records as AsyncIterable<CompanyRecord>) {
    const row = toCompanyRow(record);
    if (!row) {
      skipped++;
      continue;
    }
    nameLines.push(encodeNameLine(normalizeCompanyName(row.name), row));
    companyLines.push(encodeCompanyLine(row));
    if (nameLines.length % 500_000 === 0) log(`${nameLines.length.toLocaleString()} companies read`);
  }
  return { nameLines, companyLines, skipped };
}

function storeFromEnv(): Promise<ObjectStore> {
  const env = (name: string) => {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is not set`);
    return value;
  };
  return r2Store({
    accountId: env('R2_ACCOUNT_ID'),
    accessKeyId: env('R2_ACCESS_KEY_ID'),
    secretAccessKey: env('R2_SECRET_ACCESS_KEY'),
    bucket: env('R2_BUCKET'),
  });
}

async function main() {
  if (!args.out && !args.upload) throw new Error('Pass --out <folder>, --upload, or both');

  let workDir: string | undefined;
  let zipPath = args.zip;
  let fileName = basename(args.zip ?? args.csv ?? '');

  try {
    if (args.latest) {
      const latest = await findLatestSnapshot();
      if (args['skip-if-imported'] && snapshotFrom(latest.file) === importedSnapshot(args.summary)) {
        log(`Snapshot ${snapshotFrom(latest.file)} is already published; nothing to do`);
        return;
      }
      workDir = mkdtempSync(join(tmpdir(), 'ch-bulk-'));
      zipPath = join(workDir, latest.file);
      fileName = latest.file;
      log(`Downloading ${latest.url}`);
      await download(latest.url, zipPath);
      log('Download complete');
    } else if (!args.zip && !args.csv) {
      throw new Error('Pass --latest, --zip <file> or --csv <file>');
    }

    const snapshot = args.snapshot ?? snapshotFrom(fileName);
    if (!snapshot) throw new Error('Could not tell the snapshot date from the file name; pass --snapshot YYYY-MM-DD');

    const { nameLines, companyLines, skipped } = await readIndexLines(openCsv({ zip: zipPath, csv: args.csv }));
    log(`Read ${nameLines.length.toLocaleString()} companies (${skipped} skipped)`);

    if (!args.partial && nameLines.length < MIN_FULL_SNAPSHOT_ROWS) {
      throw new Error(
        `Only ${nameLines.length} companies read; a full snapshot has millions. Refusing to publish. ` +
          'Use --partial for a single part file.',
      );
    }

    nameLines.sort();
    companyLines.sort();
    const index: BuiltIndex = { snapshot, names: buildShards(nameLines), companies: buildShards(companyLines) };
    log(`Built ${index.names.shards.length} name shards and ${index.companies.shards.length} company shards`);

    const stores: [string, ObjectStore][] = [];
    if (args.out) stores.push([`folder ${args.out}`, folderStore(args.out)]);
    if (args.upload) stores.push(['R2', await storeFromEnv()]);

    for (const [label, store] of stores) {
      log(`Publishing to ${label}`);
      const result = await publishIndex(store, index, {
        onProgress: (done, total) => log(`  ${done}/${total} shards uploaded`),
      });
      log(`Published snapshot ${snapshot} to ${label}: ${result.uploaded} files written, ${result.deleted} old files deleted`);
    }

    if (args.summary) {
      writeFileSync(
        args.summary,
        JSON.stringify(
          {
            snapshot,
            file: fileName,
            companies: nameLines.length,
            skipped,
            name_shards: index.names.shards.length,
            company_shards: index.companies.shards.length,
            finished_at: new Date().toISOString(),
          },
          null,
          2,
        ) + '\n',
      );
    }
  } finally {
    if (workDir) rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
