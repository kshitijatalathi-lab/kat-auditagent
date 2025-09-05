import { NextRequest } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';

function contentTypeFor(p: string): string {
  const ext = path.extname(p).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.txt') return 'text/plain; charset=utf-8';
  return 'application/octet-stream';
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const p = url.searchParams.get('path');
    const sessionId = url.searchParams.get('session_id') || undefined;
    const orgId = req.headers.get('x-org-id') || url.searchParams.get('org_id') || undefined;
    if (!p) return new Response('missing path', { status: 400 });
    if (!orgId) return new Response('missing org', { status: 401 });

    // Safety: only allow absolute paths under the project root (process.cwd())
    const abs = path.resolve(p);
    const root = path.resolve(process.cwd());
    if (!path.isAbsolute(abs)) return new Response('invalid path', { status: 400 });
    const rel = path.relative(root, abs);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      return new Response('forbidden', { status: 403 });
    }

    // Additional guardrails: restrict to well-known output directories
    // Allowed: reports/, uploads/, data/processed/
    const allowedRoots = ['reports', 'uploads', path.join('data', 'processed')];
    const top = rel.split(path.sep)[0];
    if (!allowedRoots.includes(top)) {
      return new Response('forbidden', { status: 403 });
    }

    // If session_id provided, require that it appears in the path to loosely bind access to session artifacts
    if (sessionId) {
      const normRel = rel.replace(/\\/g, '/');
      if (!normRel.includes(sessionId)) {
        return new Response('forbidden', { status: 403 });
      }
    }

    await fs.promises.access(abs, fs.constants.R_OK);
    const stat = await fs.promises.stat(abs);
    const stream = fs.createReadStream(abs);
    return new Response(stream as any, {
      status: 200,
      headers: {
        'Content-Type': contentTypeFor(abs),
        'Content-Length': String(stat.size),
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err: any) {
    const msg = err?.message || 'failed to read file';
    return new Response(msg, { status: 500 });
  }
}
