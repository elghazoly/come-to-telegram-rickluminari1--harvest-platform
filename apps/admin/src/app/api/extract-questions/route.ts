import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Clean markdown to reduce token count before sending to Claude
function cleanMarkdown(md: string): string {
  return md
    .split('\n')
    .map(line => line.trim())                          // trim whitespace
    .filter(line => line.length > 0)                  // remove empty lines
    .filter(line => !line.match(/^-{3,}$/))           // remove horizontal rules
    .filter(line => !line.match(/^\s*[_*]{3,}\s*$/))  // remove decorative lines
    .map(line => line.replace(/^#{1,6}\s*/, ''))      // remove markdown headers ##
    .map(line => line.replace(/\*\*/g, ''))           // remove bold **
    .map(line => line.replace(/[_~`]/g, ''))          // remove other markdown syntax
    .map(line => line.replace(/\s+/g, ' '))           // collapse multiple spaces
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')                       // max 2 consecutive newlines
    .substring(0, 20000)                              // hard limit 20k chars
}

export async function POST(req: Request) {
  const { markdown, rules } = await req.json()
  if (!markdown) return NextResponse.json({ error: 'markdown is required' }, { status: 400 })

  // Clean markdown first
  const cleanedMd = cleanMarkdown(markdown)
  const originalLen = markdown.length
  const cleanedLen  = cleanedMd.length
  const reduction   = Math.round((1 - cleanedLen / originalLen) * 100)

  console.log(`Markdown: ${originalLen} → ${cleanedLen} chars (${reduction}% reduction)`)

  // Minimal system prompt — saves input tokens
  const systemPrompt = `استخرج أسئلة الاختيار من متعدد. أرجع JSON فقط بدون أي نص إضافي.
قواعد: needs_image:true إذا السؤال يشير لشكل/صورة. الخيارات: أ ب ج د. is_correct:true للصحيح.${rules ? '\n' + rules : ''}`

  // Compact JSON schema — saves tokens
  const userPrompt = `${cleanedMd}

JSON:{"questions":[{"num":1,"text":"","year":null,"needs_image":false,"ans_text":"","options":[{"letter":"أ","text":"","is_correct":true},{"letter":"ب","text":"","is_correct":false},{"letter":"ج","text":"","is_correct":false},{"letter":"د","text":"","is_correct":false}]}]}`

  try {
    const response = await client.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 4000,  // reduced from 8000
      messages:   [{ role: 'user', content: userPrompt }],
      system:     systemPrompt,
    })

    const text    = response.content[0].type === 'text' ? response.content[0].text : ''
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed  = JSON.parse(cleaned)

    // Return token usage for session tracking
    return NextResponse.json({
      questions:    parsed.questions || [],
      usage: {
        input_tokens:  response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      }
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
