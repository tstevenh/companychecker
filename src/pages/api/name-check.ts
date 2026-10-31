import type { APIRoute } from 'astro';
import { runNameCheck } from '../../lib/server/runtime.ts';

export const prerender = false;

// GET /api/name-check/?name=Acme+Widgets+Ltd
export const GET: APIRoute = async ({ url }) => {
  const result = await runNameCheck(url.searchParams.get('name') ?? '');
  return new Response(JSON.stringify(result), {
    status: 'error' in result ? 400 : 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
};
