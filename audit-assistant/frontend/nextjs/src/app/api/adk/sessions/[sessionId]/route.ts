const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8011';
export const runtime = 'nodejs';

export async function GET(_req: Request, context: any) {
  const sessionId = context?.params?.sessionId as string;
  const url = new URL(`/adk/sessions/${encodeURIComponent(sessionId)}`, API_BASE);
  const auth = _req.headers.get('authorization') || '';
  const org = _req.headers.get('x-org-id') || '';
  const resp = await fetch(url.toString(), {
    headers: {
      ...(auth ? { Authorization: auth } : {}),
      ...(org ? { 'X-Org-Id': org } : {}),
    },
  });
  const text = await resp.text();
  return new Response(text, { status: resp.status, headers: { 'Content-Type': resp.headers.get('content-type') || 'application/json' } });
}
