export const runtime = 'edge';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8011';

export async function POST(_req: Request, context: any) {
  const jobId = context?.params?.job_id as string;
  const url = new URL(`/adk/policy/audit/job/${jobId}/cancel`, API_BASE).toString();
  const res = await fetch(url, { method: 'POST' });
  const json = await res.json();
  return Response.json(json, { status: res.status });
}
