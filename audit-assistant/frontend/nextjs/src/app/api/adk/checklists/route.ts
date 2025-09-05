import { NextRequest } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8011';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const url = new URL('/adk/checklists', API_BASE);
    for (const [k, v] of req.nextUrl.searchParams.entries()) {
      url.searchParams.set(k, v);
    }
    const auth = req.headers.get('authorization') || '';
    const org = req.headers.get('x-org-id') || '';
    const resp = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        ...(auth ? { Authorization: auth } : {}),
        ...(org ? { 'X-Org-Id': org } : {}),
      },
    });
    const body = await resp.text();
    return new Response(body, {
      status: resp.status,
      headers: { 'Content-Type': resp.headers.get('content-type') || 'application/json' },
    });
  } catch (err: any) {
    const msg = (err && err.message) ? err.message : 'proxy failed';
    const code = err?.code ? ` code=${err.code}` : '';
    return new Response(`proxy error: ${msg}${code}`, { status: 500 });
  }
}
