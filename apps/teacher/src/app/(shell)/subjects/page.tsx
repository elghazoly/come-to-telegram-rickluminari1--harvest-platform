'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Chapter { id: string; name: string; chapter_type: string }
interface Subject { id: string; name: string; icon: string | null; chapters: Chapter[] }

export default function SubjectsPage() {
  const router = useRouter()
  const [subjects,  setSubjects]  = useState<Subject[]>([])
  const [expanded,  setExpanded]  = useState<string | null>(null)
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      let subjectIds: string[] = []

      if ((prof as any)?.role === 'admin') {
        const { data } = await supabase.from('subjects').select('id').order('order_num')
        subjectIds = data?.map((s: any) => s.id) || []
      } else {
        const { data: ts } = await supabase.from('teacher_subjects').select('subject_id').eq('teacher_id', user.id)
        subjectIds = ts?.map((t: any) => t.subject_id) || []
      }

      const built: Subject[] = []
      for (const sid of subjectIds) {
        const { data: sub } = await supabase.from('subjects').select('*').eq('id', sid).single()
        const { data: chs } = await supabase.from('chapters').select('id, name, chapter_type').eq('subject_id', sid).order('order_num')
        if (sub) built.push({ ...sub, chapters: chs || [] })
      }
      setSubjects(built)
      setLoading(false)
    }
    load()
  }, [])

  function exportPDF(subjectId: string, mode: 'solved' | 'unsolved') {
    window.open(`/api/export-pdf?subject_id=${subjectId}&mode=${mode}`, '_blank')
  }

  const colors = [
    { bg: '#eff6ff', border: '#bfdbfe', col: '#1d4ed8' },
    { bg: '#f0fdf4', border: '#bbf7d0', col: '#15803d' },
    { bg: '#f5f3ff', border: '#ddd6fe', col: '#6d28d9' },
    { bg: '#fff7ed', border: '#fed7aa', col: '#c2410c' },
    { bg: '#fdf4ff', border: '#e9d5ff', col: '#7e22ce' },
    { bg: '#f0fdfa', border: '#99f6e4', col: '#0f766e' },
  ]

  return (
    <div style={{ padding: 24, background: '#f0f4ff', minHeight: '100%' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1e293b' }}>📚 موادي</h1>
        <p style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>إدارة المواد وتصدير الأسئلة</p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>⏳ جاري التحميل...</div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {subjects.map((sub, i) => {
            const c = colors[i % colors.length]
            const isOpen = expanded === sub.id
            const lessonChs = sub.chapters.filter(ch => ch.chapter_type !== 'exam').length
            const examChs   = sub.chapters.filter(ch => ch.chapter_type === 'exam').length

            return (
              <div key={sub.id} style={{ background: 'white', borderRadius: 16, border: `1.5px solid ${c.border}`, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>

                {/* Subject header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px' }}>
                  <div style={{ width: 52, height: 52, borderRadius: 13, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0 }}>
                    {sub.icon || '📚'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 17, fontWeight: 800, color: '#1e293b', marginBottom: 5 }}>{sub.name}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ background: c.bg, color: c.col, fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 20 }}>{sub.chapters.length} فصل</span>
                      {lessonChs > 0 && <span style={{ background: '#f0fdf4', color: '#15803d', fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 20 }}>{lessonChs} شرح</span>}
                      {examChs > 0  && <span style={{ background: '#fff7ed', color: '#c2410c', fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 20 }}>{examChs} اختبار</span>}
                    </div>
                  </div>

                  {/* Manage chapters button */}
                  <button onClick={() => router.push(`/subjects/${sub.id}/chapters`)}
                          style={{ background: '#1d4ed8', color: 'white', border: 'none', padding: '7px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                    ✏️ إدارة الفصول
                  </button>

                  {/* Export buttons */}
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button onClick={() => exportPDF(sub.id, 'unsolved')}
                            style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '7px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                      📄 تصدير أسئلة
                    </button>
                    <button onClick={() => exportPDF(sub.id, 'solved')}
                            style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', padding: '7px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                      ✅ تصدير محلول
                    </button>
                    <button onClick={() => setExpanded(isOpen ? null : sub.id)}
                            style={{ background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', padding: '7px 12px', borderRadius: 10, fontSize: 12, cursor: 'pointer' }}>
                      {isOpen ? '▲' : '▼'} الفصول
                    </button>
                  </div>
                </div>

                {/* Chapters list */}
                {isOpen && (
                  <div style={{ borderTop: `1px solid ${c.border}`, background: c.bg }}>
                    {sub.chapters.map((ch, ci) => (
                      <div key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: ci < sub.chapters.length - 1 ? `1px solid ${c.border}` : 'none' }}>
                        <span style={{ background: ch.chapter_type === 'exam' ? '#fff7ed' : '#eff6ff', color: ch.chapter_type === 'exam' ? '#c2410c' : '#1d4ed8', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, flexShrink: 0 }}>
                          {ch.chapter_type === 'exam' ? 'اختبار' : 'شرح'}
                        </span>
                        <span style={{ flex: 1, fontSize: 13, color: '#374151', fontWeight: 500 }}>{ch.name}</span>
                        <button onClick={() => window.open(`/api/export-pdf?subject_id=${sub.id}&chapter_id=${ch.id}&mode=unsolved`, '_blank')}
                                style={{ background: 'white', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                          📄 أسئلة
                        </button>
                        <button onClick={() => window.open(`/api/export-pdf?subject_id=${sub.id}&chapter_id=${ch.id}&mode=solved`, '_blank')}
                                style={{ background: 'white', color: '#15803d', border: '1px solid #bbf7d0', padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                          ✅ محلول
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
