import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(req: Request) {
  const { markdown, rules, chapterId } = await req.json()
  if (!markdown || !chapterId) {
    return NextResponse.json({ error: 'markdown and chapterId required' }, { status: 400 })
  }

  const systemPrompt = `أنت مساعد متخصص في استخراج أسئلة الاختيار من متعدد من الملفات التعليمية.

مهمتك: قراءة الملف وإرجاع JSON فقط — بدون أي نص آخر.

قواعد مهمة:
- إذا كان السؤال يحتوي على صورة أو شكل أو رسم، ضع needs_image: true
- الخيارات دائماً أ، ب، ج، د
- استخرج رقم السنة من السياق إذا وجد
- الإجابة الصحيحة تكون is_correct: true
- أرجع ONLY valid JSON بدون markdown code blocks

${rules ? `\nشروط إضافية من المستخدم:\n${rules}` : ''}`

  const userPrompt = `استخرج جميع أسئلة الاختيار من متعدد من هذا الملف:

---
${markdown.substring(0, 50000)}
---

أرجع JSON بهذا الشكل بالضبط:
{
  "questions": [
    {
      "num": 1,
      "text": "نص السؤال كاملاً",
      "year": 2024,
      "needs_image": false,
      "ans_text": "شرح مختصر للإجابة الصحيحة",
      "options": [
        { "letter": "أ", "text": "نص الخيار", "is_correct": true },
        { "letter": "ب", "text": "نص الخيار", "is_correct": false },
        { "letter": "ج", "text": "نص الخيار", "is_correct": false },
        { "letter": "د", "text": "نص الخيار", "is_correct": false }
      ]
    }
  ]
}`

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 8000,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt,
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''

    // Parse JSON — strip any markdown if present
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed  = JSON.parse(cleaned)

    return NextResponse.json({ questions: parsed.questions || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
