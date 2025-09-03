'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthGate } from '@/components/auth/AuthGate';

interface Framework {
  id: string;
  slug: string;
  title: string;
  categories: string[];
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  description: string;
  questions: number;
  duration: string;
  region: string;
  updatedAt: string;
}

const MOCK_FRAMEWORKS: Framework[] = [
  {
    id: 'gdpr', slug: 'gdpr', title: 'GDPR Compliance',
    categories: ['Data Protection'], difficulty: 'Advanced',
    description: 'European Union General Data Protection Regulation comprehensive assessment covering data processing, consent, rights, and security requirements.',
    questions: 47, duration: '2-3 hours', region: 'European Union', updatedAt: '2024-01-15',
  },
  {
    id: 'hipaa', slug: 'hipaa', title: 'HIPAA Security Rule',
    categories: ['Healthcare'], difficulty: 'Intermediate',
    description: 'Requirements for protected health information (PHI) in healthcare organizations.',
    questions: 32, duration: '1.5-2 hours', region: 'United States', updatedAt: '2024-01-10',
  },
  {
    id: 'dpdp', slug: 'dpdp', title: 'India DPDP Act 2023',
    categories: ['Data Protection'], difficulty: 'Intermediate',
    description: 'Digital Personal Data Protection Act compliance assessment for organizations processing personal data of Indian residents.',
    questions: 38, duration: '2 hours', region: 'India', updatedAt: '2024-01-12',
  },
  {
    id: 'soc2', slug: 'soc2', title: 'SOC 2 Type II',
    categories: ['Security'], difficulty: 'Advanced',
    description: 'Assessment focusing on security, availability, processing integrity, confidentiality, and privacy.',
    questions: 52, duration: '3-4 hours', region: 'Global', updatedAt: '2024-01-08',
  },
  {
    id: 'ccpa', slug: 'ccpa', title: 'CCPA Compliance',
    categories: ['Data Protection'], difficulty: 'Beginner',
    description: 'California Consumer Privacy Act requirements for businesses collecting personal information from California residents.',
    questions: 28, duration: '1-1.5 hours', region: 'California, US', updatedAt: '2024-01-14',
  },
];

const CATEGORIES = ['All', 'Data Protection', 'Healthcare', 'Security'] as const;

type Cat = typeof CATEGORIES[number];

export default function ChecklistsPage() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<Cat>('All');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return MOCK_FRAMEWORKS.filter(f => {
      const okCat = cat === 'All' || f.categories.includes(cat);
      const okQ = !needle ||
        f.title.toLowerCase().includes(needle) ||
        f.description.toLowerCase().includes(needle) ||
        f.categories.some(c => c.toLowerCase().includes(needle));
      return okCat && okQ;
    });
  }, [q, cat]);

  const startAudit = (slug: string) => {
    const id = typeof crypto !== 'undefined' && (crypto as any).randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    router.push(`/audit/${id}?framework=${encodeURIComponent(slug)}`);
  };

  return (
    <AuthGate>
      <div className="p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Audit Checklists</h1>
          <p className="text-muted-foreground">Select a compliance framework to begin your AI-powered audit assessment</p>
        </div>

        <div className="border rounded-lg p-4 bg-card">
          <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search checklists..."
              className="w-full md:w-1/2 border rounded-md px-3 py-2 bg-background"
            />
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(c => (
                <button
                  key={c}
                  onClick={() => setCat(c)}
                  className={`px-3 py-1.5 rounded-full border text-sm ${cat===c ? 'bg-blue-600 text-white' : ''}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          {filtered.map(f => (
            <div key={f.id} className="rounded-xl border p-5 bg-card">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-lg font-semibold">{f.title}</div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {f.categories.map((c, i) => (
                      <span key={i} className="text-xs px-2 py-1 rounded-full border bg-muted">{c}</span>
                    ))}
                    <span className="text-xs px-2 py-1 rounded-full border bg-muted">{f.difficulty}</span>
                  </div>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{f.description}</p>
              <div className="mt-4 grid sm:grid-cols-4 gap-3 text-sm">
                <div>{f.questions} questions</div>
                <div>{f.duration}</div>
                <div>{f.region}</div>
                <div>Updated {new Date(f.updatedAt).toLocaleDateString()}</div>
              </div>
              <div className="mt-4 flex gap-2">
                <button onClick={() => startAudit(f.slug)} className="px-4 py-2 rounded-md bg-blue-600 text-white">Start Audit</button>
                <button onClick={() => alert('Preview coming soon')} className="px-4 py-2 rounded-md border">Preview</button>
              </div>
            </div>
          ))}
        </div>

        <div className="border rounded-lg p-5 bg-card">
          <div className="text-lg font-medium mb-4">Framework Coverage</div>
          <div className="grid sm:grid-cols-4 gap-4 text-center">
            <div className="rounded-lg border p-4">
              <div className="text-2xl font-bold">{MOCK_FRAMEWORKS.length}</div>
              <div className="text-sm text-muted-foreground">Total Frameworks</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-2xl font-bold">{MOCK_FRAMEWORKS.reduce((s, f) => s + f.questions, 0)}</div>
              <div className="text-sm text-muted-foreground">Total Questions</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-2xl font-bold">5</div>
              <div className="text-sm text-muted-foreground">Regions Covered</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-2xl font-bold">AI</div>
              <div className="text-sm text-muted-foreground">Powered Analysis</div>
            </div>
          </div>
        </div>
      </div>
    </AuthGate>
  );
}
