export const runtime = 'edge';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8011';

export async function GET() {
  const url = new URL('/ai/agents/graph', API_BASE).toString();
  const res = await fetch(url);
  const json = await res.json();
  return Response.json(json, { status: res.status });
}
