import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: Request) {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { persistSession: false } }
  )

  const { searchParams } = new URL(req.url)
  const subjectId   = searchParams.get('subject_id')
  const chapterId   = searchParams.get('chapter_id')
  const mode        = searchParams.get('mode') || 'unsolved'
  const orientation = searchParams.get('orientation') || 'portrait'
  const coverB64    = searchParams.get('cover') ? decodeURIComponent(searchParams.get('cover')!) : null

  if (!subjectId) return NextResponse.json({ error: 'missing subject_id' }, { status: 400 })

  const { data: subjectRows } = await supabase.from('subjects').select('name, icon').eq('id', subjectId).limit(1)
  const subject = subjectRows?.[0] || { name: 'مادة', icon: '📚' }

  let chapQuery = supabase.from('chapters').select('id, name, chapter_type').eq('subject_id', subjectId).order('order_num')
  if (chapterId) chapQuery = (chapQuery as any).eq('id', chapterId)
  const { data: chapters, error: chapErr } = await chapQuery

  if (chapErr) return NextResponse.json({ error: 'chapters error: ' + chapErr.message }, { status: 500 })
  if (!chapters?.length) return NextResponse.json({ error: 'no chapters', subject_id: subjectId, subject }, { status: 404 })

  const chapterIds = chapters.map((c: any) => c.id)
  const { data: questions } = await supabase
    .from('questions')
    .select('id, text, num, chapter_id, options(id, text, is_correct)')
    .in('chapter_id', chapterIds)
    .order('order_num')

  const qByChapter: Record<string, any[]> = {}
  for (const q of questions || []) {
    if (!qByChapter[q.chapter_id]) qByChapter[q.chapter_id] = []
    qByChapter[q.chapter_id].push(q)
  }

  const isSolved   = mode === 'solved'
  const isLandscape = orientation === 'landscape'
  const labels     = ['أ', 'ب', 'ج', 'د', 'هـ']

  let chaptersHTML = ''
  for (const ch of chapters) {
    const qs = qByChapter[(ch as any).id] || []
    if (!qs.length) continue

    let questionsHTML = ''
    for (const q of qs) {
      const opts = (q.options || []) as any[]
      const correctOpt = opts.find((o: any) => o.is_correct)

      const optionsHTML = opts.map((o: any, i: number) => {
        const isCorrect = o.is_correct && isSolved
        return '<div class="option' + (isCorrect ? ' correct' : '') + '">'
          + '<span class="opt-label">' + (labels[i] || (i+1)) + '</span>'
          + '<span class="opt-text">' + (o.text || '') + '</span>'
          + (isCorrect ? '<span class="check">✓</span>' : '')
          + '</div>'
      }).join('')

      questionsHTML += '<div class="question">'
        + '<div class="q-num">س' + (q.num || '') + '</div>'
        + '<div class="q-body">'
        + '<div class="q-text">' + (q.text || '') + '</div>'
        + '<div class="options">' + optionsHTML + '</div>'
        + (isSolved && correctOpt ? '<div class="answer-key">الإجابة: ' + labels[opts.indexOf(correctOpt)] + ' — ' + correctOpt.text + '</div>' : '')
        + '</div></div>'
    }

    chaptersHTML += '<div class="chapter">'
      + '<div class="chapter-header"><span class="ch-type">' + ((ch as any).chapter_type === 'exam' ? 'اختبار' : 'شرح') + '</span>' + (ch as any).name + '</div>'
      + questionsHTML
      + '</div>'
  }

  const coverHTML = coverB64
    ? '<div class="cover-page"><img src="' + coverB64 + '" /></div>'
    : ''

  const gridCols = isLandscape ? '1fr 1fr' : '1fr 1fr'
  const fontSize  = isLandscape ? '12px' : '13px'
  const pageSize  = isLandscape ? 'A4 landscape' : 'A4 portrait'

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>${(subject as any).name} — ${isSolved ? 'محلول' : 'غير محلول'}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: ${pageSize}; margin: 15mm; }
  body { font-family: 'Cairo', Arial, sans-serif; direction: rtl; background: white; color: #1e293b; font-size: ${fontSize}; }
  .cover-page { width:100%; height:100vh; page-break-after:always; padding:0; }
  .cover-page img { width:100%; height:100%; object-fit:cover; display:block; }
  .page-header { background: linear-gradient(135deg, #0a2d6e, #1a4fa8); color: white; padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; }
  .page-header h1 { font-size: 20px; font-weight: 900; }
  .page-header .meta { font-size: 11px; opacity: .8; margin-top: 3px; }
  .mode-badge { background: rgba(255,255,255,.2); padding: 5px 14px; border-radius: 20px; font-size: 12px; font-weight: 700; }
  .mode-badge.solved { background: #16a34a; }
  .chapter { margin: 20px 24px; page-break-inside: avoid; }
  .chapter-header { background: #1e3a8a; color: white; padding: 8px 14px; border-radius: 8px; font-size: 14px; font-weight: 700; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
  .ch-type { background: rgba(255,255,255,.2); padding: 2px 8px; border-radius: 20px; font-size: 10px; }
  .question { display: flex; gap: 10px; margin-bottom: 14px; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 10px; page-break-inside: avoid; }
  .q-num { background: #1d4ed8; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 11px; flex-shrink: 0; margin-top: 2px; }
  .q-body { flex: 1; }
  .q-text { font-size: 13px; font-weight: 600; color: #1e293b; margin-bottom: 8px; line-height: 1.6; }
  .options { display: grid; grid-template-columns: ${gridCols}; gap: 5px; }
  .option { display: flex; align-items: center; gap: 7px; padding: 5px 8px; border: 1px solid #e2e8f0; border-radius: 7px; }
  .option.correct { border-color: #16a34a; background: #f0fdf4; }
  .opt-label { background: #f1f5f9; color: #475569; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 11px; flex-shrink: 0; }
  .option.correct .opt-label { background: #16a34a; color: white; }
  .opt-text { font-size: 11px; color: #374151; flex: 1; }
  .check { color: #16a34a; font-weight: 900; font-size: 14px; }
  .answer-key { margin-top: 7px; background: #fef3c7; border: 1px solid #fcd34d; border-radius: 7px; padding: 5px 10px; font-size: 11px; font-weight: 700; color: #92400e; }
  .no-print { padding: 10px 24px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; gap: 10px; align-items: center; }
  @media print {
    .no-print { display: none !important; }
    .page-header, .chapter-header, .q-num, .option.correct { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .cover-page { height: 100vh !important; }
  }
</style>
</head>
<body>
${coverHTML}
<div class="page-header">
  <div>
    <h1>${(subject as any).icon || '📚'} ${(subject as any).name || 'مادة'}</h1>
    <div class="meta">جميع الفصول • ${questions?.length || 0} سؤال</div>
  </div>
  <div class="mode-badge ${isSolved ? 'solved' : ''}">${isSolved ? '✓ نموذج محلول' : 'نموذج أسئلة'}</div>
</div>
<div class="no-print">
  <button onclick="window.print()" style="background:#1d4ed8;color:white;border:none;padding:7px 18px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">🖨️ طباعة / حفظ PDF</button>
  <span style="font-size:12px;color:#64748b">اختر "حفظ كـ PDF" من قائمة الطباعة</span>
</div>
${chaptersHTML}
</body>
</html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  })
}
