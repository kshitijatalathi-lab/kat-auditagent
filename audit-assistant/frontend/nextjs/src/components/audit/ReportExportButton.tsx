'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';

export type ReportItemInput = {
  question: string;
  user_answer: string;
  score: number;
  rationale: string;
  llm_provider: string;
  llm_model: string;
  clauses: any[];
};

export function ReportExportButton({
  sessionId,
  buildItems,
  className,
  label = 'Generate PDF Report',
  orgId,
  disabled,
  disabledReason,
}: {
  sessionId: string;
  buildItems: () => ReportItemInput[];
  className?: string;
  label?: string;
  orgId?: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [format, setFormat] = useState<'executive' | 'detailed' | 'summary'>('executive');
  const [theme, setTheme] = useState<'classic' | 'modern' | 'minimal'>('modern');
  const [includeEvidence, setIncludeEvidence] = useState(true);
  const canGenerate = useMemo(() => !loading && !disabled, [loading, disabled]);

  const onExport = async () => {
    try {
      setLoading(true);
      const items = buildItems();
      const body = {
        session_id: sessionId,
        org_id: orgId || 'default_org',
        items,
        // options may be ignored by backend but help drive future rendering
        options: { format, theme, includeEvidence },
      };
      const rep = await apiFetch<{ pdf_gcs?: string; json_gcs?: string; pdf_path?: string; json_path?: string }>(
        '/api/adk/report',
        { method: 'POST', body: JSON.stringify(body) }
      );
      const pdf = rep.pdf_gcs || rep.pdf_path || '';
      const json = rep.json_gcs || rep.json_path || '';
      const qp = new URLSearchParams({ pdf_url: String(pdf), json_url: String(json) }).toString();
      toast.success('Report generated', { description: 'Opening report page…' });
      const url = `/report/${encodeURIComponent(sessionId)}?${qp}`;
      // Persist last report URL for quick access from the sidebar
      try { if (typeof window !== 'undefined') localStorage.setItem('lastReportUrl', url); } catch {}
      router.push(url);
    } catch (e) {
      toast.error('Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={className || ''}>
      <div className="flex flex-col gap-2">
        <button
          onClick={() => setShowOptions((v) => !v)}
          className="px-4 py-2 rounded-md border w-full text-left"
        >
          {label}
        </button>
        {showOptions && (
          <div className="border rounded-md p-3 space-y-3 bg-background">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="text-sm">
                <div className="text-muted-foreground mb-1">Format</div>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as any)}
                  className="w-full border rounded-md px-2 py-1"
                >
                  <option value="executive">Executive Summary</option>
                  <option value="summary">Compliance Summary</option>
                  <option value="detailed">Detailed (with findings)</option>
                </select>
              </label>
              <label className="text-sm">
                <div className="text-muted-foreground mb-1">Theme</div>
                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value as any)}
                  className="w-full border rounded-md px-2 py-1"
                >
                  <option value="modern">Modern</option>
                  <option value="classic">Classic</option>
                  <option value="minimal">Minimal</option>
                </select>
              </label>
              <label className="text-sm flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={includeEvidence}
                  onChange={(e) => setIncludeEvidence(e.target.checked)}
                />
                <span>Include evidence citations</span>
              </label>
            </div>
            {disabled && (
              <div className="text-xs text-amber-600">{disabledReason || 'Please complete all required items before exporting.'}</div>
            )}
            <button
              onClick={onExport}
              disabled={!canGenerate}
              className={`px-4 py-2 rounded-md ${loading ? 'bg-gray-300' : 'bg-blue-600 text-white'}`}
            >
              {loading ? 'Generating report…' : 'Generate and View'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
