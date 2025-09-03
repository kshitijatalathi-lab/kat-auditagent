'use client';
import { useState } from 'react';
import { AuthGate } from '@/components/auth/AuthGate';
import { RoleGate } from '@/components/auth/RoleGate';

const tabs = [
  { id: 'users', label: 'Users' },
  { id: 'roles', label: 'Roles' },
  { id: 'logs', label: 'Audit Logs' },
] as const;

type TabId = typeof tabs[number]['id'];

export default function AdminPage() {
  const [active, setActive] = useState<TabId>('users');

  return (
    <AuthGate>
    <RoleGate requiredRole="admin">
      <div className="p-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Admin</h1>
          <a className="underline" href="/dashboard">Back to Dashboard</a>
        </div>

        <div className="flex gap-2">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className={`px-4 py-2 rounded-md border ${active === t.id ? 'bg-blue-600 text-white border-blue-600' : ''}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {active === 'users' && <UsersTab />}
        {active === 'roles' && <RolesTab />}
        {active === 'logs' && <LogsTab />}
      </div>
    </RoleGate>
    </AuthGate>
  );
}

function UsersTab() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Users</h2>
        <div className="flex gap-2">
          <button className="px-3 py-2 rounded-md border">Invite User</button>
          <button className="px-3 py-2 rounded-md border">Sync from IdP</button>
        </div>
      </div>
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Email</th>
              <th className="text-left p-3">Role</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {[{name:'Jane Doe',email:'jane@example.com',role:'Admin',status:'Active'},{name:'John Smith',email:'john@example.com',role:'Auditor',status:'Active'}].map((u, i) => (
              <tr key={i} className="border-t">
                <td className="p-3">{u.name}</td>
                <td className="p-3">{u.email}</td>
                <td className="p-3">{u.role}</td>
                <td className="p-3">{u.status}</td>
                <td className="p-3">
                  <div className="flex gap-2">
                    <button className="px-2 py-1 rounded-md border">Edit</button>
                    <button className="px-2 py-1 rounded-md border">Deactivate</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">TODO: Wire to Firebase/Backend RBAC APIs.</p>
    </div>
  );
}

function RolesTab() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Roles</h2>
        <button className="px-3 py-2 rounded-md border">Create Role</button>
      </div>
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3">Role</th>
              <th className="text-left p-3">Permissions</th>
              <th className="text-left p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {[{role:'Admin',perms:['manage_users','view_reports','run_audits']},{role:'Auditor',perms:['run_audits','view_reports']}].map((r, i) => (
              <tr key={i} className="border-t">
                <td className="p-3">{r.role}</td>
                <td className="p-3">{r.perms.join(', ')}</td>
                <td className="p-3">
                  <div className="flex gap-2">
                    <button className="px-2 py-1 rounded-md border">Edit</button>
                    <button className="px-2 py-1 rounded-md border">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">TODO: Wire to backend RBAC service.</p>
    </div>
  );
}

function LogsTab() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Audit Logs</h2>
        <button className="px-3 py-2 rounded-md border">Refresh</button>
      </div>
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3">Timestamp</th>
              <th className="text-left p-3">User</th>
              <th className="text-left p-3">Action</th>
              <th className="text-left p-3">Target</th>
            </tr>
          </thead>
          <tbody>
            {[{ts:'2025-09-02 10:00',user:'jane',action:'SCORE_QUESTION',target:'session:demo'}, {ts:'2025-09-02 10:05',user:'john',action:'GENERATE_REPORT',target:'session:demo'}].map((l, i) => (
              <tr key={i} className="border-t">
                <td className="p-3">{l.ts}</td>
                <td className="p-3">{l.user}</td>
                <td className="p-3">{l.action}</td>
                <td className="p-3">{l.target}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">TODO: Wire to backend audit logs endpoint (or Firestore).</p>
    </div>
  );
}
