"use client";
import React, { useMemo } from "react";
import { Activity, AlertTriangle, PlayCircle, Workflow } from "lucide-react";

export type TimelineItem = {
  id: string;
  ts?: string;
  type?: string; // e.g., 'job' | 'plan' | 'execute' | 'tool' | 'error' | 'event'
  title: string;
  detail?: any;
};

export function Timeline({ items, filterTypes, onClear }: { items: TimelineItem[]; filterTypes?: string[]; onClear?: () => void }) {
  const list = useMemo(() => {
    let arr = items || [];
    if (filterTypes && filterTypes.length) arr = arr.filter(i => i.type && filterTypes.includes(i.type));
    return arr;
  }, [items, filterTypes]);

  const fmtDuration = (ms: number) => {
    if (!Number.isFinite(ms) || ms < 0) return null;
    if (ms < 1000) return `${Math.round(ms)}ms`;
    const s = ms / 1000;
    if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`;
    const m = Math.floor(s / 60);
    const rs = Math.round(s % 60);
    return `${m}m${rs ? ` ${rs}s` : ''}`;
  };

  const badge = (t?: string) => {
    const base = "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border";
    switch (t) {
      case "error": return <span className={base + " bg-red-50 text-red-700 border-red-200"}><AlertTriangle className="w-3 h-3"/>error</span>;
      case "tool": return <span className={base + " bg-amber-50 text-amber-700 border-amber-200"}><Activity className="w-3 h-3"/>tool</span>;
      case "plan": return <span className={base + " bg-indigo-50 text-indigo-700 border-indigo-200"}><Workflow className="w-3 h-3"/>plan</span>;
      case "execute": return <span className={base + " bg-green-50 text-green-700 border-green-200"}><PlayCircle className="w-3 h-3"/>execute</span>;
      case "job": return <span className={base + " bg-sky-50 text-sky-700 border-sky-200"}><Activity className="w-3 h-3"/>job</span>;
      default: return t ? <span className={base + " bg-gray-50 text-gray-700 border-gray-200"}>{t}</span> : null;
    }
  };

  if (!list || list.length === 0) {
    return (
      <div className="text-xs text-gray-500 flex items-center justify-between">
        <div>No events yet.</div>
        {onClear ? <button className="text-[11px] underline" onClick={onClear}>Clear</button> : null}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end">
        {onClear ? <button className="text-[11px] underline" onClick={onClear}>Clear</button> : null}
      </div>
      <ul className="space-y-2">
        {list.map((it) => (
          <li key={it.id} className="border rounded p-2 bg-white/70">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                {badge(it.type)}
                <div className="font-medium flex items-center gap-2">
                  <span>{it.title}</span>
                  {it.detail && typeof it.detail === 'object' && typeof it.detail.duration_ms === 'number' ? (
                    <span className="text-[10px] text-gray-500">· {fmtDuration(it.detail.duration_ms)}</span>
                  ) : null}
                </div>
              </div>
              {it.ts ? <div className="text-gray-500">{new Date(it.ts).toLocaleTimeString()}</div> : null}
            </div>
            {it.detail !== undefined && (
              <pre className="mt-1 whitespace-pre-wrap break-words text-[11px] text-gray-700">
                {typeof it.detail === "string" ? it.detail : JSON.stringify(it.detail, null, 2)}
              </pre>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
