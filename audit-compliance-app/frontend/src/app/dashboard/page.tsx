"use client";

import React from "react";
import { apiBase } from "../../lib/api";

type Health = { ok: boolean; env: Record<string, unknown> };

type Frameworks = { frameworks: string[] };

export default function DashboardPage() {
  const [health, setHealth] = React.useState<Health | null>(null);
  const [frameworks, setFrameworks] = React.useState<string[]>([]);

  React.useEffect(() => {
    (async () => {
      try {
        const h = await fetch(`${apiBase()}/health`).then((r) => r.json());
        const f = await fetch(`${apiBase()}/checklists`).then((r) => r.json());
        setHealth(h);
        setFrameworks((f as Frameworks).frameworks || []);
      } catch (e) {
        // ignore for minimal demo
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded border border-gray-800 p-4">
          <div className="font-semibold mb-2">Backend Health</div>
          <pre className="text-xs text-gray-300 whitespace-pre-wrap">{JSON.stringify(health, null, 2)}</pre>
        </div>
        <div className="rounded border border-gray-800 p-4">
          <div className="font-semibold mb-2">Frameworks</div>
          <ul className="text-sm text-gray-300 list-disc list-inside">
            {frameworks.map((fw) => (
              <li key={fw}>{fw}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
