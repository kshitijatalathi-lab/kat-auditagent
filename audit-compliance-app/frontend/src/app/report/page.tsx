"use client";

import React from "react";
import { apiBase } from "../../lib/api";

export default function ReportPage() {
  const [summary, setSummary] = React.useState<any>(null);
  const [status, setStatus] = React.useState<string | null>(null);

  async function generate() {
    setStatus("Generating report...");
    try {
      const res = await fetch(`${apiBase()}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: "ui",
          org_id: "acme",
          items: [
            { question: "GDPR lawful basis?", user_answer: "We have it.", score: 3 },
            { question: "Encrypt ePHI at rest?", user_answer: "Pending.", score: 1 },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || "Report failed");
      setSummary(data);
      setStatus(null);
    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Report</h1>
      <button className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500" onClick={generate}>
        Generate Sample Report
      </button>
      {status && <div className="text-sm text-gray-300">{status}</div>}
      {summary && (
        <div className="rounded border border-gray-800 p-4">
          <div className="font-semibold mb-2">Summary</div>
          <pre className="text-sm text-gray-300 whitespace-pre-wrap">{JSON.stringify(summary, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
