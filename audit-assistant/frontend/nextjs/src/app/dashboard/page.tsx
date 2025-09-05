"use client";
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

type SessionSummary = {
  session_id: string;
  org_id: string;
  user_id?: string;
  framework?: string;
  last_event?: string;
  last_question?: string;
  last_score?: number;
  updated_at: string;
  progress_answered?: number;
  progress_total?: number;
  progress_percent?: number;
};

export default function Dashboard() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [auditJobs, setAuditJobs] = useState<any[]>([]);

  const startAudit = useCallback(() => {
    router.push('/wizard');
  }, [router]);

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Logged out successfully');
      router.push('/login');
    } catch (error: any) {
      toast.error(error.message || 'Logout failed');
    }
  };

  useEffect(() => {
    const fetchAuditJobs = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/adk/policy/audit/jobs');
        if (response.ok) {
          const data = await response.json();
          const jobsArray = Object.entries(data).map(([jobId, jobData]: [string, any]) => ({
            id: jobId,
            ...jobData
          }));
          setAuditJobs(jobsArray.slice(0, 5)); // Show latest 5 jobs
        }
      } catch (error) {
        console.error('Failed to fetch audit jobs:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAuditJobs();
  }, []);

  return (
    <ProtectedRoute>
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-muted-foreground">Monitor your organization's compliance status and audit progress</p>
        </div>
        <a className="px-4 py-2 rounded-md bg-blue-600 text-white" href="/upload">Upload & Index Docs</a>
      </div>

      {/* User info and logout */}
      <div className="border rounded-lg p-4 bg-card">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-medium">Welcome, {user?.displayName || user?.email}</div>
            <div className="text-sm text-muted-foreground">Manage your compliance audits and reports</div>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Quick start audit */}
      <div className="border rounded-lg p-4 bg-card">
        <div className="text-lg font-medium mb-3">Start New Audit</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <button type="button" className="text-left rounded-lg border p-4 hover:bg-accent" onClick={startAudit}>
            <div className="font-medium">🚀 Audit Wizard</div>
            <div className="text-sm text-muted-foreground">Upload document and run compliance audit</div>
          </button>
          <a href="/report" className="text-left rounded-lg border p-4 hover:bg-accent block">
            <div className="font-medium">📊 View Reports</div>
            <div className="text-sm text-muted-foreground">Browse existing audit reports</div>
          </a>
          <a href="/wizard" className="text-left rounded-lg border p-4 hover:bg-accent block">
            <div className="font-medium">⚡ Quick Audit</div>
            <div className="text-sm text-muted-foreground">Fast track compliance check</div>
          </a>
        </div>
      </div>

      {/* Recent audit jobs */}
      <div className="border rounded-lg p-4 bg-card">
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-medium">Recent Audit Jobs</div>
          <div className="text-sm text-muted-foreground">User: {user?.email}</div>
        </div>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading audit jobs…</div>
        ) : auditJobs.length === 0 ? (
          <div className="text-sm text-muted-foreground">No audit jobs yet. Start a new audit above.</div>
        ) : (
          <div className="space-y-2">
            {auditJobs.map((job) => {
              const href = `/report/${job.id}`;
              const status = job.status || 'unknown';
              const createdAt = job.created_at ? new Date(job.created_at).toLocaleString() : 'Unknown';
              const policyType = job.result?.policy_type || job.params?.policy_type || 'General';
              
              return (
                <a key={job.id} href={href} className="rounded-md border p-3 hover:bg-accent block">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">Job {job.id.split('-').pop()}</div>
                      <div className="text-xs text-muted-foreground">{policyType} • {createdAt}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded-full border ${
                        status === 'completed' ? 'bg-green-50 border-green-200 text-green-700' :
                        status === 'running' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                        'bg-gray-50 border-gray-200 text-gray-700'
                      }`}>
                        {status}
                      </span>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <div className="border rounded-lg p-4 bg-card">
          <div className="text-sm text-muted-foreground">Total Audits</div>
          <div className="mt-1 text-3xl font-bold">{auditJobs.length}</div>
          <div className="text-xs text-muted-foreground mt-1">All time</div>
        </div>
        <div className="border rounded-lg p-4 bg-card">
          <div className="text-sm text-muted-foreground">Completed</div>
          <div className="mt-1 text-3xl font-bold">{auditJobs.filter(job => job.status === 'completed').length}</div>
          <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-green-500" style={{ 
              width: `${auditJobs.length > 0 ? (auditJobs.filter(job => job.status === 'completed').length / auditJobs.length) * 100 : 0}%` 
            }} />
          </div>
        </div>
        <div className="border rounded-lg p-4 bg-card">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">Running Jobs</div>
          </div>
          <div className="mt-1 text-3xl font-bold text-blue-600">{auditJobs.filter(job => job.status === 'running').length}</div>
          <div className="text-xs text-muted-foreground mt-1">In progress</div>
        </div>
        <div className="border rounded-lg p-4 bg-card">
          <div className="text-sm text-muted-foreground">Quick Actions</div>
          <div className="mt-2 space-y-2">
            <a href="/wizard" className="block text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded border border-blue-200 hover:bg-blue-100">
              New Audit
            </a>
            <a href="/report" className="block text-xs px-2 py-1 bg-gray-50 text-gray-700 rounded border border-gray-200 hover:bg-gray-100">
              View Reports
            </a>
          </div>
        </div>
      </div>
    </div>
    </ProtectedRoute>
  );
}

