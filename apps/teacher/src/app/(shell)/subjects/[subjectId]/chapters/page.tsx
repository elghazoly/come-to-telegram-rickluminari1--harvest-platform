'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter, useParams } from 'next/navigation'
import type { Chapter, Subject } from '@harvest/db'

export default function TeacherChaptersPage() {
  const router    = useRouter()
  const params    = useParams()
  const subjectId = params.subjectId as string
  const [subject,  setSubject]  = useState<Subject | null>(null)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [loading,  setLoading]  = useState(true)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    async function load() {
      const [{ data: sub }, { data: chs }] = await Promise.all([
        supabase.from('subjects').select('*').eq('id', subjectId).single(),
        supabase.from('chapters').select('*').eq('subject_id', subjectId).order('order_num'),
      ])
      setSubject(sub); setChapters(chs || []); setLoading(false)
    }
    load()
  }, [subjectId])

  return (
    <div className="min-h-screen bg-slate-50">
      <header style={{ background: 'linear-gradient(90deg, #0a2d6e, #1a4fa8)' }}
              className="text-white px-6 py-4 flex items-center gap-3 shadow-lg">
        <button onClick={() => router.push('/dashboard')}
                className="text-blue-200 hover:text-white text-sm">← موادي</button>
        <span className="text-blue-300">|</span>
        <h1 className="font-bold text-lg">{subject?.icon} {subject?.name}</h1>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        <h2 className="text-xl font-bold text-slate-700 mb-6">📂 الفصول</h2>
        {loading ? (
          <div className="text-center py-20 text-slate-400">⏳ جاري التحميل...</div>
        ) : (
          <div className="grid gap-3">
            {chapters.map(c => (
              <button key={c.id}
                      onClick={() => router.push(`/subjects/${subjectId}/chapters/${c.id}/questions`)}
                      className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex items-center gap-4 hover:shadow-md hover:border-blue-200 transition-all text-right w-full group">
                <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-2xl flex-shrink-0">
                  {c.icon || '📂'}
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-slate-800 group-hover:text-blue-700 transition-colors">{c.name}</h3>
                  <p className="text-slate-400 text-xs mt-0.5">الترتيب: {c.order_num}</p>
                </div>
                <span className="text-blue-400 group-hover:text-blue-600 text-lg">←</span>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
