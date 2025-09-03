/* @jest-environment node */
import { setTimeout as delay } from 'timers/promises';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8000';

async function readSSEOnce(resp: Response, maxLines = 10): Promise<string[]> {
  const out: string[] = [];
  const reader = (resp.body as any)?.getReader?.();
  if (!reader) return out;
  const decoder = new TextDecoder();
  let linesRead = 0;
  let buf = '';
  while (linesRead < maxLines) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.startsWith('data:')) {
        out.push(line.slice('data:'.length).trim());
        linesRead++;
        if (line.includes('[DONE]')) return out;
      }
      if (linesRead >= maxLines) break;
    }
  }
  return out;
}

describe('API smoke (mock mode)', () => {
  jest.setTimeout(30000);

  test('providers health returns models and availability', async () => {
    const res = await fetch(`${API_BASE}/ai/providers/health`);
    expect(res.ok).toBe(true);
    const json = await res.json();
    expect(json).toHaveProperty('prefer');
    expect(json).toHaveProperty('groq_model');
  });

  test('ai/chat streams mock content', async () => {
    const res = await fetch(`${API_BASE}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'hello', prefer: 'groq', temperature: 0.2 }),
    });
    expect(res.ok).toBe(true);
    const lines = await readSSEOnce(res, 5);
    expect(lines.length).toBeGreaterThan(0);
    // first chunk should contain MOCK prefix in mock mode
    expect(lines.join('\n')).toContain('MOCK:');
  });

  test('adk/score/stream yields clauses and final', async () => {
    const res = await fetch(`${API_BASE}/adk/score/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: 's1',
        org_id: 'o1',
        user_id: 'u1',
        framework: 'GDPR',
        checklist_question: 'Is data encrypted?',
        user_answer: 'Yes',
        k: 1,
      }),
    });
    expect(res.ok).toBe(true);
    const lines = await readSSEOnce(res, 20);
    expect(lines.find((l) => l.startsWith('{'))).toBeTruthy();
    const joined = lines.join('\n');
    expect(joined).toContain('"type": "clauses"');
    expect(joined).toContain('"type": "final"');
  });
});
