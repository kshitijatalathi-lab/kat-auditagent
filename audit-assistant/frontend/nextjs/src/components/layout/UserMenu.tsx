'use client';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { LogOut, LayoutDashboard, Shield, ChevronDown, Building2 } from 'lucide-react';
import Link from 'next/link';
import { signOut, onAuthStateChanged, User } from 'firebase/auth';
import { auth, isFirebaseConfigured } from '@/lib/auth';
import { useEffect, useState } from 'react';
import { useOrg } from '@/lib/org';

export function UserMenu() {
  const [user, setUser] = useState<User | null>(null);
  const { org } = useOrg();

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
    }
    window.location.href = '/login';
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
          <span className="truncate max-w-[180px]">{user?.email || 'Account'}</span>
          <ChevronDown size={16} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content sideOffset={8} className="z-50 min-w-[220px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
        <DropdownMenu.Item asChild>
          <Link href="/dashboard" className="flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-2 text-sm outline-none hover:bg-accent">
            <LayoutDashboard size={16} />
            Dashboard
          </Link>
        </DropdownMenu.Item>
        <DropdownMenu.Item asChild>
          <Link href="/admin" className="flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-2 text-sm outline-none hover:bg-accent">
            <Shield size={16} />
            Admin
          </Link>
        </DropdownMenu.Item>
        <DropdownMenu.Separator className="my-1 h-px bg-border" />
        <div className="px-2 py-1.5 text-xs text-muted-foreground flex items-center gap-2">
          <Building2 size={14} />
          Org: <span className="font-medium">{org}</span>
        </div>
        <DropdownMenu.Separator className="my-1 h-px bg-border" />
        <DropdownMenu.Item onClick={handleSignOut} className="flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-2 text-sm outline-none hover:bg-accent">
          <LogOut size={16} />
          Sign out
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
