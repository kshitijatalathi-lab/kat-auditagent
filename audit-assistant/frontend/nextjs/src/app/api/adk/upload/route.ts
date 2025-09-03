import { NextRequest } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
export const runtime = 'edge';

export async function POST(req: NextRequest) {
  const url = new URL('/adk/upload', API_BASE || 'http://localhost').toString();
  // Forward the body as-is (FormData/stream) and preserve Content-Type so FastAPI can parse multipart
  const contentType = req.headers.get('content-type') || undefined;
  const resp = await fetch(url, {
    method: 'POST',
    headers: contentType ? { 'content-type': contentType } : undefined,
    body: req.body,
  });
  if (!resp.ok) return new Response(await resp.text(), { status: resp.status });
  return new Response(resp.body, { status: 200, headers: { 'Content-Type': resp.headers.get('content-type') || 'application/json' } });
}
