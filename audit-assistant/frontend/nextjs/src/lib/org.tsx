"use client";
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';

type OrgContextType = {
  org: string;
  setOrg: (v: string) => void;
};

const OrgContext = createContext<OrgContextType | undefined>(undefined);

export function OrgProvider({ children }: { children: ReactNode }) {
  const [org, setOrgState] = useState<string>('default_org');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem('org_id');
    if (saved) setOrgState(saved);
  }, []);

  const setOrg = (v: string) => {
    setOrgState(v);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('org_id', v);
    }
  };

  const value = useMemo(() => ({ org, setOrg }), [org]);
  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used within OrgProvider');
  return ctx;
}
