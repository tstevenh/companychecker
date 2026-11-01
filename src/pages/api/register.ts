import type { APIRoute } from 'astro';
import { runRegister } from '../../lib/server/runtime.ts';

export const prerender = false;

// GET /api/register/?name=Acme+Widgets+Ltd
// The homepage calls this as the visitor types, to show the name's neighbours.
export const GET: APIRoute = async ({ url }) => {
  const result = await runRegister(url.searchParams.get('name') ?? '');
  return new Response(JSON.stringify(result), {
    status: result ? 200 : 503,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // The index changes monthly; an hour at the edge is safe.
      'cache-control': result ? 'public, max-age=3600' : 'no-store',
      'x-robots-tag': 'noindex',
    },
  });
};
