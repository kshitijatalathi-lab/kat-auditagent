'use client';
import { ReactNode, useEffect, useState } from 'react';
import { getAuth, onAuthStateChanged, getIdTokenResult, User } from 'firebase/auth';
import '@/lib/auth';
import { useRouter } from 'next/navigation';

export function RoleGate({ requiredRole, children, redirect = true }: { requiredRole: string; children: ReactNode; redirect?: boolean }) {
  const [user, setUser] = useState<User | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const router = useRouter();

  useEffect(() => {
    const auth = getAuth();
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) {
        setAuthorized(false);
        if (redirect) router.replace('/login');
        return;
      }
      try {
        const res = await getIdTokenResult(u, true);
        const claims: any = res.claims || {};
        const role = claims.role as string | undefined;
        const roles = (claims.roles as string[] | undefined) || [];
        const ok = role === requiredRole || roles.includes(requiredRole);
        setAuthorized(ok);
        if (!ok && redirect) router.replace('/dashboard');
      } catch {
        setAuthorized(false);
        if (redirect) router.replace('/dashboard');
      }
    });
    return () => unsub();
  }, [requiredRole, redirect, router]);

  if (authorized === null) {
    return <div className="p-6">Checking access…</div>;
  }

  if (!authorized) {
    return (
      <div className="p-6">
        <div className="rounded-md border p-4 bg-card">
          <div className="text-sm text-muted-foreground mb-2">Access Restricted</div>
          <div className="text-sm">You do not have the required role: <span className="font-medium">{requiredRole}</span>.</div>
          <div className="mt-3">
            <a className="underline" href="/dashboard">Go to Dashboard</a>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
