import { NextRequest } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8011';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const url = new URL('/adk/policy/annotate', API_BASE).toString();
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
  const text = await resp.text();
  return new Response(text, { status: resp.status, headers: { 'Content-Type': resp.headers.get('content-type') || 'application/json' } });
}
