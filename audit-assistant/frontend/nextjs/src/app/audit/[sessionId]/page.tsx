'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
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
  const sp = useSearchParams();
  const [framework] = useState(() => sp.get('framework') || 'GDPR');
  const [questions, setQuestions] = useState<QItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const q = useMemo(() => questions[currentIndex], [questions, currentIndex]);
  const [loadingScore, setLoadingScore] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [evidencePath, setEvidencePath] = useState<string | undefined>(undefined);

  // Load checklist from backend
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadError(null);
        const data = await apiFetch<{ framework: string; version: string; items: any[] }>(`/api/adk/checklists/${framework}`);
        if (cancelled) return;
        const raw = Array.isArray((data as any).items) ? (data as any).items : [];
        const qs: QItem[] = raw.map((it: any, idx: number) => ({ id: it.id || `q-${idx}`, text: it.question || it.text || '' }));
        setQuestions(qs);
        if (qs.length === 0) setLoadError(`No questions found for framework "${framework}".`);
      } catch (e) {
        setLoadError('Failed to load checklist. Please verify the backend is running and try again.');
      }
    })();
    return () => { cancelled = true; };
  }, [framework, reloadTick]);

  // Upload supporting evidence
  const onUploadEvidence = async (file: File) => {
    try {
      setUploading(true);
      const fd = new FormData();
      fd.append('file', file);
      // Use raw fetch to preserve FormData headers
      const res = await fetch('/api/adk/upload', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setEvidencePath(String(data.path || ''));
      toast.success('Evidence uploaded');
    } catch (e: any) {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const onDropFiles: React.DragEventHandler<HTMLDivElement> = async (ev) => {
    ev.preventDefault();
    const f = ev.dataTransfer?.files?.[0];
    if (f) onUploadEvidence(f);
  };

  const onPickFile: React.ChangeEventHandler<HTMLInputElement> = async (ev) => {
    const f = ev.target.files?.[0];
    if (f) onUploadEvidence(f);
  };

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
        '/api/adk/score',
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
          '/api/adk/report',
          { method: 'POST', body: JSON.stringify({ session_id: sessionId, org_id: org, items }) }
        );
        const pdf = rep.pdf_gcs || rep.pdf_path || '';
        const json = rep.json_gcs || rep.json_path || '';
        const qp = new URLSearchParams({ pdf_url: String(pdf), json_url: String(json) }).toString();
        const url = `/report/${encodeURIComponent(sessionId)}?${qp}`;
        try { if (typeof window !== 'undefined') localStorage.setItem('lastReportUrl', url); } catch {}
        router.push(url);
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
            '/api/adk/report',
            { method: 'POST', body: JSON.stringify({ session_id: sessionId, org_id: org, items }) }
          );
          const pdf = rep.pdf_gcs || rep.pdf_path || '';
          const json = rep.json_gcs || rep.json_path || '';
          const qp = new URLSearchParams({ pdf_url: String(pdf), json_url: String(json) }).toString();
          const url = `/report/${encodeURIComponent(sessionId)}?${qp}`;
          try { if (typeof window !== 'undefined') localStorage.setItem('lastReportUrl', url); } catch {}
          router.push(url);
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

  if (!q) {
    return (
      <div className="p-6 space-y-3">
        <div>Loading session…</div>
        {loadError && (
          <div className="space-y-2">
            <div className="text-sm text-red-600">{loadError}</div>
            <Button size="sm" onClick={() => setReloadTick((n) => n + 1)}>Retry</Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <AuthGate allowAnonymous={sessionId === 'demo'}>
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Audit Session: {framework}</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Question card */}
        <div className="rounded-lg border p-5 bg-card">
          <div className="text-sm font-semibold mb-1">Question {Math.min(currentIndex + 1, Math.max(questions.length, 1))} of {Math.max(questions.length, 1)}</div>
          <div className="text-sm text-muted-foreground mb-3">{q.text}</div>

          <div className="mt-2">
            <label className="text-sm text-muted-foreground">Your Answer</label>
            <Textarea
              className="mt-2 w-full h-40"
              value={q.userAnswer || ''}
              onChange={(e) => setQuestions(prev => prev.map((it, i) => i === currentIndex ? { ...it, userAnswer: e.target.value } : it))}
              placeholder="Provide your compliance answer and any context…"
            />
          </div>

          <div className="mt-4">
            <div className="text-sm text-muted-foreground mb-2">Supporting Evidence (Optional)</div>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDropFiles}
              className="border border-dashed rounded-lg p-6 text-center text-sm text-muted-foreground bg-background/50"
            >
              <div className="mb-2">Drag & drop files or <label className="text-primary underline cursor-pointer"><input type="file" className="hidden" onChange={onPickFile} />click to upload</label></div>
              <div className="text-xs">PDF, DOCX, or TXT up to 10MB</div>
              {uploading && <div className="text-xs mt-2">Uploading…</div>}
              {evidencePath && <div className="text-xs mt-2 text-green-600">Uploaded: {evidencePath}</div>}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <ProgressBar current={currentIndex + 1} total={Math.max(questions.length, 1)} />
          </div>

          <div className="mt-3 flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setCurrentIndex(Math.max(currentIndex - 1, 0))}
              disabled={currentIndex === 0 || loadingScore || streaming}
            >
              Previous
            </Button>
            <Button onClick={saveNext} disabled={loadingScore || streaming}>
              {currentIndex < questions.length - 1 ? (loadingScore ? 'Scoring…' : 'Save & Next') : (loadingScore ? 'Scoring…' : 'Finish Audit')}
            </Button>
          </div>
        </div>

        {/* Right: AI Analysis */}
        <div className="rounded-lg border p-5 bg-card">
          <div className="text-lg font-medium mb-2">AI Analysis</div>
          {!q.rationale && (
            <div className="text-sm text-muted-foreground">Answer the question to see AI analysis.</div>
          )}
          {q.rationale && (
            <div className="prose prose-sm max-w-none whitespace-pre-wrap">
              {q.rationale}
            </div>
          )}
        </div>
      </div>

      {/* Extras: Clauses and report tools below (optional) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-lg border p-4 bg-card lg:col-span-2">
          <div className="text-sm text-muted-foreground mb-2">Retrieved Clauses</div>
          <div className="space-y-3">
            {(q.clauses || []).length === 0 && <div className="text-sm text-muted-foreground">Score to load clauses.</div>}
            {(q.clauses || []).map((c, i) => <ClauseCard key={i} clause={c} />)}
          </div>
        </div>
        <div className="rounded-lg border p-4 bg-card">
          <ScoreDisplay score={q.score} rationale={q.rationale} provider={q.provider} loading={loadingScore} />
          <div className="mt-3">
            <Button variant="outline" onClick={streamNext} disabled={streaming || loadingScore} className="w-full">
              {streaming ? 'Streaming…' : 'Stream Score'}
            </Button>
          </div>
          <div className="mt-2">
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
        </div>
      </div>
    </div>
    </AuthGate>
  );
}
