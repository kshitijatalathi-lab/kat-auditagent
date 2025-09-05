"use client";
import React, { useMemo, useRef, useState, useEffect } from "react";
import { toast } from "sonner";
import { Timeline, type TimelineItem } from "@/components/Timeline";
import { AgentGraph } from "@/components/AgentGraph";

// Ensure URLs like "/reports/foo.pdf" are converted to absolute URLs on the backend origin
const fullUrl = (u?: string | null): string => {
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  const base = process.env.NEXT_PUBLIC_API_BASE || '';
  try {
    return base ? new URL(u, base).toString() : u;
  } catch {
    return u;
  }
};

// Minimal-input Audit Wizard: Upload -> Audit Now -> Live Progress (DAG + Timeline) -> Results
// Uses existing backend endpoints:
// - POST /api/upload (multipart) to upload a file
// - GET  /api/ai/agents/graph to fetch agent DAG
// - POST /api/adk/policy/audit/job to start an audit job
// - GET  /api/adk/policy/audit/job/{jobId}/stream (SSE) for live progress
// Final event contains links for report and annotated files

export default function AuditWizardPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState<{ path: string; filename: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [orgId, setOrgId] = useState<string>("default");
  const [policyType, setPolicyType] = useState<string>("Auto");
  const [k, setK] = useState<number>(8);
  const [prefer, setPrefer] = useState<string>("Auto");

  const [graph, setGraph] = useState<{ nodes: any[]; edges: any[] } | null>(null);
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, "idle" | "running" | "done" | "error">>({});
  const [edgeStatuses, setEdgeStatuses] = useState<Record<string, "idle" | "running" | "done" | "error">>({});

  const [events, setEvents] = useState<TimelineItem[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastStageRef = useRef<string | null>(null);
  const lastStageStartRef = useRef<number | null>(null);
  const lastEventAtRef = useRef<number>(Date.now());
  const heartbeatTimerRef = useRef<any>(null);

  const [result, setResult] = useState<any | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [toolsReady, setToolsReady] = useState<{count: number; names: string[]}>({ count: 0, names: [] });
  const [autoStart, setAutoStart] = useState(true);
  const [preflight, setPreflight] = useState<{ tools: string; providers: string } | null>(null);

  // Load agent graph on mount
  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch("/api/ai/agents/graph");
        if (r.ok) {
          const j = await r.json();
          setGraph(j);
          const ns: Record<string, any> = {};
          (j.nodes || []).forEach((n: any) => (ns[n.id] = "idle"));
          setNodeStatuses(ns);
        }
      } catch {}
    };
    load();
  }, []);

  // Consume uploaded file info from landing page (sessionStorage)
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      const raw = sessionStorage.getItem('landingUpload');
      if (!raw) return;
      sessionStorage.removeItem('landingUpload');
      const payload = JSON.parse(raw);
      if (payload && payload.path) {
        setUploaded({ path: payload.path, filename: payload.filename || 'document' });
        // Auto-start shortly after setting the uploaded state
        setTimeout(() => {
          if (!streaming) startAudit();
        }, 200);
      }
    } catch {}
    // we only want this to run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load MCP tools availability (best-effort)
  useEffect(() => {
    let aborted = false;
    async function loadTools() {
      try {
        const r = await fetch('/api/ai/tools/catalog');
        if (!r.ok) return;
        const j = await r.json();
        if (aborted) return;
        const items: any[] = Array.isArray(j) ? j : (Array.isArray(j?.tools) ? j.tools : []);
        const names = items.map((t: any) => t?.name || t?.id).filter(Boolean);
        setToolsReady({ count: names.length, names });
      } catch {}
    }
    loadTools();
    return () => { aborted = true; };
  }, []);

  const onChoose: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
  };

  const acceptTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ];
  const maxSize = 50 * 1024 * 1024; // 50MB

  function filterValid(selected: FileList | File[]): File | null {
    const arr = Array.from(selected as any as File[]);
    for (const f of arr) {
      if (!acceptTypes.includes(f.type)) { toast.error(`${f.name}: unsupported type`); continue; }
      if (f.size > maxSize) { toast.error(`${f.name}: exceeds 50MB limit`); continue; }
      return f;
    }
    return null;
  }

  const onDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      const valid = filterValid(e.dataTransfer.files);
      if (valid) {
        setFile(valid);
        if (inputRef.current) {
          const dt = new DataTransfer();
          dt.items.add(valid);
          inputRef.current.files = dt.files;
        }
      }
    }
  };
  const onDragOver: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };
  const onDragLeave: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const doUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      if (!r.ok) throw new Error("Upload failed");
      const j = await r.json();
      setUploaded(j);
      toast.success(`Uploaded ${j.filename}`);
      if (autoStart) {
        // Defer to allow state to settle
        setTimeout(() => { startAudit(); }, 150);
      }
    } catch (e: any) {
      toast.error(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  // Preflight health check (tools/providers)
  const runPreflight = async (): Promise<void> => {
    try {
      const [toolsRes, provRes] = await Promise.allSettled([
        fetch('/api/ai/tools/catalog'),
        fetch('/api/ai/providers/health'),
      ]);
      let tools = 'unknown';
      let providers = 'unknown';
      if (toolsRes.status === 'fulfilled' && toolsRes.value.ok) {
        const j = await toolsRes.value.json();
        const items: any[] = Array.isArray(j) ? j : (Array.isArray(j?.tools) ? j.tools : []);
        tools = items.length > 0 ? `ready (${items.length})` : 'none';
      }
      if (provRes.status === 'fulfilled' && provRes.value.ok) {
        const pj = await provRes.value.json();
        providers = (pj && typeof pj === 'object') ? 'ok' : 'unknown';
      }
      setPreflight({ tools, providers });
      if (tools === 'none') {
        pushEvent({ type: 'warn', title: 'Tools unavailable; proceeding with reduced plan' });
      }
    } catch {
      setPreflight({ tools: 'unknown', providers: 'unknown' });
    }
  };

  const resolveNodeId = (stage: string): string | null => {
    if (!graph) return null;
    const s = (stage || "").toLowerCase();
    // exact id match
    const exact = graph.nodes.find((n: any) => (n.id || "").toLowerCase() === s);
    if (exact) return exact.id;
    // label match
    const label = graph.nodes.find((n: any) => (n.label || "").toLowerCase() === s);
    if (label) return label.id;
    // substring
    const sub = graph.nodes.find((n: any) => (n.id || "").toLowerCase().includes(s) || (n.label || "").toLowerCase().includes(s));
    return sub ? sub.id : null;
  };

  const setNode = (id: string, status: any) => setNodeStatuses((prev) => ({ ...prev, [id]: status }));
  const setEdge = (from: string, to: string, status: any) => setEdgeStatuses((prev) => ({ ...prev, [`${from}->${to}`]: status }));

  const pushEvent = (e: Omit<TimelineItem, "id">) =>
    setEvents((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, ts: new Date().toISOString(), ...e },
    ]);

  const startAudit = async () => {
    if (!uploaded?.path) {
      toast.error("Please upload a policy document first");
      return;
    }
    if (streaming) {
      toast.message("A run is already in progress");
      return;
    }
    // best-effort preflight (non-blocking)
    runPreflight();
    setResult(null);
    setEvents([]);
    // reset statuses
    if (graph) {
      const ns: Record<string, any> = {};
      (graph.nodes || []).forEach((n: any) => (ns[n.id] = "idle"));
      setNodeStatuses(ns);
      setEdgeStatuses({});
    }

    try {
      pushEvent({ type: "job", title: "Starting audit job" });
      const body = {
        file_path: uploaded.path,
        org_id: orgId,
        policy_type: policyType && policyType !== "Auto" ? policyType.toLowerCase() : undefined,
        top_k: k,
        prefer: prefer && prefer !== "Auto" ? prefer.toLowerCase() : undefined,
      };
      const r = await fetch("/api/adk/policy/audit/job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error || "failed to start job");
      const id = j.job_id || j.id;
      setJobId(id);
      pushEvent({ type: "job", title: `Job started: ${id}` });
      lastEventAtRef.current = Date.now();
      // Start heartbeat watchdog (30s no events)
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = setInterval(() => {
        const since = Date.now() - lastEventAtRef.current;
        if (since > 30000 && streaming) {
          pushEvent({ type: "job", title: "Step is still running", detail: { idle_ms: since } });
          // avoid spamming; reset marker so next message comes after another 30s
          lastEventAtRef.current = Date.now();
        }
      }, 5000);
      await streamJob(id);
    } catch (e: any) {
      pushEvent({ type: "error", title: "Job start failed", detail: e?.message || e });
      toast.error(e?.message || "Job start failed");
    }
  };

  const streamJob = async (id: string) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);
    try {
      let attempt = 0;
      const maxAttempts = 4; // initial + 3 retries
      let r: Response | null = null;
      // retry loop for establishing the stream
      while (attempt < maxAttempts) {
        try {
          r = await fetch(`/api/adk/policy/audit/job/${encodeURIComponent(id)}/stream`, {
            method: "GET",
            signal: controller.signal,
            headers: { 'Accept': 'text/event-stream' },
          });
          if (r.ok && r.body) break;
          throw new Error(`Stream connect failed: ${r.status}`);
        } catch (e: any) {
          attempt += 1;
          if (controller.signal.aborted) throw e;
          if (attempt >= maxAttempts) throw e;
          const backoff = Math.min(15000, 1000 * Math.pow(2, attempt - 1));
          pushEvent({ type: 'job', title: `Reconnecting stream (attempt ${attempt + 1}/${maxAttempts})`, detail: { backoff_ms: backoff } });
          await new Promise(res => setTimeout(res, backoff));
        }
      }
      if (!r || !r.ok || !r.body) throw new Error("Stream failed");
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let lastNode: string | null = null;
      let gotFinal = false;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() || "";
        for (const part of parts) {
          const line = part.trim();
          if (!line) continue;
          const payload = line.replace(/^data:\s*/, "");
          try {
            const evt = JSON.parse(payload);
            const stage = evt.stage || evt.type || "event";
            lastEventAtRef.current = Date.now();
            if (stage === "error") {
              pushEvent({ type: "error", title: evt.message || "Error", detail: evt });
              const nid = lastNode && lastNode;
              if (nid) setNode(nid, "error");
              continue;
            }
            // Update graph statuses heuristically
            const nid = resolveNodeId(stage);
            if (nid) {
              // mark previous node done and compute duration for previous stage
              if (lastNode && lastNode !== nid) {
                setNode(lastNode, "done");
                if (lastStageRef.current && lastStageStartRef.current) {
                  const durMs = Date.now() - lastStageStartRef.current;
                  pushEvent({ type: "job", title: `${lastStageRef.current} done`, detail: { duration_ms: durMs } });
                }
              }
              setNode(nid, "running");
              if (lastNode) {
                setEdge(lastNode, nid, "running");
              }
              lastNode = nid;
              lastStageRef.current = stage;
              lastStageStartRef.current = Date.now();
            }
            // Push to timeline
            const t: TimelineItem = {
              id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              ts: new Date().toISOString(),
              type: stage === "final" ? "job" : "event",
              title: stage,
              detail: evt.data !== undefined ? evt.data : evt,
            };
            setEvents((prev) => [...prev, t]);
            if (stage === "final") {
              const data = evt.data || evt;
              setResult(data);
              gotFinal = true;
              // close out last running stage duration
              if (lastStageRef.current && lastStageStartRef.current) {
                const durMs = Date.now() - lastStageStartRef.current;
                pushEvent({ type: "job", title: `${lastStageRef.current} done`, detail: { duration_ms: durMs } });
              }
              // Persist last report URL for sidebar quick access
              try {
                const pdf = fullUrl(data?.download_url || data?.report_url || null);
                const jsonUrl = fullUrl(data?.results_url || null);
                const reportPath: string | null = data?.report_path || null;
                let reportId = "latest";
                if (reportPath) {
                  const base = reportPath.split("/").pop() || reportPath;
                  reportId = base.replace(/\.[^.]+$/, "");
                }
                const lastUrl = `/report/${encodeURIComponent(reportId)}${pdf || jsonUrl ? `?${[pdf ? `pdf_url=${encodeURIComponent(pdf)}` : null, jsonUrl ? `json_url=${encodeURIComponent(jsonUrl)}` : null].filter(Boolean).join('&')}` : ''}`;
                localStorage.setItem('lastReportUrl', lastUrl);

                // Update recent reports (cap 5)
                const recKey = 'recentReports';
                const recRaw = localStorage.getItem(recKey);
                const list = recRaw ? (JSON.parse(recRaw) as any[]) : [];
                const now = new Date().toISOString();
                const recItem = { id: reportId, url: lastUrl, filename: data?.filename || uploaded?.filename || 'report', ts: now };
                const next = [recItem, ...list.filter(r => r.id !== reportId)].slice(0, 5);
                localStorage.setItem(recKey, JSON.stringify(next));
              } catch {}
              pushEvent({ type: "job", title: "Audit complete", detail: data });
            }
          } catch (e) {
            // ignore parse errors
          }
        }
      }
      // Stream ended without explicit final
      if (!gotFinal) {
        pushEvent({ type: "job", title: "Job stream ended", detail: { reason: "eof" } });
        if (lastStageRef.current && lastStageStartRef.current) {
          const durMs = Date.now() - lastStageStartRef.current;
          pushEvent({ type: "job", title: `${lastStageRef.current} ended`, detail: { duration_ms: durMs } });
        }
        if (lastNode) setNode(lastNode, "done");

        // Fallback: poll job status once to see if the backend finished
        try {
          const statusRes = await fetch(`/api/adk/policy/audit/job/${encodeURIComponent(id)}/status`, { method: 'GET' });
          if (statusRes.ok) {
            const sj = await statusRes.json().catch(() => null);
            const completed = sj && (sj.status === 'completed' || sj.state === 'completed' || sj.done === true || sj.finished === true);
            if (completed) {
              const data = sj.result || sj.data || sj;
              setResult(data);
              pushEvent({ type: 'job', title: 'Audit complete (via status)', detail: data });
            }
          }
        } catch {}
      }
    } catch (e: any) {
      if (!abortRef.current) {
        // already finalized
      }
      pushEvent({ type: "error", title: "Stream error", detail: e?.message || e });
      // keep toaster minimal to avoid duplicate noise during retries
    } finally {
      setStreaming(false);
      abortRef.current = null;
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
    }
  };

  const cancel = async () => {
    try {
      const id = jobId;
      if (id) {
        // best-effort cancel upstream
        fetch(`/api/adk/policy/audit/job/${encodeURIComponent(id)}/cancel`, { method: 'POST' }).catch(() => {});
      }
      abortRef.current?.abort();
    } catch {}
  };

  const canAudit = useMemo(() => !!uploaded?.path && !streaming, [uploaded, streaming]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Audit Wizard</h1>
        <p className="text-muted-foreground">Upload a policy and get a comprehensive AI audit with one click. No setup needed.</p>
      </div>

      {/* Step 1: Upload */}
      <div className="border rounded-lg p-4 bg-card space-y-3">
        <div className="text-sm font-medium">1. Upload Policy</div>
        <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
          <input type="file" accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" onChange={onChoose} />
          <button className={`px-3 py-1.5 rounded border ${uploading || !file ? "opacity-50" : ""}`} disabled={uploading || !file} onClick={doUpload}>
            {uploading ? "Uploading…" : "Upload"}
          </button>
          {uploaded ? <div className="text-xs text-muted-foreground">Uploaded: <span className="font-medium">{uploaded.filename}</span></div> : null}
        </div>
      </div>

      {/* Step 2: Options (minimal) */}
      <div className="border rounded-lg p-4 bg-card space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">2. Options</div>
          <button type="button" className="text-xs underline" onClick={() => setShowAdvanced(v => !v)}>
            {showAdvanced ? 'Hide advanced' : 'Show advanced'}
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={autoStart} onChange={(e) => setAutoStart(e.target.checked)} />
            Auto-start after upload
          </label>
        </div>
        {showAdvanced && (
          <div className="grid sm:grid-cols-3 gap-3 items-center">
            <label className="text-xs text-muted-foreground">Org ID
              <input className="mt-1 w-full border rounded px-2 py-1 text-sm" value={orgId} onChange={(e) => setOrgId(e.target.value)} />
            </label>
            <label className="text-xs text-muted-foreground">Policy Type
              <select className="mt-1 w-full border rounded px-2 py-1 text-sm" value={policyType} onChange={(e) => setPolicyType(e.target.value)}>
                <option>Auto</option>
                <option>GDPR</option>
                <option>HIPAA</option>
                <option>DPDP</option>
              </select>
            </label>
            <label className="text-xs text-muted-foreground">Top K
              <input type="number" min={1} max={10} className="mt-1 w-full border rounded px-2 py-1 text-sm" value={k} onChange={(e) => setK(parseInt(e.target.value || "8", 10))} />
            </label>
            <label className="text-xs text-muted-foreground">Prefer
              <select className="mt-1 w-full border rounded px-2 py-1 text-sm" value={prefer} onChange={(e) => setPrefer(e.target.value)}>
                <option>Auto</option>
                <option>Speed</option>
                <option>Coverage</option>
              </select>
            </label>
          </div>
        )}
      </div>

      {/* Step 3: Run */}
      <div className="border rounded-lg p-4 bg-card space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">3. Run Audit</div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>
              Tools: {toolsReady.count > 0 ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200">Ready · {toolsReady.count}</span>
              ) : (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border">Auto</span>
              )}
            </span>
            <span>
              Health: {preflight?.providers === 'ok' ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200">OK</span>
              ) : (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border">Unknown</span>
              )}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className={`px-4 py-2 rounded bg-blue-600 text-white ${!canAudit ? "opacity-50" : ""}`} disabled={!canAudit} onClick={startAudit}>Audit Now</button>
          <button className="px-3 py-1.5 rounded border" disabled={!streaming} onClick={cancel}>Cancel</button>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded border p-3 bg-white/50">
            <div className="text-sm font-medium mb-2">Agent Graph</div>
            {graph ? (
              <AgentGraph graph={{ nodes: graph.nodes, edges: graph.edges }} statuses={{ ...nodeStatuses, ...edgeStatuses }} />
            ) : (
              <div className="text-xs text-muted-foreground">Loading graph…</div>
            )}
            <div className="mt-2 text-[11px] text-muted-foreground">
              Legend: idle (gray), running (blue), done (green), error (red)
            </div>
          </div>
          <div className="rounded border p-3 bg-white/50">
            <div className="text-sm font-medium mb-2">Run Timeline</div>
            <Timeline items={events} onClear={() => setEvents([])} />
          </div>
        </div>
      </div>

      {/* Step 4: Results */}
      <div className="border rounded-lg p-4 bg-card space-y-3">
        <div className="text-sm font-medium">4. Results</div>
        {result ? (
          <div className="space-y-2 text-sm">
            <div className="text-muted-foreground">Audit finished.</div>
            <div className="flex flex-wrap gap-2">
              {result?.download_url ? <a className="px-2 py-1 rounded border" href={fullUrl(result.download_url)} target="_blank" rel="noreferrer">Open Report (PDF)</a> : null}
              {result?.annotated_url ? <a className="px-2 py-1 rounded border" href={fullUrl(result.annotated_url)} target="_blank" rel="noreferrer">Open Annotated PDF</a> : null}
              {result?.results_url ? <a className="px-2 py-1 rounded border" href={fullUrl(result.results_url)} target="_blank" rel="noreferrer">Download JSON</a> : null}
              {result?.corrected_draft ? <button className="px-2 py-1 rounded border" onClick={() => navigator.clipboard.writeText(result.corrected_draft)}>Copy Corrected Draft</button> : null}
              {jobId ? <a className="px-2 py-1 rounded border" href={`/api/adk/policy/audit/job/${jobId}/artifacts`} target="_blank" rel="noreferrer">Download All</a> : null}
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No results yet.</div>
        )}
      </div>

      <div className="rounded border p-3 bg-white/50">
        <div className="text-sm font-medium mb-2">Recent Reports</div>
        <RecentReportsList />
      </div>
    </div>
  );
}

function RecentReportsList() {
  const [items, setItems] = React.useState<Array<{ id: string; url: string; filename?: string; ts?: string }>>([]);
  useEffect(() => {
    try {
      const recRaw = typeof window !== 'undefined' ? localStorage.getItem('recentReports') : null;
      if (!recRaw) return;
      const list = JSON.parse(recRaw) as any[];
      if (Array.isArray(list)) setItems(list);
    } catch {}
  }, []);
  if (!items.length) {
    return <div className="text-sm text-muted-foreground">No recent reports.</div>;
  }
  return (
    <ul className="space-y-1 text-sm">
      {items.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-2">
          <a className="underline" href={r.url}>{r.filename || r.id}</a>
          <span className="text-xs text-muted-foreground">{r.ts ? new Date(r.ts).toLocaleString() : ''}</span>
        </li>
      ))}
    </ul>
  );
}
