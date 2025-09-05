export const runtime = 'edge';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8011';

export async function GET(_req: Request, context: any) {
  const jobId = context?.params?.job_id as string;
  const url = new URL(`/adk/policy/audit/job/${jobId}/artifacts.zip`, API_BASE).toString();
  const res = await fetch(url, { method: 'GET' });
  const headers = new Headers(res.headers);
  headers.set('Content-Type', 'application/zip');
  const cd = res.headers.get('Content-Disposition');
  if (cd) headers.set('Content-Disposition', cd);
  return new Response(res.body, { status: res.status, headers });
}
