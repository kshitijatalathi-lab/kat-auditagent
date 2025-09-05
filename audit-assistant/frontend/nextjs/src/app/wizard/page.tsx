"use client";
import React, { useMemo, useRef, useState, useEffect } from "react";
import { toast } from "sonner";
import { Timeline, type TimelineItem } from "@/components/Timeline";
import { AgentGraph } from "@/components/AgentGraph";
import { Chatbot } from "@/components/Chatbot";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";

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
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState<{ path: string; filename: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [orgId, setOrgId] = useState<string>("default");

  // Update orgId when user changes
  useEffect(() => {
    if (user?.uid) {
      setOrgId(user.uid);
    }
  }, [user]);
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
          const agentData = await r.json();
          // Convert agent registry to graph format
          if (agentData.agents) {
            const nodes = agentData.agents.map((agent: any) => ({
              id: agent.id,
              label: agent.name || agent.id
            }));
            // Create simple sequential edges for workflow
            const edges = [];
            for (let i = 0; i < nodes.length - 1; i++) {
              edges.push({
                from: nodes[i].id,
                to: nodes[i + 1].id,
                label: "→"
              });
            }
            const graphData = { nodes, edges };
            setGraph(graphData);
            const ns: Record<string, any> = {};
            nodes.forEach((n: any) => (ns[n.id] = "idle"));
            setNodeStatuses(ns);
          }
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
    <ProtectedRoute>
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Chatbot - Fixed position */}
      <Chatbot 
        className="fixed top-4 right-4 z-40"
        systemPrompt="You are an expert compliance and audit assistant. Help users understand regulatory frameworks, audit processes, policy analysis, and compliance requirements. Provide clear, actionable guidance for GDPR, HIPAA, DPDP, and other regulations."
        placeholder="Ask about compliance, audits, or regulations..."
      />
      
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="text-center py-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-4">Audit Wizard</h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">Upload a policy document and get a comprehensive AI-powered compliance audit with real-time progress tracking. No setup needed.</p>
        </div>

        {/* Step 1: Upload */}
        <div className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-semibold text-sm">1</div>
            <div className="text-lg font-semibold text-gray-900">Upload Policy Document</div>
          </div>
          <div 
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
            }`}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
          >
            <div className="space-y-4">
              <div className="text-4xl">📄</div>
              <div>
                <p className="text-lg font-medium text-gray-900 mb-2">Drop your policy document here</p>
                <p className="text-sm text-gray-500 mb-4">Supports PDF, DOCX, and TXT files up to 50MB</p>
                <div className="flex flex-col sm:flex-row gap-3 items-center justify-center">
                  <input 
                    ref={inputRef}
                    type="file" 
                    accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" 
                    onChange={onChoose}
                    className="hidden"
                  />
                  <button 
                    onClick={() => inputRef.current?.click()}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  >
                    Choose File
                  </button>
                  {file && (
                    <button 
                      className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                        uploading ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
                      } text-white`} 
                      disabled={uploading} 
                      onClick={doUpload}
                    >
                      {uploading ? 'Uploading...' : `Upload ${file.name}`}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
          {uploaded && (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="text-green-600">✓</div>
              <div className="text-sm">
                <span className="font-medium text-green-800">Uploaded:</span>
                <span className="text-green-700 ml-1">{uploaded.filename}</span>
              </div>
            </div>
          )}
        </div>

        {/* Step 2: Options (minimal) */}
        <div className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-semibold text-sm">2</div>
              <div className="text-lg font-semibold text-gray-900">Configuration</div>
            </div>
            <button 
              type="button" 
              className="text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors" 
              onClick={() => setShowAdvanced(v => !v)}
            >
              {showAdvanced ? '← Hide Advanced' : 'Advanced Options →'}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm">
              <input 
                type="checkbox" 
                checked={autoStart} 
                onChange={(e) => setAutoStart(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <span className="text-gray-700">Auto-start audit after upload</span>
            </label>
          </div>
          {showAdvanced && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
              <label className="space-y-2">
                <span className="text-sm font-medium text-gray-700">Organization ID</span>
                <input 
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" 
                  value={orgId} 
                  onChange={(e) => setOrgId(e.target.value)} 
                  placeholder="default"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-gray-700">Policy Framework</span>
                <select 
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" 
                  value={policyType} 
                  onChange={(e) => setPolicyType(e.target.value)}
                >
                  <option>Auto</option>
                  <option>GDPR</option>
                  <option>HIPAA</option>
                  <option>DPDP</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-gray-700">Analysis Depth</span>
                <input 
                  type="number" 
                  min={1} 
                  max={10} 
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" 
                  value={k} 
                  onChange={(e) => setK(parseInt(e.target.value || "8", 10))} 
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-gray-700">Optimization</span>
                <select 
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" 
                  value={prefer} 
                  onChange={(e) => setPrefer(e.target.value)}
                >
                  <option>Auto</option>
                  <option>Speed</option>
                  <option>Coverage</option>
                </select>
              </label>
            </div>
          )}
        </div>

        {/* Step 3: Run */}
        <div className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-semibold text-sm">3</div>
              <div className="text-lg font-semibold text-gray-900">Run Audit</div>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-gray-600">Tools:</span>
                {toolsReady.count > 0 ? (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-medium">
                    Ready · {toolsReady.count}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full border text-xs">Auto</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-600">Health:</span>
                {preflight?.providers === 'ok' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-medium">
                    OK
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full border text-xs">Unknown</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              className={`px-8 py-3 rounded-lg font-semibold text-white transition-all ${
                !canAudit 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg hover:shadow-xl'
              }`} 
              disabled={!canAudit} 
              onClick={startAudit}
            >
              {streaming ? '🔄 Running Audit...' : '🚀 Start Audit'}
            </button>
            <button 
              className="px-6 py-3 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 font-medium transition-colors" 
              disabled={!streaming} 
              onClick={cancel}
            >
              Cancel
            </button>
          </div>
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Agent Workflow</h3>
                <div className="text-xs text-gray-500">Real-time status</div>
              </div>
              {graph ? (
                <AgentGraph graph={{ nodes: graph.nodes, edges: graph.edges }} statuses={{ ...nodeStatuses, ...edgeStatuses }} />
              ) : (
                <div className="flex items-center justify-center py-8 text-gray-500">
                  <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mr-2"></div>
                  Loading workflow...
                </div>
              )}
              <div className="flex items-center gap-4 text-xs text-gray-500 pt-2 border-t">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-gray-300 rounded-full"></div>
                  <span>Idle</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span>Running</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Done</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                  <span>Error</span>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Execution Timeline</h3>
                <button 
                  onClick={() => setEvents([])} 
                  className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
                  disabled={events.length === 0}
                >
                  Clear
                </button>
              </div>
              <Timeline items={events} onClear={() => setEvents([])} />
            </div>
          </div>
        </div>

        {/* Step 4: Results */}
        <div className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-semibold text-sm">4</div>
            <div className="text-lg font-semibold text-gray-900">Results & Downloads</div>
          </div>
          {result ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="text-green-600 text-xl">🎉</div>
                <div>
                  <div className="font-medium text-green-800">Audit Complete!</div>
                  <div className="text-sm text-green-700">Your compliance report is ready for download.</div>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {result?.download_url && (
                  <a 
                    className="flex items-center gap-3 p-4 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors group" 
                    href={fullUrl(result.download_url)} 
                    target="_blank" 
                    rel="noreferrer"
                  >
                    <div className="text-2xl">📊</div>
                    <div>
                      <div className="font-medium text-blue-900 group-hover:text-blue-700">PDF Report</div>
                      <div className="text-xs text-blue-600">Comprehensive audit results</div>
                    </div>
                  </a>
                )}
                {result?.annotated_url && (
                  <a 
                    className="flex items-center gap-3 p-4 border border-purple-200 rounded-lg hover:bg-purple-50 transition-colors group" 
                    href={fullUrl(result.annotated_url)} 
                    target="_blank" 
                    rel="noreferrer"
                  >
                    <div className="text-2xl">📝</div>
                    <div>
                      <div className="font-medium text-purple-900 group-hover:text-purple-700">Annotated PDF</div>
                      <div className="text-xs text-purple-600">Highlighted policy document</div>
                    </div>
                  </a>
                )}
                {result?.results_url && (
                  <a 
                    className="flex items-center gap-3 p-4 border border-green-200 rounded-lg hover:bg-green-50 transition-colors group" 
                    href={fullUrl(result.results_url)} 
                    target="_blank" 
                    rel="noreferrer"
                  >
                    <div className="text-2xl">💾</div>
                    <div>
                      <div className="font-medium text-green-900 group-hover:text-green-700">JSON Data</div>
                      <div className="text-xs text-green-600">Machine-readable results</div>
                    </div>
                  </a>
                )}
                {jobId && (
                  <a 
                    className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors group" 
                    href={`/api/adk/policy/audit/job/${jobId}/artifacts`} 
                    target="_blank" 
                    rel="noreferrer"
                  >
                    <div className="text-2xl">📦</div>
                    <div>
                      <div className="font-medium text-gray-900 group-hover:text-gray-700">All Files</div>
                      <div className="text-xs text-gray-600">Complete artifact bundle</div>
                    </div>
                  </a>
                )}
                {result?.corrected_draft && (
                  <button 
                    className="flex items-center gap-3 p-4 border border-orange-200 rounded-lg hover:bg-orange-50 transition-colors group" 
                    onClick={() => navigator.clipboard.writeText(result.corrected_draft)}
                  >
                    <div className="text-2xl">📋</div>
                    <div>
                      <div className="font-medium text-orange-900 group-hover:text-orange-700">Copy Draft</div>
                      <div className="text-xs text-orange-600">Corrected policy text</div>
                    </div>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">⏳</div>
              <div className="text-gray-600">Results will appear here after the audit completes</div>
            </div>
          )}
        </div>

        <div className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="text-xl">📋</div>
            <div className="text-lg font-semibold text-gray-900">Recent Reports</div>
          </div>
          <RecentReportsList />
        </div>
      </div>
    </div>
    </ProtectedRoute>
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
    return (
      <div className="text-center py-6 text-gray-500">
        <div className="text-2xl mb-2">📊</div>
        <div className="text-sm">No recent reports yet</div>
        <div className="text-xs text-gray-400 mt-1">Your completed audits will appear here</div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((r) => (
        <div key={r.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
          <a className="flex-1 font-medium text-blue-600 hover:text-blue-700 transition-colors" href={r.url}>
            {r.filename || r.id}
          </a>
          <span className="text-xs text-gray-500">
            {r.ts ? new Date(r.ts).toLocaleString() : ''}
          </span>
        </div>
      ))}
    </div>
  );
}
