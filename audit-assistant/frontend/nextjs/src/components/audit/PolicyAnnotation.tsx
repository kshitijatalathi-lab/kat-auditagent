"use client";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export type PolicyAnnotationProps = {
  sessionId: string;
  orgId: string;
  evidencePath?: string;
  gaps: { count: number; items: any[] } | null;
  className?: string;
};

export function PolicyAnnotation({ sessionId, orgId, evidencePath, gaps, className }: PolicyAnnotationProps) {
  const [loading, setLoading] = useState(false);
  const [annotatedPath, setAnnotatedPath] = useState<string>("");
  const disabled = useMemo(() => !evidencePath || !gaps || (gaps.items || []).length === 0, [evidencePath, gaps]);

  const annotate = async () => {
    try {
      if (disabled) return;
      setLoading(true);
      const body = { file: evidencePath, gaps: gaps?.items || [] };
      const resp = await fetch('/api/adk/policy/annotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.detail || 'Annotation failed');
      const path = String(json?.annotated_path || '');
      setAnnotatedPath(path);
      toast.success('Annotated policy created');
      // persist into session state meta
      try {
        const getRes = await fetch(`/api/adk/sessions/${encodeURIComponent(sessionId)}/state?org_id=${encodeURIComponent(orgId)}`);
        const state = getRes.ok ? await getRes.json() : { session_id: sessionId, org_id: orgId, answers: [], meta: {} };
        const meta = state.meta || {};
        const next = { ...state, meta: { ...meta, annotated_path: path } };
        await fetch(`/api/adk/sessions/${encodeURIComponent(sessionId)}/state`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
        });
      } catch {}
    } catch (e: any) {
      toast.error(e?.message || 'Annotate failed');
    } finally {
      setLoading(false);
    }
  };

  const downloadUrl = annotatedPath
    ? `/api/files?path=${encodeURIComponent(annotatedPath)}&org_id=${encodeURIComponent(orgId)}&session_id=${encodeURIComponent(sessionId)}`
    : '';

  return (
    <div className={"rounded-lg border p-4 bg-card space-y-2 " + (className || '')}>
      <div className="text-sm font-medium">Policy Annotation</div>
      <div className="text-xs text-muted-foreground">Annotate the uploaded policy with gap highlights.</div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={annotate} disabled={disabled || loading}>
          {loading ? 'Annotating…' : 'Annotate Policy'}
        </Button>
        {disabled && <div className="text-xs text-muted-foreground">Upload a policy and compute gaps first.</div>}
      </div>
      {annotatedPath && (
        <div className="text-xs">
          Annotated file: <a className="underline" href={downloadUrl} target="_blank" rel="noreferrer">{annotatedPath}</a>
        </div>
      )}
      {gaps && (
        <div>
          <div className="text-xs text-muted-foreground mb-1">Gaps preview</div>
          <Textarea className="w-full h-32 font-mono text-xs" value={JSON.stringify(gaps, null, 2)} onChange={() => {}} />
        </div>
      )}
    </div>
  );
}
