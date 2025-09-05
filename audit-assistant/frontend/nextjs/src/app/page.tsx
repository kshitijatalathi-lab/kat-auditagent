"use client";
import React from "react";
import { useRouter } from "next/navigation";
import { Chatbot } from "@/components/Chatbot";
import { ArrowRight, Upload, Zap, Shield, Download } from "lucide-react";

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      {/* Chatbot - Fixed position */}
      <Chatbot 
        className="fixed top-4 right-4 z-40"
        systemPrompt="You are an expert compliance and audit assistant. Help users understand regulatory frameworks, audit processes, policy analysis, and compliance requirements. Provide clear, actionable guidance for GDPR, HIPAA, DPDP, and other regulations."
        placeholder="Ask about compliance, audits, or regulations..."
      />
      
      <header className="px-6 py-6 bg-white/80 backdrop-blur-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="font-bold text-xl bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Audit Assistant</div>
              <div className="text-xs text-gray-500">AI-Powered Compliance Platform</div>
            </div>
          </div>
          <nav className="flex items-center gap-6">
            <a href="/wizard" className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors">
              <Zap className="w-4 h-4" />
              Wizard
            </a>
            <a href="/report" className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors">
              <Download className="w-4 h-4" />
              Reports
            </a>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-16">
        <section className="text-center space-y-8 mb-16">
          <div className="space-y-4">
            <h1 className="text-5xl sm:text-6xl font-bold tracking-tight">
              <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent">
                AI-Powered
              </span>
              <br />
              <span className="text-gray-900">Policy Audits</span>
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
              Transform your compliance workflow with intelligent multi-agent auditing. 
              Upload any policy document and get comprehensive analysis in minutes, not days.
            </p>
          </div>
          <div className="flex items-center justify-center gap-4">
            <ToolsBadge setToolsReady={setToolsReady} toolsReady={toolsReady} />
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span>Live System</span>
            </div>
          </div>
        </section>

        <section className="mb-20">
          <div className="max-w-2xl mx-auto">
            <div
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              className={`relative border-2 border-dashed rounded-2xl p-12 text-center bg-white/80 backdrop-blur-sm transition-all duration-300 ${
                isDragging 
                  ? "border-blue-400 bg-blue-50 scale-105 shadow-xl" 
                  : "border-gray-300 hover:border-gray-400 hover:shadow-lg"
              }`}
            >
              <div className="space-y-6">
                <div className="flex justify-center">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors ${
                    isDragging ? 'bg-blue-100' : 'bg-gray-100'
                  }`}>
                    <Upload className={`w-8 h-8 transition-colors ${
                      isDragging ? 'text-blue-600' : 'text-gray-600'
                    }`} />
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold text-gray-900">
                    {isDragging ? 'Drop your document here' : 'Upload Policy Document'}
                  </h3>
                  <p className="text-gray-600">
                    Supports PDF, DOCX, and TXT files up to 50MB
                  </p>
                </div>
                <div className="space-y-4">
                  <div className="text-sm text-gray-500">or</div>
                  <div className="flex flex-col sm:flex-row gap-3 items-center justify-center">
                    <input 
                      ref={inputRef} 
                      type="file" 
                      accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" 
                      onChange={onChoose}
                      className="hidden"
                    />
                    <button
                      onClick={() => inputRef.current?.click()}
                      className="px-6 py-3 border-2 border-gray-300 rounded-lg text-gray-700 hover:border-gray-400 hover:bg-gray-50 font-medium transition-colors"
                    >
                      Choose File
                    </button>
                    {file && (
                      <button
                        onClick={doUpload}
                        disabled={uploading}
                        className={`flex items-center gap-2 px-8 py-3 rounded-lg font-semibold text-white transition-all ${
                          uploading 
                            ? 'bg-gray-400 cursor-not-allowed' 
                            : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg hover:shadow-xl'
                        }`}
                      >
                        {uploading ? (
                          <>
                            <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                            Uploading...
                          </>
                        ) : (
                          <>
                            Start Audit
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  {file && (
                    <div className="text-sm text-gray-600">
                      Selected: <span className="font-medium">{file.name}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid md:grid-cols-3 gap-8">
          <div className="group bg-white/80 backdrop-blur-sm rounded-2xl p-8 border border-gray-200 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900">Multi-Agent Orchestration</h3>
            </div>
            <p className="text-gray-600 leading-relaxed">
              Coordinated analysis across specialized AI agents for clause extraction, gap detection, and intelligent remediation suggestions.
            </p>
          </div>
          
          <div className="group bg-white/80 backdrop-blur-sm rounded-2xl p-8 border border-gray-200 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900">Smart Framework Detection</h3>
            </div>
            <p className="text-gray-600 leading-relaxed">
              Automatically identifies relevant compliance frameworks (GDPR, HIPAA, DPDP) and applies appropriate audit criteria.
            </p>
          </div>
          
          <div className="group bg-white/80 backdrop-blur-sm rounded-2xl p-8 border border-gray-200 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-teal-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <Download className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900">Complete Deliverables</h3>
            </div>
            <p className="text-gray-600 leading-relaxed">
              Comprehensive reports, annotated documents, machine-readable JSON data, and actionable remediation guidance.
            </p>
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
    <div className="flex items-center gap-2">
      {toolsReady === null ? (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-gray-300 bg-white text-sm">
          <div className="animate-spin w-3 h-3 border border-gray-400 border-t-transparent rounded-full"></div>
          <span className="text-gray-600">Detecting tools...</span>
        </div>
      ) : toolsReady > 0 ? (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-sm">
          <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
          <span className="text-emerald-700 font-medium">{toolsReady} AI Tools Ready</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-orange-200 bg-orange-50 text-sm">
          <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
          <span className="text-orange-700 font-medium">Basic Mode</span>
        </div>
      )}
    </div>
  );
}
