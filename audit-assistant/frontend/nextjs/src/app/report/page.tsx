'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';

type JobRecord = {
  job_id: string;
  status: string;
  created_at?: string;
  params?: any;
  result?: any;
};

// Ensure artifact URLs are absolute to the backend origin
const fullUrl = (u?: string | null): string => {
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  const base = process.env.NEXT_PUBLIC_API_BASE || '';
  // If base is not set (dev env), fallback for known backend-served paths
  const needsBackend = /^\/(reports|adk)\//.test(u);
  const fallbackBase = needsBackend ? 'http://127.0.0.1:8011' : '';
  try {
    if (base) return new URL(u, base).toString();
    if (fallbackBase) return new URL(u, fallbackBase).toString();
    return u;
  } catch {
    return u;
  }
};

export default function ReportsListPage() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");

  useEffect(() => {
    let aborted = false;
    async function load() {
      setLoading(true);
      setErr(null);
      try {
        const r = await fetch('/api/adk/policy/audit/jobs');
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        if (!aborted) setJobs(Array.isArray(j.jobs) ? j.jobs : []);
      } catch (e: any) {
        if (!aborted) setErr(e?.message || 'Failed to load jobs');
      } finally {
        if (!aborted) setLoading(false);
      }
    }
    load();
    return () => { aborted = true; };
  }, []);

  const filtered = useMemo(() => {
    let list = Array.isArray(jobs) ? [...jobs] : [];
    if (statusFilter !== 'all') {
      list = list.filter(j => (j.status || '').toLowerCase() === statusFilter);
    }
    list.sort((a, b) => {
      const at = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
      return sortOrder === 'newest' ? bt - at : at - bt;
    });
    return list;
  }, [jobs, statusFilter, sortOrder]);
  const hasAny = useMemo(() => filtered && filtered.length > 0, [filtered]);

  async function rerun(jobId: string) {
    setBusy((b) => ({ ...b, [jobId]: true }));
    try {
      const r = await fetch(`/api/adk/policy/audit/job/${encodeURIComponent(jobId)}/rerun`, { method: 'POST' });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      // Reload jobs list so the new run appears
      const lr = await fetch('/api/adk/policy/audit/jobs');
      const lj = await lr.json();
      if (lr.ok && Array.isArray(lj.jobs)) setJobs(lj.jobs);
    } catch (e) {
      // Optionally report error; keeping minimal UI
      console.error('rerun failed', e);
    } finally {
      setBusy((b) => ({ ...b, [jobId]: false }));
    }
  }

  return (
    <ProtectedRoute>
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Recent Reports</h1>
        <div className="flex gap-2">
          <Link className="px-3 py-1.5 rounded-md border text-sm" href="/wizard">New Audit</Link>
          <Link className="px-3 py-1.5 rounded-md border text-sm" href="/">Home</Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="inline-flex items-center gap-2">Status
          <select className="border rounded px-2 py-1" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="error">Error</option>
          </select>
        </label>
        <label className="inline-flex items-center gap-2">Sort
          <select className="border rounded px-2 py-1" value={sortOrder} onChange={(e) => setSortOrder(e.target.value as any)}>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </select>
        </label>
      </div>

      {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {err && <div className="text-sm text-rose-600">{err}</div>}

      {hasAny ? (
        <div className="grid gap-3">
          {filtered.map((j) => {
            const rid = j.job_id;
            const res = j.result || {};
            const reportPath = res.report_path ? `/${String(res.report_path).replace(/^\/?/, '')}` : '';
            const annotatedPath = res.annotated_path ? `/${String(res.annotated_path).replace(/^\/?/, '')}` : '';
            const pdf = fullUrl((res.download_url as string | undefined) || (res.report_url as string | undefined) || reportPath || '');
            const jsonUrl = fullUrl(((res.results_url || res.json_url) as string | undefined) || '');
            const annotated = fullUrl((res.annotated_url as string | undefined) || annotatedPath || '');
            const created = j.created_at ? new Date(j.created_at).toLocaleString() : '';
            const reportLink = pdf || jsonUrl ? `/report/${encodeURIComponent(rid)}${buildQuery({ pdf_url: pdf, json_url: jsonUrl })}` : undefined;
            return (
              <div key={rid} className="rounded border p-4 bg-card">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{rid}</div>
                    <div className="text-xs text-muted-foreground">{created} · Status: {j.status}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {reportLink ? (
                      <Link className="px-2 py-1 rounded border text-sm" href={reportLink}>Open</Link>
                    ) : null}
                    {pdf ? (
                      <a className="px-2 py-1 rounded border text-sm" href={pdf} target="_blank" rel="noreferrer">PDF</a>
                    ) : null}
                    {annotated ? (
                      <a className="px-2 py-1 rounded border text-sm" href={annotated} target="_blank" rel="noreferrer">Annotated</a>
                    ) : null}
                    {jsonUrl ? (
                      <a className="px-2 py-1 rounded border text-sm" href={jsonUrl} target="_blank" rel="noreferrer">JSON</a>
                    ) : null}
                    <a className="px-2 py-1 rounded border text-sm" href={`/api/adk/policy/audit/job/${encodeURIComponent(rid)}/artifacts`} target="_blank" rel="noreferrer">Download All</a>
                    <button
                      className="px-2 py-1 rounded border text-sm disabled:opacity-50"
                      onClick={() => rerun(rid)}
                      disabled={!!busy[rid]}
                      title="Start a new audit with the same parameters"
                    >{busy[rid] ? 'Rerunning…' : 'Rerun'}</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">No reports yet. Run a new audit to get started.</div>
      )}
    </div>
    </ProtectedRoute>
  );
}

function buildQuery(params: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v) sp.set(k, v);
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}
