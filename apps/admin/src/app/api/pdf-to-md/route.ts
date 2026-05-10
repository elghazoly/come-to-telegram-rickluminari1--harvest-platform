import { NextResponse } from 'next/server'
import { writeFile, unlink } from 'fs/promises'
import { exec } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import { randomUUID } from 'crypto'

const execAsync = promisify(exec)

export async function POST(req: Request) {
  const formData = await req.formData()
  const file = formData.get('file') as File
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const tmpId   = randomUUID()
  const tmpPath = join('/tmp', `${tmpId}.pdf`)

  try {
    // Save PDF to temp file
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(tmpPath, buffer)

    // Convert to Markdown
    const scriptPath = join(process.cwd(), 'scripts', 'pdf_to_md.py')
    const { stdout, stderr } = await execAsync(`python3 "${scriptPath}" "${tmpPath}"`, {
      maxBuffer: 10 * 1024 * 1024 // 10MB
    })

    if (stderr && !stdout) {
      return NextResponse.json({ error: stderr }, { status: 500 })
    }

    return NextResponse.json({ markdown: stdout })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  } finally {
    await unlink(tmpPath).catch(() => {})
  }
}
