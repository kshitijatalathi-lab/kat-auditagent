"use client";
import React from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [file, setFile] = React.useState<File | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [toolsReady, setToolsReady] = React.useState<number | null>(null);

  const onChoose: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
  };

  const onDrop: React.DragEventHandler<HTMLDivElement> = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) setFile(f);
  };
  const onDragOver: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };
  const onDragLeave: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const doUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      if (!r.ok) throw new Error("Upload failed");
      const j = await r.json();
      // Pass uploaded payload to Wizard via sessionStorage
      if (typeof window !== "undefined") {
        sessionStorage.setItem("landingUpload", JSON.stringify(j));
      }
      router.push("/wizard");
    } catch (e) {
      // no-op minimal UI; in production, show a toast
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50">
      <header className="px-6 py-4 border-b bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/50">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="font-semibold">Audit Assistant</div>
          <nav className="text-sm text-muted-foreground flex items-center gap-4">
            <a href="/wizard" className="hover:underline">Wizard</a>
            <a href="/report" className="hover:underline">Reports</a>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        <section className="text-center space-y-3">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">One-click AI Policy Audit</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Drop your policy document below and we’ll orchestrate a multi-agent audit with the best available tools. No setup, no parameters.
          </p>
          <ToolsBadge setToolsReady={setToolsReady} toolsReady={toolsReady} />
        </section>

        <section className="mt-8">
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            className={`border-2 border-dashed rounded-xl p-10 text-center bg-white ${isDragging ? "border-blue-400 bg-blue-50" : "border-slate-200"}`}
          >
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">Drag & drop your policy (PDF, DOCX, TXT)</div>
              <div className="text-xs text-muted-foreground">or</div>
              <div className="inline-flex items-center gap-2">
                <input ref={inputRef} type="file" accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" onChange={onChoose} />
                <button
                  onClick={doUpload}
                  disabled={!file || uploading}
                  className={`px-4 py-2 rounded bg-blue-600 text-white ${!file || uploading ? "opacity-50" : "hover:bg-blue-700"}`}
                >
                  {uploading ? "Uploading…" : file ? `Audit ${file.name}` : "Choose file to audit"}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 grid sm:grid-cols-3 gap-4 text-sm">
          <div className="rounded-lg border bg-white p-4">
            <div className="font-medium">Multi-Agent Orchestration</div>
            <div className="text-muted-foreground mt-1">Coordinated analysis across specialized agents for clause extraction, gap detection, and remediation.</div>
          </div>
          <div className="rounded-lg border bg-white p-4">
            <div className="font-medium">Tool Auto-Discovery</div>
            <div className="text-muted-foreground mt-1">MCP tools and integrated utilities are auto-detected and used when beneficial.</div>
          </div>
          <div className="rounded-lg border bg-white p-4">
            <div className="font-medium">Artifacts Included</div>
            <div className="text-muted-foreground mt-1">Download full report, annotated PDFs, extracted JSON, and corrected drafts.</div>
          </div>
        </section>
      </main>
    </div>
  );
}

function ToolsBadge({ toolsReady, setToolsReady }: { toolsReady: number | null; setToolsReady: (n: number) => void }) {
  React.useEffect(() => {
    let aborted = false;
    async function load() {
      try {
        const r = await fetch('/api/ai/tools/catalog');
        if (!r.ok) return;
        const j = await r.json();
        const items: any[] = Array.isArray(j) ? j : (Array.isArray(j?.tools) ? j.tools : []);
        if (!aborted) setToolsReady(items.length);
      } catch {}
    }
    load();
    return () => { aborted = true; };
  }, [setToolsReady]);
  return (
    <div className="flex items-center justify-center gap-2 text-xs">
      {toolsReady === null ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border">Detecting tools…</span>
      ) : toolsReady > 0 ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200">Tools ready · {toolsReady}</span>
      ) : (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border">Reduced plan (no tools)</span>
      )}
    </div>
  );
}
