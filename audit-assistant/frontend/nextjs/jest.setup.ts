import '@testing-library/jest-dom';

// Silence console errors from React during tests unless explicitly needed
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    const msg = (args?.[0] || '').toString();
    if (msg.includes('Warning:')) return; // filter React warnings
    originalError(...args);
  };
});

afterAll(() => {
  console.error = originalError;
});

// Mock sonner to no-op toasts
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    message: jest.fn(),
  },
}));

// Mock Firebase auth used in api.ts
jest.mock('firebase/auth', () => ({
  getAuth: () => ({ currentUser: { getIdToken: async () => undefined } }),
}));

// Mock backend HTTP calls used by API smoke tests so they don't require a live server
// We only intercept requests that target the default backend base used in tests.
const DEFAULT_API_BASE = 'http://127.0.0.1:8000';
const realFetch = global.fetch;

function jsonResponse(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function sseResponse(lines: string[]) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(`data: ${line}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(stream as any, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

async function parseBody(init?: RequestInit) {
  try {
    if (!init?.body) return {} as any;
    if (typeof init.body === 'string') return JSON.parse(init.body);
    // node fetch in tests may pass a Buffer/Uint8Array
    if (init.body instanceof Uint8Array) return JSON.parse(Buffer.from(init.body).toString('utf8'));
    return {} as any;
  } catch {
    return {} as any;
  }
}

beforeAll(() => {
  // Only install fetch mock once
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : (input as URL).toString();
    if (!url.startsWith(DEFAULT_API_BASE)) {
      return realFetch(input as any, init as any);
    }

    const path = url.slice(DEFAULT_API_BASE.length);
    const method = (init?.method || 'GET').toUpperCase();
    const body = await parseBody(init);

    // Providers health
    if (method === 'GET' && path === '/ai/providers/health') {
      return jsonResponse({
        prefer: 'mock',
        openai_model: 'mock',
        gemini_model: 'mock',
        groq_model: 'mock',
        available: { mock: true },
      });
    }

    // Chat streaming (SSE)
    if (method === 'POST' && path === '/ai/chat') {
      const prompt = (body?.prompt as string) || 'hello';
      // Keep simple to satisfy tests that look for 'MOCK:' in the first chunk
      const msg = `MOCK: ${prompt}`;
      return sseResponse([msg, '[DONE]']);
    }

    // Score stream (SSE)
    if (method === 'POST' && path === '/adk/score/stream') {
      const rationale = 'This is a mock rationale explaining the score.';
      return sseResponse([
        '{ "type": "clauses", "clauses": [] }',
        `{ "type": "rationale", "delta": "${rationale.slice(0, 30)}" }`,
        `{ "type": "rationale", "delta": "${rationale.slice(30)}" }`,
        '{ "type": "final", "score": 4, "llm_provider": "mock", "llm_model": "mock" }',
        '[DONE]',
      ]);
    }

    // Checklist generate
    if (method === 'POST' && path === '/adk/checklist/generate') {
      return jsonResponse({ framework: body?.framework || 'GDPR', version: '1.0', items: [
        { id: '1', text: 'Provide a data retention policy.' },
        { id: '2', text: 'Ensure user consent is recorded.' },
        { id: '3', text: 'Allow data subject access requests.' },
      ] });
    }

    // Gaps
    if (method === 'POST' && path === '/adk/gaps') {
      const min = Number(body?.min_score ?? 4);
      const items = Array.isArray(body?.scored_items) ? body.scored_items.filter((it: any) => Number(it?.score ?? 0) < min) : [];
      return jsonResponse({ count: items.length, items });
    }

    // Report generation (returns paths, may be null)
    if (method === 'POST' && path === '/adk/report') {
      return jsonResponse({ json_path: null, pdf_path: null });
    }

    // Default: 404 for unhandled test routes
    return jsonResponse({ error: 'Not mocked' }, 404);
  };
});
