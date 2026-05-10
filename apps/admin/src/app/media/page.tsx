'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/Toast'

interface MediaFile {
  key:  string
  size: number
  url:  string
}

const WORKER_URL = process.env.NEXT_PUBLIC_CF_WORKER_URL!

export default function MediaPage() {
  const router = useRouter()
  const { show, ToastComponent } = useToast()

  const [tab,       setTab]       = useState<'videos'|'images'>('videos')
  const [files,     setFiles]     = useState<MediaFile[]>([])
  const [loading,   setLoading]   = useState(true)
  const [uploading, setUploading] = useState(false)
  const [preview,   setPreview]   = useState<MediaFile | null>(null)
  const [search,    setSearch]    = useState('')

  // Upload form
  const [upForm, setUpForm] = useState({
    chapter_id: '', question_id: '', file: null as File | null
  })

  async function loadFiles() {
    setLoading(true)
    try {
      const prefix = tab === 'videos' ? 'videos/' : 'images/'
      const r = await fetch(`/api/media/list?prefix=${prefix}`)
      const d = await r.json()
      setFiles(d.files || [])
    } catch {
      show('فشل تحميل الملفات', 'error')
    }
    setLoading(false)
  }

  useEffect(() => { loadFiles() }, [tab])

  const filtered = files.filter(f =>
    !search || f.key.toLowerCase().includes(search.toLowerCase())
  )

  async function handleUpload() {
    if (!upForm.file || !upForm.chapter_id || !upForm.question_id) {
      show('أدخل بيانات الرفع كاملة', 'error'); return
    }
    setUploading(true)
    show('جاري الرفع...', 'loading')

    const ext  = upForm.file.name.split('.').pop() || (tab === 'videos' ? 'mp4' : 'jpg')
    const path = `${tab === 'videos' ? 'videos' : 'images'}/${upForm.chapter_id}/${upForm.question_id}.${ext}`
    const fd   = new FormData()
    fd.append('file', upForm.file)
    fd.append('path', path)

    const r = await fetch('/api/upload', { method: 'POST', body: fd })
    const d = await r.json()

    if (d.url) {
      show('✅ تم الرفع بنجاح', 'success')
      setUpForm({ chapter_id: '', question_id: '', file: null })
      await loadFiles()
    } else {
      show('فشل الرفع: ' + (d.error || ''), 'error')
    }
    setUploading(false)
  }

  async function handleDelete(file: MediaFile) {
    if (!confirm(`حذف "${file.key.split('/').pop()}" نهائياً؟`)) return
    show('جاري الحذف...', 'loading')

    const r = await fetch('/api/upload', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ path: file.key })
    })

    if (r.ok) {
      show('تم الحذف', 'success')
      await loadFiles()
    } else {
      show('فشل الحذف', 'error')
    }
  }

  function formatSize(bytes: number) {
    if (bytes < 1024)       return bytes + ' B'
    if (bytes < 1024*1024)  return (bytes/1024).toFixed(1) + ' KB'
    return (bytes/1024/1024).toFixed(1) + ' MB'
  }

  function parsePath(key: string) {
    const parts = key.split('/')
    return { type: parts[0], chapter: parts[1] || '—', file: parts[2] || '—' }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {ToastComponent}

      {/* Header */}
      <header style={{ background: 'linear-gradient(90deg, #0a2d6e, #1a4fa8)' }}
              className="text-white px-6 py-4 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')}
                  className="text-blue-200 hover:text-white text-sm">← العودة</button>
          <span className="text-blue-300">|</span>
          <h1 className="font-bold text-lg">🗂️ إدارة الميديا</h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {(['videos', 'images'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
                    className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                      tab === t
                        ? 'bg-blue-700 text-white shadow-md'
                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}>
              {t === 'videos' ? '🎬 الفيديوهات' : '🖼️ الصور'}
              <span className="mr-2 bg-white/20 px-2 py-0.5 rounded-full text-xs">
                {tab === t ? files.length : ''}
              </span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-6">

          {/* Upload panel */}
          <div className="col-span-1">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 sticky top-6">
              <h2 className="font-bold text-slate-800 mb-4">
                {tab === 'videos' ? '🎬 رفع فيديو' : '🖼️ رفع صورة'}
              </h2>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Chapter ID</label>
                  <input value={upForm.chapter_id}
                         onChange={e => setUpForm({...upForm, chapter_id: e.target.value})}
                         className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                         placeholder="uuid الفصل" dir="ltr"/>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Question ID</label>
                  <input value={upForm.question_id}
                         onChange={e => setUpForm({...upForm, question_id: e.target.value})}
                         className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                         placeholder="uuid السؤال" dir="ltr"/>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-2">الملف</label>
                  <label className="flex flex-col items-center justify-center h-24 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-colors">
                    <span className="text-2xl mb-1">{upForm.file ? '✅' : tab === 'videos' ? '🎬' : '🖼️'}</span>
                    <span className="text-xs text-slate-400">
                      {upForm.file ? upForm.file.name : 'اختر ملف'}
                    </span>
                    <input type="file"
                           accept={tab === 'videos' ? 'video/*' : 'image/*'}
                           className="hidden"
                           onChange={e => setUpForm({...upForm, file: e.target.files?.[0] || null})}/>
                  </label>
                </div>

                <button onClick={handleUpload} disabled={uploading}
                        className="w-full py-2.5 rounded-xl text-white font-bold text-sm disabled:opacity-50"
                        style={{ background: 'linear-gradient(90deg, #0a2d6e, #1a4fa8)' }}>
                  {uploading ? '⏳ جاري الرفع...' : '☁️ رفع'}
                </button>
              </div>
            </div>
          </div>

          {/* Files list */}
          <div className="col-span-2">
            {/* Search */}
            <input value={search} onChange={e => setSearch(e.target.value)}
                   className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 shadow-sm mb-4"
                   placeholder="🔍 بحث..."/>

            {loading ? (
              <div className="text-center py-20 text-slate-400">⏳ جاري التحميل...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-20 text-slate-400">
                <div className="text-5xl mb-3">{tab === 'videos' ? '🎬' : '🖼️'}</div>
                <p>لا توجد {tab === 'videos' ? 'فيديوهات' : 'صور'} بعد</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-right">
                      <th className="px-4 py-3 font-semibold text-slate-600">الفصل / السؤال</th>
                      <th className="px-4 py-3 font-semibold text-slate-600">الحجم</th>
                      <th className="px-4 py-3 font-semibold text-slate-600 text-center">معاينة</th>
                      <th className="px-4 py-3 font-semibold text-slate-600 text-center">إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(f => {
                      const { chapter, file } = parsePath(f.key)
                      return (
                        <tr key={f.key} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-700 text-xs truncate max-w-[180px]">{chapter}</div>
                            <div className="text-slate-400 text-xs">{file}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs">{formatSize(f.size)}</td>
                          <td className="px-4 py-3 text-center">
                            <button onClick={() => setPreview(f)}
                                    className="bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-semibold">
                              {tab === 'videos' ? '▶️' : '👁️'} معاينة
                            </button>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button onClick={() => handleDelete(f)}
                                    className="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg text-xs font-semibold">
                              🗑️ حذف
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
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
              <p className="text-white text-sm font-medium">{preview.key}</p>
              <button onClick={() => setPreview(null)}
                      className="text-white hover:text-slate-300 text-2xl leading-none">×</button>
            </div>
            {tab === 'videos' ? (
              <video src={preview.url} controls autoPlay className="w-full rounded-xl max-h-[70vh] bg-black"/>
            ) : (
              <img src={preview.url} alt="" className="w-full rounded-xl max-h-[70vh] object-contain bg-black"/>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
