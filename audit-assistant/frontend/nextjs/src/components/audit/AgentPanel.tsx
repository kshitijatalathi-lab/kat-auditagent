"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export type AgentPanelProps = {
  sessionId: string;
  orgId: string;
  framework: string;
  questions: Array<{ id: string; text: string; userAnswer?: string; score?: number; rationale?: string; clauses?: any[]; provider?: string; model?: string }>;
  evidencePath?: string;
  className?: string;
};

export function AgentPanel({ sessionId, orgId, framework, questions, evidencePath, className }: AgentPanelProps) {
  const [planning, setPlanning] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [planOutput, setPlanOutput] = useState<string>("");
  const [k, setK] = useState<number>(5);
  const [prefer, setPrefer] = useState<string>('auto');
  const [idxStats, setIdxStats] = useState<{ exists: boolean; count: number; updated_at?: string } | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [streamScore, setStreamScore] = useState<number | null>(null);
  const [streamModel, setStreamModel] = useState<string>("");
  const [streamClauses, setStreamClauses] = useState<any[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  type PlanStep = { tool: string; args?: any; status?: 'pending'|'running'|'done'|'error'; result?: any; error?: string };
  const [planSteps, setPlanSteps] = useState<PlanStep[]>([]);
  // Auto-run Auto Audit toggle and tracking
  const [autoRunAudit, setAutoRunAudit] = useState<boolean>(false);
  const lastAutoRanForPath = useRef<string | null>(null);

  // Providers health (compact widget)
  const [providersHealth, setProvidersHealth] = useState<any | null>(null);
  const [providersLoading, setProvidersLoading] = useState(false);
  const loadProvidersHealth = async () => {
    setProvidersLoading(true);
    try {
      const res = await fetch('/api/ai/providers/health');
      if (res.ok) setProvidersHealth(await res.json());
    } catch {
      // ignore
    } finally {
      setProvidersLoading(false);
    }
  };

  const answered = useMemo(() => questions.filter(q => (q.userAnswer || "").trim().length > 0), [questions]);

  useEffect(() => {
    // Fetch index stats for retriever visibility
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/adk/index/stats');
        if (res.ok) {
          const json = await res.json();
          setIdxStats(json);
        }
      } catch {
        // ignore
      }
    };
    fetchStats();
  }, []);

  // Auto-run Auto Audit when evidencePath appears and toggle is on
  useEffect(() => {
    const path = evidencePath || '';
    if (!autoRunAudit) return;
    if (!path || path.trim().length === 0) return;
    if (lastAutoRanForPath.current === path) return;
    if (executing) return;
    // Trigger auto audit
    const policyType = (framework || '').toLowerCase();
    runAgent('auto_audit', { file_path: path, org_id: orgId, policy_type: policyType, top_k: k })
      .then(() => { lastAutoRanForPath.current = path; })
      .catch(() => { /* feedback already shown via toast */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evidencePath, autoRunAudit, k, framework, orgId, executing]);

  const runAgent = async (tool: string, args: any) => {
    setExecuting(true);
    try {
      const argsWithPrefer = (prefer && prefer !== 'auto') ? { ...args, prefer } : args;
      const res = await fetch('/api/ai/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool, args: argsWithPrefer })
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || 'Agent run failed');
      toast.success(`${tool} completed`);
      setPlanOutput(JSON.stringify(json.result || json, null, 2));
      // persist agent run into session state meta.agent_runs
      try { await persistAgentRun(tool, args, json.result || json); } catch {}
    } catch (e: any) {
      toast.error(e?.message || 'Agent error');
    } finally {
      setExecuting(false);
    }
  };

  const onPlan = async () => {
    setPlanning(true);
    try {
      const messages = [
        { role: 'user', content: `We are auditing framework ${framework}. Session ${sessionId}, Org ${orgId}. We have ${answered.length} answered items.` }
      ];
      const res = await fetch('/api/ai/agent/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, org_id: orgId, user_id: 'agent-ui', messages, tools: ['index_documents','score_question','compute_gaps','generate_report','auto_audit'], execute: false })
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || 'Planner failed');
      const pretty = JSON.stringify(json.result, null, 2);
      setPlanOutput(pretty);
      try { parsePlanToSteps(pretty); } catch {}
      toast.message('Plan ready');
    } catch (e: any) {
      toast.error(e?.message || 'Plan error');
    } finally {
      setPlanning(false);
    }
  };

  const onExecutePlan = async () => {
    try {
      const parsed = JSON.parse(planOutput || '{}');
      // Accept either { plan: {tool,args} } or { tool, args }
      const candidate = parsed.plan ? parsed.plan : parsed;
      // Support single step or array of steps [{tool,args},...]
      const steps = Array.isArray(candidate) ? candidate : (candidate.tool ? [candidate] : (candidate.steps || []));
      if (!steps || steps.length === 0) throw new Error('No steps found in plan');
      // reflect into UI
      const initial: PlanStep[] = steps.map((s: any) => ({ tool: s.tool, args: s.args || {}, status: 'pending' }));
      setPlanSteps(initial);
      for (let i = 0; i < initial.length; i++) {
        const step = initial[i];
        try {
          setPlanSteps(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'running', error: undefined } : p));
          // Validate step args before executing
          const errs = validateToolArgs(step.tool, step.args || {});
          if (errs.length) {
            const msg = `Invalid args: ${errs.join('; ')}`;
            setPlanSteps(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'error', error: msg } : p));
            toast.error(msg);
            continue;
          }
          const res = await runAgentReturn(step.tool, step.args || {});
          setPlanSteps(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'done', result: res } : p));
        } catch (e: any) {
          const msg = e?.message || 'step failed';
          setPlanSteps(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'error', error: msg } : p));
          // continue to next step or break? choose continue to maximize progress
        }
      }
    } catch (e: any) {
      toast.error(e?.message || 'Invalid plan JSON');
    }
  };

  // helper that returns result for plan step execution
  const runAgentReturn = async (tool: string, args: any) => {
    const argsWithPrefer = (prefer && prefer !== 'auto') ? { ...args, prefer } : args;
    const res = await fetch('/api/ai/agent/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool, args: argsWithPrefer })
    });
    const json = await res.json();
    if (!res.ok || json.ok === false) throw new Error(json.error || 'Agent run failed');
    try { await persistAgentRun(tool, argsWithPrefer, json.result || json); } catch {}
    return json.result || json;
  };

  const parsePlanToSteps = (text: string) => {
    try {
      const parsed = JSON.parse(text || '{}');
      const candidate = parsed.plan ? parsed.plan : parsed;
      const steps = Array.isArray(candidate) ? candidate : (candidate.tool ? [candidate] : (candidate.steps || []));
      if (Array.isArray(steps)) {
        setPlanSteps(steps.map((s: any) => ({ tool: s.tool, args: s.args || {}, status: 'pending' })));
      }
    } catch {
      setPlanSteps([]);
    }
  };

  const streamScoreOne = async () => {
    if (streaming) return;
    const q = answered[0];
    if (!q) { toast.error('No answered question'); return; }
    setStreaming(true);
    setStreamText("");
    setStreamClauses([]);
    setStreamScore(null);
    setStreamModel("");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const payload: any = { session_id: sessionId, org_id: orgId, user_id: 'agent-ui', checklist_question: q.text, user_answer: q.userAnswer, k, framework };
      if (prefer && prefer !== 'auto') payload.prefer = prefer;
      const body = JSON.stringify(payload);
      const resp = await fetch('/api/adk/score/stream', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: controller.signal });
      if (!resp.ok || !resp.body) throw new Error('stream start failed');
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split(/\n/);
        buf = lines.pop() || '';
        for (const line of lines) {
          const s = line.trim();
          if (!s.startsWith('data:')) continue;
          const payload = s.slice('data:'.length).trim();
          if (payload === '[DONE]') { setStreaming(false); return; }
          try {
            const evt = JSON.parse(payload);
            if (evt.type === 'clauses') setStreamClauses(evt.clauses || []);
            else if (evt.type === 'rationale') setStreamText(prev => prev + (evt.delta || ''));
            else if (evt.type === 'final') {
              setStreamScore(typeof evt.score === 'number' ? evt.score : null);
              const model = [evt.llm_provider, evt.llm_model].filter(Boolean).join('/');
              setStreamModel(model);
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') toast.error(e?.message || 'Stream error');
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const cancelStream = () => {
    try { abortRef.current?.abort(); } catch {}
  };

  const persistAgentRun = async (tool: string, args: any, output: any) => {
    try {
      const qs = new URLSearchParams({ org_id: orgId });
      const getRes = await fetch(`/api/adk/sessions/${encodeURIComponent(sessionId)}/state?${qs.toString()}`);
      const state = getRes.ok ? await getRes.json() : { session_id: sessionId, org_id: orgId, answers: [], meta: {} };
      const meta = state.meta || {};
      const runs = Array.isArray(meta.agent_runs) ? meta.agent_runs : [];
      runs.push({ ts: new Date().toISOString(), tool, args, output });
      const next = { ...state, meta: { ...meta, agent_runs: runs } };
      await fetch(`/api/adk/sessions/${encodeURIComponent(sessionId)}/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
    } catch {
      // non-fatal
    }
  };

  return (
    <div className={"rounded-lg border p-4 bg-card space-y-3 " + (className || '')}>
      <div className="text-sm font-medium">Agent Panel</div>

      {/* Index stats */}
      <div className="text-xs text-muted-foreground">
        Index: {idxStats?.exists ? `${idxStats.count} clauses` : 'not built'}{idxStats?.updated_at ? ` • updated ${idxStats.updated_at}` : ''}
      </div>

      {/* Providers Health (compact) */}
      <div className="rounded-md border p-2 bg-background">
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">Providers Health</div>
          <Button size="sm" variant="ghost" disabled={providersLoading} onClick={loadProvidersHealth}>{providersLoading ? 'Loading…' : 'Refresh'}</Button>
        </div>
        {/* Preferred provider selector */}
        <div className="mt-2 flex items-center gap-2">
          <div className="text-xs text-muted-foreground">Preferred LLM:</div>
          <select className="border rounded px-2 py-1 text-xs bg-background" value={prefer} onChange={e => setPrefer(e.target.value)}>
            <option value="auto">Auto</option>
            <option value="openai">OpenAI</option>
            <option value="groq">Groq</option>
            <option value="gemini">Gemini</option>
          </select>
        </div>
        {/* Auto-run toggle */}
        <div className="mt-2 flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={autoRunAudit} onChange={e => setAutoRunAudit(e.target.checked)} />
            <span className="text-muted-foreground">Auto-run Auto Audit on upload</span>
          </label>
        </div>
        {providersHealth ? (
          <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
            <div className="rounded border p-2">
              <div className="flex items-center justify-between"><span>Groq</span><span className={providersHealth.groq_available ? 'text-green-600' : 'text-red-600'}>{providersHealth.groq_available ? 'Up' : 'Down'}</span></div>
              <div className="text-muted-foreground truncate">{providersHealth.groq_model || '-'}</div>
            </div>
            <div className="rounded border p-2">
              <div className="flex items-center justify-between"><span>OpenAI</span><span className={providersHealth.openai_available ? 'text-green-600' : 'text-red-600'}>{providersHealth.openai_available ? 'Up' : 'Down'}</span></div>
              <div className="text-muted-foreground truncate">{providersHealth.openai_model || '-'}</div>
            </div>
            <div className="rounded border p-2">
              <div className="flex items-center justify-between"><span>Gemini</span><span className={providersHealth.gemini_available ? 'text-green-600' : 'text-red-600'}>{providersHealth.gemini_available ? 'Up' : 'Down'}</span></div>
              <div className="text-muted-foreground truncate">{providersHealth.gemini_model || '-'}</div>
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground mt-1">Click Refresh to load status.</div>
        )}
      </div>

      {/* Agent Roles (visual) */}
      <div className="rounded-md border p-2 bg-background">
        <div className="text-xs text-muted-foreground mb-1">Agents in Workflow</div>
        <ul className="text-xs list-disc pl-5 space-y-1">
          <li><span className="font-medium">RetrieverAgent</span>: builds and queries clause index from uploaded policy + India corpus.</li>
          <li><span className="font-medium">PromptBuilderAgent</span>: crafts scoring prompts with question, answer, and retrieved clauses.</li>
          <li><span className="font-medium">ScorerAgent</span>: calls LLM via MCP router and returns score, rationale, and citations.</li>
          <li><span className="font-medium">ReportGeneratorAgent</span>: compiles results into JSON and PDF report.</li>
          <li><span className="font-medium">PolicyAuditPipeline</span>: orchestrates end-to-end Auto Audit.</li>
        </ul>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" disabled={executing || !evidencePath} onClick={() => runAgent('index_documents', { files: evidencePath ? [evidencePath] : [] })}>Index Evidence</Button>
        <div className="flex items-center gap-2">
          <Input type="number" value={k} min={1} max={10} className="w-16" onChange={e => setK(parseInt(e.target.value || '5', 10))} />
          <Button variant="outline" disabled={executing || answered.length === 0} onClick={() => {
            const q = answered[0];
            runAgent('score_question', { session_id: sessionId, org_id: orgId, framework, checklist_question: q.text, user_answer: q.userAnswer, k });
          }}>Score 1Q</Button>
        </div>
        <Button variant="outline" disabled={executing || answered.length === 0} onClick={() => runAgent('compute_gaps', { scored_items: answered.map(a => ({ question: a.text, user_answer: a.userAnswer, score: a.score, rationale: a.rationale, clauses: a.clauses })) })}>Compute Gaps</Button>
        <Button variant="outline" disabled={executing || answered.length === 0} onClick={() => runAgent('generate_report', { session_id: sessionId, org_id: orgId, items: answered.map(a => ({ question: a.text, user_answer: a.userAnswer, score: a.score || 0, rationale: a.rationale || '', clauses: a.clauses || [], llm_provider: a.provider || 'unknown', llm_model: a.model || 'unknown' })) })}>Generate Report</Button>
        <Button variant="default" disabled={executing || !evidencePath} onClick={() => {
          // One-click end-to-end audit grounded on India corpus + uploaded policy
          // Map current framework to a policy_type hint (lowercased)
          const policyType = (framework || '').toLowerCase();
          runAgent('auto_audit', { file_path: evidencePath, org_id: orgId, policy_type: policyType, top_k: k });
        }}>Auto Audit</Button>
        <Button variant="ghost" disabled={executing} onClick={async () => {
          // Refresh index stats
          try { const r = await fetch('/api/adk/index/stats'); if (r.ok) setIdxStats(await r.json()); } catch {}
        }}>Refresh Index Stats</Button>
        <Button variant="ghost" disabled={executing || !evidencePath} onClick={async () => {
          // Reindex (alias to index_documents) and then refresh stats
          await runAgent('index_documents', { files: evidencePath ? [evidencePath] : [] });
          try { const r = await fetch('/api/adk/index/stats'); if (r.ok) setIdxStats(await r.json()); } catch {}
        }}>Reindex</Button>
      </div>

      {/* Streaming scoring inside panel */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" disabled={streaming || answered.length === 0} onClick={streamScoreOne}>Stream Score 1Q</Button>
          <Button size="sm" variant="ghost" disabled={!streaming} onClick={cancelStream}>Cancel</Button>
          {streamScore !== null ? <div className="text-xs">Score: <span className="font-medium">{streamScore}</span> {streamModel ? <span className="text-muted-foreground">({streamModel})</span> : null}</div> : null}
        </div>
        {streamClauses?.length ? (
          <div className="rounded-md border p-2 text-xs max-h-24 overflow-auto bg-background">
            {streamClauses.map((c: any, i: number) => (
              <div key={i} className="truncate">[{c.law}.{c.article}#{c.clause_id}] {c.title || ''}</div>
            ))}
          </div>
        ) : null}
        <Textarea className="w-full h-28 font-mono text-xs" value={streamText} onChange={() => {}} placeholder="Streaming rationale will appear here" />
      </div>

      {/* Planning and plan execution */}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={onPlan} disabled={planning}>Plan</Button>
        <Button size="sm" variant="secondary" onClick={onExecutePlan} disabled={!planOutput || executing}>Execute Plan</Button>
      </div>
      <div>
        <Textarea className="w-full h-48 font-mono text-xs" value={planOutput} onChange={e => { setPlanOutput(e.target.value); parsePlanToSteps(e.target.value); }} placeholder="Agent plans / results will appear here" />
      </div>
      {planSteps.length > 0 && (
        <div className="rounded-md border p-2 bg-background">
          <div className="text-xs text-muted-foreground mb-2">Plan Steps</div>
          <div className="space-y-2">
            {planSteps.map((s, i) => (
              <div key={i} className="text-xs flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div><span className="font-medium">{s.tool}</span> <span className="text-muted-foreground">{s.status ? `(${s.status})` : ''}</span></div>
                  {s.error && <div className="text-red-600">{s.error}</div>}
                  {s.result && <pre className="mt-1 p-1 bg-card overflow-auto max-h-24">{JSON.stringify(s.result, null, 2)}</pre>}
                </div>
                <div>
                  <Button size="sm" variant="ghost" onClick={async () => {
                    try {
                      setPlanSteps(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'running', error: undefined } : p));
                      const errs = validateToolArgs(s.tool, s.args || {});
                      if (errs.length) {
                        const msg = `Invalid args: ${errs.join('; ')}`;
                        setPlanSteps(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'error', error: msg } : p));
                        toast.error(msg);
                        return;
                      }
                      const out = await runAgentReturn(s.tool, s.args || {});
                      setPlanSteps(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'done', result: out } : p));
                    } catch (e: any) {
                      const msg = e?.message || 'step failed';
                      setPlanSteps(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'error', error: msg } : p));
                    }
                  }}>Run</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Simple validator for known tools to prevent bad backend calls
function validateToolArgs(tool: string, args: any): string[] {
  const errs: string[] = [];
  const isNonEmptyStr = (v: any) => typeof v === 'string' && v.trim().length > 0;
  switch (tool) {
    case 'index_documents': {
      const files = Array.isArray(args?.files) ? args.files : [];
      if (!files.length) errs.push('files[] is required');
      break;
    }
    case 'score_question': {
      if (!isNonEmptyStr(args?.session_id)) errs.push('session_id is required');
      if (!isNonEmptyStr(args?.org_id)) errs.push('org_id is required');
      if (!isNonEmptyStr(args?.framework)) errs.push('framework is required');
      if (!isNonEmptyStr(args?.checklist_question)) errs.push('checklist_question is required');
      if (typeof args?.user_answer !== 'string') errs.push('user_answer must be a string (can be empty for auto)');
      if (typeof args?.k !== 'number') errs.push('k must be a number');
      break;
    }
    case 'compute_gaps': {
      const items = Array.isArray(args?.scored_items) ? args.scored_items : [];
      if (!items.length) errs.push('scored_items[] is required');
      break;
    }
    case 'generate_report': {
      if (!isNonEmptyStr(args?.session_id)) errs.push('session_id is required');
      if (!isNonEmptyStr(args?.org_id)) errs.push('org_id is required');
      const items = Array.isArray(args?.items) ? args.items : [];
      if (!items.length) errs.push('items[] is required');
      break;
    }
    case 'auto_audit': {
      if (!isNonEmptyStr(args?.file_path)) errs.push('file_path is required');
      if (!isNonEmptyStr(args?.org_id)) errs.push('org_id is required');
      if (args?.top_k !== undefined && typeof args.top_k !== 'number') errs.push('top_k must be a number');
      break;
    }
    default:
      // Unknown tool: no strict validation
      break;
  }
  return errs;
}
