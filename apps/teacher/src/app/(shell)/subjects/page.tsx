'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Subject { id: string; name: string; icon: string | null; chapters: { id: string; name: string; chapter_type: string }[] }

export default function SubjectsPickerPage() {
  const router = useRouter()
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single()

      let subjectIds: string[] = []
      if (prof?.role === 'admin') {
        const { data } = await supabase.from('subjects').select('id').order('order_num')
        subjectIds = data?.map((s: any) => s.id) || []
      } else {
        const { data: ts } = await supabase.from('teacher_subjects').select('subject_id').eq('teacher_id', user.id)
        subjectIds = ts?.map((t: any) => t.subject_id) || []
      }

      const built: Subject[] = []
      for (const sid of subjectIds) {
        const { data: sub }  = await supabase.from('subjects').select('*').eq('id', sid).single()
        const { data: chs }  = await supabase.from('chapters').select('id, name, chapter_type').eq('subject_id', sid).order('order_num')
        if (sub) built.push({ ...sub, chapters: chs || [] })
      }
      setSubjects(built)
      setLoading(false)
    }
    load()
  }, [])

  const colors = [
    { bg: '#eff6ff', border: '#bfdbfe', col: '#1d4ed8', hover: '#dbeafe' },
    { bg: '#f0fdf4', border: '#bbf7d0', col: '#15803d', hover: '#dcfce7' },
    { bg: '#f5f3ff', border: '#ddd6fe', col: '#6d28d9', hover: '#ede9fe' },
    { bg: '#fff7ed', border: '#fed7aa', col: '#c2410c', hover: '#ffedd5' },
    { bg: '#fdf4ff', border: '#e9d5ff', col: '#7e22ce', hover: '#f3e8ff' },
    { bg: '#f0fdfa', border: '#99f6e4', col: '#0f766e', hover: '#ccfbf1' },
  ]

  return (
    <div style={{ padding: 24, background: '#f0f4ff', minHeight: '100%' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1e293b' }}>📚 موادي</h1>
        <p style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>اختر مادة للبدء في إدارتها</p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>⏳ جاري التحميل...</div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {subjects.map((sub, i) => {
            const c = colors[i % colors.length]
            const lessons = sub.chapters.filter(ch => ch.chapter_type !== 'exam').length
            const exams   = sub.chapters.filter(ch => ch.chapter_type === 'exam').length
            return (
              <div key={sub.id}
                   onClick={() => router.push(`/subjects/${sub.id}/chapters`)}
                   style={{ background: 'white', borderRadius: 16, border: `1.5px solid ${c.border}`, padding: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 1px 4px rgba(0,0,0,.05)', transition: 'all .2s' }}
                   onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateX(-4px)'; (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 16px rgba(0,0,0,.1)`; }}
                   onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateX(0)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 4px rgba(0,0,0,.05)'; }}>
                {/* Icon */}
                <div style={{ width: 56, height: 56, borderRadius: 14, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, flexShrink: 0 }}>
                  {sub.icon || '📚'}
                </div>
                {/* Info */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b', marginBottom: 6 }}>{sub.name}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ background: c.bg, color: c.col, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20 }}>{sub.chapters.length} فصل</span>
                    <span style={{ background: '#f0fdf4', color: '#15803d', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20 }}>{lessons} شرح</span>
                    {exams > 0 && <span style={{ background: '#fff7ed', color: '#c2410c', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20 }}>{exams} اختبار</span>}
                  </div>
                </div>
                {/* Arrow */}
                <div style={{ color: '#94a3b8' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6"/>
                  </svg>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
