"use client";
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AuthGate } from '@/components/auth/AuthGate';
import { useOrg } from '@/lib/org';
import { apiFetch } from '@/lib/api';

type SessionSummary = {
  session_id: string;
  org_id: string;
  user_id?: string;
  framework?: string;
  last_event?: string;
  last_question?: string;
  last_score?: number;
  updated_at: string;
  progress_answered?: number;
  progress_total?: number;
  progress_percent?: number;
};

export default function Dashboard() {
  const router = useRouter();
  const startAudit = useCallback((framework: string) => {
    const id = `sess-${Math.random().toString(36).slice(2, 8)}`;
    router.push(`/audit/${id}?framework=${framework}`);
  }, [router]);
  const { org } = useOrg();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await apiFetch<{ items: SessionSummary[] }>(`/api/adk/sessions?org_id=${encodeURIComponent(org)}`);
        if (cancelled) return;
        setSessions(Array.isArray((data as any).items) ? (data as any).items : []);
      } catch {
        setSessions([]);
      } finally {
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [org]);
  return (
    <AuthGate>
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-muted-foreground">Monitor your organization's compliance status and audit progress</p>
        </div>
        <a className="px-4 py-2 rounded-md bg-blue-600 text-white" href="/upload">Upload & Index Docs</a>
      </div>

      {/* Framework-specific quick start */}
      <div className="border rounded-lg p-4 bg-card">
        <div className="text-lg font-medium mb-3">Start an Audit</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <button type="button" className="text-left rounded-lg border p-4 hover:bg-accent" onClick={() => startAudit('GDPR')}>
            <div className="font-medium">GDPR</div>
            <div className="text-sm text-muted-foreground">EU data protection compliance</div>
          </button>
          <button type="button" className="text-left rounded-lg border p-4 hover:bg-accent" onClick={() => startAudit('HIPAA')}>
            <div className="font-medium">HIPAA</div>
            <div className="text-sm text-muted-foreground">US healthcare data privacy</div>
          </button>
          <button type="button" className="text-left rounded-lg border p-4 hover:bg-accent" onClick={() => startAudit('DPDP')}>
            <div className="font-medium">DPDP (India)</div>
            <div className="text-sm text-muted-foreground">Digital Personal Data Protection</div>
          </button>
          <button type="button" className="text-left rounded-lg border p-4 hover:bg-accent" onClick={() => startAudit('OTHER')}>
            <div className="font-medium">Other / Custom</div>
            <div className="text-sm text-muted-foreground">Generic audit questions</div>
          </button>
          <button type="button" className="text-left rounded-lg border p-4 hover:bg-accent" onClick={() => startAudit('OTHER')}>
            <div className="font-medium">POSH Policy</div>
            <div className="text-sm text-muted-foreground">Start with OTHER, upload POSH policy, then Generate Checklist</div>
          </button>
        </div>
      </div>

      {/* Resume audits */}
      <div className="border rounded-lg p-4 bg-card">
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-medium">Resume Audits</div>
          <div className="text-sm text-muted-foreground">Org: {org}</div>
        </div>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading sessions…</div>
        ) : sessions.length === 0 ? (
          <div className="text-sm text-muted-foreground">No sessions yet. Start a new audit above.</div>
        ) : (
          <div className="space-y-2">
            {sessions.slice(0, 6).map((s) => {
              const href = `/audit/${encodeURIComponent(s.session_id)}${s.framework ? `?framework=${encodeURIComponent(s.framework)}` : ''}`;
              const pct = typeof s.progress_percent === 'number' ? s.progress_percent : undefined;
              const label = typeof s.progress_answered === 'number' && typeof s.progress_total === 'number'
                ? `${s.progress_answered}/${s.progress_total}`
                : undefined;
              return (
                <a key={s.session_id} href={href} className="rounded-md border p-3 hover:bg-accent block">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">Session {s.session_id}</div>
                      <div className="text-xs text-muted-foreground">{s.framework || 'Unknown framework'} • Updated {new Date(s.updated_at).toLocaleString()}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">Last: {s.last_question || s.last_event || '—'}</div>
                  </div>
                  {pct !== undefined && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Progress</span>
                        <span>{label} ({pct.toFixed(0)}%)</span>
                      </div>
                      <div className="mt-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-blue-600" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
                      </div>
                    </div>
                  )}
                </a>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <div className="border rounded-lg p-4 bg-card">
          <div className="text-sm text-muted-foreground">Total Audits</div>
          <div className="mt-1 text-3xl font-bold">24</div>
          <div className="text-xs text-muted-foreground mt-1">+2 from last month</div>
        </div>
        <div className="border rounded-lg p-4 bg-card">
          <div className="text-sm text-muted-foreground">Completed</div>
          <div className="mt-1 text-3xl font-bold">18</div>
          <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-green-500" style={{ width: '75%' }} />
          </div>
        </div>
        <div className="border rounded-lg p-4 bg-card">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">Avg. Score</div>
          </div>
          <div className="mt-1 text-3xl font-bold text-green-600">4.2/5.0</div>
          <div className="text-xs text-muted-foreground mt-1">+0.3 from last quarter</div>
        </div>
        <div className="border rounded-lg p-4 bg-card">
          <div className="text-sm text-muted-foreground">Pending Reviews</div>
          <div className="mt-1 text-3xl font-bold">3</div>
          <div className="text-xs text-muted-foreground mt-1">Requires attention</div>
        </div>
      </div>

      <div className="border rounded-lg p-4 bg-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">Recent Audits</h2>
          <a className="px-3 py-1.5 rounded-md border text-sm" href="/audits">View All Audits</a>
        </div>
        <div className="space-y-3">
          {[{t:'GDPR Compliance', org:'ACME Corp', score:'4.5/5.0', status:'Completed', time:'2 hours ago'},
            {t:'HIPAA Assessment', org:'HealthTech Ltd', score:'—', status:'In Progress', time:'1 day ago'},
            {t:'SOC 2 Type II', org:'DataFlow Inc', score:'—', status:'Pending', time:'3 days ago'}].map((it, i) => (
            <a key={i} href="/audit/demo" className="flex items-center justify-between rounded-lg border p-4 hover:bg-accent">
              <div>
                <div className="font-medium">{it.t}</div>
                <div className="text-sm text-muted-foreground">{it.org}</div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-green-600 text-sm font-medium">{it.score}</div>
                <span className={`text-xs px-2 py-1 rounded-full border ${it.status==='Completed'?'bg-green-50 border-green-200 text-green-700': it.status==='In Progress'?'bg-amber-50 border-amber-200 text-amber-700':'bg-muted text-foreground'}`}>{it.status}</span>
                <div className="text-xs text-muted-foreground">{it.time}</div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
    </AuthGate>
  );
}

