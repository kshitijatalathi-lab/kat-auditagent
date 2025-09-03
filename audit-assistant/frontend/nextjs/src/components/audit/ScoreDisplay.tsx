"use client";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

export function ScoreDisplay({
  score: initialScore,
  rationale: initialRationale,
  provider,
  loading,
  error,
}: {
  score?: number;
  rationale?: string;
  provider?: string;
  loading?: boolean;
  error?: Error | null;
}) {
  const [score, setScore] = useState<number | undefined>(initialScore);
  const [rationale, setRationale] = useState<string | undefined>(initialRationale);

  useEffect(() => { setScore(initialScore); }, [initialScore]);
  useEffect(() => { setRationale(initialRationale); }, [initialRationale]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-muted-foreground">AI Score</div>
        {provider && <Badge variant="secondary">{provider}</Badge>}
      </div>
      <div className="text-3xl font-semibold">{typeof score === 'number' ? score.toFixed(1) : '—'}</div>
      <div className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">
        {rationale || 'No rationale yet.'}
      </div>
      {loading && <div className="text-xs mt-2">Scoring…</div>}
      {error && <div className="text-xs text-red-600 mt-2">{error.message}</div>}
    </div>
  );
}
