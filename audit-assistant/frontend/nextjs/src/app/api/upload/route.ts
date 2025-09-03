import { NextRequest } from 'next/server';

export const runtime = 'edge';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';

export async function POST(req: NextRequest) {
  const url = new URL('/adk/upload', API_BASE).toString();
  const auth = req.headers.get('authorization') || '';

  // Read the incoming multipart body as-is and forward.
  // Note: Edge runtime streams the body; we pass it through directly.
  const backendResp = await fetch(url, {
    method: 'POST',
    headers: {
      // Do not set Content-Type so the boundary is preserved
      ...(auth ? { Authorization: auth } : {}),
    },
    body: req.body,
  });

  if (!backendResp.ok) {
    const msg = await backendResp.text();
    return new Response(msg || 'Upload failed', { status: backendResp.status });
  }

  const readable = backendResp.body;
  if (!readable) {
    // Backend returns JSON; if body isn't readable stream, forward JSON
    const json = await backendResp.json().catch(() => ({}));
    return Response.json(json, { status: 200 });
  }

  // For simplicity, return whatever backend returns
  return new Response(readable, {
    status: 200,
    headers: {
      'Content-Type': backendResp.headers.get('content-type') || 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
