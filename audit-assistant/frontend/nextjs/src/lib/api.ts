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
  // Build URL safely:
  // - If path is absolute (http/https), use it as-is
  // - Else if path starts with '/api/', keep it relative to use Next.js proxy
  // - Else if API_BASE provided, resolve against it
  // - Else fall back to using the relative path directly
  let url: string;
  if (/^https?:\/\//i.test(path)) {
    url = path;
  } else if (/^\/api\//.test(path)) {
    // Keep Next.js API routes relative so they proxy to the backend
    url = path;
  } else if (API_BASE) {
    url = new URL(path, API_BASE).toString();
  } else {
    url = path; // e.g., '/adk/checklists/GDPR' -> same origin
  }
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
