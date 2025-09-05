'use client';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';

export type BatchItem = { question: string; user_answer: string };

export function BatchScoring({
  sessionId,
  orgId,
  framework = 'GDPR',
  k = 5,
  buildItems,
  className,
  onResult,
}: {
  sessionId: string;
  orgId: string;
  framework?: string;
  k?: number;
  buildItems: () => BatchItem[];
  className?: string;
  onResult?: (res: { items: any[]; composite_score: number }) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ items: any[]; composite_score: number } | null>(null);

  const run = async () => {
    try {
      setLoading(true);
      const items = buildItems();
      if (items.length === 0) {
        toast.message('No answers to score');
        return;
      }
      const res = await apiFetch<{ items: any[]; composite_score: number }>(
        '/api/adk/score/batch',
        {
          method: 'POST',
          body: JSON.stringify({ session_id: sessionId, org_id: orgId, user_id: 'anonymous', framework, items, k }),
        }
      );
      setResult(res);
      try { onResult?.(res); } catch {}
      toast.success('Batch scored');
    } catch (e) {
      toast.error('Failed to run batch scoring');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={className}>
      <button onClick={run} disabled={loading} className="px-4 py-2 rounded-md border w-full">
        {loading ? 'Scoring…' : 'Score All Answered'}
      </button>
      {result && (
        <div className="mt-3 rounded-md border p-3 bg-card">
          <div className="text-sm text-muted-foreground mb-2">Composite Score: <span className="font-semibold">{result.composite_score.toFixed(2)}</span></div>
          <ul className="text-sm list-disc pl-5 space-y-1">
            {result.items.map((it, idx) => (
              <li key={idx}>
                <span className="font-medium">{it.question}</span>
                {typeof it.score !== 'undefined' && (
                  <span className="text-muted-foreground"> — score {it.score}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
