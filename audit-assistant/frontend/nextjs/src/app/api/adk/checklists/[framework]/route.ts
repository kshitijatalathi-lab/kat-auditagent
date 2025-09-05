// Use the standard Web Request type for Next 15 route handlers

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8011';
export const runtime = 'nodejs';

export async function GET(req: Request, context: any) {
  const { params } = context || {};
  const { framework } = params;
  const url = new URL(`/adk/checklists/${encodeURIComponent(framework)}`, API_BASE).toString();
  const org = req.headers.get('x-org-id') || '';
  const auth = req.headers.get('authorization') || '';
  const resp = await fetch(url, { method: 'GET', headers: { ...(org ? { 'X-Org-Id': org } : {}), ...(auth ? { Authorization: auth } : {}) } });
  if (!resp.ok) {
    const msg = await resp.text();
    return new Response(msg || 'Upstream error', { status: resp.status });
  }
  return new Response(await resp.text(), { status: 200, headers: { 'Content-Type': resp.headers.get('content-type') || 'application/json' } });
}
