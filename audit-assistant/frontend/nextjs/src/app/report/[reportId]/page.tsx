'use client';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

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

export default function ReportPage() {
  const routeParams = useParams<{ reportId: string }>();
  const router = useRouter();
  const sp = useSearchParams();
  const qpPdf = sp.get('pdf_url') || '';
  const qpJson = sp.get('json_url') || '';
  const jobId = routeParams?.reportId as string;
  const [job, setJob] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [jsonErr, setJsonErr] = useState<string | null>(null);
  const [jsonLoading, setJsonLoading] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const onCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // no toast system imported here; keep silent success
    } catch {}
  }, []);

  // Load job details to enrich artifact links
  useEffect(() => {
    let aborted = false;
    async function loadJob() {
      if (!jobId) return;
      setLoading(true);
      setErr(null);
      try {
        const r = await fetch(`/api/adk/policy/audit/job/${encodeURIComponent(jobId)}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        if (!aborted) setJob(j);
      } catch (e: any) {
        if (!aborted) setErr(e?.message || 'Failed to load job');
      } finally {
        if (!aborted) setLoading(false);
      }
    }
    loadJob();
    return () => { aborted = true; };
  }, [jobId]);

  const res = job?.result || {};
  // Build robust links with multiple fallbacks
  const reportPath = res.report_path ? `/${String(res.report_path).replace(/^\/?/, '')}` : '';
  const annotatedPath = res.annotated_path ? `/${String(res.annotated_path).replace(/^\/?/, '')}` : '';
  const pdf = fullUrl(qpPdf || res.download_url || res.report_url || reportPath || '');
  const jsonUrl = fullUrl(qpJson || res.results_url || res.json_url || '');
  const annotated = fullUrl(res.annotated_url || annotatedPath || '');

  async function doRerun() {
    if (!jobId) return;
    setRerunning(true);
    try {
      const r = await fetch(`/api/adk/policy/audit/job/${encodeURIComponent(jobId)}/rerun`, { method: 'POST' });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      // Navigate to Reports list so user can see the new run
      router.push('/report');
    } catch (e) {
      // Keep UI minimal; could add an inline error message if desired
    } finally {
      setRerunning(false);
    }
  }

  useEffect(() => {
    let aborted = false;
    async function load() {
      if (!jsonUrl) return;
      setJsonLoading(true);
      setJsonErr(null);
      try {
        const r = await fetch(jsonUrl);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (!aborted) {
          const s = (data?.summary as string) || null;
          setSummary(s);
        }
      } catch (e: any) {
        if (!aborted) setJsonErr(e?.message || 'Failed to load JSON');
      } finally {
        if (!aborted) setJsonLoading(false);
      }
    }
    load();
    return () => {
      aborted = true;
    };
  }, [jsonUrl]);
  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Compliance Report</h1>
          <div className="text-sm text-muted-foreground">Report ID: {routeParams?.reportId}</div>
          {job?.status && <div className="text-xs text-muted-foreground mt-1">Status: {job.status}</div>}
        </div>
        <div className="flex flex-wrap gap-2">
          {pdf ? <a className="px-3 py-2 rounded-md bg-blue-600 text-white" href={pdf} target="_blank" rel="noreferrer">Open Report</a> : null}
          {jobId ? <a className="px-3 py-2 rounded-md border" href={`/api/adk/policy/audit/job/${encodeURIComponent(jobId)}/artifacts`} target="_blank" rel="noreferrer">Download All</a> : null}
          {jobId ? <button className="px-3 py-2 rounded-md border disabled:opacity-50" onClick={doRerun} disabled={rerunning}>{rerunning ? 'Rerunning…' : 'Rerun'}</button> : null}
          <a className="px-3 py-2 rounded-md border" href="/report">Back to Reports</a>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-lg border p-5 bg-card space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-medium">PDF Report</div>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${pdf ? 'bg-green-50 border-green-200 text-green-700' : 'bg-muted text-foreground'}`}>{pdf ? 'Ready' : 'Unavailable'}</span>
          </div>
          <p className="text-sm text-muted-foreground">Shareable, printable PDF with selected theme and format.</p>
          <div className="flex flex-wrap gap-2">
            {pdf ? (
              <>
                <a className="px-3 py-2 rounded-md bg-blue-600 text-white" href={pdf} target="_blank" rel="noreferrer">View PDF</a>
                <a className="px-3 py-2 rounded-md border" href={pdf} download>Download</a>
                <button className="px-3 py-2 rounded-md border" onClick={() => onCopy(pdf)}>Copy Link</button>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">PDF link not provided by backend.</span>
            )}
          </div>
        </div>

        <div className="rounded-lg border p-5 bg-card space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-medium">JSON Export</div>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${jsonUrl ? 'bg-green-50 border-green-200 text-green-700' : 'bg-muted text-foreground'}`}>{jsonUrl ? 'Ready' : 'Unavailable'}</span>
          </div>
          <p className="text-sm text-muted-foreground">Machine-readable results for integration and automation.</p>
          <div className="flex flex-wrap gap-2">
            {jsonUrl ? (
              <>
                <a className="px-3 py-2 rounded-md border" href={jsonUrl} target="_blank" rel="noreferrer">Open JSON</a>
                <a className="px-3 py-2 rounded-md border" href={jsonUrl} download>Download</a>
                <button className="px-3 py-2 rounded-md border" onClick={() => onCopy(jsonUrl)}>Copy Link</button>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">JSON link not provided by backend.</span>
            )}
          </div>
        </div>
      </div>

      {annotated ? (
        <div className="rounded-lg border p-5 bg-card space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-medium">Annotated PDF</div>
            <span className="text-xs px-2 py-0.5 rounded-full border bg-green-50 border-green-200 text-green-700">Ready</span>
          </div>
          <p className="text-sm text-muted-foreground">PDF annotated with clause highlights and references.</p>
          <div className="flex flex-wrap gap-2">
            <a className="px-3 py-2 rounded-md border" href={annotated} target="_blank" rel="noreferrer">Open Annotated PDF</a>
            <a className="px-3 py-2 rounded-md border" href={annotated} download>Download</a>
            <button className="px-3 py-2 rounded-md border" onClick={() => onCopy(annotated)}>Copy Link</button>
          </div>
        </div>
      ) : null}

      {(summary || jsonLoading || jsonErr) && (
        <div className="rounded-lg border p-5 bg-card space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-medium">Executive Summary</div>
            {jsonLoading && <span className="text-xs text-muted-foreground">Loading…</span>}
            {jsonErr && <span className="text-xs text-rose-600">{jsonErr}</span>}
          </div>
          {summary && (
            <div className="prose prose-sm max-w-none whitespace-pre-wrap">
              {summary}
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border p-5 bg-card">
        <div className="text-sm text-muted-foreground">Tip: You can always return to this report from the sidebar's recent activity or by bookmarking the link.</div>
        {err && <div className="text-xs text-rose-600 mt-2">{err}</div>}
        {loading && <div className="text-xs text-muted-foreground mt-2">Loading job details…</div>}
      </div>
    </div>
  );
}
