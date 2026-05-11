import { NextRequest, NextResponse } from 'next/server'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

export async function POST(req: NextRequest) {
  const { question, options, ans_text, user_message, history } = await req.json()

  const systemPrompt = `أنت مساعد تعليمي ذكي لمنصة هارفست. تساعد الطلاب على فهم أسئلة الاختيار من متعدد.
قواعد:
- لا تعطي الإجابة الصحيحة مباشرة إلا إذا طُلب منك صراحةً
- قدم تلميحات تساعد الطالب على التفكير
- كن مشجعاً وإيجابياً
- ردودك مختصرة وواضحة بالعربية`

  const questionContext = `السؤال: ${question}
الخيارات: ${options.map((o: any) => `${o.letter}: ${o.text}`).join(' | ')}
${ans_text ? `شرح الإجابة: ${ans_text}` : ''}`

  const messages = [
    { role: 'user', content: `سياق السؤال:\n${questionContext}` },
    { role: 'assistant', content: 'فهمت السؤال، كيف يمكنني مساعدتك؟' },
    ...(history || []),
    { role: 'user', content: user_message }
  ]

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'API key not configured' }, { status: 500 })

  const r = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 500,
      system: systemPrompt,
      messages
    })
  })

  const data = await r.json()
  const reply = data.content?.[0]?.text || 'عذراً، لم أستطع الرد'
  return NextResponse.json({ reply })
}
