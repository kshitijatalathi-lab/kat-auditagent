export default function Home() {
  return (
    <div className="p-10">
      <h1 className="text-2xl font-semibold mb-2">Audit Assistant</h1>
      <p className="text-muted-foreground mb-6">AI-powered compliance auditing UI</p>
      <div className="flex gap-3">
        <a className="px-4 py-2 rounded-md bg-blue-600 text-white" href="/dashboard">Open Dashboard</a>
        <a className="px-4 py-2 rounded-md border" href="/audit/demo-session">Try Demo Audit</a>
      </div>
    </div>
  );
}
