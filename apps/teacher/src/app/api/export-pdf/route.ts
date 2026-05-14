import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { searchParams } = new URL(req.url)
  const subjectId = searchParams.get('subject_id')
  const chapterId = searchParams.get('chapter_id')
  const mode      = searchParams.get('mode') || 'unsolved'

  if (!subjectId) return NextResponse.json({ error: 'missing subject_id' }, { status: 400 })

  // Load subject
  const { data: subject, error: subErr } = await supabase.from('subjects').select('name, icon').eq('id', subjectId).single()
  if (subErr) return NextResponse.json({ error: 'subject error: ' + subErr.message }, { status: 500 })

  // Load chapters (all or single)
  let chapQuery = supabase.from('chapters').select('id, name, chapter_type').eq('subject_id', subjectId).order('order_num')
  if (chapterId) chapQuery = (chapQuery as any).eq('id', chapterId)
  const { data: chapters, error: chapErr } = await chapQuery

  if (chapErr) return NextResponse.json({ error: 'chapters error: ' + chapErr.message }, { status: 500 })
  if (!chapters?.length) return NextResponse.json({ error: 'no chapters', subject_id: subjectId, subject }, { status: 404 })

  // Load all questions + options for all chapters at once
  const chapterIds = chapters.map((c: any) => c.id)
  const { data: questions } = await supabase
    .from('questions')
    .select('id, text, num, chapter_id, options(id, text, is_correct)')
    .in('chapter_id', chapterIds)
    .order('order_num')

  // Group questions by chapter
  const qByChapter: Record<string, any[]> = {}
  for (const q of questions || []) {
    if (!qByChapter[q.chapter_id]) qByChapter[q.chapter_id] = []
    qByChapter[q.chapter_id].push(q)
  }

  const isSolved = mode === 'solved'
  const labels   = ['أ', 'ب', 'ج', 'د', 'هـ']

  // Build HTML
  let chaptersHTML = ''
  for (const ch of chapters) {
    const qs = qByChapter[ch.id] || []
    if (!qs.length) continue

    let questionsHTML = ''
    for (const q of qs) {
      const opts = (q.options || []) as any[]
      const correctOpt = opts.find((o: any) => o.is_correct)

      let optionsHTML = opts.map((o: any, i: number) => {
        const isCorrect = o.is_correct && isSolved
        return `<div class="option ${isCorrect ? 'correct' : ''}">
          <span class="opt-label">${labels[i] || (i+1)}</span>
          <span class="opt-text">${o.text || ''}</span>
          ${isCorrect ? '<span class="check">✓</span>' : ''}
        </div>`
      }).join('')

      questionsHTML += `
        <div class="question">
          <div class="q-num">س${q.num || ''}</div>
          <div class="q-body">
            <div class="q-text">${q.text || ''}</div>
            <div class="options">${optionsHTML}</div>
            ${isSolved && correctOpt ? `<div class="answer-key">الإجابة: ${labels[opts.indexOf(correctOpt)]} — ${correctOpt.text}</div>` : ''}
          </div>
        </div>`
    }

    chaptersHTML += `
      <div class="chapter">
        <div class="chapter-header">
          <span class="ch-type">${ch.chapter_type === 'exam' ? 'اختبار' : 'شرح'}</span>
          ${ch.name}
        </div>
        ${questionsHTML}
      </div>`
  }

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${subject?.name || 'مادة'} — ${isSolved ? 'محلول' : 'غير محلول'}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Cairo', Arial, sans-serif; direction: rtl; background: white; color: #1e293b; font-size: 13px; }

  /* Page header */
  .page-header { background: linear-gradient(135deg, #0a2d6e, #1a4fa8); color: white; padding: 20px 30px; display: flex; align-items: center; justify-content: space-between; }
  .page-header h1 { font-size: 22px; font-weight: 900; }
  .page-header .meta { font-size: 12px; opacity: .8; margin-top: 4px; }
  .mode-badge { background: rgba(255,255,255,.2); padding: 6px 16px; border-radius: 20px; font-size: 13px; font-weight: 700; }
  .mode-badge.solved { background: #16a34a; }

  /* Chapter */
  .chapter { margin: 24px 30px; page-break-inside: avoid; }
  .chapter-header { background: #1e3a8a; color: white; padding: 10px 16px; border-radius: 8px; font-size: 15px; font-weight: 700; margin-bottom: 14px; display: flex; align-items: center; gap: 10px; }
  .ch-type { background: rgba(255,255,255,.2); padding: 2px 10px; border-radius: 20px; font-size: 11px; }

  /* Question */
  .question { display: flex; gap: 10px; margin-bottom: 16px; padding: 12px 14px; border: 1px solid #e2e8f0; border-radius: 10px; page-break-inside: avoid; }
  .q-num { background: #1d4ed8; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 12px; flex-shrink: 0; margin-top: 2px; }
  .q-body { flex: 1; }
  .q-text { font-size: 14px; font-weight: 600; color: #1e293b; margin-bottom: 10px; line-height: 1.6; }

  /* Options */
  .options { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .option { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border: 1px solid #e2e8f0; border-radius: 8px; }
  .option.correct { border-color: #16a34a; background: #f0fdf4; }
  .opt-label { background: #f1f5f9; color: #475569; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 12px; flex-shrink: 0; }
  .option.correct .opt-label { background: #16a34a; color: white; }
  .opt-text { font-size: 12px; color: #374151; flex: 1; }
  .check { color: #16a34a; font-weight: 900; font-size: 16px; }
  .answer-key { margin-top: 8px; background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 6px 12px; font-size: 12px; font-weight: 700; color: #92400e; }

  /* Print */
  @media print {
    .no-print { display: none !important; }
    body { font-size: 12px; }
    .chapter { margin: 16px 20px; }
    .page-header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .chapter-header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .q-num { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .option.correct { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>

<div class="page-header">
  <div>
    <h1>${subject?.icon || '📚'} ${subject?.name || 'مادة'}</h1>
    <div class="meta">جميع الفصول • ${questions?.length || 0} سؤال</div>
  </div>
  <div class="mode-badge ${isSolved ? 'solved' : ''}">${isSolved ? '✓ نموذج محلول' : 'نموذج أسئلة'}</div>
</div>

<div class="no-print" style="padding:12px 30px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;gap:10px;align-items:center">
  <button onclick="window.print()" style="background:#1d4ed8;color:white;border:none;padding:8px 20px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">🖨️ طباعة / حفظ PDF</button>
  <span style="font-size:12px;color:#64748b">عند الطباعة اختر "حفظ كـ PDF" من الطابعة</span>
</div>

${chaptersHTML}

</body>
</html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  })
}
