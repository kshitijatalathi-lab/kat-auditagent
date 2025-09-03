import { NextRequest } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8002';
export const runtime = 'edge';

export async function GET(_req: NextRequest, { params }: { params: { framework: string } }) {
  const { framework } = params;
  const url = new URL(`/adk/checklists/${encodeURIComponent(framework)}`, API_BASE).toString();
  const resp = await fetch(url, { method: 'GET' });
  if (!resp.ok) {
    const msg = await resp.text();
    return new Response(msg || 'Upstream error', { status: resp.status });
  }
  return new Response(await resp.text(), { status: 200, headers: { 'Content-Type': resp.headers.get('content-type') || 'application/json' } });
}
