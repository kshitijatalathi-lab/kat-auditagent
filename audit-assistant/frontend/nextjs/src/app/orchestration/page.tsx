"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Timeline, type TimelineItem } from "@/components/Timeline";
import { AgentGraph, type GraphData } from "@/components/AgentGraph";

export default function OrchestrationPage() {
  const [registry, setRegistry] = useState<any | null>(null);
  const [tools, setTools] = useState<any | null>(null);
  const [providers, setProviders] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [orgId, setOrgId] = useState("default_org");
  const [framework, setFramework] = useState("GDPR");
  const [sessionId, setSessionId] = useState(() => `sess-${Math.random().toString(36).slice(2,10)}`);
  const [prefer, setPrefer] = useState("auto");
  const [k, setK] = useState(5);
  const [filePath, setFilePath] = useState("");
  const [log, setLog] = useState<string>("");
  const [events, setEvents] = useState<TimelineItem[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [plannerMsg, setPlannerMsg] = useState<string>("Please audit the uploaded policy end-to-end.");
  const [selectedTools, setSelectedTools] = useState<string[]>(["auto_audit", "index_documents", "score_question", "compute_gaps", "generate_report"]);
  const [executingPlanner, setExecutingPlanner] = useState(false);
  const [jobId, setJobId] = useState<string>("");
  const [jobStreaming, setJobStreaming] = useState(false);
  const [agentGraph, setAgentGraph] = useState<any | null>(null);
  const [agentStatus, setAgentStatus] = useState<any | null>(null);
  const [graphStatuses, setGraphStatuses] = useState<Record<string, "idle"|"running"|"done"|"error">>({});
  const lastNodeRef = useRef<string | null>(null);

  const resolveNodeId = (stage: string): string => {
    if (!agentGraph) return stage;
    const nodes: any[] = agentGraph.nodes || [];
    // exact id match
    if (nodes.find(n => n.id === stage)) return stage;
    // label case-insensitive match
    const byLabel = nodes.find(n => String(n.label||'').toLowerCase() === String(stage).toLowerCase());
    if (byLabel) return byLabel.id;
    // substring contains
    const contains = nodes.find(n => String(n.id).toLowerCase().includes(String(stage).toLowerCase()));
    if (contains) return contains.id;
    return stage; // fallback
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [r1, r2, r3, r4, r5] = await Promise.all([
          fetch('/api/ai/agents/registry'),
          fetch('/api/ai/tools/catalog'),
          fetch('/api/ai/providers/health'),
          fetch('/api/ai/agents/graph'),
          fetch('/api/ai/agents/status'),
        ]);
        if (r1.ok) setRegistry(await r1.json());
        if (r2.ok) setTools(await r2.json());
        if (r3.ok) setProviders(await r3.json());
        if (r4.ok) setAgentGraph(await r4.json());
        if (r5.ok) setAgentStatus(await r5.json());
      } catch {}
    };
    load();
  }, []);

  const pushEvent = (e: TimelineItem) => setEvents(prev => [{...e, id: e.id || Math.random().toString(36).slice(2)}, ...prev].slice(0, 500));

  const startJob = async () => {
    if (!filePath.trim()) { alert('Enter file_path'); return; }
    try {
      const payload: any = { file_path: filePath, org_id: orgId, policy_type: framework.toLowerCase(), top_k: k };
      if (prefer && prefer !== 'auto') payload.prefer = prefer;
      const res = await fetch('/api/adk/policy/audit/job', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'failed to start job');
      setJobId(json.job_id);
      setLog(prev => prev + `\n$ job start -> ${json.job_id}\n`);
      pushEvent({ id: 'job-start', type: 'job', title: `Job started`, detail: { job_id: json.job_id } });
    } catch (e:any) {
      setLog(prev => prev + `\n$ job start -> ERROR: ${e?.message || 'failed'}\n`);
      pushEvent({ id: 'job-start-error', type: 'error', title: 'Job start failed', detail: e?.message || 'failed' });
    }
  };

  const streamJob = () => {
    if (!jobId) { alert('Start a job first'); return; }
    if (jobStreaming) return;
    setJobStreaming(true);
    // reset statuses when a new stream starts
    setGraphStatuses({});
    lastNodeRef.current = null;
    const es = new EventSource(`/api/adk/policy/audit/job/${jobId}/stream`);
    setLog(prev => prev + `\n$ job stream(${jobId}) starting...\n`);
    pushEvent({ id: 'job-stream-start', type: 'job', title: `Streaming job ${jobId}...` });
    es.onmessage = (ev) => {
      if (!ev.data) return;
      if (ev.data === '[DONE]') {
        setLog(prev => prev + `\n[job ${jobId}] DONE\n`);
        es.close();
        setJobStreaming(false);
        pushEvent({ id: 'job-done', type: 'job', title: `Job ${jobId} done` });
        // mark last running node as done
        setGraphStatuses(prev => {
          const p = { ...prev };
          if (lastNodeRef.current) p[lastNodeRef.current] = 'done';
          return p;
        });
        return;
      }
      try {
        const obj = JSON.parse(ev.data);
        const stage = obj.stage || 'event';
        setLog(prev => prev + `\n[job ${jobId}] [${stage}] ${JSON.stringify(obj.data)}\n`);
        pushEvent({ id: `job-${stage}`, type: stage, title: `Job ${stage}`, detail: obj.data });
        // resolve stage to node id and update node + edge statuses
        const nodeId = resolveNodeId(stage);
        setGraphStatuses(prev => {
          const next = { ...prev };
          const prevNode = lastNodeRef.current;
          if (prevNode && prevNode !== nodeId && next[prevNode] === 'running') {
            next[prevNode] = 'done';
            // mark edge prev->current as done
            const edgeKey = `${prevNode}->${nodeId}`;
            next[edgeKey] = 'done';
          }
          if (nodeId) {
            next[nodeId] = 'running';
            // mark edge from prev to current as running if present
            if (prevNode) {
              const edgeKeyRun = `${prevNode}->${nodeId}`;
              next[edgeKeyRun] = 'running';
            }
          }
          lastNodeRef.current = nodeId;
          return next;
        });
      } catch {
        setLog(prev => prev + `\n[job ${jobId}] ${ev.data}\n`);
        pushEvent({ id: 'job-stream-msg', type: 'job', title: `Job message`, detail: ev.data });
      }
    };
    es.onerror = () => {
      setLog(prev => prev + `\n[job ${jobId}] stream error/closed\n`);
      es.close();
      setJobStreaming(false);
      pushEvent({ id: 'job-stream-error', type: 'error', title: `Job ${jobId} stream error/closed` });
      // mark current stage as error
      setGraphStatuses(prev => {
        const p = { ...prev };
        if (lastNodeRef.current) p[lastNodeRef.current] = 'error';
        return p;
      });
    };
  };

  const checkJobStatus = async () => {
    if (!jobId) { alert('Start a job first'); return; }
    const res = await fetch(`/api/adk/policy/audit/job/${jobId}/status`);
    const json = await res.json();
    setLog(prev => prev + `\n$ job status(${jobId}) -> ${JSON.stringify(json)}\n`);
    pushEvent({ id: 'job-status', type: 'job', title: `Job status`, detail: json });
  };

  const cancelJob = async () => {
    if (!jobId) { alert('Start a job first'); return; }
    const res = await fetch(`/api/adk/policy/audit/job/${jobId}/cancel`, { method: 'POST' });
    const json = await res.json();
    setLog(prev => prev + `\n$ job cancel(${jobId}) -> ${JSON.stringify(json)}\n`);
    pushEvent({ id: 'job-cancel', type: 'job', title: `Job cancel`, detail: json });
  };

  const toggleTool = (t: string) => {
    setSelectedTools(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  const runPlanner = async (execute: boolean) => {
    setExecutingPlanner(true);
    try {
      const payload: any = {
        session_id: sessionId,
        org_id: orgId,
        user_id: 'ui',
        messages: [{ role: 'user', content: plannerMsg }],
        tools: selectedTools,
        execute,
      };
      if (prefer && prefer !== 'auto') payload.prefer = prefer;
      const res = await fetch('/api/ai/agent/openai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || 'planner failed');
      setLog(prev => prev + `\n$ planner(${execute ? 'execute' : 'plan'}) -> OK\n${JSON.stringify(json.result, null, 2)}\n`);
      pushEvent({ id: 'planner', type: execute? 'execute':'plan', title: 'Planner result', detail: json.result });
    } catch (e: any) {
      setLog(prev => prev + `\n$ planner -> ERROR: ${e?.message || 'failed'}\n`);
      pushEvent({ id: 'planner-error', type: 'error', title: 'Planner failed', detail: e?.message || 'failed' });
    } finally {
      setExecutingPlanner(false);
    }
  };
  

  const onRunTool = async (tool: string, args: any) => {
    setLoading(true);
    try {
      const payload = (prefer && prefer !== 'auto') ? { tool, args: { ...args, prefer } } : { tool, args };
      const res = await fetch('/api/ai/agent/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || 'failed');
      setLog(prev => `${prev}\n$ ${tool} -> OK\n${JSON.stringify(json.result || json, null, 2)}\n`);
      pushEvent({ id: `tool-${tool}`, type: 'tool', title: `${tool} complete`, detail: json.result || json });
    } catch (e: any) {
      setLog(prev => `${prev}\n$ ${tool} -> ERROR: ${e?.message || 'failed'}\n`);
      pushEvent({ id: `tool-${tool}-error`, type: 'error', title: `${tool} failed`, detail: e?.message || 'failed' });
    } finally {
      setLoading(false);
    }
  };

  const runAutoAudit = async () => {
    if (!filePath.trim()) { alert('Enter file_path'); return; }
    await onRunTool('auto_audit', { file_path: filePath, org_id: orgId, policy_type: framework.toLowerCase(), top_k: k });
  };

  const runAutoAuditStream = () => {
    if (!filePath.trim()) { alert('Enter file_path'); return; }
    if (streaming) return;
    setStreaming(true);
    setLog(prev => prev + `\n$ auto_audit (stream) starting...\n`);
    const qs = new URLSearchParams({ file_path: filePath, org_id: orgId, top_k: String(k) });
    if (framework) qs.set('policy_type', framework.toLowerCase());
    if (prefer && prefer !== 'auto') qs.set('prefer', prefer);
    const url = `/api/adk/policy/audit/stream?${qs.toString()}`;
    const es = new EventSource(url);
    es.onmessage = (ev) => {
      if (!ev.data) return;
      if (ev.data === '[DONE]') {
        setLog(prev => prev + `\n[DONE]\n`);
        es.close();
        setStreaming(false);
        return;
      }
      try {
        const obj = JSON.parse(ev.data);
        const stage = obj.stage || 'event';
        setLog(prev => prev + `\n[${stage}] ${JSON.stringify(obj.data)}\n`);
      } catch {
        setLog(prev => prev + `\n${ev.data}\n`);
      }
    };
    es.onerror = () => {
      setLog(prev => prev + `\n[error] stream closed\n`);
      es.close();
      setStreaming(false);
    };
  };

  return (
    <div className="p-4 space-y-4">
      <div className="text-lg font-semibold">Orchestration</div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded border p-3 bg-white/50">
          <div className="text-sm font-medium mb-2">Session</div>
          <div className="space-y-2 text-sm">
            <div>
              <div className="text-xs text-gray-500">Org ID</div>
              <input className="w-full border rounded px-2 py-1" value={orgId} onChange={e => setOrgId(e.target.value)} />
            </div>

      <div className="rounded border p-3 bg-white/50">
        <div className="text-sm font-medium mb-2">Background Job Orchestration</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="space-y-2">
            <div className="text-xs text-gray-500">Job</div>
            <div className="text-xs">Job ID: <span className="font-mono">{jobId || '-'}</span></div>
          </div>
          <div className="space-y-2">
            <div className="text-xs text-gray-500">Start</div>
            <button className="border rounded px-2 py-1" onClick={startJob}>Start Auto Audit Job</button>
          </div>
          <div className="space-y-2">
            <div className="text-xs text-gray-500">Controls</div>
            <div className="flex gap-2">
              <button className="flex-1 border rounded px-2 py-1 disabled:opacity-50" disabled={!jobId || jobStreaming} onClick={streamJob}>{jobStreaming? 'Streaming…' : 'Stream'}</button>
              <button className="flex-1 border rounded px-2 py-1" disabled={!jobId} onClick={checkJobStatus}>Status</button>
              <button className="flex-1 border rounded px-2 py-1" disabled={!jobId} onClick={cancelJob}>Cancel</button>
            </div>
          </div>
        </div>
      </div>
            <div>
              <div className="text-xs text-gray-500">Session ID</div>
              <input className="w-full border rounded px-2 py-1" value={sessionId} onChange={e => setSessionId(e.target.value)} />
            </div>
            <div>
              <div className="text-xs text-gray-500">Framework</div>
              <select className="w-full border rounded px-2 py-1" value={framework} onChange={e => setFramework(e.target.value)}>
                <option>GDPR</option>
                <option>DPDP</option>
                <option>HIPAA</option>
              </select>
            </div>
            <div>
              <div className="text-xs text-gray-500">Preferred LLM</div>
              <select className="w-full border rounded px-2 py-1" value={prefer} onChange={e => setPrefer(e.target.value)}>
                <option value="auto">Auto</option>
                <option value="openai">OpenAI</option>
                <option value="groq">Groq</option>
                <option value="gemini">Gemini</option>
              </select>
            </div>
            <div>
              <div className="text-xs text-gray-500">k (retrieval)</div>
              <input type="number" min={1} max={10} className="w-full border rounded px-2 py-1" value={k} onChange={e => setK(parseInt(e.target.value||'5',10))} />
            </div>
            <div>
              <div className="text-xs text-gray-500">file_path</div>
              <input className="w-full border rounded px-2 py-1" value={filePath} onChange={e => setFilePath(e.target.value)} placeholder="uploads/annotated.pdf" />
            </div>
            <div className="flex gap-2">
              <button className="flex-1 border rounded px-2 py-1 bg-black text-white disabled:opacity-50" disabled={loading} onClick={runAutoAudit}>Run Auto Audit</button>
              <button className="flex-1 border rounded px-2 py-1 disabled:opacity-50" disabled={streaming} onClick={runAutoAuditStream}>{streaming? 'Streaming…' : 'Stream Auto Audit'}</button>
            </div>
          </div>
        </div>

        <div className="rounded border p-3 bg-white/50">
          <div className="text-sm font-medium mb-2">Agents</div>
          {!registry ? <div className="text-xs text-gray-500">Loading…</div> : (
            <ul className="space-y-2 text-sm">
              {(registry.agents||[]).map((a:any, idx:number) => (
                <li key={idx} className="border rounded p-2">
                  <div className="font-medium">{a.name}</div>
                  <div className="text-xs text-gray-600">{a.role}</div>
                  <div className="text-xs mt-1">Tools: {(a.tools||[]).join(', ')}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded border p-3 bg-white/50">
          <div className="text-sm font-medium mb-2">MCP Tools</div>
          {!tools ? <div className="text-xs text-gray-500">Loading…</div> : (
            <ul className="space-y-2 text-sm">
              {(tools.tools||[]).map((t:any, idx:number) => (
                <li key={idx} className="border rounded p-2 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{t.tool}</div>
                    <div className="text-xs text-gray-600">{t.desc}</div>
                  </div>
                  <button className="border rounded px-2 py-1 text-xs" disabled={loading} onClick={() => {
                    if (t.tool === 'index_documents') {
                      const files = filePath ? [filePath] : [];
                      onRunTool('index_documents', { files });
                    } else if (t.tool === 'score_question') {
                      const sampleQ = 'Is data encrypted at rest?';
                      onRunTool('score_question', { session_id: sessionId, org_id: orgId, framework, checklist_question: sampleQ, user_answer: '', k });
                    } else if (t.tool === 'compute_gaps') {
                      onRunTool('compute_gaps', { scored_items: [] });
                    } else if (t.tool === 'generate_report') {
                      onRunTool('generate_report', { session_id: sessionId, org_id: orgId, items: [] });
                    } else if (t.tool === 'auto_audit') {
                      runAutoAudit();
                    }
                  }}>Run</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded border p-3 bg-white/50">
        <div className="text-sm font-medium mb-2">Planner (OpenAI Agents)</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="space-y-2">
            <div className="text-xs text-gray-500">Message</div>
            <textarea className="w-full h-28 border rounded p-2" value={plannerMsg} onChange={e => setPlannerMsg(e.target.value)} />
          </div>
          <div className="space-y-2">
            <div className="text-xs text-gray-500">Select Tools</div>
            <div className="grid grid-cols-2 gap-2">
              {((tools?.tools||[{tool:'auto_audit'},{tool:'index_documents'},{tool:'score_question'},{tool:'compute_gaps'},{tool:'generate_report'}]) as any[]).map((t:any, idx:number) => (
                <label key={idx} className="flex items-center gap-2 text-xs border rounded p-2">
                  <input type="checkbox" checked={selectedTools.includes(t.tool)} onChange={() => toggleTool(t.tool)} />
                  <span>{t.tool}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-xs text-gray-500">Actions</div>
            <div className="flex gap-2">
              <button className="flex-1 border rounded px-2 py-1 disabled:opacity-50" disabled={executingPlanner} onClick={() => runPlanner(false)}>Plan</button>
              <button className="flex-1 border rounded px-2 py-1 bg-black text-white disabled:opacity-50" disabled={executingPlanner} onClick={() => runPlanner(true)}>Plan & Execute</button>
            </div>
            <div className="text-xs text-gray-600">Prefer: {prefer}</div>
          </div>
        </div>
      </div>

      <div className="rounded border p-3 bg-white/50">
        <div className="text-sm font-medium mb-2">Providers Health</div>
        {!providers ? <div className="text-xs text-gray-500">Loading…</div> : (
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="border rounded p-2"><div className="flex justify-between"><span>Groq</span><span className={providers.groq_available ? 'text-green-600':'text-red-600'}>{providers.groq_available?'Up':'Down'}</span></div><div className="text-gray-600">{providers.groq_model||'-'}</div></div>
            <div className="border rounded p-2"><div className="flex justify-between"><span>OpenAI</span><span className={providers.openai_available ? 'text-green-600':'text-red-600'}>{providers.openai_available?'Up':'Down'}</span></div><div className="text-gray-600">{providers.openai_model||'-'}</div></div>
            <div className="border rounded p-2"><div className="flex justify-between"><span>Gemini</span><span className={providers.gemini_available ? 'text-green-600':'text-red-600'}>{providers.gemini_available?'Up':'Down'}</span></div><div className="text-gray-600">{providers.gemini_model||'-'}</div></div>
          </div>
        )}
      </div>

      <div className="rounded border p-3 bg-white/50">
        <div className="text-sm font-medium mb-2">Agent Status</div>
        {!agentStatus ? <div className="text-xs text-gray-500">Loading…</div> : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
            {['embedder','retriever','prompt_builder','scorer','annotator','reporter'].map((k) => (
              <div key={k} className="border rounded p-2">
                <div className="flex justify-between">
                  <span className="font-medium">{k}</span>
                  <span className={(agentStatus?.[k]?.ok ? 'text-green-600' : 'text-red-600')}>{agentStatus?.[k]?.ok? 'OK':'Error'}</span>
                </div>
                {agentStatus?.[k]?.details && (
                  <pre className="mt-1 whitespace-pre-wrap break-words text-[10px] text-gray-700">{JSON.stringify(agentStatus?.[k]?.details, null, 2)}</pre>
                )}
                {agentStatus?.[k]?.error && (
                  <div className="mt-1 text-[10px] text-red-700">{agentStatus?.[k]?.error}</div>
                )}
              </div>
            ))}
            <div className="border rounded p-2">
              <div className="flex justify-between"><span className="font-medium">Providers</span><span></span></div>
              <div className="mt-1 grid grid-cols-3 gap-1">
                <div>OpenAI: <span className={agentStatus?.providers?.openai_available? 'text-green-600':'text-red-600'}>{agentStatus?.providers?.openai_available? 'Up':'Down'}</span></div>
                <div>Groq: <span className={agentStatus?.providers?.groq_available? 'text-green-600':'text-red-600'}>{agentStatus?.providers?.groq_available? 'Up':'Down'}</span></div>
                <div>Gemini: <span className={agentStatus?.providers?.gemini_available? 'text-green-600':'text-red-600'}>{agentStatus?.providers?.gemini_available? 'Up':'Down'}</span></div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="rounded border p-3 bg-white/50">
        <div className="text-sm font-medium mb-2">Agent Graph</div>
        {!agentGraph ? <div className="text-xs text-gray-500">Loading…</div> : (
          <div className="space-y-3 text-xs">
            <AgentGraph graph={agentGraph as GraphData} statuses={graphStatuses} />
            <div className="flex items-center gap-3 text-[11px] text-gray-700">
              <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded border" style={{background:'#e0f2fe', borderColor:'#0284c7'}}></span> running</div>
              <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded border" style={{background:'#ecfdf5', borderColor:'#059669'}}></span> done</div>
              <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded border" style={{background:'#fef2f2', borderColor:'#dc2626'}}></span> error</div>
              <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded border" style={{background:'#ffffff', borderColor:'#cbd5e1'}}></span> idle</div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-gray-600 mb-1">Nodes</div>
                <ul className="space-y-1">
                  {(agentGraph.nodes||[]).map((n:any) => (
                    <li key={n.id} className="border rounded p-2"><span className="font-medium">{n.label}</span> <span className="text-gray-600">({n.id})</span></li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-xs text-gray-600 mb-1">Edges</div>
                <ul className="space-y-1">
                  {(agentGraph.edges||[]).map((e:any, idx:number) => (
                    <li key={idx} className="border rounded p-2"><span className="font-medium">{e.from}</span> → <span className="font-medium">{e.to}</span> <span className="text-gray-600">{e.label? `(${e.label})`:''}</span></li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="rounded border p-3 bg-white/50">
        <div className="text-sm font-medium mb-2">Run Timeline</div>
        <Timeline items={events} onClear={() => setEvents([])} />
      </div>
    </div>
  );
}
