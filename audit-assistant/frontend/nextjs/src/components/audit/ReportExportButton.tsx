'use client';
import { useState } from 'react';
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
  label = 'Export Report',
  orgId,
}: {
  sessionId: string;
  buildItems: () => ReportItemInput[];
  className?: string;
  label?: string;
  orgId?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const onExport = async () => {
    try {
      setLoading(true);
      const items = buildItems();
      const rep = await apiFetch<{ pdf_gcs?: string; json_gcs?: string; pdf_path?: string; json_path?: string }>(
        '/adk/report',
        { method: 'POST', body: JSON.stringify({ session_id: sessionId, org_id: orgId || 'default_org', items }) }
      );
      const pdf = rep.pdf_gcs || rep.pdf_path || '';
      const json = rep.json_gcs || rep.json_path || '';
      const qp = new URLSearchParams({ pdf_url: String(pdf), json_url: String(json) }).toString();
      toast.success('Report generated', {
        description: 'Opening report page…',
      });
      router.push(`/report/${encodeURIComponent(sessionId)}?${qp}`);
    } catch (e) {
      toast.error('Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button onClick={onExport} disabled={loading} className={className || 'px-4 py-2 rounded-md border'}>
      {loading ? 'Exporting…' : label}
    </button>
  );
}
