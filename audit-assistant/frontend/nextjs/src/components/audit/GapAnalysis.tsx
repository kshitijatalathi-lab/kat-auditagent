'use client';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';

export type ScoredItem = {
  question: string;
  user_answer: string;
  score: number;
  rationale?: string;
  llm_provider?: string;
  llm_model?: string;
  clauses?: any[];
};

export function GapAnalysis({ buildItems, className }: { buildItems: () => ScoredItem[]; className?: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ count: number; items: any[] } | null>(null);

  const run = async () => {
    try {
      setLoading(true);
      const items = buildItems();
      const res = await apiFetch<{ count: number; items: any[] }>(
        '/adk/gaps',
        { method: 'POST', body: JSON.stringify({ scored_items: items, min_score: 4 }) }
      );
      setResult(res);
      toast.success(`Found ${res.count} gaps`);
    } catch (e) {
      toast.error('Failed to compute gaps');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={className}>
      <button onClick={run} disabled={loading} className="px-4 py-2 rounded-md border">
        {loading ? 'Analyzing…' : 'Run Gap Analysis'}
      </button>
      {result && (
        <div className="mt-3 rounded-md border p-3 bg-card">
          <div className="text-sm text-muted-foreground mb-2">Gaps ({result.count})</div>
          {result.items.length === 0 ? (
            <div className="text-sm text-muted-foreground">No gaps above threshold.</div>
          ) : (
            <ul className="text-sm list-disc pl-5 space-y-1">
              {result.items.map((it, idx) => (
                <li key={idx}>
                  <span className="font-medium">{it.question || 'Item'}</span>
                  {typeof it.score !== 'undefined' && <span className="text-muted-foreground"> — score {it.score}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
