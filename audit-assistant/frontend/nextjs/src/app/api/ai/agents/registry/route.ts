import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8011';
    const res = await fetch(`${API_BASE}/ai/agents/registry`, { cache: 'no-store' });
    const json = await res.json();
    return NextResponse.json(json);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}
