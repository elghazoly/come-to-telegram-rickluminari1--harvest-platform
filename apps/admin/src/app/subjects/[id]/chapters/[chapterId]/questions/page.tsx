'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter, useParams } from 'next/navigation'
import type { Question, Option, Chapter, Explanation } from '@harvest/db'

type QuestionFull = Question & {
  options: Option[]
  explanations: Explanation[]
}

export default function QuestionsPage() {
  const router    = useRouter()
  const params    = useParams()
  const subjectId = params.id as string
  const chapterId = params.chapterId as string

  const [chapter,   setChapter]   = useState<Chapter | null>(null)
  const [questions, setQuestions] = useState<QuestionFull[]>([])
  const [loading,   setLoading]   = useState(true)
  const [showForm,  setShowForm]  = useState(false)
  const [editItem,  setEditItem]  = useState<QuestionFull | null>(null)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const [uploading, setUploading] = useState<Record<string, boolean>>({})

  const [form, setForm] = useState({
    text: '', year: '', ans_text: '',
    options: [
      { letter: 'أ', text: '', is_correct: true  },
      { letter: 'ب', text: '', is_correct: false },
      { letter: 'ج', text: '', is_correct: false },
      { letter: 'د', text: '', is_correct: false },
    ]
  })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  async function load() {
    const [{ data: ch }, { data: qs }] = await Promise.all([
      supabase.from('chapters').select('*').eq('id', chapterId).single(),
      supabase.from('questions')
        .select('*, options(*), explanations(*)')
        .eq('chapter_id', chapterId)
        .order('order_num'),
    ])
    setChapter(ch)
    setQuestions((qs || []) as QuestionFull[])
    setLoading(false)
  }

  useEffect(() => { load() }, [chapterId])

  // ── Upload image for question ────────────────────────────
  async function uploadImage(q: QuestionFull, file: File) {
    setUploading(u => ({ ...u, [`img-${q.id}`]: true }))
    const ext  = file.name.split('.').pop() || 'jpg'
    const path = `images/${chapterId}/${q.id}.${ext}`
    const fd   = new FormData()
    fd.append('file', file)
    fd.append('path', path)

    const r    = await fetch('/api/upload', { method: 'POST', body: fd })
    const data = await r.json()

    if (data.url) {
      await supabase.from('questions').update({ image_url: data.url }).eq('id', q.id)
      await load()
    }
    setUploading(u => ({ ...u, [`img-${q.id}`]: false }))
  }

  // ── Upload video explanation ─────────────────────────────
  async function uploadVideo(q: QuestionFull, file: File) {
    setUploading(u => ({ ...u, [`vid-${q.id}`]: true }))
    const ext  = file.name.split('.').pop() || 'mp4'
    const path = `videos/${chapterId}/${q.id}.${ext}`
    const fd   = new FormData()
    fd.append('file', file)
    fd.append('path', path)

    const r    = await fetch('/api/upload', { method: 'POST', body: fd })
    const data = await r.json()

    if (data.url) {
      const existing = q.explanations?.[0]
      if (existing) {
        await supabase.from('explanations')
          .update({ video_url: data.url, video_cf_key: path, video_uploaded_at: new Date().toISOString() })
          .eq('id', existing.id)
      } else {
        await supabase.from('explanations')
          .insert({ question_id: q.id, video_url: data.url, video_cf_key: path, video_uploaded_at: new Date().toISOString() })
      }
      await load()
    }
    setUploading(u => ({ ...u, [`vid-${q.id}`]: false }))
  }

  // ── Delete image ─────────────────────────────────────────
  async function deleteImage(q: QuestionFull) {
    if (!confirm('حذف صورة السؤال؟')) return
    const ext  = q.image_url?.split('.').pop() || 'jpg'
    await fetch('/api/upload', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: `images/${chapterId}/${q.id}.${ext}` })
    })
    await supabase.from('questions').update({ image_url: null }).eq('id', q.id)
    await load()
  }

  // ── Delete video ─────────────────────────────────────────
  async function deleteVideo(q: QuestionFull) {
    if (!confirm('حذف فيديو الشرح؟')) return
    const exp = q.explanations?.[0]
    if (exp?.video_cf_key) {
      await fetch('/api/upload', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: exp.video_cf_key })
      })
    }
    if (exp) await supabase.from('explanations').delete().eq('id', exp.id)
    await load()
  }

  function openAdd() {
    setEditItem(null)
    setForm({
      text: '', year: '', ans_text: '',
      options: [
        { letter: 'أ', text: '', is_correct: true  },
        { letter: 'ب', text: '', is_correct: false },
        { letter: 'ج', text: '', is_correct: false },
        { letter: 'د', text: '', is_correct: false },
      ]
    })
    setError(''); setShowForm(true)
  }

  function openEdit(q: QuestionFull) {
    setEditItem(q)
    const opts = ['أ','ب','ج','د'].map(letter => {
      const ex = q.options.find(o => o.letter === letter)
      return { letter, text: ex?.text || '', is_correct: ex?.is_correct || false }
    })
    setForm({ text: q.text, year: q.year?.toString() || '', ans_text: q.ans_text || '', options: opts })
    setError(''); setShowForm(true)
  }

  function setCorrect(idx: number) {
    setForm(f => ({ ...f, options: f.options.map((o, i) => ({ ...o, is_correct: i === idx })) }))
  }

  async function handleSave() {
    if (!form.text.trim()) { setError('نص السؤال مطلوب'); return }
    if (form.options.some(o => !o.text.trim())) { setError('جميع الخيارات مطلوبة'); return }
    setSaving(true); setError('')

    if (editItem) {
      await supabase.from('questions').update({
        text: form.text,
        year: form.year ? parseInt(form.year) : null,
        ans_text: form.ans_text,
        updated_at: new Date().toISOString()
      }).eq('id', editItem.id)

      for (let i = 0; i < form.options.length; i++) {
        const opt = form.options[i]
        const ex  = editItem.options.find(o => o.letter === opt.letter)
        if (ex) {
          await supabase.from('options').update({ text: opt.text, is_correct: opt.is_correct }).eq('id', ex.id)
        } else {
          await supabase.from('options').insert({ question_id: editItem.id, ...opt, order_num: i + 1 })
        }
      }
    } else {
      const maxNum = questions.length ? Math.max(...questions.map(q => q.num)) + 1 : 1
      const { data: newQ } = await supabase.from('questions').insert({
        chapter_id: chapterId, text: form.text,
        year: form.year ? parseInt(form.year) : null,
        ans_text: form.ans_text, num: maxNum, order_num: maxNum
      }).select().single()

      if (newQ) {
        for (let i = 0; i < form.options.length; i++) {
          await supabase.from('options').insert({ question_id: newQ.id, ...form.options[i], order_num: i + 1 })
        }
      }
    }

    await load(); setSaving(false); setShowForm(false)
  }

  async function handleDelete(q: QuestionFull) {
    if (!confirm(`حذف السؤال رقم ${q.num}؟`)) return
    await supabase.from('questions').delete().eq('id', q.id)
    await load()
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header style={{ background: 'linear-gradient(90deg, #0a2d6e, #1a4fa8)' }}
              className="text-white px-6 py-4 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(`/subjects/${subjectId}/chapters`)}
                  className="text-blue-200 hover:text-white text-sm">← الفصول</button>
          <span className="text-blue-300">|</span>
          <h1 className="font-bold text-lg">{chapter?.icon} {chapter?.name} — الأسئلة</h1>
        </div>
        <button onClick={openAdd}
                className="bg-yellow-500 hover:bg-yellow-400 text-white font-bold px-4 py-2 rounded-lg text-sm">
          ➕ سؤال جديد
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {loading ? (
          <div className="text-center py-20 text-slate-400">⏳ جاري التحميل...</div>
        ) : questions.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">❓</div>
            <p className="text-slate-500 mb-4">لا توجد أسئلة بعد</p>
            <button onClick={openAdd} className="bg-blue-700 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-600">
              ➕ أضف أول سؤال
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {questions.map(q => {
              const explanation = q.explanations?.[0]
              const imgLoading  = uploading[`img-${q.id}`]
              const vidLoading  = uploading[`vid-${q.id}`]

              return (
                <div key={q.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                  {/* Question header */}
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="bg-blue-700 text-white text-xs font-bold px-2 py-1 rounded-lg">س {q.num}</span>
                          {q.year && <span className="bg-yellow-100 text-yellow-800 text-xs font-bold px-2 py-1 rounded-lg">{q.year}</span>}
                        </div>
                        <p className="text-slate-800 font-medium mb-3">{q.text}</p>

                        {/* Options */}
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          {q.options.sort((a,b) => a.order_num - b.order_num).map(o => (
                            <div key={o.id} className={`text-sm px-3 py-2 rounded-lg flex items-center gap-2 ${
                              o.is_correct ? 'bg-green-50 text-green-700 font-semibold' : 'bg-slate-50 text-slate-600'
                            }`}>
                              <span className="font-bold">{o.letter}</span>
                              <span>{o.text}</span>
                              {o.is_correct && <span className="mr-auto">✅</span>}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-2 flex-shrink-0">
                        <button onClick={() => openEdit(q)}
                                className="bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold px-3 py-2 rounded-lg text-sm">
                          ✏️ تعديل
                        </button>
                        <button onClick={() => handleDelete(q)}
                                className="bg-red-50 hover:bg-red-100 text-red-600 font-semibold px-3 py-2 rounded-lg text-sm">
                          🗑️ حذف
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Media section */}
                  <div className="border-t border-slate-100 grid grid-cols-2 divide-x divide-x-reverse divide-slate-100">

                    {/* Image */}
                    <div className="p-4">
                      <p className="text-xs font-bold text-slate-500 mb-2">🖼️ صورة السؤال</p>
                      {q.image_url ? (
                        <div className="relative">
                          <img src={q.image_url} alt="question" className="w-full h-32 object-cover rounded-lg"/>
                          <button onClick={() => deleteImage(q)}
                                  className="absolute top-1 left-1 bg-red-500 text-white rounded-full w-6 h-6 text-xs flex items-center justify-center hover:bg-red-600">
                            ×
                          </button>
                        </div>
                      ) : (
                        <label className={`flex flex-col items-center justify-center h-32 border-2 border-dashed border-slate-200 rounded-lg cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-colors ${imgLoading ? 'opacity-50 pointer-events-none' : ''}`}>
                          <span className="text-2xl mb-1">{imgLoading ? '⏳' : '🖼️'}</span>
                          <span className="text-xs text-slate-400">{imgLoading ? 'جاري الرفع...' : 'رفع صورة'}</span>
                          <input type="file" accept="image/*" className="hidden"
                                 onChange={e => e.target.files?.[0] && uploadImage(q, e.target.files[0])}/>
                        </label>
                      )}
                    </div>

                    {/* Video */}
                    <div className="p-4">
                      <p className="text-xs font-bold text-slate-500 mb-2">🎬 فيديو الشرح</p>
                      {explanation?.video_url ? (
                        <div className="relative">
                          <video src={explanation.video_url} className="w-full h-32 object-cover rounded-lg bg-black" controls/>
                          <button onClick={() => deleteVideo(q)}
                                  className="absolute top-1 left-1 bg-red-500 text-white rounded-full w-6 h-6 text-xs flex items-center justify-center hover:bg-red-600">
                            ×
                          </button>
                        </div>
                      ) : (
                        <label className={`flex flex-col items-center justify-center h-32 border-2 border-dashed border-slate-200 rounded-lg cursor-pointer hover:border-purple-300 hover:bg-purple-50 transition-colors ${vidLoading ? 'opacity-50 pointer-events-none' : ''}`}>
                          <span className="text-2xl mb-1">{vidLoading ? '⏳' : '🎬'}</span>
                          <span className="text-xs text-slate-400">{vidLoading ? 'جاري الرفع...' : 'رفع فيديو'}</span>
                          <input type="file" accept="video/*" className="hidden"
                                 onChange={e => e.target.files?.[0] && uploadVideo(q, e.target.files[0])}/>
                        </label>
                      )}
                    </div>

                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-4">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 className="font-bold text-lg text-slate-800">
                {editItem ? `✏️ تعديل السؤال ${editItem.num}` : '➕ سؤال جديد'}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 text-2xl">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">
                  نص السؤال <span className="text-red-500">*</span>
                </label>
                <textarea value={form.text} onChange={e => setForm({...form, text: e.target.value})}
                          className="w-full border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500 resize-none"
                          rows={3} placeholder="اكتب نص السؤال هنا..."/>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-600 mb-1">السنة</label>
                  <input type="number" value={form.year} onChange={e => setForm({...form, year: e.target.value})}
                         className="w-full border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
                         placeholder="2024" dir="ltr"/>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-600 mb-1">شرح الإجابة</label>
                  <input value={form.ans_text} onChange={e => setForm({...form, ans_text: e.target.value})}
                         className="w-full border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
                         placeholder="شرح مختصر..."/>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-2">
                  الخيارات <span className="text-red-500">*</span>
                  <span className="text-slate-400 font-normal mr-2 text-xs">(اضغط على الحرف لتحديد الإجابة الصحيحة)</span>
                </label>
                <div className="space-y-2">
                  {form.options.map((opt, i) => (
                    <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-colors ${
                      opt.is_correct ? 'border-green-400 bg-green-50' : 'border-slate-200'
                    }`}>
                      <button onClick={() => setCorrect(i)}
                              className={`w-8 h-8 rounded-full font-bold text-sm flex-shrink-0 transition-colors ${
                                opt.is_correct ? 'bg-green-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-green-100'
                              }`}>
                        {opt.letter}
                      </button>
                      <input value={opt.text}
                             onChange={e => setForm(f => ({
                               ...f, options: f.options.map((o, j) => j === i ? {...o, text: e.target.value} : o)
                             }))}
                             className="flex-1 border-0 bg-transparent text-sm focus:outline-none"
                             placeholder={`الخيار ${opt.letter}`}/>
                      {opt.is_correct && <span className="text-green-600 text-xs font-bold">✅ صحيح</span>}
                    </div>
                  ))}
                </div>
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
            </div>
            <div className="flex gap-3 p-6 border-t border-slate-100">
              <button onClick={handleSave} disabled={saving}
                      className="flex-1 py-3 rounded-xl text-white font-bold text-sm disabled:opacity-60"
                      style={{ background: 'linear-gradient(90deg, #0a2d6e, #1a4fa8)' }}>
                {saving ? '⏳ جاري الحفظ...' : '💾 حفظ السؤال'}
              </button>
              <button onClick={() => setShowForm(false)}
                      className="px-6 py-3 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
