'use client';
import { useSearchParams } from 'next/navigation';

export default function ReportPage({ params }: { params: { reportId: string } }) {
  const sp = useSearchParams();
  const pdf = sp.get('pdf_url') || '';
  const json = sp.get('json_url') || '';
  return (
    <div className="p-8 space-y-4">
      <h1 className="text-2xl font-semibold">Report {params.reportId}</h1>
      <p className="text-muted-foreground">Your report has been generated. Use the links below to download.</p>
      <div className="flex gap-3">
        {pdf ? (
          <a className="px-4 py-2 rounded-md bg-blue-600 text-white" href={pdf} target="_blank" rel="noreferrer">Download PDF</a>
        ) : (
          <span className="px-4 py-2 rounded-md border text-muted-foreground">PDF not available</span>
        )}
        {json ? (
          <a className="px-4 py-2 rounded-md border" href={json} target="_blank" rel="noreferrer">Download JSON</a>
        ) : (
          <span className="px-4 py-2 rounded-md border text-muted-foreground">JSON not available</span>
        )}
      </div>
      <div className="mt-6">
        <a className="underline" href="/dashboard">Back to Dashboard</a>
      </div>
    </div>
  );
}
