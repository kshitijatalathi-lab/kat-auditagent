export default function HomePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">MCP Audit Compliance</h1>
      <p className="text-gray-300">Hybrid MCP-integrated audit-compliance app.</p>
      <ul className="list-disc list-inside text-gray-300">
        <li><a className="text-blue-400 hover:underline" href="/upload">Upload</a></li>
        <li><a className="text-blue-400 hover:underline" href="/audit">Audit</a></li>
        <li><a className="text-blue-400 hover:underline" href="/dashboard">Dashboard</a></li>
        <li><a className="text-blue-400 hover:underline" href="/report">Report</a></li>
      </ul>
    </div>
  );
}
