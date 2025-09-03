export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE;
    if (!apiBase) return new Response(JSON.stringify({ ok: false, error: 'NEXT_PUBLIC_API_BASE missing' }), { status: 500 });

    const body = await req.text();
    const url = `${apiBase.replace(/\/$/, '')}/ai/agent/run`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Forward auth if present
        Authorization: (req.headers.get('authorization') || ''),
      },
      body,
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
