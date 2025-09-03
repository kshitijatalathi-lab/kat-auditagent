import { getAuth } from 'firebase/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';

export async function apiFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const auth = getAuth();
  const token = await auth.currentUser?.getIdToken?.();
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  const baseHeaders: HeadersInit = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const headers: HeadersInit = {
    ...baseHeaders,
    ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
    ...init.headers,
  };
  const url = new URL(path, API_BASE).toString();
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  // try json, fallback text
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  // @ts-ignore
  return res.text();
}
