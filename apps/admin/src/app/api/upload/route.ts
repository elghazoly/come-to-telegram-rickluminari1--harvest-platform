import { NextResponse } from 'next/server'

const WORKER_URL   = process.env.NEXT_PUBLIC_CF_WORKER_URL!
const WORKER_TOKEN = process.env.CF_WORKER_TOKEN!

export async function POST(req: Request) {
  const formData = await req.formData()
  const file     = formData.get('file') as File
  const path     = formData.get('path') as string

  if (!file || !path) {
    return NextResponse.json({ error: 'file and path required' }, { status: 400 })
  }

  const r = await fetch(`${WORKER_URL}/${path}`, {
    method:  'PUT',
    headers: {
      'X-Auth-Token': WORKER_TOKEN,
      'Content-Type': file.type,
    },
    body: file.stream(),
    // @ts-ignore
    duplex: 'half',
  })

  if (!r.ok) {
    const e = await r.json().catch(() => ({}))
    return NextResponse.json({ error: e.error || r.status }, { status: 400 })
  }

  const data = await r.json()
  return NextResponse.json({ url: data.url })
}

export async function DELETE(req: Request) {
  const { path } = await req.json()
  if (!path) return NextResponse.json({ error: 'path required' }, { status: 400 })

  const r = await fetch(`${WORKER_URL}/${path}`, {
    method:  'DELETE',
    headers: { 'X-Auth-Token': WORKER_TOKEN },
  })

  return NextResponse.json({ success: r.ok })
}
