"use client";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export type AgentHistoryProps = {
  sessionId: string;
  orgId: string;
  className?: string;
};

type AgentRun = { ts: string; tool: string; args: any; output: any };

export function AgentHistory({ sessionId, orgId, className }: AgentHistoryProps) {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(false);

  const sorted = useMemo(() => {
    return [...runs].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  }, [runs]);

  const refresh = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ org_id: orgId });
      const res = await fetch(`/api/adk/sessions/${encodeURIComponent(sessionId)}/state?${qs.toString()}`);
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      const meta = json?.meta || {};
      const list: AgentRun[] = Array.isArray(meta.agent_runs) ? meta.agent_runs : [];
      setRuns(list);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load agent history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, [sessionId, orgId]);

  const rerun = async (run: AgentRun) => {
    try {
      const resp = await fetch('/api/ai/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: run.tool, args: run.args || {} })
      });
      const json = await resp.json();
      if (!resp.ok || json.ok === false) throw new Error(json.error || 'Agent rerun failed');
      toast.success(`${run.tool} re-executed`);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || 'Rerun error');
    }
  };

  return (
    <div className={"rounded-lg border p-4 bg-card space-y-3 " + (className || '')}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Agent History</div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={refresh} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</Button>
        </div>
      </div>
      {sorted.length === 0 && (
        <div className="text-sm text-muted-foreground">No agent runs yet.</div>
      )}
      <div className="space-y-2">
        {sorted.map((r, idx) => {
          const i = idx;
          const isOpen = !!expanded[i];
          return (
            <div key={`${r.ts}-${idx}`} className="rounded-md border p-2 bg-background">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{new Date(r.ts).toLocaleString()}</span>
                  <span className="font-medium">{r.tool}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => rerun(r)}>Re-run</Button>
                  <Button size="sm" variant="ghost" onClick={() => setExpanded(prev => ({ ...prev, [i]: !isOpen }))}>{isOpen ? 'Hide' : 'View'}</Button>
                </div>
              </div>
              {isOpen && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Args</div>
                    <Textarea className="w-full h-28 font-mono text-xs" value={JSON.stringify(r.args, null, 2)} onChange={() => {}} />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Output</div>
                    <Textarea className="w-full h-28 font-mono text-xs" value={JSON.stringify(r.output, null, 2)} onChange={() => {}} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
