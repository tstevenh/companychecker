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
  // Search and result pages are noindex and stay out of the sitemap.
  integrations: [
    sitemap({
      filter: (page) =>
        !['/check/', '/company/', '/results/', '/ideas/', '/reminders/confirm/', '/reminders/unsubscribe/', '/dev/'].some((part) => new URL(page).pathname.includes(part)),
    }),
  ],
});