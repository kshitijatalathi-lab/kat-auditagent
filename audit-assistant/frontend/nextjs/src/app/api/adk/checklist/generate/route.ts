import { NextRequest } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8011';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const url = new URL('/adk/checklist/generate', API_BASE).toString();
    const auth = req.headers.get('authorization') || '';
    const org = req.headers.get('x-org-id') || '';
    const body = await req.text();
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? { Authorization: auth } : {}),
        ...(org ? { 'X-Org-Id': org } : {}),
      },
      body,
    });
    const text = await resp.text();
    return new Response(text, { status: resp.status, headers: { 'Content-Type': resp.headers.get('content-type') || 'application/json' } });
  } catch (err: any) {
    const msg = err?.message || 'proxy failed';
    const code = err?.code ? ` code=${err.code}` : '';
    return new Response(`proxy error: ${msg}${code}`, { status: 500 });
  }
}
