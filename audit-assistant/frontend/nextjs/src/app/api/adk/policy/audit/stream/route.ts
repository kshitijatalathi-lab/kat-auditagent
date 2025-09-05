export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const file_path = searchParams.get('file_path') || '';
  const org_id = searchParams.get('org_id') || 'default_org';
  const policy_type = searchParams.get('policy_type') || '';
  const top_k = searchParams.get('top_k') || '8';
  const prefer = searchParams.get('prefer') || '';

  const backend = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8011';
  const qs = new URLSearchParams({ file_path, org_id, top_k, ...(policy_type?{policy_type}:{}) , ...(prefer?{prefer}:{}) });
  const url = `${backend}/adk/policy/audit/stream?${qs.toString()}`;

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.body) {
    return new Response('stream not available', { status: 500 });
  }
  return new Response(res.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
