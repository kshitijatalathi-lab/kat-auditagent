const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8011';
export const runtime = 'nodejs';

export async function GET(req: Request, context: any) {
  const sessionId = context?.params?.sessionId as string;
  const incoming = new URL(req.url);
  const url = new URL(`/adk/sessions/${encodeURIComponent(sessionId)}/state`, API_BASE);
  // forward all search params (e.g., org_id)
  for (const [k, v] of incoming.searchParams.entries()) url.searchParams.set(k, v);
  const auth = req.headers.get('authorization') || '';
  const org = req.headers.get('x-org-id') || '';
  const resp = await fetch(url.toString(), { headers: { ...(auth ? { Authorization: auth } : {}), ...(org ? { 'X-Org-Id': org } : {}) } });
  const text = await resp.text();
  return new Response(text, { status: resp.status, headers: { 'Content-Type': resp.headers.get('content-type') || 'application/json' } });
}

export async function POST(req: Request, context: any) {
  const sessionId = context?.params?.sessionId as string;
  const url = new URL(`/adk/sessions/${encodeURIComponent(sessionId)}/state`, API_BASE);
  const auth = req.headers.get('authorization') || '';
  const org = req.headers.get('x-org-id') || '';
  const body = await req.text();
  const resp = await fetch(url.toString(), {
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
}
