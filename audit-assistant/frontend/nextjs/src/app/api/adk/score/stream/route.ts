import { NextRequest } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
export const runtime = 'edge';

export async function POST(req: NextRequest) {
  const url = new URL('/adk/score/stream', API_BASE).toString();
  const auth = req.headers.get('authorization') || '';

  const backendResp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: auth } : {}),
    },
    body: await req.text(),
  });

  if (!backendResp.ok) {
    const msg = await backendResp.text();
    return new Response(msg || 'Upstream error', { status: backendResp.status });
  }

  const readable = backendResp.body;
  if (!readable) return new Response('No stream', { status: 500 });

  return new Response(readable, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Transfer-Encoding': 'chunked',
    },
  });
}
