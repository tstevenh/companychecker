// The Worker entry: Astro handles every request, apart from the one-click
// unsubscribe that mail providers post from the inbox, and the cron trigger
// runs the deadline reminder job.

import { handle } from '@astrojs/cloudflare/handler';
import { oneClickUnsubscribe, runReminderJob } from './lib/server/reminders.ts';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/reminders/one-click-unsubscribe/') {
      return oneClickUnsubscribe(url.searchParams.get('t') ?? '');
    }
    return handle(request, env, ctx);
  },
  async scheduled(controller, _env, ctx) {
    ctx.waitUntil(runReminderJob(new Date(controller.scheduledTime)));
  },
} satisfies ExportedHandler<Env>;
