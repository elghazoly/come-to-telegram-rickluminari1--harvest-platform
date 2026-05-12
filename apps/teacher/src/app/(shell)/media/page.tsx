'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { useToast } from '@/components/Toast'
import type { Subject, Chapter, Question } from '@harvest/db'

interface MediaFile {
  key:  string
  size: number
  url:  string
}

interface EnrichedFile extends MediaFile {
  subjectName:  string
  chapterName:  string
  questionText: string
  questionNum:  number
}

export default function MediaPage() {
  const router = useRouter()
  const { show, ToastComponent } = useToast()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [tab,       setTab]       = useState<'videos'|'images'>('videos')
  const [files,     setFiles]     = useState<EnrichedFile[]>([])
  const [loading,   setLoading]   = useState(true)
  const [uploading, setUploading] = useState(false)
  const [preview,   setPreview]   = useState<EnrichedFile | null>(null)
  const [search,    setSearch]    = useState('')

  // Dropdown data
  const [subjects,  setSubjects]  = useState<Subject[]>([])
  const [chapters,  setChapters]  = useState<Chapter[]>([])
  const [questions, setQuestions] = useState<Question[]>([])

  // Upload form
  const [upSubject,  setUpSubject]  = useState('')
  const [upChapter,  setUpChapter]  = useState('')
  const [upQuestion, setUpQuestion] = useState('')
  const [upFile,     setUpFile]     = useState<File | null>(null)

  // Load subjects on mount
  useEffect(() => {
    supabase.from('subjects').select('*').order('order_num').then(({ data }) => {
      setSubjects(data || [])
    })
  }, [])

  // Load chapters when subject changes
  useEffect(() => {
    setUpChapter(''); setUpQuestion(''); setChapters([]); setQuestions([])
    if (!upSubject) return
    supabase.from('chapters').select('*').eq('subject_id', upSubject).order('order_num')
      .then(({ data }) => setChapters(data || []))
  }, [upSubject])

  // Load questions when chapter changes
  useEffect(() => {
    setUpQuestion(''); setQuestions([])
    if (!upChapter) return
    supabase.from('questions').select('*').eq('chapter_id', upChapter).order('order_num')
      .then(({ data }) => setQuestions(data || []))
  }, [upChapter])

  // Load and enrich files
  async function loadFiles() {
    setLoading(true)
    try {
      const prefix = tab === 'videos' ? 'videos/' : 'images/'
      const r = await fetch(`/api/media/list?prefix=${prefix}`)
      const d = await r.json()
      const rawFiles: MediaFile[] = d.files || []

      // Enrich: resolve chapter/question IDs to names
      // Path format: videos/{chapter_id}/{question_id}.ext
      const enriched = await Promise.all(rawFiles.map(async f => {
        const parts     = f.key.split('/')
        const chapterId = parts[1] || ''
        const qFile     = parts[2] || ''
        const qId       = qFile.replace(/\.[^.]+$/, '') // remove extension

        let subjectName  = chapterId.substring(0, 8) + '...'
        let chapterName  = chapterId.substring(0, 8) + '...'
        let questionText = qId.substring(0, 8) + '...'
        let questionNum  = 0

        // Fetch chapter info
        const { data: ch } = await supabase.from('chapters')
          .select('id, name, subject_id, subjects(name)')
          .eq('id', chapterId).single()
        if (ch) {
          chapterName = ch.name
          // @ts-ignore
          subjectName = ch.subjects?.name || subjectName
        }

        // Fetch question info
        const { data: q } = await supabase.from('questions')
          .select('id, num, text')
          .eq('id', qId).single()
        if (q) {
          questionText = q.text?.substring(0, 60) + (q.text?.length > 60 ? '...' : '')
          questionNum  = q.num
        }

        return { ...f, subjectName, chapterName, questionText, questionNum }
      }))

      setFiles(enriched)
    } catch {
      show('فشل تحميل الملفات', 'error')
    }
    setLoading(false)
  }

  useEffect(() => { loadFiles() }, [tab])

  const filtered = files.filter(f =>
    !search ||
    f.subjectName.includes(search) ||
    f.chapterName.includes(search) ||
    f.questionText.includes(search)
  )

  async function handleUpload() {
    if (!upFile || !upChapter || !upQuestion) {
      show('اختر المادة والفصل والسؤال والملف', 'error'); return
    }
    setUploading(true)
    show('جاري الرفع...', 'loading')

    const ext  = upFile.name.split('.').pop() || (tab === 'videos' ? 'mp4' : 'jpg')
    const path = `${tab === 'videos' ? 'videos' : 'images'}/${upChapter}/${upQuestion}.${ext}`
    const fd   = new FormData()
    fd.append('file', upFile)
    fd.append('path', path)

    const r = await fetch('/api/upload', { method: 'POST', body: fd })
    const d = await r.json()

    if (d.url) {
      // If video, update explanations table
      if (tab === 'videos') {
        const { data: existing } = await supabase.from('explanations')
          .select('id').eq('question_id', upQuestion).single()
        if (existing) {
          await supabase.from('explanations')
            .update({ video_url: d.url, video_cf_key: path, video_uploaded_at: new Date().toISOString() })
            .eq('id', existing.id)
        } else {
          await supabase.from('explanations')
            .insert({ question_id: upQuestion, video_url: d.url, video_cf_key: path, video_uploaded_at: new Date().toISOString() })
        }
      } else {
        // If image, update questions table
        await supabase.from('questions').update({ image_url: d.url }).eq('id', upQuestion)
      }

      show('تم الرفع بنجاح ✅', 'success')
      setUpFile(null)
      setUpSubject(''); setUpChapter(''); setUpQuestion('')
      await loadFiles()
    } else {
      show('فشل الرفع: ' + (d.error || ''), 'error')
    }
    setUploading(false)
  }

  async function handleDelete(file: EnrichedFile) {
    if (!confirm(`حذف هذا الملف نهائياً؟`)) return
    show('جاري الحذف...', 'loading')

    const r = await fetch('/api/upload', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: file.key })
    })

    if (r.ok) {
      show('تم الحذف', 'success')
      await loadFiles()
    } else {
      show('فشل الحذف', 'error')
    }
  }

  function formatSize(bytes: number) {
    if (bytes < 1024*1024) return (bytes/1024).toFixed(0) + ' KB'
    return (bytes/1024/1024).toFixed(1) + ' MB'
  }

  return (
    <div>
      {ToastComponent}

      {/* Header */}

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {(['videos','images'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
                    className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                      tab === t ? 'bg-blue-700 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                    }`}>
              {t === 'videos' ? '🎬 الفيديوهات' : '🖼️ الصور'}
              {tab === t && <span className="mr-2 bg-white/20 px-2 py-0.5 rounded-full text-xs">{files.length}</span>}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Upload Panel */}
          <div className="col-span-1">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 sticky top-6">
              <h2 className="font-bold text-slate-800 mb-4">
                {tab === 'videos' ? '🎬 رفع فيديو' : '🖼️ رفع صورة'}
              </h2>
              <div className="space-y-3">

                {/* Subject */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">المادة</label>
                  <select value={upSubject} onChange={e => setUpSubject(e.target.value)}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 bg-white">
                    <option value="">اختر المادة...</option>
                    {subjects.map(s => (
                      <option key={s.id} value={s.id}>{s.icon} {s.name}</option>
                    ))}
                  </select>
                </div>

                {/* Chapter */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">الفصل</label>
                  <select value={upChapter} onChange={e => setUpChapter(e.target.value)}
                          disabled={!upSubject}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 bg-white disabled:opacity-50">
                    <option value="">اختر الفصل...</option>
                    {chapters.map(c => (
                      <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                    ))}
                  </select>
                </div>

                {/* Question */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">السؤال</label>
                  <select value={upQuestion} onChange={e => setUpQuestion(e.target.value)}
                          disabled={!upChapter}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 bg-white disabled:opacity-50">
                    <option value="">اختر السؤال...</option>
                    {questions.map(q => (
                      <option key={q.id} value={q.id}>س{q.num} — {q.text?.substring(0,40)}...</option>
                    ))}
                  </select>
                </div>

                {/* File */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">الملف</label>
                  <label className={`flex flex-col items-center justify-center h-24 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                    upFile ? 'border-green-400 bg-green-50' : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50'
                  }`}>
                    <span className="text-2xl mb-1">{upFile ? '✅' : tab === 'videos' ? '🎬' : '🖼️'}</span>
                    <span className="text-xs text-slate-400 text-center px-2">
                      {upFile ? upFile.name : 'اضغط لاختيار ملف'}
                    </span>
                    <input type="file" accept={tab === 'videos' ? 'video/*' : 'image/*'} className="hidden"
                           onChange={e => setUpFile(e.target.files?.[0] || null)}/>
                  </label>
                </div>

                <button onClick={handleUpload} disabled={uploading || !upFile || !upQuestion}
                        className="w-full py-2.5 rounded-xl text-white font-bold text-sm disabled:opacity-50 transition-opacity"
                        style={{ background: 'linear-gradient(90deg, #0a2d6e, #1a4fa8)' }}>
                  {uploading ? '⏳ جاري الرفع...' : '☁️ رفع'}
                </button>
              </div>
            </div>
          </div>

          {/* Files Grid */}
          <div className="col-span-2">
            <input value={search} onChange={e => setSearch(e.target.value)}
                   className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 shadow-sm mb-4"
                   placeholder="🔍 بحث بالمادة أو الفصل أو السؤال..."/>

            {loading ? (
              <div className="text-center py-20 text-slate-400">⏳ جاري التحميل...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-20 text-slate-400">
                <div className="text-5xl mb-3">{tab === 'videos' ? '🎬' : '🖼️'}</div>
                <p>لا توجد {tab === 'videos' ? 'فيديوهات' : 'صور'} بعد</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map(f => (
                  <div key={f.key} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex items-center gap-4">

                    {/* Thumbnail */}
                    <div className="w-20 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-slate-100 flex items-center justify-center cursor-pointer"
                         onClick={() => setPreview(f)}>
                      {tab === 'images' ? (
                        <img src={f.url} alt="" className="w-full h-full object-cover"/>
                      ) : (
                        <span className="text-3xl">🎬</span>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">
                          {f.subjectName}
                        </span>
                        <span className="bg-purple-100 text-purple-700 text-xs font-bold px-2 py-0.5 rounded-full">
                          {f.chapterName}
                        </span>
                        <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">
                          س{f.questionNum}
                        </span>
                      </div>
                      <p className="text-slate-700 text-sm font-medium truncate">{f.questionText}</p>
                      <p className="text-slate-400 text-xs mt-0.5">{formatSize(f.size)}</p>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <button onClick={() => setPreview(f)}
                              className="bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-semibold">
                        {tab === 'videos' ? '▶️ معاينة' : '👁️ معاينة'}
                      </button>
                      <button onClick={() => handleDelete(f)}
                              className="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg text-xs font-semibold">
                        🗑️ حذف
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Preview Modal */}
      {preview && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
             onClick={() => setPreview(null)}>
          <div className="max-w-3xl w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-white">
                <span className="text-sm font-bold">{preview.subjectName}</span>
                <span className="text-slate-400 mx-2">›</span>
                <span className="text-sm">{preview.chapterName}</span>
                <span className="text-slate-400 mx-2">›</span>
                <span className="text-sm">س{preview.questionNum}</span>
              </div>
              <button onClick={() => setPreview(null)}
                      className="text-white hover:text-slate-300 text-2xl leading-none">×</button>
            </div>
            {tab === 'videos' ? (
              <video src={preview.url} controls autoPlay className="w-full rounded-xl max-h-[70vh] bg-black"/>
            ) : (
              <img src={preview.url} alt="" className="w-full rounded-xl max-h-[70vh] object-contain bg-black"/>
            )}
            <p className="text-slate-400 text-xs mt-2 text-center">{preview.questionText}</p>
          </div>
        </div>
      )}
    </div>
  )
}
