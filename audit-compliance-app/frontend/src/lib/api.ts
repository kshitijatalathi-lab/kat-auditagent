export function apiBase(): string {
  return process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8010';
}
