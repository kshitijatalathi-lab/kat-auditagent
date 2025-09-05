import { NextRequest } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8011';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const url = new URL('/adk/score/batch', API_BASE).toString();
  const auth = req.headers.get('authorization') || '';
  const org = req.headers.get('x-org-id') || '';
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: auth } : {}),
      ...(org ? { 'X-Org-Id': org } : {}),
    },
    body: await req.text(),
  });
  if (!resp.ok) return new Response(await resp.text(), { status: resp.status });
  return new Response(await resp.text(), { status: 200, headers: { 'Content-Type': resp.headers.get('content-type') || 'application/json' } });
}
