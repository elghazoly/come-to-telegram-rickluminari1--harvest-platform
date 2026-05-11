import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Types ────────────────────────────────────────────────────────────────────

interface Choice {
  label: 'A' | 'B' | 'C' | 'D'
  text: string
}

interface RawQuestion {
  number: number
  text: string
  choices: Choice[]
  correct_answer: 'A' | 'B' | 'C' | 'D'
  year?: number
}

interface ExtractionResult {
  questions: RawQuestion[]
  topic?: string
  extraction_notes?: string
}

// Map A/B/C/D → أ/ب/ج/د
const LETTER_MAP: Record<string, string> = { A: 'أ', B: 'ب', C: 'ج', D: 'د' }

// ─── Prompt ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `أنت متخصص في استخراج الأسئلة من ملفات PDF العربية للمناهج الدراسية.
مهمتك الوحيدة: إرجاع JSON صالح بدون أي نص إضافي أو backticks.`

function buildUserPrompt(md: string): string {
  return `استخرج جميع الأسئلة من النص التالي وأرجع JSON فقط.

## قواعد الاستخراج الصارمة:

1. **الترتيب**: رقّم الأسئلة بحسب رقمها الظاهر في النص. لا تعتمد على ترتيب ظهورها في النص الخام لأن PDF ثنائي العمود يُشوّه الترتيب.

2. **الخيارات**: لكل سؤال 4 خيارات (A، B، C، D). إذا كانت في عمودين:
   - A = أول خيار في العمود الأيمن
   - B = أول خيار في العمود الأيسر
   - C = ثاني خيار في العمود الأيمن
   - D = ثاني خيار في العمود الأيسر

3. **الإجابات الصحيحة**: ابحث عن جدول الإجابات في آخر النص. الجدول يكون بهذا الشكل:
   \`14 | 13 | 12 | ... | 1\`
   \`A  |  C |  A | ... | D\`
   استخرج الإجابة لكل رقم سؤال بدقة. **لا تخمّن الإجابات أبداً.**

4. **تصحيح OCR**: صحح الأخطاء الشائعة:
   - "الفزييائية" → "الفيزيائية"
   - "اإللكرت روين" → "الإلكتروني"
   - "الرت ر كيب" → "التركيب"
   - "يف" → "في" (إذا كانت حرف جر)

5. **شارة السنة**: استخرج السنة في حقل year إذا وجدت.

## تنسيق JSON المطلوب:
{
  "topic": "عنوان الموضوع",
  "questions": [
    {
      "number": 1,
      "text": "نص السؤال كاملاً",
      "choices": [
        { "label": "A", "text": "نص الخيار A" },
        { "label": "B", "text": "نص الخيار B" },
        { "label": "C", "text": "نص الخيار C" },
        { "label": "D", "text": "نص الخيار D" }
      ],
      "correct_answer": "A",
      "year": 2024
    }
  ],
  "extraction_notes": "ملاحظات عن مشاكل في الاستخراج"
}

## النص:
${md}`
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateAndClean(raw: ExtractionResult): ExtractionResult {
  raw.questions.sort((a, b) => a.number - b.number)
  raw.questions = raw.questions.filter(q => {
    if (q.choices.length !== 4) {
      console.warn(`Question ${q.number} has ${q.choices.length} choices — skipped`)
      return false
    }
    if (!['A','B','C','D'].includes(q.correct_answer)) {
      console.warn(`Question ${q.number} has invalid answer "${q.correct_answer}" — skipped`)
      return false
    }
    return true
  })
  return raw
}

// ─── Convert to app format ────────────────────────────────────────────────────

function toAppFormat(raw: ExtractionResult) {
  return raw.questions.map(q => ({
    num:         q.number,
    text:        q.text,
    year:        q.year || null,
    needs_image: false,
    ans_text:    '',
    options: q.choices.map(c => ({
      letter:     LETTER_MAP[c.label] || c.label,
      text:       c.text,
      is_correct: c.label === q.correct_answer,
    }))
  }))
}

// ─── Chunking ─────────────────────────────────────────────────────────────────

function splitIntoChunks(text: string, size = 6000): string[] {
  const chunks: string[] = []
  const paragraphs = text.split(/\n{2,}/)
  let current = ''
  for (const para of paragraphs) {
    if ((current + para).length > size && current.length > 0) {
      chunks.push(current.trim())
      current = para
    } else {
      current += (current ? '\n\n' : '') + para
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { markdown, rules, maxTokens } = await req.json()

    if (!markdown || markdown.trim().length < 50) {
      return NextResponse.json({ error: 'markdown content is required' }, { status: 400 })
    }

    const tokenLimit = Math.min(Math.max(parseInt(maxTokens) || 6000, 2000), 8000)
    const chunks = markdown.length > 6000 ? splitIntoChunks(markdown) : [markdown]

    const allQuestions: RawQuestion[] = []
    let topic: string | undefined
    const notes: string[] = []
    let totalInput = 0, totalOutput = 0

    const systemWithRules = rules
      ? SYSTEM_PROMPT + `\n\nشروط إضافية:\n${rules}`
      : SYSTEM_PROMPT

    for (const chunk of chunks) {
      const response = await client.messages.create({
        model:      'claude-haiku-4-5',
        max_tokens: tokenLimit,
        system:     systemWithRules,
        messages:   [{ role: 'user', content: buildUserPrompt(chunk) }],
      })

      totalInput  += response.usage.input_tokens
      totalOutput += response.usage.output_tokens

      const rawText = response.content
        .filter(b => b.type === 'text')
        .map(b => (b as any).text)
        .join('')

      const jsonText = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()

      let parsed: ExtractionResult
      try {
        parsed = JSON.parse(jsonText)
      } catch {
        console.error('JSON parse error:', rawText.slice(0, 300))
        return NextResponse.json({ error: 'Model returned invalid JSON', raw: rawText.slice(0, 300) }, { status: 500 })
      }

      if (!topic && parsed.topic) topic = parsed.topic
      if (parsed.extraction_notes) notes.push(parsed.extraction_notes)
      allQuestions.push(...(parsed.questions || []))
    }

    const cleaned  = validateAndClean({ topic, questions: allQuestions, extraction_notes: notes.join(' | ') || undefined })
    const appReady = toAppFormat(cleaned)

    console.log(`Extracted ${appReady.length} questions | ${totalInput}+${totalOutput} tokens`)

    return NextResponse.json({
      questions: appReady,
      topic,
      truncated: false,
      usage: { input_tokens: totalInput, output_tokens: totalOutput }
    })

  } catch (err: any) {
    console.error('extract-questions error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
