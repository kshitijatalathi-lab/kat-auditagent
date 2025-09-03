import { NextRequest } from 'next/server';

export const runtime = 'edge';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';

// Adapts our /api/ai/chat SSE stream (plain text chunks + [DONE])
// to a Vercel AI SDK-compatible event stream with JSON objects.
// For each chunk -> { type: 'text-delta', text }
// On end -> { type: 'finish' }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const url = new URL('/ai/chat', API_BASE).toString();

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(req.headers.get('authorization') ? { Authorization: req.headers.get('authorization')! } : {}),
    },
    body: JSON.stringify(body),
  });

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  if (!resp.ok || !resp.body) {
    const msg = await resp.text().catch(() => 'request failed');
    return new Response(msg, { status: resp.status || 500 });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const reader = resp.body!.getReader();
      let buffer = '';

      const pump = () => reader.read().then(({ done, value }) => {
        if (done) {
          // send finish event
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'finish' })}\n\n`));
          controller.close();
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          if (payload === '[DONE]') {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'finish' })}\n\n`));
            continue;
          }
          // emit text-delta event
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text-delta', text: payload })}\n\n`));
        }
        pump();
      }).catch((err) => {
        controller.error(err);
      });
      pump();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
    },
  });
}
