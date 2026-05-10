'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter, useParams } from 'next/navigation'
import type { Question, Option, Chapter } from '@harvest/db'

type QuestionWithOptions = Question & { options: Option[] }

export default function QuestionsPage() {
  const router    = useRouter()
  const params    = useParams()
  const subjectId = params.id as string
  const chapterId = params.chapterId as string

  const [chapter,   setChapter]   = useState<Chapter | null>(null)
  const [questions, setQuestions] = useState<QuestionWithOptions[]>([])
  const [loading,   setLoading]   = useState(true)
  const [showForm,  setShowForm]  = useState(false)
  const [editItem,  setEditItem]  = useState<QuestionWithOptions | null>(null)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')

  const [form, setForm] = useState({
    text: '', year: '', ans_text: '',
    options: [
      { letter: 'أ', text: '', is_correct: true },
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
      supabase.from('questions').select('*, options(*)').eq('chapter_id', chapterId).order('order_num'),
    ])
    setChapter(ch)
    setQuestions((qs || []) as QuestionWithOptions[])
    setLoading(false)
  }

  useEffect(() => { load() }, [chapterId])

  function openAdd() {
    setEditItem(null)
    setForm({
      text: '', year: '', ans_text: '',
      options: [
        { letter: 'أ', text: '', is_correct: true },
        { letter: 'ب', text: '', is_correct: false },
        { letter: 'ج', text: '', is_correct: false },
        { letter: 'د', text: '', is_correct: false },
      ]
    })
    setError('')
    setShowForm(true)
  }

  function openEdit(q: QuestionWithOptions) {
    setEditItem(q)
    const opts = ['أ','ب','ج','د'].map(letter => {
      const existing = q.options.find(o => o.letter === letter)
      return { letter, text: existing?.text || '', is_correct: existing?.is_correct || false }
    })
    setForm({ text: q.text, year: q.year?.toString() || '', ans_text: q.ans_text || '', options: opts })
    setError('')
    setShowForm(true)
  }

  function setCorrect(idx: number) {
    setForm(f => ({
      ...f,
      options: f.options.map((o, i) => ({ ...o, is_correct: i === idx }))
    }))
  }

  async function handleSave() {
    if (!form.text.trim()) { setError('نص السؤال مطلوب'); return }
    if (form.options.some(o => !o.text.trim())) { setError('جميع الخيارات مطلوبة'); return }
    setSaving(true); setError('')

    if (editItem) {
      await supabase.from('questions').update({
        text: form.text, year: form.year ? parseInt(form.year) : null,
        ans_text: form.ans_text, updated_at: new Date().toISOString()
      }).eq('id', editItem.id)

      for (let i = 0; i < form.options.length; i++) {
        const opt = form.options[i]
        const existing = editItem.options.find(o => o.letter === opt.letter)
        if (existing) {
          await supabase.from('options').update({ text: opt.text, is_correct: opt.is_correct }).eq('id', existing.id)
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

  async function handleDelete(q: QuestionWithOptions) {
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
          <div className="space-y-4">
            {questions.map(q => (
              <div key={q.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="bg-blue-700 text-white text-xs font-bold px-2 py-1 rounded-lg">
                        س {q.num}
                      </span>
                      {q.year && (
                        <span className="bg-yellow-100 text-yellow-800 text-xs font-bold px-2 py-1 rounded-lg">
                          {q.year}
                        </span>
                      )}
                    </div>
                    <p className="text-slate-800 font-medium mb-3">{q.text}</p>
                    <div className="grid grid-cols-2 gap-2">
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
            ))}
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
                  <span className="text-slate-400 font-normal mr-2">(اضغط على الصح لتحديد الإجابة الصحيحة)</span>
                </label>
                <div className="space-y-2">
                  {form.options.map((opt, i) => (
                    <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-colors ${
                      opt.is_correct ? 'border-green-400 bg-green-50' : 'border-slate-200 bg-white'
                    }`}>
                      <button onClick={() => setCorrect(i)}
                              className={`w-8 h-8 rounded-full font-bold text-sm flex-shrink-0 transition-colors ${
                                opt.is_correct
                                  ? 'bg-green-500 text-white'
                                  : 'bg-slate-100 text-slate-500 hover:bg-green-100'
                              }`}>
                        {opt.letter}
                      </button>
                      <input value={opt.text}
                             onChange={e => setForm(f => ({
                               ...f,
                               options: f.options.map((o, j) => j === i ? {...o, text: e.target.value} : o)
                             }))}
                             className="flex-1 border-0 bg-transparent text-sm focus:outline-none text-slate-700"
                             placeholder={`الخيار ${opt.letter}`}/>
                      {opt.is_correct && <span className="text-green-600 text-xs font-bold">✅ صحيح</span>}
                    </div>
                  ))}
                </div>
              </div>
              {error && <p className="text-red-600 text-sm font-medium">{error}</p>}
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
