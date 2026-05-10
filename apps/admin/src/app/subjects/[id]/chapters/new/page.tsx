'use client'
import { useState, useRef, useCallback } from 'react'

// Module-level variable — survives re-renders with no timing issues
let _mdContent = ''
import { createClient } from '@supabase/supabase-js'
import { useRouter, useParams } from 'next/navigation'

interface ExtractedQuestion {
  num:         number
  text:        string
  year:        number | null
  needs_image: boolean
  ans_text:    string
  options: {
    letter:     string
    text:       string
    is_correct: boolean
  }[]
}

type Step = 'upload' | 'review' | 'saving' | 'done'

export default function NewChapterPage() {
  const router    = useRouter()
  const params    = useParams()
  const subjectId = params.id as string

  const [step,        setStep]        = useState<Step>('upload')
  const [chapterName, setChapterName] = useState('')
  const [chapterIcon, setChapterIcon] = useState('')
  const [rules,       setRules]       = useState('')
  const [fileType,    setFileType]    = useState<'pdf'|'md'>('pdf')
  const [pdfFile,     setPdfFile]     = useState<File | null>(null)
  const [markdown,    setMarkdown]    = useState('')
  const [questions,   setQuestions]   = useState<ExtractedQuestion[]>([])
  const [loading,     setLoading]     = useState(false)
  const [loadingMsg,  setLoadingMsg]  = useState('')
  const [error,       setError]       = useState('')
  const [savedCount,  setSavedCount]  = useState(0)
  const [tokenEstimate, setTokenEstimate] = useState<{input: number; output: number; cost: number} | null>(null)
  const [showConfirm,   setShowConfirm]   = useState(false)
  const [mdReady,       setMdReady]       = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const mdRef   = useRef<string>('')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // ── Token estimation ────────────────────────────────────
  function estimateTokens(text: string) {
    // ~1 token per 3 Arabic chars, ~1 token per 4 English chars
    const arabicChars   = (text.match(/[؀-ۿ]/g) || []).length
    const otherChars    = text.length - arabicChars
    const inputTokens   = Math.ceil(arabicChars / 3 + otherChars / 4) + 500 // +500 for system prompt
    const outputTokens  = Math.ceil(inputTokens * 0.6) // estimated output
    const costPerMInput  = 0.00025  // claude-haiku-4-5: $0.25 per 1M input tokens
    const costPerMOutput = 0.00125  // claude-haiku-4-5: $1.25 per 1M output tokens
    const cost = (inputTokens / 1_000_000 * costPerMInput) + (outputTokens / 1_000_000 * costPerMOutput)
    return { input: inputTokens, output: outputTokens, cost }
  }

  // ── Prepare: read file + estimate tokens ───────────────
  async function handlePrepare() {
    if (!pdfFile) { setError(`اختر ملف ${fileType === 'pdf' ? 'PDF' : 'Markdown'} أولاً`); return }
    if (!chapterName.trim()) { setError('أدخل اسم الفصل'); return }
    setLoading(true); setError('')

    let mdContent = ''
    if (fileType === 'md') {
      setLoadingMsg('جاري قراءة الملف...')
      mdContent = await pdfFile.text()
    } else {
      setLoadingMsg('جاري تحويل PDF إلى Markdown...')
      const fd = new FormData()
      fd.append('file', pdfFile)
      const r = await fetch('/api/pdf-to-md', { method: 'POST', body: fd })
      const d = await r.json()
      if (!r.ok || d.error) {
        setError('فشل تحويل PDF: ' + (d.error || ''))
        setLoading(false); return
      }
      mdContent = d.markdown
    }

    // Store in module-level var (100% reliable, no timing issues)
    _mdContent = mdContent
    mdRef.current = mdContent
    setMarkdown(mdContent)
    setTokenEstimate(estimateTokens(mdContent))
    setShowConfirm(true)
    setLoading(false)
  }

  // ── Extract: send to Claude ──────────────────────────────
  async function handleConvert() {
    const mdContent = _mdContent
    if (!mdContent) { setError('الملف غير جاهز، أعد رفعه'); setLoading(false); return }
    setLoading(true); setError('')
    setShowConfirm(false)
    setLoadingMsg('جاري تحليل الأسئلة بالذكاء الاصطناعي...')

    const r2 = await fetch('/api/extract-questions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ markdown: mdContent, rules })
    })
    const d2 = await r2.json()

    if (!r2.ok || d2.error) {
      setError('فشل استخراج الأسئلة: ' + (d2.error || ''))
      setLoading(false); return
    }

    setQuestions(d2.questions || [])
    setLoading(false)
    setStep('review')
  }



  // ── Step 3: Save to Supabase ─────────────────────────────
  async function handleSave() {
    setStep('saving')
    setLoadingMsg('جاري إنشاء الفصل...')

    // Create chapter
    const { data: subjects } = await supabase
      .from('chapters').select('order_num').eq('subject_id', subjectId).order('order_num', { ascending: false }).limit(1)
    const maxOrder = subjects?.[0]?.order_num ?? 0

    const { data: chapter, error: chErr } = await supabase
      .from('chapters')
      .insert({ name: chapterName, icon: chapterIcon, subject_id: subjectId, order_num: maxOrder + 1 })
      .select().single()

    if (chErr || !chapter) {
      setError('فشل إنشاء الفصل: ' + chErr?.message)
      setStep('review'); return
    }

    setLoadingMsg('جاري حفظ الأسئلة...')
    let saved = 0

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      setLoadingMsg(`حفظ السؤال ${i + 1} من ${questions.length}...`)

      const { data: newQ, error: qErr } = await supabase
        .from('questions')
        .insert({
          chapter_id: chapter.id,
          num:        q.num,
          text:       q.text,
          year:       q.year,
          ans_text:   q.ans_text,
          order_num:  q.num,
          image_url:  q.needs_image ? '__NEEDS_IMAGE__' : null,
        })
        .select().single()

      if (qErr || !newQ) continue

      // Save options
      for (let j = 0; j < q.options.length; j++) {
        await supabase.from('options').insert({
          question_id: newQ.id,
          letter:      q.options[j].letter,
          text:        q.options[j].text,
          is_correct:  q.options[j].is_correct,
          order_num:   j + 1,
        })
      }
      saved++
      setSavedCount(saved)
    }

    setStep('done')
  }

  function updateQuestion(idx: number, field: string, value: any) {
    setQuestions(qs => qs.map((q, i) => i === idx ? { ...q, [field]: value } : q))
  }

  function updateOption(qIdx: number, oIdx: number, field: string, value: any) {
    setQuestions(qs => qs.map((q, i) => i === qIdx ? {
      ...q,
      options: q.options.map((o, j) => j === oIdx ? { ...o, [field]: value } : o)
    } : q))
  }

  function setCorrect(qIdx: number, oIdx: number) {
    setQuestions(qs => qs.map((q, i) => i === qIdx ? {
      ...q,
      options: q.options.map((o, j) => ({ ...o, is_correct: j === oIdx }))
    } : q))
  }

  function removeQuestion(idx: number) {
    setQuestions(qs => qs.filter((_, i) => i !== idx))
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header style={{ background: 'linear-gradient(90deg, #0a2d6e, #1a4fa8)' }}
              className="text-white px-6 py-4 flex items-center gap-3 shadow-lg">
        <button onClick={() => router.back()} className="text-blue-200 hover:text-white text-sm">← رجوع</button>
        <span className="text-blue-300">|</span>
        <h1 className="font-bold text-lg">➕ إضافة فصل جديد بالذكاء الاصطناعي</h1>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">

        {/* ── STEP: UPLOAD ── */}
        {step === 'upload' && (
          <div className="space-y-6">
            {/* Chapter info */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
              <h2 className="font-bold text-slate-800 mb-4">📂 معلومات الفصل</h2>
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-slate-600 mb-1">
                    اسم الفصل <span className="text-red-500">*</span>
                  </label>
                  <input value={chapterName} onChange={e => setChapterName(e.target.value)}
                         className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
                         placeholder="مثال: الأنماط والمنطق"/>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-600 mb-1">الأيقونة</label>
                  <input value={chapterIcon} onChange={e => setChapterIcon(e.target.value)}
                         className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
                         placeholder="📐"/>
                </div>
              </div>
            </div>

            {/* PDF Upload */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
              <h2 className="font-bold text-slate-800 mb-4">📄 ملف الأسئلة (PDF)</h2>
              {/* File type selector */}
              <div className="flex gap-2 mb-3">
                <button type="button"
                        onClick={() => { setFileType('pdf'); setPdfFile(null); setError('') }}
                        className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors border-2 ${
                          fileType === 'pdf'
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-slate-200 text-slate-500 hover:border-slate-300'
                        }`}>
                  📄 PDF
                </button>
                <button type="button"
                        onClick={() => { setFileType('md'); setPdfFile(null); setError('') }}
                        className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors border-2 ${
                          fileType === 'md'
                            ? 'border-purple-500 bg-purple-50 text-purple-700'
                            : 'border-slate-200 text-slate-500 hover:border-slate-300'
                        }`}>
                  📝 Markdown
                </button>
              </div>

              <label className={`flex flex-col items-center justify-center h-36 border-2 border-dashed rounded-2xl cursor-pointer transition-colors ${
                pdfFile
                  ? 'border-green-400 bg-green-50'
                  : fileType === 'pdf'
                    ? 'border-slate-200 hover:border-blue-300 hover:bg-blue-50'
                    : 'border-slate-200 hover:border-purple-300 hover:bg-purple-50'
              }`}>
                <span className="text-4xl mb-2">
                  {pdfFile ? '✅' : fileType === 'pdf' ? '📄' : '📝'}
                </span>
                <span className="font-semibold text-slate-700">
                  {pdfFile ? pdfFile.name : fileType === 'pdf' ? 'اضغط لرفع ملف PDF' : 'اضغط لرفع ملف Markdown'}
                </span>
                {pdfFile && (
                  <span className="text-slate-400 text-xs mt-1">
                    {(pdfFile.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                )}
                <span className="text-slate-400 text-xs mt-1">
                  {fileType === 'pdf' ? '.pdf' : '.md, .txt'}
                </span>
                <input ref={fileRef} type="file"
                       accept={fileType === 'pdf' ? '.pdf,application/pdf' : '.md,.txt,text/markdown,text/plain'}
                       className="hidden"
                       onChange={e => { setPdfFile(e.target.files?.[0] || null); setError('') }}/>
              </label>
            </div>

            {/* Rules / Instructions */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
              <h2 className="font-bold text-slate-800 mb-1">⚙️ شروط الاستخراج</h2>
              <p className="text-slate-400 text-sm mb-4">
                أضف تعليمات خاصة لـ Claude لتحسين دقة الاستخراج (اختياري)
              </p>
              <textarea value={rules} onChange={e => setRules(e.target.value)}
                        rows={4}
                        className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 resize-none"
                        placeholder={`مثال:
• فقط استخرج أسئلة سنة 2024
• تجاهل الأسئلة المقالية
• إذا وجدت جداول، تعامل معها كأسئلة تحتاج صورة
• الأسئلة من صفحة 5 إلى 20 فقط`}/>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
                ❌ {error}
              </div>
            )}

            <button onClick={handleConvert} disabled={loading || !pdfFile || !chapterName}
                    className="w-full py-4 rounded-2xl text-white font-bold text-base disabled:opacity-50 flex items-center justify-center gap-3 shadow-lg"
                    style={{ background: 'linear-gradient(90deg, #0a2d6e, #1a4fa8)' }}>
              {loading ? (
                <>
                  <span className="animate-spin text-xl">⏳</span>
                  <span>{loadingMsg}</span>
                </>
              ) : (
                <>
                  <span>🤖</span>
                  <span>تحليل الملف وتقدير التكلفة</span>
                </>
              )}
            </button>

            {/* Token estimate confirmation */}
            {showConfirm && tokenEstimate && (
              <div className="bg-white rounded-2xl border-2 border-blue-200 p-5 shadow-lg">
                <h3 className="font-bold text-slate-800 mb-4 text-center">
                  📊 تقدير التكلفة قبل الإرسال لـ Claude
                </h3>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    { label: 'توكن الإدخال',  value: tokenEstimate.input.toLocaleString(),  color: '#1a4fa8', icon: '📥' },
                    { label: 'توكن الإخراج',  value: tokenEstimate.output.toLocaleString(), color: '#6d28d9', icon: '📤' },
                    { label: 'التكلفة التقديرية', value: `$${tokenEstimate.cost.toFixed(4)}`, color: '#0e7a3e', icon: '💰' },
                  ].map(s => (
                    <div key={s.label} className="text-center bg-slate-50 rounded-xl p-3 border border-slate-100">
                      <div className="text-xl mb-1">{s.icon}</div>
                      <div className="font-black text-lg" style={{ color: s.color }}>{s.value}</div>
                      <div className="text-slate-400 text-xs mt-0.5">{s.label}</div>
                    </div>
                  ))}
                </div>
                <div className="bg-blue-50 rounded-xl px-4 py-2 text-xs text-blue-700 mb-4 text-center">
                  ℹ️ الأرقام تقديرية — الموديل المستخدم: <strong>claude-haiku-4-5</strong>
                  <br/>السعر: $0.25/مليون توكن إدخال • $1.25/مليون توكن إخراج
                </div>
                <div className="flex gap-3">
                  <button onClick={handleConvert}
                          className="flex-1 py-3 rounded-xl text-white font-bold text-sm shadow"
                          style={{ background: 'linear-gradient(90deg, #0e7a3e, #16a34a)' }}>
                    ✅ تأكيد وإرسال لـ Claude
                  </button>
                  <button onClick={() => setShowConfirm(false)}
                          className="px-5 py-3 rounded-xl border-2 border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50">
                    إلغاء
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── STEP: REVIEW ── */}
        {step === 'review' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-slate-800">
                  ✅ تم استخراج {questions.length} سؤال
                </h2>
                <p className="text-slate-500 text-sm mt-1">
                  راجع الأسئلة وعدّل إذا لزم قبل الحفظ
                </p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep('upload')}
                        className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50">
                  ← إعادة
                </button>
                <button onClick={handleSave}
                        className="px-6 py-2 rounded-xl text-white font-bold text-sm shadow"
                        style={{ background: 'linear-gradient(90deg, #0e7a3e, #16a34a)' }}>
                  💾 حفظ {questions.length} سؤال
                </button>
              </div>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              {[
                { label: 'إجمالي الأسئلة',  value: questions.length,                                  color: '#0a2d6e' },
                { label: 'تحتاج صورة',       value: questions.filter(q => q.needs_image).length,        color: '#b45309' },
                { label: 'بدون سنة',          value: questions.filter(q => !q.year).length,              color: '#6d28d9' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 text-center">
                  <div className="text-2xl font-black" style={{ color: s.color }}>{s.value}</div>
                  <div className="text-slate-500 text-xs mt-1">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Questions list */}
            <div className="space-y-4">
              {questions.map((q, qi) => (
                <div key={qi} className={`bg-white rounded-2xl shadow-sm border overflow-hidden ${
                  q.needs_image ? 'border-orange-200' : 'border-slate-100'
                }`}>
                  <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="bg-blue-700 text-white text-xs font-bold px-2 py-1 rounded-lg">
                        س {qi + 1}
                      </span>
                      {q.needs_image && (
                        <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-1 rounded-lg">
                          🖼️ تحتاج صورة
                        </span>
                      )}
                      <div className="flex items-center gap-1">
                        <input type="number" value={q.year || ''} placeholder="السنة"
                               onChange={e => updateQuestion(qi, 'year', e.target.value ? parseInt(e.target.value) : null)}
                               className="w-20 border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-blue-400"
                               dir="ltr"/>
                      </div>
                      <label className="flex items-center gap-1 text-xs text-orange-600 cursor-pointer">
                        <input type="checkbox" checked={q.needs_image}
                               onChange={e => updateQuestion(qi, 'needs_image', e.target.checked)}/>
                        تحتاج صورة
                      </label>
                    </div>
                    <button onClick={() => removeQuestion(qi)}
                            className="text-red-500 hover:text-red-700 text-sm">🗑️</button>
                  </div>

                  <div className="p-5 space-y-3">
                    {/* Question text */}
                    <textarea value={q.text}
                              onChange={e => updateQuestion(qi, 'text', e.target.value)}
                              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 resize-none"
                              rows={2}/>

                    {/* Options */}
                    <div className="grid grid-cols-2 gap-2">
                      {q.options.map((o, oi) => (
                        <div key={oi} className={`flex items-center gap-2 p-2 rounded-xl border-2 ${
                          o.is_correct ? 'border-green-400 bg-green-50' : 'border-slate-200'
                        }`}>
                          <button onClick={() => setCorrect(qi, oi)}
                                  className={`w-7 h-7 rounded-full text-xs font-bold flex-shrink-0 ${
                                    o.is_correct ? 'bg-green-500 text-white' : 'bg-slate-100 text-slate-500'
                                  }`}>
                            {o.letter}
                          </button>
                          <input value={o.text} onChange={e => updateOption(qi, oi, 'text', e.target.value)}
                                 className="flex-1 text-sm border-0 bg-transparent focus:outline-none"/>
                        </div>
                      ))}
                    </div>

                    {/* Answer explanation */}
                    <input value={q.ans_text || ''} placeholder="شرح الإجابة (اختياري)"
                           onChange={e => updateQuestion(qi, 'ans_text', e.target.value)}
                           className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-blue-500"/>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end">
              <button onClick={handleSave}
                      className="px-8 py-3 rounded-2xl text-white font-bold shadow-lg"
                      style={{ background: 'linear-gradient(90deg, #0e7a3e, #16a34a)' }}>
                💾 حفظ {questions.length} سؤال في الفصل
              </button>
            </div>
          </div>
        )}

        {/* ── STEP: SAVING ── */}
        {step === 'saving' && (
          <div className="text-center py-20">
            <div className="text-6xl mb-4 animate-bounce">⏳</div>
            <h2 className="text-xl font-bold text-slate-700 mb-2">{loadingMsg}</h2>
            <div className="w-64 bg-slate-200 rounded-full h-3 mx-auto mt-4">
              <div className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                   style={{ width: `${questions.length ? (savedCount / questions.length) * 100 : 0}%` }}/>
            </div>
            <p className="text-slate-500 text-sm mt-2">{savedCount} / {questions.length}</p>
          </div>
        )}

        {/* ── STEP: DONE ── */}
        {step === 'done' && (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">تم بنجاح!</h2>
            <p className="text-slate-500 mb-2">
              تم حفظ <strong>{savedCount}</strong> سؤال في فصل <strong>{chapterName}</strong>
            </p>
            {questions.filter(q => q.needs_image).length > 0 && (
              <p className="text-orange-600 text-sm mb-6">
                ⚠️ {questions.filter(q => q.needs_image).length} سؤال يحتاج إضافة صورة من إدارة الميديا
              </p>
            )}
            <div className="flex gap-3 justify-center mt-6">
              <button onClick={() => router.push(`/subjects/${subjectId}/chapters`)}
                      className="px-6 py-3 rounded-xl text-white font-bold"
                      style={{ background: 'linear-gradient(90deg, #0a2d6e, #1a4fa8)' }}>
                عرض الفصول ←
              </button>
              <button onClick={() => router.push('/media')}
                      className="px-6 py-3 rounded-xl bg-orange-500 text-white font-bold">
                🖼️ إدارة الميديا
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
