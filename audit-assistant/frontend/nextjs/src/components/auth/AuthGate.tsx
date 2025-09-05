'use client';
import { ReactNode, useEffect, useState } from 'react';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { isFirebaseConfigured } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import '@/lib/auth';

export function AuthGate({ children, allowAnonymous = false }: { children: ReactNode; allowAnonymous?: boolean }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      // No Firebase; treat as anonymous allowed session
      setUser(null);
      return;
    }
    const auth = getAuth();
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured) return; // skip redirects when not configured
    if (user === null && !allowAnonymous) {
      router.replace('/login');
    }
  }, [user, router, allowAnonymous]);

  if (user === undefined) {
    return <div className="p-6 text-sm text-muted-foreground">Checking authentication…</div>;
  }
  if (!user && !allowAnonymous) return null;
  return <>{children}</>;
}
