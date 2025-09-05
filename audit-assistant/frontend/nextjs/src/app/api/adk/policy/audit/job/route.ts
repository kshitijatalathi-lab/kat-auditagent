import { NextRequest } from 'next/server';

export const runtime = 'edge';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8011';

export async function POST(req: NextRequest) {
  const body = await req.json();
  // Smart Auto inference for minimal-input flow
  // - org_id: default to 'default' if missing
  // - top_k: default to 8 if missing/invalid
  // - policy_type: if 'Auto' or empty, omit to allow backend auto-classification
  const inferred: any = { ...body };
  if (!inferred.org_id || typeof inferred.org_id !== 'string') {
    inferred.org_id = 'default';
  }
  if (inferred.top_k == null || Number.isNaN(parseInt(String(inferred.top_k), 10))) {
    inferred.top_k = 8;
  } else {
    inferred.top_k = Math.max(1, Math.min(10, parseInt(String(inferred.top_k), 10)));
  }
  if (!inferred.policy_type || String(inferred.policy_type).toLowerCase() === 'auto') {
    delete inferred.policy_type;
  }
  const url = new URL('/adk/policy/audit/job', API_BASE).toString();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(inferred),
  });
  const json = await res.json();
  return Response.json(json, { status: res.status });
}
