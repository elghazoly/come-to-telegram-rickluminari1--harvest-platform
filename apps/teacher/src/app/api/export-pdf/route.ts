import { NextResponse, NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

async function buildHTML(body: {
  subject_id: string
  chapter_id?: string
  mode?: string
  orientation?: string
  cover?: string
  logo?: string
  teacher_name?: string
}) {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { persistSession: false } }
  )

  const { subject_id: subjectId, chapter_id: chapterId, mode = 'unsolved', orientation = 'portrait', cover, logo, teacher_name } = body

  if (!subjectId) return null

  const { data: subjectRows } = await supabase.from('subjects').select('name, icon').eq('id', subjectId).limit(1)
  const subject = subjectRows?.[0] || { name: 'مادة', icon: '📚' }

  let chapQuery = supabase.from('chapters').select('id, name, chapter_type').eq('subject_id', subjectId).order('order_num')
  if (chapterId) chapQuery = (chapQuery as any).eq('id', chapterId)
  const { data: chapters, error: chapErr } = await chapQuery

  if (chapErr || !chapters?.length) return { error: 'no chapters', subject }

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

  const isSolved    = mode === 'solved'
  const isLandscape = orientation === 'landscape'
  const labels      = ['أ', 'ب', 'ج', 'د', 'هـ']

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

  // Build chapters agenda for cover page
  const agendaRows = chapters.reduce((acc: string[], ch: any, i: number) => {
    if (i % 2 === 0) {
      const next = chapters[i + 1]
      acc.push(
        '<tr>' +
          '<td>' + (i + 1) + '</td><td>' + ch.name + '</td>' +
          (next ? '<td>' + (i + 2) + '</td><td>' + next.name + '</td>' : '<td></td><td></td>') +
        '</tr>'
      )
    }
    return acc
  }, []).join('')

  const coverHTML = '<div class="cover-page">' +
    (cover ? '<img class="cover-bg" src="' + cover + '" />' : '') +
    '<div class="cover-overlay">' +
      '<div class="cover-inner">' +
        (logo ? '<img class="cover-logo" src="' + logo + '" />' : '<div class="cover-logo-placeholder">🎓</div>') +
        '<div class="cover-platform">منصة هارفست التعليمية</div>' +
        '<div class="cover-subject">' + ((subject as any).icon || '📚') + ' ' + ((subject as any).name || 'مادة') + '</div>' +
        (teacher_name ? '<div class="cover-teacher">إعداد الأستاذ / ' + teacher_name + '</div>' : '') +
        '<div class="cover-mode-badge ' + (mode === 'solved' ? 'solved' : '') + '">' + (mode === 'solved' ? '✓ نموذج محلول' : 'نموذج أسئلة') + '</div>' +
        '<div class="cover-agenda">' +
          '<div class="agenda-title">📋 أجندة الفصول</div>' +
          '<table class="agenda-table"><thead><tr><th>#</th><th>الفصل</th><th>#</th><th>الفصل</th></tr></thead><tbody>' +
          agendaRows +
          '</tbody></table>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>'


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
  @page {
    size: ${pageSize};
    margin: 10%;
    @top-center {
      content: "${(subject as any).name || ''}";
      font-family: 'Cairo', Arial, sans-serif;
      font-size: 10px;
      color: #64748b;
      padding-bottom: 4px;
      border-bottom: 1px solid #e2e8f0;
    }
    @bottom-center {
      content: counter(page) " / " counter(pages);
      font-family: 'Cairo', Arial, sans-serif;
      font-size: 10px;
      color: #94a3b8;
      padding-top: 4px;
      border-top: 1px solid #e2e8f0;
    }
  }
  body { counter-reset: page; font-family: 'Cairo', Arial, sans-serif; direction: rtl; background: #f1f5f9; color: #1e293b; font-size: ${fontSize}; margin: 0; padding: 40px 0; }
  .page-wrap { max-width: 680px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,.08); }
  @media print { body { background: white; padding: 0; } .page-wrap { max-width: 100%; box-shadow: none; border-radius: 0; } }
  .cover-page { position:relative; width:100%; height:100vh; page-break-after:always; break-after:page; display:flex; align-items:stretch; overflow:hidden; }
  .cover-bg { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; display:block; }
  .cover-overlay { position:relative; z-index:1; width:100%; height:100%; background:linear-gradient(160deg,rgba(10,45,110,.92) 0%,rgba(26,79,168,.85) 60%,rgba(10,45,110,.95) 100%); display:flex; align-items:center; justify-content:center; padding:40px 20px; }
  .cover-inner { text-align:center; color:white; width:100%; max-width:560px; }
  .cover-logo { width:90px; height:90px; object-fit:contain; border-radius:16px; background:white; padding:8px; margin-bottom:20px; box-shadow:0 4px 20px rgba(0,0,0,.3); }
  .cover-logo-placeholder { font-size:72px; margin-bottom:20px; line-height:1; }
  .cover-platform { font-size:14px; font-weight:600; opacity:.85; letter-spacing:1px; margin-bottom:10px; }
  .cover-subject { font-size:32px; font-weight:900; margin-bottom:14px; line-height:1.3; }
  .cover-teacher { font-size:16px; font-weight:700; background:rgba(255,255,255,.15); display:inline-block; padding:8px 24px; border-radius:30px; margin-bottom:20px; }
  .cover-mode-badge { display:inline-block; padding:6px 20px; border-radius:20px; font-size:13px; font-weight:700; background:rgba(255,255,255,.2); border:1px solid rgba(255,255,255,.4); margin-bottom:28px; }
  .cover-mode-badge.solved { background:#16a34a; border-color:#16a34a; }
  .cover-agenda { background:rgba(255,255,255,.1); border-radius:12px; padding:16px 20px; text-align:right; }
  .agenda-title { font-size:14px; font-weight:700; margin-bottom:10px; opacity:.9; }
  .agenda-table { width:100%; border-collapse:collapse; font-size:12px; }
  .agenda-table th { background:rgba(255,255,255,.15); padding:7px 10px; font-weight:700; font-size:11px; }
  .agenda-table td { padding:6px 10px; border-bottom:1px solid rgba(255,255,255,.1); }
  .agenda-table tr:last-child td { border-bottom:none; }
  .agenda-table td:first-child, .agenda-table td:nth-child(3) { width:28px; opacity:.7; font-size:11px; text-align:center; }
  .page-header { background: linear-gradient(135deg, #0a2d6e, #1a4fa8); color: white; padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; }
  .page-header h1 { font-size: 20px; font-weight: 900; }
  .page-header .meta { font-size: 11px; opacity: .8; margin-top: 3px; }
  .mode-badge { background: rgba(255,255,255,.2); padding: 5px 14px; border-radius: 20px; font-size: 12px; font-weight: 700; }
  .mode-badge.solved { background: #16a34a; }
  .chapter { margin: 20px 0; page-break-inside: avoid; }
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
  .no-print { padding: 10px 20px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; gap: 10px; align-items: center; }
  @media print {
    .no-print { display: none !important; }
    body { background: white !important; padding: 0 !important; }
    .page-wrap { max-width: 100% !important; box-shadow: none !important; border-radius: 0 !important; }
    .page-header, .chapter-header, .q-num, .option.correct { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .cover-page { height: 100vh !important; page-break-after: always !important; break-after: page !important; }
    .cover-overlay, .cover-bg { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
${coverHTML}
<div class="page-wrap">
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
</div>
</body>
</html>`

  return html
}

// GET (legacy - no cover)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const result = await buildHTML({
    subject_id:  searchParams.get('subject_id') || '',
    chapter_id:  searchParams.get('chapter_id') || undefined,
    mode:        searchParams.get('mode') || 'unsolved',
    orientation: searchParams.get('orientation') || 'portrait',
  })
  if (!result) return NextResponse.json({ error: 'missing subject_id' }, { status: 400 })
  if (typeof result === 'object' && 'error' in result)
    return NextResponse.json(result, { status: 404 })
  return new NextResponse(result as string, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

// POST (supports cover image)
export async function POST(req: NextRequest) {
  const body = await req.json()
  if (!body.subject_id) return NextResponse.json({ error: 'missing subject_id' }, { status: 400 })
  const result = await buildHTML(body)
  if (!result) return NextResponse.json({ error: 'missing subject_id' }, { status: 400 })
  if (typeof result === 'object' && 'error' in result)
    return NextResponse.json(result, { status: 404 })
  return new NextResponse(result as string, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
