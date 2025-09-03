/* @jest-environment node */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8000';

describe('API non-stream smoke (mock mode)', () => {
  jest.setTimeout(20000);

  test('adk/checklist/generate returns items', async () => {
    const res = await fetch(`${API_BASE}/adk/checklist/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ framework: 'GDPR', files: ['uploads/comppoli.pdf'], top_n: 3 }),
    });
    expect(res.ok).toBe(true);
    const json = await res.json();
    expect(json).toHaveProperty('framework');
    expect(Array.isArray(json.items)).toBe(true);
  });

  test('adk/gaps returns items and count', async () => {
    const res = await fetch(`${API_BASE}/adk/gaps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scored_items: [
          { question: 'Q1', user_answer: 'A1', score: 2, rationale: 'r', clauses: [], llm_provider: 'mock', llm_model: 'mock' },
          { question: 'Q2', user_answer: 'A2', score: 5, rationale: 'r', clauses: [], llm_provider: 'mock', llm_model: 'mock' },
        ],
        min_score: 4,
      }),
    });
    expect(res.ok).toBe(true);
    const json = await res.json();
    expect(typeof json.count).toBe('number');
    expect(Array.isArray(json.items)).toBe(true);
  });

  test('adk/report returns paths (may be null) and succeeds', async () => {
    const res = await fetch(`${API_BASE}/adk/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: 's1',
        org_id: 'o1',
        items: [
          {
            question: 'Q1',
            user_answer: 'A1',
            score: 3,
            rationale: 'mock rationale',
            llm_provider: 'mock',
            llm_model: 'mock',
            clauses: [],
          },
        ],
      }),
    });
    expect(res.ok).toBe(true);
    const json = await res.json();
    expect(json).toHaveProperty('json_path');
    expect(json).toHaveProperty('pdf_path');
  });
});
