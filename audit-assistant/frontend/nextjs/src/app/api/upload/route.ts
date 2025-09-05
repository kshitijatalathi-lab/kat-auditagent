import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8011';

export async function POST(req: NextRequest) {
  try {
    const url = new URL('/adk/upload', API_BASE).toString();
    const auth = req.headers.get('authorization') || '';
    const org = req.headers.get('x-org-id') || '';
    // Parse the incoming multipart and forward as FormData (lets fetch set proper boundary)
    const form = await req.formData();
    const backendResp = await fetch(url, {
      method: 'POST',
      headers: {
        ...(auth ? { Authorization: auth } : {}),
        ...(org ? { 'X-Org-Id': org } : {}),
        // Do NOT set Content-Type manually when sending FormData
      },
      body: form,
    });

    if (!backendResp.ok) {
      const msg = await backendResp.text();
      return new Response(msg || 'Upload failed', { status: backendResp.status });
    }

    const readable = backendResp.body;
    if (!readable) {
      const json = await backendResp.json().catch(() => ({}));
      return Response.json(json, { status: 200 });
    }

    return new Response(readable, {
      status: 200,
      headers: {
        'Content-Type': backendResp.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    const msg = err?.message || 'proxy failed';
    const code = err?.code ? ` code=${err.code}` : '';
    return new Response(`proxy error: ${msg}${code}`, { status: 500 });
  }
}
