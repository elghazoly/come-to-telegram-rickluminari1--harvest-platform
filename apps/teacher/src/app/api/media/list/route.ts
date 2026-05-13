import { NextResponse } from 'next/server'

const WORKER_URL   = process.env.NEXT_PUBLIC_CF_WORKER_URL!
const WORKER_TOKEN = process.env.CF_WORKER_TOKEN!

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const prefix = searchParams.get('prefix') || ''

  const r = await fetch(`${WORKER_URL}/?prefix=${encodeURIComponent(prefix)}`, {
    headers: { 'X-Auth-Token': WORKER_TOKEN }
  })

  if (!r.ok) return NextResponse.json({ files: [] })

  const data = await r.json()
  return NextResponse.json({ files: data.files || [] })
}
