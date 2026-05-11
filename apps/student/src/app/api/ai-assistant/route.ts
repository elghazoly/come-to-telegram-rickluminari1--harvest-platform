import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { question, options, ans_text, user_message, history } = await req.json()

  const systemPrompt = `أنت مساعد تعليمي ذكي لمنصة هارفست للقدرات. مهمتك مساعدة الطلاب على فهم أسئلة الاختيار من متعدد.
قواعد مهمة:
- لا تعطِ الإجابة مباشرة ما لم يطلبها الطالب صراحة أو يكون قد أجاب بالفعل
- اشرح المفاهيم بأسلوب بسيط وواضح
- كن مشجعاً وإيجابياً
- ردودك باللغة العربية ومختصرة`

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
  if (!apiKey) return NextResponse.json({ reply: 'المساعد الذكي غير متاح حالياً' })

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 400, system: systemPrompt, messages })
  })

  const data = await r.json()
  return NextResponse.json({ reply: data.content?.[0]?.text || 'عذراً، حدث خطأ' })
}
