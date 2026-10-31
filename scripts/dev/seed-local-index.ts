// Copies a locally built company index into the local R2 emulator used by
// `astro dev`, so the name check works offline.
//
//   node scripts/import/build-index.ts --zip <part file>.zip --partial --out ./index-out
//   node scripts/dev/seed-local-index.ts ./index-out

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { getPlatformProxy } from 'wrangler';

const from = process.argv[2];
if (!from) {
  console.error('Usage: node scripts/dev/seed-local-index.ts <folder built with --out>');
  process.exit(1);
}

const { env, dispose } = await getPlatformProxy<{ COMPANY_INDEX: R2Bucket }>({ persist: true });
try {
  const files = (await readdir(from, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
  // Shards first and current.json last, as in production.
  files.sort((a, b) => Number(a.endsWith('current.json')) - Number(b.endsWith('current.json')));
  let done = 0;
  for (const file of files) {
    const key = relative(from, file).split('\\').join('/');
    await env.COMPANY_INDEX.put(key, await readFile(file));
    if (++done % 250 === 0) console.log(`${done}/${files.length}`);
  }
  console.log(`Seeded ${files.length} files into the local COMPANY_INDEX bucket`);
} finally {
  await dispose();
}
