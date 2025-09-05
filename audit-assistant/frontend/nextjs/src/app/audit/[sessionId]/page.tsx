'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getAuth } from 'firebase/auth';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ClauseCard } from '@/components/audit/ClauseCard';
import { ScoreDisplay } from '@/components/audit/ScoreDisplay';
import { ProgressBar } from '@/components/audit/ProgressBar';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import { AuthGate } from '@/components/auth/AuthGate';
import { ReportExportButton } from '@/components/audit/ReportExportButton';
import { useOrg } from '@/lib/org';
import { toast } from 'sonner';
import { GapAnalysis } from '@/components/audit/GapAnalysis';
import { BatchScoring } from '@/components/audit/BatchScoring';
import { AgentPanel } from '@/components/audit/AgentPanel';
import { AgentHistory } from '@/components/audit/AgentHistory';
import { PolicyAnnotation } from '@/components/audit/PolicyAnnotation';

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
  const [generatingChecklist, setGeneratingChecklist] = useState(false);
  const [autoExportAfterBatch, setAutoExportAfterBatch] = useState(false);
  const [autoScoreAfterGen, setAutoScoreAfterGen] = useState(true);
  const [genericSeeded, setGenericSeeded] = useState(false);
  const [loadedState, setLoadedState] = useState(false);
  const [gapsResult, setGapsResult] = useState<{ count: number; items: any[] } | null>(null);
  const saveTimer = useRef<any>(null);
  const answeredCount = useMemo(() => questions.filter((it) => (it.userAnswer || '').trim().length > 0).length, [questions]);
  const totalCount = useMemo(() => questions.length, [questions.length]);
  const allAnswered = useMemo(() => totalCount > 0 && answeredCount >= totalCount, [answeredCount, totalCount]);
  const frameworkIntro = useMemo(() => {
    switch (framework) {
      case 'GDPR':
        return 'GDPR focus areas: Lawful basis, data subject rights, DPIAs, and security of processing.';
      case 'HIPAA':
        return 'HIPAA focus areas: Privacy Rule, Security Rule, access controls, and breach notification.';
      case 'DPDP':
        return 'DPDP (India) focus areas: consent, purpose limitation, data principal rights, and safeguards.';
      default:
        return 'Generic audit: baseline governance, access control, training, incident management, and vendor risk.';
    }
  }, [framework]);

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
        if (qs.length === 0 && framework === 'OTHER') {
          // Seed a generic set when backend has no checklist for OTHER
          const generic: QItem[] = [
            { id: 'gen_1', text: 'Do you have documented policies for data handling and retention?' },
            { id: 'gen_2', text: 'Is there a process for access control and least privilege enforcement?' },
            { id: 'gen_3', text: 'Do you conduct regular security training and awareness?' },
            { id: 'gen_4', text: 'Are incident response and breach notification procedures defined?' },
            { id: 'gen_5', text: 'Is vendor risk management performed for third-party processors?' },
          ];
          setQuestions(generic);
          setGenericSeeded(true);
          return;
        }
        setQuestions(qs);
        setGenericSeeded(false);
        if (qs.length === 0) setLoadError(`No questions found for framework "${framework}".`);
      } catch (e) {
        if (framework === 'OTHER') {
          // Fallback to generic set on error for OTHER
          const generic: QItem[] = [
            { id: 'gen_1', text: 'Do you have documented policies for data handling and retention?' },
            { id: 'gen_2', text: 'Is there a process for access control and least privilege enforcement?' },
            { id: 'gen_3', text: 'Do you conduct regular security training and awareness?' },
            { id: 'gen_4', text: 'Are incident response and breach notification procedures defined?' },
            { id: 'gen_5', text: 'Is vendor risk management performed for third-party processors?' },
          ];
          setQuestions(generic);
          setLoadError(null);
          setGenericSeeded(true);
        } else {
          setLoadError('Failed to load checklist. Please verify the backend is running and try again.');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [framework, reloadTick]);

  // After questions are loaded, attempt to load saved session state
  useEffect(() => {
    if (questions.length === 0 || loadedState === true) return;
    let cancelled = false;
    (async () => {
      try {
        const state = await apiFetch<any>(`/api/adk/sessions/${encodeURIComponent(sessionId)}/state?org_id=${encodeURIComponent(org)}`);
        if (cancelled) return;
        if (state && Array.isArray(state.answers) && state.answers.length > 0) {
          // Merge answers into questions by id
          setQuestions((prev) => prev.map((it) => {
            const a = state.answers.find((x: any) => x.question_id === it.id || x.id === it.id);
            if (!a) return it;
            return {
              ...it,
              userAnswer: a.answer ?? a.user_answer ?? it.userAnswer,
              score: typeof a.score === 'number' ? a.score : it.score,
              rationale: a.rationale ?? it.rationale,
            };
          }));
          // Restore index if present
          const idx = Number(state?.progress?.index ?? 0);
          if (!Number.isNaN(idx)) setCurrentIndex(Math.max(0, Math.min(idx, questions.length - 1)));
        }
      } catch {}
      finally {
        if (!cancelled) setLoadedState(true);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions.length, sessionId, org]);

  // Debounced autosave of session state when questions or index change
  useEffect(() => {
    if (questions.length === 0) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const answers = questions.map((it) => ({
        question_id: it.id,
        question: it.text,
        answer: it.userAnswer || '',
        score: typeof it.score === 'number' ? it.score : undefined,
        rationale: it.rationale || undefined,
        updated_at: new Date().toISOString(),
      }));
      const progress = { answered: answers.filter((a) => a.answer && a.answer.length > 0).length, total: questions.length, index: currentIndex };
      const body = { session_id: sessionId, org_id: org, framework, answers, progress };
      apiFetch(`/api/adk/sessions/${encodeURIComponent(sessionId)}/state`, { method: 'POST', body: JSON.stringify(body) }).catch(() => {});
    }, 600);
    return () => clearTimeout(saveTimer.current);
  }, [questions, currentIndex, sessionId, org, framework]);

  // Upload supporting evidence
  const onUploadEvidence = async (file: File) => {
    try {
      setUploading(true);
      const fd = new FormData();
      fd.append('file', file);
      // Use raw fetch to preserve FormData headers
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken?.();
      const orgId = typeof window !== 'undefined' ? window.localStorage.getItem('org_id') || undefined : undefined;
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: fd,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(orgId ? { 'X-Org-Id': orgId } : {}),
        },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setEvidencePath(String(data.path || ''));
      // Automatically index the uploaded document so scoring uses policy content
      try {
        await apiFetch('/api/adk/index', {
          method: 'POST',
          body: JSON.stringify({ files: [String(data.path || '')] }),
        });
        toast.success('Evidence uploaded and indexed');
        // Auto-generate checklist from document and then auto-score
        try {
          await generateFromDocument(!!autoScoreAfterGen);
        } catch {}
      } catch (e) {
        toast.message('Uploaded, but indexing failed');
      }
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

  // Generate checklist from uploaded document (POSH or any policy)
  const generateFromDocument = async (autoScoreNext: boolean = false) => {
    if (!evidencePath) {
      toast.error('Please upload a document first');
      return;
    }
    setGeneratingChecklist(true);
    try {
      const body = { framework, files: [evidencePath], top_n: 10 };
      const res = await apiFetch<{ framework: string; version: string; items: any[] }>(
        '/api/adk/checklist/generate',
        { method: 'POST', body: JSON.stringify(body) }
      );
      const items = Array.isArray(res.items) ? res.items : [];
      const qs: QItem[] = items.map((it: any, idx: number) => ({ id: it.id || `gq-${idx}`, text: it.question || it.text || '' }));
      if (qs.length === 0) {
        toast.error('No checklist items generated from the document');
      } else {
        setQuestions(qs);
        setCurrentIndex(0);
        setGenericSeeded(false);
        toast.success(`Generated ${qs.length} checklist items from document`);
        if (autoScoreNext) {
          try {
            await batchScoreAll(qs);
          } catch {}
        }
      }
    } catch (e: any) {
      toast.error('Checklist generation failed');
    } finally {
      setGeneratingChecklist(false);
    }
  };

  // Batch score all questions using LLM with empty user_answer (auto mode)
  const batchScoreAll = async (qs?: QItem[]) => {
    const base = qs && qs.length ? qs : questions;
    if (!base.length) return;
    try {
      const items = base.map((it) => ({ question: it.text, user_answer: it.userAnswer || '' }));
      const resp = await apiFetch<any>(
        '/api/adk/score/batch',
        { method: 'POST', body: JSON.stringify({ session_id: sessionId, org_id: org, framework, items }) }
      );
      const byQ: Record<string, any> = {};
      (resp.items || []).forEach((it: any) => { if (it?.question) byQ[String(it.question)] = it; });
      const merged = base.map((q) => {
        const r = byQ[q.text];
        if (!r) return q;
        return {
          ...q,
          // Mark as auto-answered to enable downstream flows like export if desired
          userAnswer: (q.userAnswer && q.userAnswer.length > 0) ? q.userAnswer : '(auto)',
          score: typeof r.score === 'number' ? r.score : q.score,
          rationale: typeof r.rationale === 'string' && r.rationale.length > 0 ? r.rationale : q.rationale,
          clauses: Array.isArray(r.clauses) ? r.clauses : q.clauses,
          provider: r.llm_provider || q.provider,
          model: r.llm_model || q.model,
        } as QItem;
      });
      setQuestions(merged);
      toast.success('Auto-scored generated checklist');
    } catch (e) {
      toast.message('Auto scoring failed');
    }
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
        const pdf = rep.pdf_gcs || (rep.pdf_path ? `/api/files?path=${encodeURIComponent(rep.pdf_path)}&org_id=${encodeURIComponent(org)}&session_id=${encodeURIComponent(sessionId)}` : '');
        const json = rep.json_gcs || (rep.json_path ? `/api/files?path=${encodeURIComponent(rep.json_path)}&org_id=${encodeURIComponent(org)}&session_id=${encodeURIComponent(sessionId)}` : '');
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

      const auth2 = getAuth();
      const token2 = await auth2.currentUser?.getIdToken?.();
      const orgId2 = typeof window !== 'undefined' ? window.localStorage.getItem('org_id') || undefined : undefined;
      const res = await fetch('/api/adk/score/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token2 ? { Authorization: `Bearer ${token2}` } : {}),
          ...(orgId2 ? { 'X-Org-Id': orgId2 } : {}),
        },
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
          const pdf = rep.pdf_gcs || (rep.pdf_path ? `/api/files?path=${encodeURIComponent(rep.pdf_path)}` : '');
          const json = rep.json_gcs || (rep.json_path ? `/api/files?path=${encodeURIComponent(rep.json_path)}` : '');
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
      <h1 className="text-2xl font-semibold">Audit Session</h1>
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span className="px-2 py-0.5 rounded-md border bg-background">Framework: <span className="font-medium">{framework}</span></span>
        <span className="px-2 py-0.5 rounded-md border bg-background">Org: <span className="font-medium">{org}</span></span>
        <span className="px-2 py-0.5 rounded-md border bg-background">Session: <span className="font-mono">{sessionId}</span></span>
      </div>
      {genericSeeded && (
        <div className="rounded-md border p-3 bg-muted/30 text-sm">
          Using a generic checklist because the selected framework returned no items. You can proceed, or upload documents to improve coverage.
        </div>
      )}
      {!genericSeeded && (
        <div className="rounded-md border p-3 bg-muted/30 text-sm">
          {frameworkIntro}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Question card */}
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
              {evidencePath && (
                <div className="mt-3">
                  <Button size="sm" onClick={() => generateFromDocument(!!autoScoreAfterGen)} disabled={generatingChecklist}>
                    {generatingChecklist ? 'Generating…' : 'Generate Checklist from Document'}
                  </Button>
                </div>
              )}
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
              disabled={!allAnswered}
              disabledReason={`Please answer all questions before exporting (${answeredCount}/${totalCount} answered).`}
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
          <div className="mt-2">
            <BatchScoring
              sessionId={sessionId}
              orgId={org}
              framework={framework}
              className="w-full"
              buildItems={() =>
                questions
                  .filter((it) => (it.userAnswer || '').trim().length > 0)
                  .map((it) => ({ question: it.text, user_answer: it.userAnswer || '' }))
              }
              onResult={async (res) => {
                try {
                  const byQ: Record<string, any> = {};
                  (res.items || []).forEach((it: any) => { if (it?.question) byQ[String(it.question)] = it; });
                  const merged = questions.map((q) => {
                    const r = byQ[q.text];
                    if (!r) return q;
                    return {
                      ...q,
                      score: typeof r.score === 'number' ? r.score : q.score,
                      rationale: typeof r.rationale === 'string' && r.rationale.length > 0 ? r.rationale : q.rationale,
                      clauses: Array.isArray(r.clauses) ? r.clauses : q.clauses,
                      provider: r.llm_provider || q.provider,
                      model: r.llm_model || q.model,
                    };
                  });
                  setQuestions(merged);
                  const answered = merged.filter((it) => (it.userAnswer || '').trim().length > 0).length;
                  const total = merged.length;
                  const allAns = total > 0 && answered >= total;
                  if (autoExportAfterBatch && allAns) {
                    toast.message('Exporting report…');
                    const items = merged.map((it) => ({
                      question: it.text,
                      user_answer: it.userAnswer || '',
                      score: Math.round((it.score ?? 0) as number),
                      rationale: it.rationale || '',
                      llm_provider: it.provider || 'unknown',
                      llm_model: it.model || 'unknown',
                      clauses: it.clauses || [],
                    }));
                    try {
                      const rep = await apiFetch<{ pdf_gcs?: string; json_gcs?: string; pdf_path?: string; json_path?: string }>(
                        '/api/adk/report',
                        { method: 'POST', body: JSON.stringify({ session_id: sessionId, org_id: org, items }) }
                      );
                      const pdf = rep.pdf_gcs || (rep.pdf_path ? `/api/files?path=${encodeURIComponent(rep.pdf_path)}&org_id=${encodeURIComponent(org)}&session_id=${encodeURIComponent(sessionId)}` : '');
                      const json = rep.json_gcs || (rep.json_path ? `/api/files?path=${encodeURIComponent(rep.json_path)}&org_id=${encodeURIComponent(org)}&session_id=${encodeURIComponent(sessionId)}` : '');
                      const qp = new URLSearchParams({ pdf_url: String(pdf), json_url: String(json) }).toString();
                      const url = `/report/${encodeURIComponent(sessionId)}?${qp}`;
                      try { if (typeof window !== 'undefined') localStorage.setItem('lastReportUrl', url); } catch {}
                      toast.success('Report generated');
                      router.push(url);
                    } catch {
                      toast.error('Failed to generate report');
                    }
                  }
                } catch {}
              }}
            />
            <GapAnalysis
              className="mt-3"
              buildItems={() =>
                questions
                  .filter((it) => (it.userAnswer || '').trim().length > 0)
                  .map((it) => ({
                    question: it.text,
                    user_answer: it.userAnswer || '',
                    score: typeof it.score === 'number' ? it.score : 0,
                    rationale: it.rationale || '',
                    llm_provider: it.provider || 'unknown',
                    llm_model: it.model || 'unknown',
                    clauses: it.clauses || [],
                  }))
              }
              onResult={(res) => setGapsResult(res)}
            />
            <div className="mt-2 flex items-center gap-2">
              <input id="auto-export" type="checkbox" className="h-4 w-4" checked={autoExportAfterBatch} onChange={(e) => setAutoExportAfterBatch(e.target.checked)} />
              <label htmlFor="auto-export" className="text-sm text-muted-foreground">Auto-export report after batch scoring when all answers are filled</label>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input id="auto-score-gen" type="checkbox" className="h-4 w-4" checked={autoScoreAfterGen} onChange={(e) => setAutoScoreAfterGen(e.target.checked)} />
              <label htmlFor="auto-score-gen" className="text-sm text-muted-foreground">Auto-score generated checklist with LLM</label>
            </div>
            <AgentPanel
              className="mt-3"
              sessionId={sessionId}
              orgId={org}
              framework={framework}
              questions={questions}
              evidencePath={evidencePath}
            />
            <PolicyAnnotation
              className="mt-3"
              sessionId={sessionId}
              orgId={org}
              evidencePath={evidencePath}
              gaps={gapsResult}
            />
            <AgentHistory
              className="mt-3"
              sessionId={sessionId}
              orgId={org}
            />
          </div>
        </div>
      </div>
    </div>
    </AuthGate>
  );
}
