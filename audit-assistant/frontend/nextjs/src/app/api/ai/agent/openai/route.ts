import { NextRequest } from 'next/server';

export const runtime = 'edge';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8011';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const url = new URL('/ai/agent/openai', API_BASE).toString();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(req.headers.get('authorization') ? { Authorization: req.headers.get('authorization')! } : {}),
    },
    body: JSON.stringify(body),
  });
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const json = await res.json();
    return Response.json(json, { status: res.status });
  }
  const text = await res.text();
  return new Response(text, { status: res.status });
}
