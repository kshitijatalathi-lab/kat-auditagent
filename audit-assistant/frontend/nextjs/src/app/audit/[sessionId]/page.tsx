'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { QuestionList } from '@/components/audit/QuestionList';
import { ClauseCard } from '@/components/audit/ClauseCard';
import { ScoreDisplay } from '@/components/audit/ScoreDisplay';
import { ProgressBar } from '@/components/audit/ProgressBar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import { AuthGate } from '@/components/auth/AuthGate';
import { ReportExportButton } from '@/components/audit/ReportExportButton';
import { useOrg } from '@/lib/org';
import { toast } from 'sonner';
import { GapAnalysis } from '@/components/audit/GapAnalysis';
import { BatchScoring } from '@/components/audit/BatchScoring';

type QItem = { id: string; text: string; userAnswer?: string; score?: number; rationale?: string; clauses?: any[]; provider?: string; model?: string };

export default function AuditSession() {
  const routeParams = useParams<{ sessionId?: string }>();
  const sessionId = routeParams?.sessionId ?? 'demo';
  const router = useRouter();
  const { org } = useOrg();
  const [framework] = useState('GDPR');
  const [questions, setQuestions] = useState<QItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const q = useMemo(() => questions[currentIndex], [questions, currentIndex]);
  const [loadingScore, setLoadingScore] = useState(false);
  const [streaming, setStreaming] = useState(false);

  // Load checklist from backend
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch<{ framework: string; version: string; items: any[] }>(`/adk/checklists/${framework}`);
        if (cancelled) return;
        const qs: QItem[] = (data.items || []).map((it: any, idx: number) => ({ id: it.id || `q-${idx}`, text: it.question || it.text || '' }));
        setQuestions(qs);
      } catch (e) {
        // noop; could show toast
      }
    })();
    return () => { cancelled = true; };
  }, [framework]);

  // Score current question and move next
  const saveNext = async () => {
    if (!q) return;
    setLoadingScore(true);
    try {
      const payload = {
        session_id: sessionId,
        org_id: org,
        user_id: 'anonymous',
        framework,
        checklist_question: q.text,
        user_answer: q.userAnswer || '',
        k: 5,
      };
      const res = await apiFetch<{ ok: boolean; score: number; rationale: string; provider: string; model: string; clauses: any[] }>(
        '/adk/score',
        { method: 'POST', body: JSON.stringify(payload) }
      );
      // Update current question
      setQuestions(prev => prev.map((it, i) => i === currentIndex ? { ...it, score: res.score, rationale: res.rationale, clauses: res.clauses, provider: res.provider, model: res.model } : it));
      const atLast = currentIndex >= questions.length - 1;
      if (!atLast) {
        setCurrentIndex(Math.min(currentIndex + 1, Math.max(questions.length - 1, 0)));
      } else {
        // Build report items from answered questions
        const items = (
          (prev => prev)(questions)
        ).map(it => ({
          question: it.text,
          user_answer: it.userAnswer || '',
          score: Math.round((it.score ?? res.score) as number),
          rationale: it.rationale || res.rationale || '',
          llm_provider: it.provider || res.provider || 'unknown',
          llm_model: it.model || res.model || 'unknown',
          clauses: it.clauses || res.clauses || [],
        }));
        const rep = await apiFetch<{ pdf_gcs?: string; json_gcs?: string; pdf_path?: string; json_path?: string }>(
          '/adk/report',
          { method: 'POST', body: JSON.stringify({ session_id: sessionId, org_id: org, items }) }
        );
        const pdf = rep.pdf_gcs || rep.pdf_path || '';
        const json = rep.json_gcs || rep.json_path || '';
        const qp = new URLSearchParams({ pdf_url: String(pdf), json_url: String(json) }).toString();
        router.push(`/report/${encodeURIComponent(sessionId)}?${qp}`);
      }
    } catch (e) {
      toast.error('Failed to score or generate report');
    } finally {
      setLoadingScore(false);
    }
  };

  // Stream scoring for current question and move next
  const streamNext = async () => {
    if (!q) return;
    setStreaming(true);
    try {
      const payload = {
        session_id: sessionId,
        org_id: org,
        user_id: 'anonymous',
        framework,
        checklist_question: q.text,
        user_answer: q.userAnswer || '',
        k: 5,
      };

      const res = await fetch('/api/adk/score/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      let finalScore: number | undefined;
      let provider: string | undefined;
      let model: string | undefined;
      let receivedClauses = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        const parts = acc.split('\n\n');
        acc = parts.pop() || '';
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') continue;
          try {
            const evt = JSON.parse(data);
            if (evt.type === 'clauses' && !receivedClauses) {
              receivedClauses = true;
              setQuestions(prev => prev.map((it, i) => i === currentIndex ? { ...it, clauses: evt.clauses || [] } : it));
            } else if (evt.type === 'rationale' && typeof evt.delta === 'string') {
              setQuestions(prev => prev.map((it, i) => i === currentIndex ? { ...it, rationale: (it.rationale || '') + evt.delta } : it));
            } else if (evt.type === 'final') {
              finalScore = Number(evt.score ?? 0);
              provider = String(evt.llm_provider || '');
              model = String(evt.llm_model || '');
            }
          } catch {
            // ignore malformed chunk
          }
        }
      }

      // finalize current item
      setQuestions(prev => prev.map((it, i) => i === currentIndex ? { ...it, score: finalScore ?? it.score, provider: provider || it.provider, model: model || it.model } : it));

      const atLast = currentIndex >= questions.length - 1;
      if (!atLast) {
        setCurrentIndex(Math.min(currentIndex + 1, Math.max(questions.length - 1, 0)));
      } else {
        // Build report items from answered questions
        const items = (
          (prev => prev)(questions)
        ).map(it => ({
          question: it.text,
          user_answer: it.userAnswer || '',
          score: Math.round((it.score ?? finalScore ?? 0) as number),
          rationale: it.rationale || '',
          llm_provider: it.provider || provider || 'unknown',
          llm_model: it.model || model || 'unknown',
          clauses: it.clauses || [],
        }));
        try {
          const rep = await apiFetch<{ pdf_gcs?: string; json_gcs?: string; pdf_path?: string; json_path?: string }>(
            '/adk/report',
            { method: 'POST', body: JSON.stringify({ session_id: sessionId, org_id: org, items }) }
          );
          const pdf = rep.pdf_gcs || rep.pdf_path || '';
          const json = rep.json_gcs || rep.json_path || '';
          const qp = new URLSearchParams({ pdf_url: String(pdf), json_url: String(json) }).toString();
          router.push(`/report/${encodeURIComponent(sessionId)}?${qp}`);
        } catch {
          toast.error('Failed to generate report');
        }
      }
    } catch (e) {
      toast.error('Streaming score failed');
    } finally {
      setStreaming(false);
    }
  };

  if (!q) return <div className="p-6">Loading session…</div>;

  return (
    <AuthGate>
    <div className="grid grid-cols-[320px_1fr_380px] gap-4 p-6">
      <aside className="border-r">
        <div className="p-2">
          <Input placeholder="Search questions…" />
        </div>
        <QuestionList questions={questions} currentIndex={currentIndex} onSelect={setCurrentIndex} />
      </aside>

      <main className="space-y-4">
        <div className="rounded-lg border p-4 bg-card">
          <div className="text-sm text-muted-foreground mb-2">Question</div>
          <h2 className="text-lg font-medium">{q.text}</h2>
          <div className="mt-4">
            <label className="text-sm text-muted-foreground">Your Answer</label>
            <Textarea className="mt-2 w-full h-40" value={q.userAnswer || ''}
              onChange={(e) => setQuestions(prev => prev.map((it, i) => i === currentIndex ? { ...it, userAnswer: e.target.value } : it))}
              placeholder="Provide your compliance answer and any context…" />
          </div>
        </div>

        <div>
          <ProgressBar current={currentIndex + 1} total={questions.length} />
        </div>

        <div className="flex gap-2">
          <Button onClick={saveNext} disabled={loadingScore || streaming}>
            {currentIndex < questions.length - 1 ? (loadingScore ? 'Scoring…' : 'Save & Next') : (loadingScore ? 'Scoring…' : 'Finish Audit')}
          </Button>
          <Button variant="outline" onClick={streamNext} disabled={streaming || loadingScore}>
            {streaming ? 'Streaming…' : 'Stream Score'}
          </Button>
          <ReportExportButton
            sessionId={sessionId}
            orgId={org}
            label="Export Report"
            buildItems={() =>
              questions.map((it) => ({
                question: it.text,
                user_answer: it.userAnswer || '',
                score: Math.round((it.score ?? 0) as number),
                rationale: it.rationale || '',
                llm_provider: it.provider || 'unknown',
                llm_model: it.model || 'unknown',
                clauses: it.clauses || [],
              }))
            }
          />
        </div>

        <div className="mt-3">
          <GapAnalysis
            buildItems={() =>
              questions
                .filter((it) => typeof it.score !== 'undefined')
                .map((it) => ({
                  question: it.text,
                  user_answer: it.userAnswer || '',
                  score: Math.round((it.score ?? 0) as number),
                  rationale: it.rationale || '',
                  llm_provider: it.provider || 'unknown',
                  llm_model: it.model || 'unknown',
                  clauses: it.clauses || [],
                }))
            }
          />
        </div>
      </main>

      <aside className="space-y-4">
        <div className="rounded-lg border p-4 bg-card">
          <div className="text-sm text-muted-foreground mb-2">Retrieved Clauses</div>
          <div className="space-y-3">
            {(q.clauses || []).length === 0 && <div className="text-sm text-muted-foreground">Score to load clauses.</div>}
            {(q.clauses || []).map((c, i) => <ClauseCard key={i} clause={c} />)}
          </div>
        </div>

        <div className="rounded-lg border p-4 bg-card">
          <ScoreDisplay score={q.score} rationale={q.rationale} provider={q.provider} loading={loadingScore} />
        </div>
      </aside>
    </div>
    </AuthGate>
  );
}
