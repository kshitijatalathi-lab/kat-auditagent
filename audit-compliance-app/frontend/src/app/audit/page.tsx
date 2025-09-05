"use client";

import React from "react";
import { apiBase } from "../../lib/api";

type ChecklistItem = { id: string; category?: string; question: string };

export default function AuditPage() {
  const [framework, setFramework] = React.useState("gdpr");
  const [items, setItems] = React.useState<ChecklistItem[]>([]);
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [result, setResult] = React.useState<any>(null);
  const [agentixResult, setAgentixResult] = React.useState<any>(null);
  const [rawText, setRawText] = React.useState("");
  const [status, setStatus] = React.useState<string | null>(null);

  async function loadChecklist() {
    const res = await fetch(`${apiBase()}/checklists/${framework}`);
    const data = await res.json();
    setItems(data?.items || []);
  }

  React.useEffect(() => {
    loadChecklist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [framework]);

  async function onScore(e: React.FormEvent) {
    e.preventDefault();
    if (!items.length) return;
    const first = items[0];
    const payload = {
      session_id: "ui",
      framework,
      question: first.question,
      user_answer: answers[first.id] || "",
      k: 5,
    };
    const res = await fetch(`${apiBase()}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setResult(data);
  }

  async function onAgentix(e: React.FormEvent) {
    e.preventDefault();
    setStatus("Running full Agentix UX audit...");
    try {
      // Collect current answers for shown questions (first 3 for brevity)
      const ua: Record<string, string> = {};
      items.slice(0, 3).forEach((it) => {
        if (answers[it.id]) ua[it.id] = answers[it.id];
      });

      const payload = {
        session_id: "ui",
        framework,
        raw_text: rawText || undefined,
        user_answers: ua,
      };
      const res = await fetch(`${apiBase()}/agentix/ux/audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || "Agentix UX audit failed");
      setAgentixResult(data);
      setStatus(null);
    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Audit</h1>
      <div className="flex items-center gap-3">
        <label>Framework</label>
        <select
          className="bg-gray-900 border border-gray-700 rounded px-3 py-2"
          value={framework}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFramework(e.target.value)}
        >
          <option value="gdpr">GDPR</option>
          <option value="hipaa">HIPAA</option>
          <option value="dpdp">DPDP</option>
        </select>
      </div>

      <form onSubmit={onScore} className="space-y-4">
        {items.slice(0, 3).map((it: ChecklistItem) => (
          <div key={it.id} className="space-y-2">
            <div className="text-sm text-gray-400">{it.category}</div>
            <div className="font-medium">{it.question}</div>
            <textarea
              className="w-full min-h-[90px] bg-gray-900 border border-gray-700 rounded px-3 py-2"
              value={answers[it.id] || ""}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setAnswers({ ...answers, [it.id]: e.target.value })}
              placeholder="Type your answer"
            />
          </div>
        ))}
        <button className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500" type="submit">
          Score first question
        </button>
      </form>

      {result && (
        <div className="rounded border border-gray-800 p-4">
          <div className="font-semibold mb-2">Score Result</div>
          <pre className="text-sm text-gray-300 whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}

      <div className="h-px bg-gray-800" />

      <h2 className="text-lg font-semibold">Run Full Agentix UX Audit</h2>
      <form onSubmit={onAgentix} className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm text-gray-400">Raw Text (optional)</label>
          <textarea
            className="w-full min-h-[120px] bg-gray-900 border border-gray-700 rounded px-3 py-2"
            placeholder="Paste policy or UX/process text here..."
            value={rawText}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setRawText(e.target.value)}
          />
        </div>
        <button className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500" type="submit">
          Run Agentix Audit
        </button>
      </form>
      {status && <div className="text-sm text-gray-300">{status}</div>}

      {agentixResult && (
        <div className="rounded border border-gray-800 p-4">
          <div className="font-semibold mb-2">Agentix Result</div>
          <pre className="text-sm text-gray-300 whitespace-pre-wrap">{JSON.stringify(agentixResult, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
