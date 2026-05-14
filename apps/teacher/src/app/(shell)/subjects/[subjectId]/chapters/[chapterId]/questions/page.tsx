'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter, useParams } from 'next/navigation'
import { useToast } from '@/components/Toast'
import type { Question, Option, Chapter, Explanation } from '@harvest/db'

type QuestionFull = Question & { options: Option[]; explanations: Explanation[] }

export default function TeacherQuestionsPage() {
  const router    = useRouter()
  const params    = useParams()
  const subjectId = params.subjectId as string
  const chapterId = params.chapterId as string
  const { show, ToastComponent } = useToast()

  const [chapter,   setChapter]   = useState<Chapter | null>(null)
  const [questions, setQuestions] = useState<QuestionFull[]>([])
  const [loading,   setLoading]   = useState(true)
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const [notes,     setNotes]     = useState<Record<string, string>>({})
  const [savingNote, setSavingNote] = useState<string | null>(null)

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
    const qList = (qs || []) as QuestionFull[]
    setQuestions(qList)
    // Pre-fill notes
    const notesMap: Record<string, string> = {}
    qList.forEach(q => {
      notesMap[q.id] = q.explanations?.[0]?.text_note || ''
    })
    setNotes(notesMap)
    setLoading(false)
  }

  useEffect(() => { load() }, [chapterId])

  async function uploadVideo(q: QuestionFull, file: File) {
    setUploading(u => ({ ...u, [q.id]: true }))
    show('جاري رفع الفيديو...', 'loading')

    const ext  = file.name.split('.').pop() || 'mp4'
    const path = `videos/${chapterId}/${q.id}.${ext}`
    const fd   = new FormData()
    fd.append('file', file)
    fd.append('path', path)

    const r = await fetch('/api/upload', { method: 'POST', body: fd })
    const d = await r.json()

    if (d.url) {
      const existing = q.explanations?.[0]
      if (existing) {
        await supabase.from('explanations')
          .update({ video_url: d.url, video_cf_key: path, video_uploaded_at: new Date().toISOString() })
          .eq('id', existing.id)
      } else {
        await supabase.from('explanations')
          .insert({ question_id: q.id, video_url: d.url, video_cf_key: path, video_uploaded_at: new Date().toISOString() })
      }
      show('✅ تم رفع الفيديو بنجاح', 'success')
      await load()
    } else {
      show('فشل رفع الفيديو', 'error')
    }
    setUploading(u => ({ ...u, [q.id]: false }))
  }

  async function deleteVideo(q: QuestionFull) {
    if (!confirm('حذف فيديو الشرح؟')) return
    const exp = q.explanations?.[0]
    if (exp?.video_cf_key) {
      await fetch('/api/upload', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: exp.video_cf_key })
      })
    }
    if (exp) await supabase.from('explanations').update({ video_url: null, video_cf_key: null }).eq('id', exp.id)
    show('تم حذف الفيديو', 'success')
    await load()
  }

  async function saveNote(q: QuestionFull) {
    setSavingNote(q.id)
    const note = notes[q.id] || ''
    const existing = q.explanations?.[0]
    if (existing) {
      await supabase.from('explanations').update({ text_note: note }).eq('id', existing.id)
    } else {
      await supabase.from('explanations').insert({ question_id: q.id, text_note: note })
    }
    show('✅ تم حفظ الملاحظة', 'success')
    setSavingNote(null)
    await load()
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {ToastComponent}
      <header style={{ background: 'linear-gradient(90deg, #0a2d6e, #1a4fa8)' }}
              className="text-white px-6 py-4 flex items-center gap-3 shadow-lg">
        <button onClick={() => router.push(`/subjects/${subjectId}/chapters`)}
                className="text-blue-200 hover:text-white text-sm">← الفصول</button>
        <span className="text-blue-300">|</span>
        <h1 className="font-bold text-lg">{chapter?.icon} {chapter?.name}</h1>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {loading ? (
          <div className="text-center py-20 text-slate-400">⏳ جاري التحميل...</div>
        ) : (
          <div className="space-y-6">
            {questions.map(q => {
              const exp        = q.explanations?.[0]
              const isUploading = uploading[q.id]

              return (
                <div key={q.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                  {/* Question */}
                  <div className="p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="bg-blue-700 text-white text-xs font-bold px-2 py-1 rounded-lg">س {q.num}</span>
                      {q.year && <span className="bg-yellow-100 text-yellow-800 text-xs font-bold px-2 py-1 rounded-lg">{q.year}</span>}
                      {exp?.video_url && <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded-lg">🎬 يوجد شرح</span>}
                    </div>
                    <p className="text-slate-800 font-medium mb-3">{q.text}</p>
                    {q.image_url && (
                      <img src={q.image_url} alt="" className="max-h-40 rounded-lg mb-3 object-contain"/>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      {q.options.sort((a,b) => a.order_num-b.order_num).map(o => (
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

                  {/* Teacher section */}
                  <div className="border-t border-slate-100 bg-slate-50">
                    <div className="grid grid-cols-2 divide-x divide-x-reverse divide-slate-200">

                      {/* Video */}
                      <div className="p-4">
                        <p className="text-xs font-bold text-slate-500 mb-2">🎬 فيديو الشرح</p>
                        {exp?.video_url ? (
                          <div className="relative">
                            <video src={exp.video_url} controls
                                   className="w-full h-36 rounded-xl bg-black object-cover"/>
                            <button onClick={() => deleteVideo(q)}
                                    className="absolute top-2 left-2 bg-red-500 text-white rounded-full w-7 h-7 text-sm flex items-center justify-center hover:bg-red-600 shadow">
                              ×
                            </button>
                          </div>
                        ) : (
                          <label className={`flex flex-col items-center justify-center h-36 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                            isUploading ? 'opacity-50 pointer-events-none border-blue-300 bg-blue-50' : 'border-slate-200 hover:border-purple-300 hover:bg-purple-50'
                          }`}>
                            <span className="text-3xl mb-2">{isUploading ? '⏳' : '🎬'}</span>
                            <span className="text-xs text-slate-400 font-medium">
                              {isUploading ? 'جاري الرفع...' : 'اضغط لرفع فيديو الشرح'}
                            </span>
                            <input type="file" accept="video/*" className="hidden"
                                   onChange={e => e.target.files?.[0] && uploadVideo(q, e.target.files[0])}/>
                          </label>
                        )}
                      </div>

                      {/* Notes */}
                      <div className="p-4">
                        <p className="text-xs font-bold text-slate-500 mb-2">✏️ ملاحظات المعلم</p>
                        <textarea
                          value={notes[q.id] || ''}
                          onChange={e => setNotes(n => ({ ...n, [q.id]: e.target.value }))}
                          className="w-full h-28 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none bg-white"
                          placeholder="أضف ملاحظة أو شرحاً للطلاب..."/>
                        <button
                          onClick={() => saveNote(q)}
                          disabled={savingNote === q.id}
                          className="mt-2 w-full py-2 rounded-lg text-white text-xs font-bold disabled:opacity-50"
                          style={{ background: 'linear-gradient(90deg, #0a2d6e, #1a4fa8)' }}>
                          {savingNote === q.id ? '⏳ جاري الحفظ...' : '💾 حفظ الملاحظة'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
