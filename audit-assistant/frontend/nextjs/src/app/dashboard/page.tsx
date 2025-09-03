import { AuthGate } from '@/components/auth/AuthGate';

export default function Dashboard() {
  return (
    <AuthGate>
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-muted-foreground">Monitor your organization's compliance status and audit progress</p>
        </div>
        <a className="px-4 py-2 rounded-md bg-blue-600 text-white" href="/upload">+ Start New Audit</a>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <div className="border rounded-lg p-4 bg-card">
          <div className="text-sm text-muted-foreground">Total Audits</div>
          <div className="mt-1 text-3xl font-bold">24</div>
          <div className="text-xs text-muted-foreground mt-1">+2 from last month</div>
        </div>
        <div className="border rounded-lg p-4 bg-card">
          <div className="text-sm text-muted-foreground">Completed</div>
          <div className="mt-1 text-3xl font-bold">18</div>
          <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-green-500" style={{ width: '75%' }} />
          </div>
        </div>
        <div className="border rounded-lg p-4 bg-card">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">Avg. Score</div>
          </div>
          <div className="mt-1 text-3xl font-bold text-green-600">4.2/5.0</div>
          <div className="text-xs text-muted-foreground mt-1">+0.3 from last quarter</div>
        </div>
        <div className="border rounded-lg p-4 bg-card">
          <div className="text-sm text-muted-foreground">Pending Reviews</div>
          <div className="mt-1 text-3xl font-bold">3</div>
          <div className="text-xs text-muted-foreground mt-1">Requires attention</div>
        </div>
      </div>

      <div className="border rounded-lg p-4 bg-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">Recent Audits</h2>
          <a className="px-3 py-1.5 rounded-md border text-sm" href="/audits">View All Audits</a>
        </div>
        <div className="space-y-3">
          {[{t:'GDPR Compliance', org:'ACME Corp', score:'4.5/5.0', status:'Completed', time:'2 hours ago'},
            {t:'HIPAA Assessment', org:'HealthTech Ltd', score:'—', status:'In Progress', time:'1 day ago'},
            {t:'SOC 2 Type II', org:'DataFlow Inc', score:'—', status:'Pending', time:'3 days ago'}].map((it, i) => (
            <a key={i} href="/audit/demo" className="flex items-center justify-between rounded-lg border p-4 hover:bg-accent">
              <div>
                <div className="font-medium">{it.t}</div>
                <div className="text-sm text-muted-foreground">{it.org}</div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-green-600 text-sm font-medium">{it.score}</div>
                <span className={`text-xs px-2 py-1 rounded-full border ${it.status==='Completed'?'bg-green-50 border-green-200 text-green-700': it.status==='In Progress'?'bg-amber-50 border-amber-200 text-amber-700':'bg-muted text-foreground'}`}>{it.status}</span>
                <div className="text-xs text-muted-foreground">{it.time}</div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
    </AuthGate>
  );
}

