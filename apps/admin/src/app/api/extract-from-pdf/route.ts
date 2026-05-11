import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const LETTER_MAP: Record<string, string> = { A: 'أ', B: 'ب', C: 'ج', D: 'د' }

const SYSTEM_PROMPT = `أنت متخصص في استخراج أسئلة الاختيار من متعدد من صفحات PDF العربية.
مهمتك الوحيدة: إرجاع JSON صالح بدون أي نص إضافي أو backticks.`

function buildPrompt(rules?: string): string {
  const rulesSection = rules ? `5. **شروط المستخدم**:\n${rules}\n\n` : ''

  return [
    'استخرج جميع أسئلة الاختيار من متعدد من هذه الصفحة وأرجع JSON فقط.',
    '',
    '## قواعد صارمة لقراءة الملفات العربية:',
    '',
    '1. **اتجاه القراءة**: الملف عربي — اقرأ من اليمين لليسار دائماً.',
    '   - إذا كانت الصفحة بعمودين: ابدأ بالعمود الأيمن ثم الأيسر.',
    '   - رقّم الأسئلة بالتسلسل الصحيح حسب رقمها المكتوب في الملف.',
    '',
    '2. **الخيارات في عمودين**:',
    '   - A = أول خيار في العمود الأيمن',
    '   - B = أول خيار في العمود الأيسر',
    '   - C = ثاني خيار في العمود الأيمن',
    '   - D = ثاني خيار في العمود الأيسر',
    '',
    '3. **جدول الإجابات**: ابحث في أسفل الصفحة عن جدول الإجابات.',
    '   استخرج إجابة كل سؤال بدقة من الجدول. **لا تخمّن الإجابات أبداً.**',
    '',
    '4. **السنة**: استخرج سنة السؤال في حقل year إذا ظهرت.',
    '',
    rulesSection,
    '## JSON المطلوب:',
    '{"topic":"عنوان الموضوع","questions":[{"number":1,"text":"نص السؤال","choices":[{"label":"A","text":"خيار أ"},{"label":"B","text":"خيار ب"},{"label":"C","text":"خيار ج"},{"label":"D","text":"خيار د"}],"correct_answer":"A","year":2024}]}',
  ].join('\n')
}

export async function POST(req: NextRequest) {
  try {
    const formData  = await req.formData()
    const file      = formData.get('file') as File
    const rules     = (formData.get('rules') as string) || ''
    const maxTokens = parseInt((formData.get('maxTokens') as string) || '6000')

    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

    const buffer   = await file.arrayBuffer()
    const base64   = Buffer.from(buffer).toString('base64')
    const mimeType = (file.type || 'application/pdf') as 'application/pdf'

    const tokenLimit = Math.min(Math.max(maxTokens, 2000), 8000)

    const response = await client.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: tokenLimit,
      system:     SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          {
            type:   'document',
            source: { type: 'base64', media_type: mimeType, data: base64 },
          },
          {
            type: 'text',
            text: buildPrompt(rules),
          }
        ]
      }]
    })

    const rawText  = response.content.filter(b => b.type === 'text').map(b => (b as any).text).join('')
    const jsonText = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/g, '').trim()

    let parsed: any
    try {
      parsed = JSON.parse(jsonText)
    } catch {
      return NextResponse.json({ error: 'Model returned invalid JSON', raw: rawText.slice(0, 300) }, { status: 500 })
    }

    const questions = (parsed.questions || []).sort((a: any, b: any) => a.number - b.number)

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

    console.log(`PDF direct: ${appReady.length} questions | ${response.usage.input_tokens}+${response.usage.output_tokens} tokens`)

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
