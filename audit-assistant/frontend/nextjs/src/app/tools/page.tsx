'use client';
import { useEffect, useState } from 'react';
import { AuthGate } from '@/components/auth/AuthGate';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';

// helper to download JSON client-side
function downloadJson(filename: string, data: any) {
  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {}
}

export default function ToolsPage() {
  // Upload & Index state
  const [filesToUpload, setFilesToUpload] = useState<FileList | null>(null);
  const [uploadedPaths, setUploadedPaths] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [indexing, setIndexing] = useState(false);

  // Checklist generation state
  const [framework, setFramework] = useState('GDPR');
  const [filesText, setFilesText] = useState('');
  const [topN, setTopN] = useState(20);
  const [genResult, setGenResult] = useState<any | null>(null);
  const [loadingGen, setLoadingGen] = useState(false);

  // Policy annotate state
  const [policyFile, setPolicyFile] = useState('');
  const [gapsJson, setGapsJson] = useState('');
  const [outPath, setOutPath] = useState('');
  const [annotated, setAnnotated] = useState<string | null>(null);
  const [loadingAnnotate, setLoadingAnnotate] = useState(false);

  // Quick Actions (rule-clarity style)
  const [qaLoading, setQaLoading] = useState<string | null>(null);
  const [qaResult, setQaResult] = useState<any | null>(null);
  async function runQuick(tool: 'index_documents'|'score_question'|'compute_gaps'|'generate_report') {
    if (qaLoading) return;
    setQaLoading(tool);
    setQaResult(null);
    const defaults: Record<string, any> = {
      index_documents: { files: uploadedPaths.length ? uploadedPaths : [
        '/home/kshitija/Downloads/kat-audit-master/uploads/CELEX_32016R0679_EN_TXT.pdf',
        '/home/kshitija/Downloads/kat-audit-master/uploads/comppoli.pdf',
      ]},
      score_question: { session_id: 'tools-ui', org_id: 'default_org', user_id: 'ui', framework: 'GDPR', checklist_question: 'Do you encrypt data at rest?', user_answer: 'Yes, AES-256', k: 5 },
      compute_gaps: { scored_items: [{ question: 'Data retention policy documented', user_answer: 'Not documented', score: 1 }], min_score: 4 },
      generate_report: { session_id: 'tools-ui', org_id: 'default_org', items: [
        { question: 'Encrypt data at rest', user_answer: 'Yes, AES-256', score: 5, rationale: 'AES-256 at rest', llm_provider: 'groq', llm_model: 'llama3-70b-8192', clauses: [] },
      ], upload_to_gcs: false },
    };
    try {
      const res = await fetch('/api/ai/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool, args: defaults[tool] || {} })
      });
      const data = await res.json();
      setQaResult(data);
      if (!data.ok) toast.error(data.error || 'Action failed'); else toast.success('Action completed');
    } catch (e) {
      setQaResult({ ok: false, error: 'request failed' });
      toast.error('Request failed');
    } finally {
      setQaLoading(null);
    }
  }

  // Agent tools
  const [agentTool, setAgentTool] = useState('index_documents');
  const [agentArgs, setAgentArgs] = useState<string>(JSON.stringify({ files: ["/path/to/doc.pdf"] }, null, 2));
  const [agentResult, setAgentResult] = useState<any | null>(null);
  const [agentLoading, setAgentLoading] = useState(false);

  // Policy Audit (end-to-end) state
  const [auditFilePath, setAuditFilePath] = useState('');
  const [auditPolicyType, setAuditPolicyType] = useState('');
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditResult, setAuditResult] = useState<any | null>(null);

  async function runPolicyAudit() {
    if (!auditFilePath) {
      toast.error('Provide a policy file path (server path)');
      return;
    }
    setAuditLoading(true);
    setAuditResult(null);
    try {
      const body = {
        file_path: auditFilePath,
        top_k: 8,
        ...(auditPolicyType ? { policy_type: auditPolicyType } : {}),
      };
      const res = await apiFetch('/adk/policy/audit', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setAuditResult(res);
      toast.success('Audit complete');
    } catch (e: any) {
      toast.error(e?.message || 'Audit failed');
    } finally {
      setAuditLoading(false);
    }
  }

  // Batch score (streaming)
  const [batchFramework, setBatchFramework] = useState('GDPR');
  const [batchK, setBatchK] = useState(5);
  const [batchSession, setBatchSession] = useState('session-stream');
  const [batchLines, setBatchLines] = useState<string>('Is user data encrypted at rest?|Yes, we use AES-256\nDo you have a DPO appointed?|No');
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchResults, setBatchResults] = useState<Array<{ i:number; question:string; user_answer:string; score?:number; rationale:string; clauses:any[] }>>([]);

  // Providers health
  const [providersHealth, setProvidersHealth] = useState<any | null>(null);
  const [providersLoading, setProvidersLoading] = useState(false);
  const loadProvidersHealth = async () => {
    setProvidersLoading(true);
    try {
      const res = await fetch('/api/ai/providers/health');
      const data = await res.json();
      setProvidersHealth(data);
    } catch (e) {
      toast.error('Failed to load provider health');
    } finally {
      setProvidersLoading(false);
    }
  };

  // OpenAI Agent (plan/execute)
  const [agentMsgs, setAgentMsgs] = useState<string>(
    JSON.stringify([
      { role: 'user', content: 'Index my PDFs and then generate a report' },
    ], null, 2)
  );
  const [agentAllowedTools, setAgentAllowedTools] = useState<string>('index_documents,score_question,compute_gaps,generate_report');
  const [agentExecute, setAgentExecute] = useState(false);
  const [agentPlanResult, setAgentPlanResult] = useState<any | null>(null);
  const [agentPlanLoading, setAgentPlanLoading] = useState(false);
  const runOpenAIAgent = async () => {
    setAgentPlanLoading(true);
    setAgentPlanResult(null);
    try {
      let messages: Array<{ role: string; content: string }> = [];
      try { messages = JSON.parse(agentMsgs); } catch {}
      const tools = agentAllowedTools.split(',').map(s => s.trim()).filter(Boolean);
      const res = await fetch('/api/ai/agent/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: 'agent-ui',
          org_id: 'default_org',
          user_id: 'ui',
          messages,
          tools,
          execute: agentExecute,
        })
      });
      const data = await res.json();
      setAgentPlanResult(data);
    } catch (e) {
      setAgentPlanResult({ ok: false, error: 'request failed' });
    } finally {
      setAgentPlanLoading(false);
    }
  };

  // Hydrate uploads from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('uploaded_paths');
      if (saved) setUploadedPaths(JSON.parse(saved));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('uploaded_paths', JSON.stringify(uploadedPaths));
    } catch {}
  }, [uploadedPaths]);

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilesToUpload(e.target.files);
  };

  async function runBatchStream() {
    const items = batchLines
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l, i) => {
        const [q, a = ''] = l.split('|');
        return { i, question: (q || '').trim(), user_answer: (a || '').trim() };
      });
    if (!items.length) return;
    setBatchRunning(true);
    setBatchResults(items.map(({ i, question, user_answer }) => ({ i, question, user_answer, rationale: '', clauses: [] })));
    try {
      // Stream each item sequentially for simplicity
      for (const it of items) {
        await new Promise<void>((resolve, reject) => {
          const es = new EventSource('/api/adk/score/stream', { withCredentials: false } as any);
          // EventSource with POST workaround via fetch+reader is complex; instead, use fetch stream
          es.onerror = () => {
            es.close();
            reject(new Error('EventSource error'));
          };
          // Close immediately; we can't send a POST body with native EventSource.
          es.close();
          // Use fetch streaming instead
          (async () => {
            const res = await fetch('/api/adk/score/stream', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                session_id: batchSession,
                org_id: 'default_org',
                user_id: 'batch',
                framework: batchFramework,
                checklist_question: it.question,
                user_answer: it.user_answer,
                k: batchK,
              }),
            });
            if (!res.ok || !res.body) throw new Error('stream failed');
            const reader = res.body.getReader();
            const dec = new TextDecoder();
            let buf = '';
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += dec.decode(value, { stream: true });
              const lines = buf.split(/\r?\n/);
              buf = lines.pop() || '';
              for (const line of lines) {
                if (!line.startsWith('data:')) continue;
                const payload = line.slice(5).trim();
                if (!payload) continue;
                if (payload === '[DONE]') continue;
                try {
                  const obj = JSON.parse(payload);
                  if (obj.type === 'clauses') {
                    setBatchResults((prev) => prev.map((r) => r.i === it.i ? { ...r, clauses: obj.clauses || [] } : r));
                  } else if (obj.type === 'rationale') {
                    setBatchResults((prev) => prev.map((r) => r.i === it.i ? { ...r, rationale: (r.rationale || '') + (obj.delta || '') } : r));
                  } else if (obj.type === 'final') {
                    setBatchResults((prev) => prev.map((r) => r.i === it.i ? { ...r, score: obj.score } : r));
                  }
                } catch {}
              }
            }
            resolve();
          })().catch(reject);
        });
      }
      toast.success('Batch stream complete');
    } catch (e) {
      toast.error('Batch stream failed');
    } finally {
      setBatchRunning(false);
    }
  }

  const uploadSelected = async () => {
    if (!filesToUpload || filesToUpload.length === 0) return;
    setUploading(true);
    const newPaths: string[] = [];
    try {
      for (let i = 0; i < filesToUpload.length; i++) {
        const fd = new FormData();
        fd.append('file', filesToUpload[i]);
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        if (!res.ok) throw new Error('upload failed');
        const data = await res.json();
        if (data?.path) newPaths.push(data.path);
      }
      const combined = Array.from(new Set([...(uploadedPaths || []), ...newPaths]));
      setUploadedPaths(combined);
      toast.success(`Uploaded ${newPaths.length} file(s)`);
      setFilesToUpload(null);
    } catch (e) {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const indexUploaded = async () => {
    if (!uploadedPaths.length) return;
    setIndexing(true);
    try {
      const res = await fetch('/api/ai/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'index_documents', args: { files: uploadedPaths } }),
      });
      const data = await res.json();
      if (!data.ok) toast.error(data.error || 'Index failed');
      else toast.success('Index built');
    } catch (e) {
      toast.error('Index request failed');
    } finally {
      setIndexing(false);
    }
  };

  const runChecklistGen = async () => {
    try {
      setLoadingGen(true);
      const files = filesText.split('\n').map(s => s.trim()).filter(Boolean);
      const res = await apiFetch<{ framework: string; version: string; items: any[] }>(
        '/adk/checklist/generate',
        { method: 'POST', body: JSON.stringify({ framework, files, top_n: topN }) }
      );
      setGenResult(res);
      toast.success(`Generated ${res.items?.length ?? 0} items for ${res.framework}`);
    } catch (e) {
      toast.error('Checklist generation failed');
    } finally {
      setLoadingGen(false);
    }
  };

  const runAgent = async () => {
    try {
      setAgentLoading(true);
      let args: any = {};
      try {
        args = agentArgs ? JSON.parse(agentArgs) : {};
      } catch {
        toast.error('Agent args JSON is invalid');
        return;
      }
      const res = await fetch('/api/ai/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: agentTool, args }),
      });
      const data = await res.json();
      setAgentResult(data);
      if (!data.ok) toast.error(data.error || 'Agent tool failed');
      else toast.success('Agent tool executed');
    } catch (e) {
      toast.error('Agent request failed');
    } finally {
      setAgentLoading(false);
    }
  };

  const runAnnotate = async () => {
    try {
      setLoadingAnnotate(true);
      let gaps: any[] = [];
      try {
        gaps = JSON.parse(gapsJson || '[]');
      } catch {
        toast.error('Gaps JSON is invalid');
        return;
      }
      const res = await apiFetch<{ annotated_path: string }>(
        '/adk/policy/annotate',
        { method: 'POST', body: JSON.stringify({ file: policyFile, gaps, out_path: outPath || undefined }) }
      );
      setAnnotated(res.annotated_path);
      toast.success('Annotated policy created');
    } catch (e) {
      toast.error('Policy annotation failed');
    } finally {
      setLoadingAnnotate(false);
    }
  };

  return (
    <AuthGate>
      <div className="p-8 space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Tools</h1>
          <a className="underline" href="/dashboard">Back to Dashboard</a>
        </div>

        {/* Quick Actions (Rule-Clarity style toolbar) */}
        <section className="rounded-lg border p-4 bg-card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Quick Actions</h2>
            <div className="text-xs text-muted-foreground">One-click calls to backend agent tools</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => runQuick('index_documents')} disabled={qaLoading!==null} className="px-3 py-2 rounded-md border">
              {qaLoading==='index_documents' ? 'Indexing…' : 'Index Documents'}
            </button>
            <button onClick={() => runQuick('score_question')} disabled={qaLoading!==null} className="px-3 py-2 rounded-md border">
              {qaLoading==='score_question' ? 'Scoring…' : 'Quick Score'}
            </button>
            <button onClick={() => runQuick('compute_gaps')} disabled={qaLoading!==null} className="px-3 py-2 rounded-md border">
              {qaLoading==='compute_gaps' ? 'Computing…' : 'Compute Gaps'}
            </button>
            <button onClick={() => runQuick('generate_report')} disabled={qaLoading!==null} className="px-3 py-2 rounded-md border">
              {qaLoading==='generate_report' ? 'Generating…' : 'Generate Report'}
            </button>
          </div>
          {qaResult && (
            <div className="mt-3 rounded-md border p-3 bg-background text-sm max-h-64 overflow-auto">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-muted-foreground">Action result</div>
                <button className="px-2 py-1 text-xs border rounded" onClick={() => navigator.clipboard.writeText(JSON.stringify(qaResult, null, 2))}>Copy</button>
              </div>
              <pre className="whitespace-pre-wrap">{JSON.stringify(qaResult, null, 2)}</pre>
            </div>
          )}
        </section>

        {/* Audit Policy (end-to-end) */}
        <section className="rounded-lg border p-4 bg-card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Audit Policy (end-to-end)</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-muted-foreground">Policy file path (server)</label>
              <input className="mt-1 w-full border rounded-md px-2 py-1 bg-background" value={auditFilePath} onChange={(e)=>setAuditFilePath(e.target.value)} placeholder="uploads/hr_policy.pdf" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Policy type (optional)</label>
              <input className="mt-1 w-full border rounded-md px-2 py-1 bg-background" value={auditPolicyType} onChange={(e)=>setAuditPolicyType(e.target.value)} placeholder="hr, posh, ..." />
            </div>
          </div>
          <div className="flex gap-2">
            <button disabled={auditLoading} onClick={runPolicyAudit} className="px-4 py-2 rounded-md border">{auditLoading ? 'Auditing…' : 'Run Audit'}</button>
            {auditResult && (
              <>
                <button className="px-3 py-2 rounded-md border" onClick={()=>navigator.clipboard.writeText(JSON.stringify(auditResult, null, 2))}>Copy JSON</button>
                <button className="px-3 py-2 rounded-md border" onClick={()=>downloadJson(`policy_audit_${auditResult.policy_type||'result'}.json`, auditResult)}>Download</button>
                {(auditResult?.download_url || auditResult?.report_path) && (
                  <button className="px-3 py-2 rounded-md border" onClick={()=>{
                    const url = auditResult.download_url || auditResult.report_path;
                    try { window.open(url, '_blank'); } catch {}
                  }}>Open report</button>
                )}
              </>
            )}
          </div>
          {auditResult && (
            <div className="mt-3 rounded-md border p-3 bg-background text-sm">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="px-2 py-0.5 rounded-full bg-indigo-600/15 text-indigo-700 dark:text-indigo-400 text-xs">{auditResult.policy_type || 'unknown'}</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 text-xs">Composite: {typeof auditResult.composite === 'number' ? auditResult.composite.toFixed(2) : auditResult.composite}</span>
                <span className="px-2 py-0.5 rounded-full bg-slate-600/15 text-slate-700 dark:text-slate-300 text-xs">Checklist: {auditResult.checklist?.length ?? 0}</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-600/15 text-amber-700 dark:text-amber-400 text-xs">Gaps: {auditResult.gaps?.length ?? 0}</span>
              </div>
              <pre className="whitespace-pre-wrap max-h-72 overflow-auto">{JSON.stringify(auditResult, null, 2)}</pre>
            </div>
          )}
        </section>

        {/* Providers Health */}
        <section className="rounded-lg border p-4 bg-card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Providers Health</h2>
            <button onClick={loadProvidersHealth} disabled={providersLoading} className="px-3 py-1.5 border rounded-md">
              {providersLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
          {providersHealth ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
              <div className="rounded-md border p-3 bg-background">
                <div className="font-medium">Default</div>
                <div className="text-muted-foreground">prefer: {providersHealth.prefer || 'auto'}</div>
              </div>
              <div className="rounded-md border p-3 bg-background">
                <div className="flex items-center justify-between">
                  <div className="font-medium">Groq</div>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${providersHealth.groq_available ? 'bg-green-600/15 text-green-700 dark:text-green-400' : 'bg-red-600/15 text-red-700 dark:text-red-400'}`}>{providersHealth.groq_available ? 'Up' : 'Down'}</span>
                </div>
                <div className="text-muted-foreground">model: {providersHealth.groq_model || '-'}</div>
              </div>
              <div className="rounded-md border p-3 bg-background">
                <div className="flex items-center justify-between">
                  <div className="font-medium">OpenAI</div>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${providersHealth.openai_available ? 'bg-green-600/15 text-green-700 dark:text-green-400' : 'bg-red-600/15 text-red-700 dark:text-red-400'}`}>{providersHealth.openai_available ? 'Up' : 'Down'}</span>
                </div>
                <div className="text-muted-foreground">model: {providersHealth.openai_model || '-'}</div>
              </div>
              <div className="rounded-md border p-3 bg-background">
                <div className="flex items-center justify-between">
                  <div className="font-medium">Gemini</div>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${providersHealth.gemini_available ? 'bg-green-600/15 text-green-700 dark:text-green-400' : 'bg-red-600/15 text-red-700 dark:text-red-400'}`}>{providersHealth.gemini_available ? 'Up' : 'Down'}</span>
                </div>
                <div className="text-muted-foreground">model: {providersHealth.gemini_model || '-'}</div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Click Refresh to load provider status.</div>
          )}
        </section>

        {/* OpenAI Agent (plan/execute) */}
        <section className="rounded-lg border p-4 bg-card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">OpenAI Agent (plan/execute)</h2>
            <div className="flex items-center gap-2">
              <label className="text-sm">Execute</label>
              <input type="checkbox" checked={agentExecute} onChange={(e)=>setAgentExecute(e.target.checked)} />
              <button disabled={agentPlanLoading} onClick={runOpenAIAgent} className="px-3 py-1.5 border rounded-md">{agentPlanLoading? 'Running…' : 'Run'}</button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="text-sm text-muted-foreground">{"Messages (JSON array of { role, content })"}</label>
              <textarea className="mt-1 w-full border rounded-md px-2 py-2 bg-background h-40" value={agentMsgs} onChange={(e)=>setAgentMsgs(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Allowed tools (comma-separated)</label>
              <input className="mt-1 w-full border rounded-md px-2 py-1 bg-background" value={agentAllowedTools} onChange={(e)=>setAgentAllowedTools(e.target.value)} />
              <p className="text-xs text-muted-foreground mt-2">index_documents, score_question, compute_gaps, generate_report</p>
            </div>
          </div>
          {agentPlanResult && (
            <div className="rounded-md border p-3 bg-background text-sm overflow-auto">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-muted-foreground">Result</div>
                <button className="px-2 py-1 text-xs border rounded" onClick={()=>navigator.clipboard.writeText(JSON.stringify(agentPlanResult, null, 2))}>Copy</button>
              </div>
              <pre className="whitespace-pre-wrap">{JSON.stringify(agentPlanResult, null, 2)}</pre>
            </div>
          )}
        </section>

        {/* Batch Score (streaming) */}
        <section className="rounded-lg border p-4 bg-card space-y-4">
          <h2 className="text-lg font-medium">Batch Score (streaming)</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm text-muted-foreground">Framework</label>
              <select className="mt-1 w-full border rounded-md px-2 py-1 bg-background" value={batchFramework} onChange={(e) => setBatchFramework(e.target.value)}>
                <option value="GDPR">GDPR</option>
                <option value="DPDP">DPDP</option>
                <option value="HIPAA">HIPAA</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">k</label>
              <input type="number" min={1} max={10} className="mt-1 w-full border rounded-md px-2 py-1 bg-background" value={batchK} onChange={(e) => setBatchK(parseInt(e.target.value||'5'))} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Session</label>
              <input className="mt-1 w-full border rounded-md px-2 py-1 bg-background" value={batchSession} onChange={(e) => setBatchSession(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Items (one per line: question|answer)</label>
            <textarea className="mt-1 w-full border rounded-md px-2 py-2 bg-background h-28" value={batchLines} onChange={(e) => setBatchLines(e.target.value)} />
          </div>
          <div className="flex justify-end">
            <button disabled={batchRunning} onClick={runBatchStream} className="px-4 py-2 rounded-md border">{batchRunning ? 'Running…' : 'Run Stream'}</button>
          </div>
          {batchResults.length > 0 && (
            <div className="rounded-md border p-3 bg-background overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="p-2">#</th>
                    <th className="p-2">Question</th>
                    <th className="p-2">Answer</th>
                    <th className="p-2">Score</th>
                    <th className="p-2">Rationale (streamed)</th>
                  </tr>
                </thead>
                <tbody>
                  {batchResults.map((r) => (
                    <tr key={r.i} className="align-top border-t">
                      <td className="p-2">{r.i+1}</td>
                      <td className="p-2 whitespace-pre-wrap">{r.question}</td>
                      <td className="p-2 whitespace-pre-wrap">{r.user_answer}</td>
                      <td className="p-2">{r.score ?? '-'}</td>
                      <td className="p-2 whitespace-pre-wrap text-muted-foreground">{r.rationale}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Upload & Index */}
        <section className="rounded-lg border p-4 bg-card space-y-4">
          <h2 className="text-lg font-medium">Upload & Index</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="md:col-span-2">
              <label className="text-sm text-muted-foreground">Select files</label>
              <input type="file" multiple onChange={onPickFiles} className="mt-1 w-full" />
            </div>
            <div className="flex gap-2 justify-end">
              <button disabled={uploading || !filesToUpload?.length} onClick={uploadSelected} className="px-4 py-2 rounded-md border">{uploading ? 'Uploading…' : 'Upload'}</button>
              <button disabled={indexing || !uploadedPaths.length} onClick={indexUploaded} className="px-4 py-2 rounded-md border">{indexing ? 'Indexing…' : 'Index Uploaded'}</button>
            </div>
          </div>
          {uploadedPaths.length > 0 && (
            <div className="rounded-md border p-3 bg-background text-sm">
              <div className="text-xs text-muted-foreground mb-2">Uploaded paths</div>
              <ul className="list-disc pl-5 space-y-1 max-h-40 overflow-auto">
                {uploadedPaths.map((p) => (
                  <li key={p} className="flex items-center justify-between gap-2">
                    <span className="truncate">{p}</span>
                    <button className="px-2 py-1 text-xs border rounded" onClick={() => navigator.clipboard.writeText(p)}>Copy</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="rounded-lg border p-4 bg-card space-y-4">
          <h2 className="text-lg font-medium">Checklist Generation</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground">Framework</label>
              <select className="mt-1 w-full border rounded-md px-2 py-1 bg-background" value={framework} onChange={(e) => setFramework(e.target.value)}>
                <option value="GDPR">GDPR</option>
                <option value="DPDP">DPDP</option>
                <option value="HIPAA">HIPAA</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Top N</label>
              <input className="mt-1 w-full border rounded-md px-2 py-1 bg-background" type="number" value={topN} onChange={(e) => setTopN(parseInt(e.target.value || '0'))} />
            </div>
          </div>
          <div>
            <label className="text-sm text-muted-foreground">File paths (one per line)</label>
            <textarea className="mt-2 w-full h-32 border rounded-md px-2 py-1 bg-background" value={filesText} onChange={(e) => setFilesText(e.target.value)} placeholder="/path/to/file1.pdf\n/path/to/file2.txt" />
          </div>
          <div className="flex gap-2">
            <button disabled={loadingGen} onClick={runChecklistGen} className="px-4 py-2 rounded-md border">{loadingGen ? 'Generating…' : 'Generate Checklist'}</button>
            {genResult && (
              <>
                <button className="px-3 py-2 rounded-md border" onClick={()=>navigator.clipboard.writeText(JSON.stringify(genResult, null, 2))}>Copy JSON</button>
                <button className="px-3 py-2 rounded-md border" onClick={()=>downloadJson(`checklist_${genResult.framework||'framework'}.json`, genResult)}>Download</button>
              </>
            )}
          </div>
          {genResult && (
            <div className="mt-3 rounded-md border p-3 bg-background">
              <div className="text-sm text-muted-foreground mb-2">Items ({genResult.items?.length ?? 0})</div>
              <ul className="text-sm list-disc pl-5 space-y-1 max-h-64 overflow-auto">
                {genResult.items?.map((it: any, i: number) => (
                  <li key={i}>{it.question || JSON.stringify(it)}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="rounded-lg border p-4 bg-card space-y-4">
          <h2 className="text-lg font-medium">Policy Annotation</h2>
          <div>
            <label className="text-sm text-muted-foreground">Policy PDF path</label>
            <input className="mt-1 w-full border rounded-md px-2 py-1 bg-background" value={policyFile} onChange={(e) => setPolicyFile(e.target.value)} placeholder="/path/to/policy.pdf" />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Gaps JSON (array)</label>
            <textarea className="mt-2 w-full h-32 border rounded-md px-2 py-1 bg-background" value={gapsJson} onChange={(e) => setGapsJson(e.target.value)} placeholder='[{"question":"...","score":2}]' />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Output path (optional)</label>
            <input className="mt-1 w-full border rounded-md px-2 py-1 bg-background" value={outPath} onChange={(e) => setOutPath(e.target.value)} placeholder="/tmp/annotated.pdf" />
          </div>
          <button disabled={loadingAnnotate} onClick={runAnnotate} className="px-4 py-2 rounded-md border">{loadingAnnotate ? 'Annotating…' : 'Annotate Policy PDF'}</button>
          {annotated && (
            <div className="text-sm text-muted-foreground">Annotated file: <span className="font-medium">{annotated}</span></div>
          )}
        </section>

        <section className="rounded-lg border p-4 bg-card space-y-4">
          <h2 className="text-lg font-medium">Agent Tools</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground">Tool</label>
              <select className="mt-1 w-full border rounded-md px-2 py-1 bg-background" value={agentTool} onChange={(e) => setAgentTool(e.target.value)}>
                <option value="index_documents">index_documents</option>
                <option value="score_question">score_question</option>
                <option value="generate_report">generate_report</option>
                <option value="compute_gaps">compute_gaps</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Args (JSON)</label>
              <textarea className="mt-2 w-full h-40 border rounded-md px-2 py-1 bg-background" value={agentArgs} onChange={(e) => setAgentArgs(e.target.value)} />
            </div>
          </div>
          <button disabled={agentLoading} onClick={runAgent} className="px-4 py-2 rounded-md border">{agentLoading ? 'Running…' : 'Run Tool'}</button>
          {agentResult && (
            <div className="mt-3 rounded-md border p-3 bg-background text-sm overflow-auto">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-muted-foreground">Result</div>
                <div className="flex gap-2">
                  <button className="px-2 py-1 text-xs border rounded" onClick={()=>navigator.clipboard.writeText(JSON.stringify(agentResult, null, 2))}>Copy</button>
                  {(agentResult?.report_path || agentResult?.download_url) && (
                    <button className="px-2 py-1 text-xs border rounded" onClick={()=>{
                      const url = agentResult.download_url || agentResult.report_path;
                      try { window.open(url, '_blank'); } catch {}
                    }}>Open</button>
                  )}
                </div>
              </div>
              <pre className="whitespace-pre-wrap">{JSON.stringify(agentResult, null, 2)}</pre>
            </div>
          )}
        </section>
      </div>
    </AuthGate>
  );
}
