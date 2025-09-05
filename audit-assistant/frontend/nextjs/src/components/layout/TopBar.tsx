'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { auth, isFirebaseConfigured } from '@/lib/auth';
import { useOrg } from '@/lib/org';
import { UserMenu } from './UserMenu';
import { SidebarTrigger } from '@/components/ui/sidebar';

export function TopBar() {
  const [user, setUser] = useState<User | null>(null);
  const { org, setOrg } = useOrg();

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setUser(null);
      return;
    }
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  const handleSignOut = async () => {
    if (isFirebaseConfigured) {
      try { await signOut(auth); } catch {}
      window.location.href = '/login';
    } else {
      window.location.href = '/login';
    }
  };

  return (
    <div className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto max-w-screen-2xl px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <SidebarTrigger />
          <Link href="/dashboard" className="font-semibold">Audit Assistant</Link>
          <span className="text-muted-foreground text-sm">|</span>
          <div className="flex items-center gap-2">
            <label htmlFor="org" className="text-sm text-muted-foreground">Org</label>
            <select
              id="org"
              value={org}
              onChange={(e) => setOrg(e.target.value)}
              className="text-sm border rounded-md px-2 py-1 bg-background"
            >
              <option value="default_org">default_org</option>
              <option value="acme_corp">acme_corp</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <UserMenu />
        </div>
      </div>
    </div>
  );
}
