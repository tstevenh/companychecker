// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';

import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://companynamechecker.co.uk',
  trailingSlash: 'always',
  // Keep whitespace between text and inline links that sit on separate lines.
  compressHTML: false,
  adapter: cloudflare(),
  // /check/ shows search results, which shouldn't be indexed.
  integrations: [sitemap({ filter: (page) => !page.includes('/check/') })],
});