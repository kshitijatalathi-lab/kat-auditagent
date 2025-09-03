'use client';
import { ReactNode, useEffect, useState } from 'react';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import '@/lib/auth';

export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    const auth = getAuth();
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (user === null) {
      router.replace('/login');
    }
  }, [user, router]);

  if (user === undefined) {
    return <div className="p-6 text-sm text-muted-foreground">Checking authentication…</div>;
  }
  if (!user) return null;
  return <>{children}</>;
}
