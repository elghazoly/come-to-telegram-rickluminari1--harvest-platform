import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function cleanMarkdown(md: string): string {
  return md
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .filter(line => !line.match(/^-{3,}$/))
    .filter(line => !line.match(/^\s*[_*]{3,}\s*$/))
    .map(line => line.replace(/^#{1,6}\s*/, ''))
    .map(line => line.replace(/\*\*/g, ''))
    .map(line => line.replace(/[_~`]/g, ''))
    .map(line => line.replace(/\s+/g, ' '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .substring(0, 20000)
}

export async function POST(req: Request) {
  const { markdown, rules } = await req.json()
  if (!markdown) return NextResponse.json({ error: 'markdown is required' }, { status: 400 })

  const cleanedMd = cleanMarkdown(markdown)
  console.log(`Markdown: ${markdown.length} → ${cleanedMd.length} chars`)

  const systemPrompt = `استخرج كل أسئلة الاختيار من متعدد بدون استثناء. أرجع JSON فقط بدون أي نص إضافي.
قواعد: needs_image:true إذا السؤال يشير لشكل/صورة. الخيارات: أ ب ج د. is_correct:true للصحيح.${rules ? '\n' + rules : ''}`

  const userPrompt = `${cleanedMd}

أرجع JSON بهذا الشكل بالضبط (استخرج جميع الأسئلة):
{"questions":[{"num":1,"text":"","year":null,"needs_image":false,"ans_text":"","options":[{"letter":"أ","text":"","is_correct":true},{"letter":"ب","text":"","is_correct":false},{"letter":"ج","text":"","is_correct":false},{"letter":"د","text":"","is_correct":false}]}]}`

  try {
    const response = await client.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 6000,
      messages:   [{ role: 'user', content: userPrompt }],
      system:     systemPrompt,
    })

    const text       = response.content[0].type === 'text' ? response.content[0].text : ''
    const stopReason = response.stop_reason

    let jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

    // If response was cut off, salvage complete questions
    if (stopReason === 'max_tokens') {
      console.warn('Response truncated — salvaging complete questions')
      const lastBrace = jsonText.lastIndexOf('},')
      if (lastBrace > 0) jsonText = jsonText.substring(0, lastBrace + 1) + ']}'
    }

    const parsed = JSON.parse(jsonText)

    return NextResponse.json({
      questions: parsed.questions || [],
      truncated: stopReason === 'max_tokens',
      usage: {
        input_tokens:  response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      }
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
