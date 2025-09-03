'use client';

import { useEffect, useRef, useState } from 'react';
import { useCompletion } from '@ai-sdk/react';

interface Msg { id: string; role: 'user' | 'assistant'; content: string }

export default function AssistantPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const currentAssistantId = useRef<string | null>(null);
  const [provider, setProvider] = useState<'auto' | 'gemini' | 'openai' | 'groq'>('groq');
  const [temperature, setTemperature] = useState<number>(0.2);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<any | null>(null);

  // hydrate from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('assistant_state');
      if (saved) {
        const obj = JSON.parse(saved);
        if (Array.isArray(obj.messages)) setMessages(obj.messages);
        if (obj.provider) setProvider(obj.provider);
        if (typeof obj.temperature === 'number') setTemperature(obj.temperature);
      }
    } catch {}
  }, []);

  // persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('assistant_state', JSON.stringify({ messages, provider, temperature }));
    } catch {}
  }, [messages, provider, temperature]);

  const { complete, completion, isLoading, stop: stopCompletion, setCompletion } = useCompletion({
    api: '/api/ai/chat/ai-sdk',
    onFinish: () => {
      setLoading(false);
      controllerRef.current = null;
      currentAssistantId.current = null;
    },
  });

  // Reflect streaming completion into the last assistant message
  useEffect(() => {
    if (!currentAssistantId.current) return;
    setMessages(prev => prev.map(m => (m.id === currentAssistantId.current ? { ...m, content: completion } : m)));
  }, [completion]);

  const send = async () => {
    const prompt = input.trim();
    if (!prompt || isLoading) return;
    setInput('');
    const userMsg: Msg = { id: crypto.randomUUID(), role: 'user', content: prompt };
    const asstMsg: Msg = { id: crypto.randomUUID(), role: 'assistant', content: '' };
    currentAssistantId.current = asstMsg.id;
    setMessages(prev => [...prev, userMsg, asstMsg]);
    setCompletion('');
    setLoading(true);
    await complete(prompt, {
      body: {
        // Pass provider preference and temperature through adapter
        prefer: provider === 'auto' ? undefined : provider,
        temperature,
      },
    });
  };

  const stop = () => {
    stopCompletion();
    controllerRef.current = null;
    setLoading(false);
  };

  const clear = () => {
    setMessages([]);
    setInput('');
  };

  // Quick Actions mirroring rule-clarity style, calling agent tools
  const runAgentTool = async (tool: 'index_documents' | 'score_question' | 'generate_report' | 'compute_gaps') => {
    if (actionLoading) return;
    setActionLoading(tool);
    setActionResult(null);
    // sensible defaults; user can refine in Tools page
    const defaults: Record<string, any> = {
      index_documents: { files: [
        '/home/kshitija/Downloads/kat-audit-master/uploads/CELEX_32016R0679_EN_TXT.pdf',
        '/home/kshitija/Downloads/kat-audit-master/uploads/comppoli.pdf',
      ] },
      score_question: { session_id: 'assistant', question: 'Do you encrypt data at rest?', answer: 'Yes, AES-256', provider: provider === 'auto' ? undefined : provider },
      compute_gaps: { answers: [{ question: 'Data retention policy', answer: 'Not documented', score: 1 }] },
      generate_report: { session_id: 'assistant' },
    };
    try {
      const res = await fetch('/api/ai/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool, args: defaults[tool] || {} }),
      });
      const data = await res.json();
      setActionResult(data);
    } catch (e) {
      setActionResult({ ok: false, error: 'Request failed' });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">AI Assistant</h1>

      {/* Quick Actions bar (rule-clarity-inspired) */}
      <div className="rounded-lg border p-3 bg-card">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => runAgentTool('index_documents')} disabled={actionLoading!==null} className="px-3 py-2 rounded-md border">{actionLoading==='index_documents'?'Indexing…':'Index Documents'}</button>
          <button onClick={() => runAgentTool('score_question')} disabled={actionLoading!==null} className="px-3 py-2 rounded-md border">{actionLoading==='score_question'?'Scoring…':'Quick Score'}</button>
          <button onClick={() => runAgentTool('compute_gaps')} disabled={actionLoading!==null} className="px-3 py-2 rounded-md border">{actionLoading==='compute_gaps'?'Computing…':'Compute Gaps'}</button>
          <button onClick={() => runAgentTool('generate_report')} disabled={actionLoading!==null} className="px-3 py-2 rounded-md border">{actionLoading==='generate_report'?'Generating…':'Generate Report'}</button>
        </div>
        {actionResult && (
          <div className="mt-3 rounded-md border p-3 bg-background text-sm max-h-64 overflow-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-muted-foreground">Action result</div>
              <button className="px-2 py-1 text-xs border rounded" onClick={() => navigator.clipboard.writeText(JSON.stringify(actionResult, null, 2))}>Copy</button>
            </div>
            <pre className="whitespace-pre-wrap">{JSON.stringify(actionResult, null, 2)}</pre>
          </div>
        )}
      </div>

      <div className="rounded-lg border p-3 bg-card grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
        <div>
          <label className="text-sm text-muted-foreground">Provider</label>
          <select className="mt-1 w-full border rounded-md px-2 py-1 bg-background" value={provider} onChange={(e) => setProvider(e.target.value as any)}>
            <option value="auto">Auto</option>
            <option value="gemini">Gemini</option>
            <option value="openai">OpenAI</option>
            <option value="groq">Groq</option>
          </select>
        </div>
        <div>
          <label className="text-sm text-muted-foreground">Temperature ({temperature.toFixed(2)})</label>
          <input className="mt-1 w-full" type="range" min={0} max={1} step={0.05} value={temperature} onChange={(e) => setTemperature(parseFloat(e.target.value))} />
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={clear} className="px-3 py-2 rounded-md border">Clear</button>
          <button onClick={stop} disabled={!loading} className="px-3 py-2 rounded-md border">Stop</button>
        </div>
      </div>

      <div className="border rounded-lg p-4 bg-card min-h-[300px]">
        <div className="space-y-3">
          {messages.length === 0 && (
            <div className="text-sm text-muted-foreground">Ask a question to get started…</div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={m.role === 'user' ? 'text-foreground' : 'text-muted-foreground'}>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{m.role}</div>
              <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          className="flex-1 border rounded-md px-3 py-2 bg-background"
          placeholder="Type your message and press Enter"
          disabled={loading || isLoading}
        />
        <button onClick={() => {
          const last = [...messages].reverse().find(m => m.role === 'assistant');
          if (last) navigator.clipboard.writeText(last.content || '');
        }} className="px-3 py-2 rounded-md border">Copy Reply</button>
        <button onClick={send} disabled={loading || isLoading || !input.trim()} className="px-4 py-2 rounded-md bg-primary text-primary-foreground">
          {loading || isLoading ? 'Sending…' : 'Send'}
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        Tip: We can later swap this custom UI with <code>@ai-sdk/ui</code> components once installed.
      </p>
    </div>
  );
}
