import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const ANALYSIS_PROMPT = [
  'حلّل هذا الملف بدقة وأجب بـ JSON فقط بدون أي نص خارجه:',
  '',
  '{',
  '  "language": "arabic" أو "english" أو "mixed",',
  '  "reading_direction": "rtl" أو "ltr",',
  '  "layout": "single" أو "double",',
  '  "total_questions": عدد الأسئلة تقريباً,',
  '  "has_answer_table": true/false,',
  '  "answer_table_format": "وصف مختصر لجدول الإجابات إذا وجد أو null",',
  '  "has_images_in_questions": true/false,',
  '  "images_count": عدد الأسئلة التي تحتوي صور أو أشكال أو جداول تقريباً,',
  '  "has_general_explanation": true/false,',
  '  "explanation_location": "before_questions" أو "after_questions" أو "none",',
  '  "explanation_summary": "ملخص مختصر للشرح إذا وجد أو null",',
  '  "year": السنة إذا ظهرت أو null,',
  '  "subject": "المادة/الموضوع",',
  '  "notes": "أي ملاحظة مهمة لقراءة الملف بشكل صحيح"',
  '}',
].join('\n')

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
            type:   'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64 }
          } as any,
          {
            type: 'text',
            text: ANALYSIS_PROMPT,
          }
        ]
      }]
    })

    const text = response.content.filter(b => b.type === 'text').map(b => (b as any).text).join('')
    const json = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()

    let analysis: any
    try {
      analysis = JSON.parse(json)
    } catch {
      return NextResponse.json({ error: 'Invalid analysis response', raw: text.slice(0, 200) }, { status: 500 })
    }

    return NextResponse.json({
      analysis,
      usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens }
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
