'use client';
import Link from 'next/link';

export default function ReportIndexPage() {
  return (
    <div className="p-8 space-y-4">
      <h1 className="text-2xl font-semibold">Report not found</h1>
      <p className="text-muted-foreground">
        You reached the report page without a report ID. Please generate a report first, or open a link of the
        form <code>/report/&lt;reportId&gt;?pdf_url=...&json_url=...</code>.
      </p>
      <div>
        <Link href="/dashboard" className="underline">Back to Dashboard</Link>
      </div>
    </div>
  );
}
