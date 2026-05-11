import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const LETTER_MAP: Record<string, string> = { A: 'أ', B: 'ب', C: 'ج', D: 'د' }

const SYSTEM_PROMPT = `أنت متخصص في استخراج أسئلة الاختيار من متعدد من صفحات PDF العربية.
مهمتك الوحيدة: إرجاع JSON صالح بدون أي نص إضافي أو backticks.`

function buildPrompt(rules?: string): string {
  return `استخرج جميع أسئلة الاختيار من متعدد من هذه الصفحة وأرجع JSON فقط.

## قواعد صارمة:

1. **الترتيب**: رتّب حسب رقم السؤال الظاهر في الصفحة.

2. **الخيارات**: لكل سؤال 4 خيارات (A، B، C، D).
   إذا كانت في عمودين: A=أيمن-أول، B=أيسر-أول، C=أيمن-ثاني، D=أيسر-ثاني.

3. **الإجابات**: ابحث عن جدول الإجابات في أسفل الصفحة مثل:
   \`1  | 2  | 3  | ...\`
   \`A  | C  | B  | ...\`
   استخرج الإجابة الصحيحة بدقة. **لا تخمّن أبداً.**

4. **السنة**: استخرج السنة في حقل year إذا وجدت.

${rules ? `5. **شروط إضافية**:\n${rules}` : ''}

## JSON المطلوب:
{
  "topic": "عنوان الموضوع",
  "questions": [
    {
      "number": 1,
      "text": "نص السؤال كاملاً",
      "choices": [
        { "label": "A", "text": "نص الخيار" },
        { "label": "B", "text": "نص الخيار" },
        { "label": "C", "text": "نص الخيار" },
        { "label": "D", "text": "نص الخيار" }
      ],
      "correct_answer": "A",
      "year": 2024
    }
  ]
}`
}

export async function POST(req: NextRequest) {
  try {
    const formData  = await req.formData()
    const file      = formData.get('file') as File
    const rules     = formData.get('rules') as string || ''
    const maxTokens = parseInt(formData.get('maxTokens') as string || '6000')

    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

    // Convert file to base64
    const buffer  = await file.arrayBuffer()
    const base64  = Buffer.from(buffer).toString('base64')
    const mimeType = file.type || 'application/pdf'

    const tokenLimit = Math.min(Math.max(maxTokens, 2000), 8000)

    const response = await client.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: tokenLimit,
      system:     SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type:       'base64',
              media_type: mimeType as 'application/pdf',
              data:       base64,
            },
          },
          {
            type: 'text',
            text: buildPrompt(rules),
          }
        ]
      }]
    })

    const rawText = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as any).text)
      .join('')

    const jsonText = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()

    let parsed: any
    try {
      parsed = JSON.parse(jsonText)
    } catch {
      return NextResponse.json({ error: 'Model returned invalid JSON', raw: rawText.slice(0, 300) }, { status: 500 })
    }

    // Sort by question number
    const questions = (parsed.questions || []).sort((a: any, b: any) => a.number - b.number)

    // Convert to app format
    const appReady = questions
      .filter((q: any) => q.choices?.length === 4)
      .map((q: any) => ({
        num:         q.number,
        text:        q.text,
        year:        q.year || null,
        needs_image: false,
        ans_text:    '',
        options: q.choices.map((c: any) => ({
          letter:     LETTER_MAP[c.label] || c.label,
          text:       c.text,
          is_correct: c.label === q.correct_answer,
        }))
      }))

    console.log(`PDF direct: extracted ${appReady.length} questions | ${response.usage.input_tokens}+${response.usage.output_tokens} tokens`)

    return NextResponse.json({
      questions: appReady,
      topic:     parsed.topic,
      usage: {
        input_tokens:  response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      }
    })

  } catch (err: any) {
    console.error('extract-from-pdf error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
