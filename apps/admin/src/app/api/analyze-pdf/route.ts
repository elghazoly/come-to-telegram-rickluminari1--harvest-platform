import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file     = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

    const buffer = await file.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')

    const response = await client.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64 }
          } as any,
          {
            type: 'text',
            text: `حلّل هذا الملف بسرعة وأجب على هذه الأسئلة بـ JSON فقط:

{
  "layout": "single" أو "double",
  "total_questions": عدد الأسئلة تقريباً,
  "has_answer_table": true/false,
  "answer_table_format": "وصف مختصر لجدول الإجابات إذا وجد",
  "year": السنة إذا ظهرت أو null,
  "subject": "المادة/الموضوع تقريباً",
  "notes": "أي ملاحظة مهمة لقراءة الملف بشكل صحيح"
}`
          }
        ]
      }]
    })

    const text = response.content.filter(b => b.type === 'text').map(b => (b as any).text).join('')
    const json = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

    return NextResponse.json({
      analysis: JSON.parse(json),
      usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens }
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
