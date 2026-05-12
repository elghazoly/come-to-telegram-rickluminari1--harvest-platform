import { NextResponse } from 'next/server'
const WORKER_URL   = process.env.NEXT_PUBLIC_CF_WORKER_URL!
const WORKER_TOKEN = process.env.CF_WORKER_TOKEN!

export async function POST(req: Request) {
  const formData = await req.formData()
  const file = formData.get('file') as File
  const path = formData.get('path') as string
  if (!file || !path) return NextResponse.json({ error: 'missing params' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())

  const r = await fetch(`${WORKER_URL}/${path}`, {
    method: 'PUT',
    headers: { 'X-Auth-Token': WORKER_TOKEN, 'Content-Type': file.type || 'video/mp4' },
    body: buffer,
  })
  if (!r.ok) {
    const errText = await r.text()
    return NextResponse.json({ error: errText }, { status: 400 })
  }
  const data = await r.json()
  return NextResponse.json({ url: data.url })
}

export async function DELETE(req: Request) {
  const { path } = await req.json()
  const r = await fetch(`${WORKER_URL}/${path}`, {
    method: 'DELETE', headers: { 'X-Auth-Token': WORKER_TOKEN }
  })
  return NextResponse.json({ success: r.ok })
}
