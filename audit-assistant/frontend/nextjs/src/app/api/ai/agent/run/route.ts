export const runtime = 'nodejs';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8011';

export async function POST(req: Request) {
  try {
    const body = await req.text();
    const url = new URL('/ai/agent/run', API_BASE).toString();

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(req.headers.get('authorization') ? { Authorization: req.headers.get('authorization')! } : {}),
        ...(req.headers.get('x-org-id') ? { 'X-Org-Id': req.headers.get('x-org-id')! } : {}),
      },
      body: body,
    });

    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('content-type') || 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || 'Proxy error' }), { status: 500 });
  }
}
