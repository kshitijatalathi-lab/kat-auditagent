import { AuthGate } from '@/components/auth/AuthGate';

export default function Dashboard() {
  return (
    <AuthGate>
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <div className="grid md:grid-cols-3 gap-4">
        <div className="border rounded-lg p-4 bg-card">
          <div className="text-sm text-muted-foreground">Total Audits</div>
          <div className="text-3xl font-bold">—</div>
        </div>
        <div className="border rounded-lg p-4 bg-card">
          <div className="text-sm text-muted-foreground">Avg Compliance Score</div>
          <div className="text-3xl font-bold">—</div>
        </div>
        <div className="border rounded-lg p-4 bg-card">
          <div className="text-sm text-muted-foreground">In Progress</div>
          <div className="text-3xl font-bold">—</div>
        </div>
      </div>
      <div className="flex gap-3">
        <a className="px-4 py-2 rounded-md bg-blue-600 text-white" href="/audit/demo-session">Start New Audit</a>
        <a className="px-4 py-2 rounded-md border" href="/upload">Upload & Index</a>
        <a className="px-4 py-2 rounded-md border" href="/tools">Tools</a>
        <a className="px-4 py-2 rounded-md border" href="/admin">Admin</a>
      </div>
    </div>
    </AuthGate>
  );
}
