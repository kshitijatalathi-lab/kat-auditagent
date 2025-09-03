import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE || ''
  const url = `${API_BASE}/ai/providers/health`
  const auth = req.headers.get('authorization') || ''
  const res = await fetch(url, { headers: { authorization: auth } })
  const data = await res.json().catch(() => ({}))
  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { 'content-type': 'application/json' },
  })
}
