'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Student {
  id: string
  full_name: string
  email: string
  subject_name: string
  subject_icon: string
  expires_at: string | null
  enrolled_at: string
  progress_pct: number
}

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [filter,   setFilter]   = useState('all')
  const [subjects, setSubjects] = useState<{ id: string; name: string; icon: string }[]>([])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single()

      let subjectIds: string[] = []
      if (prof?.role === 'admin') {
        const { data } = await supabase.from('subjects').select('id, name, icon')
        setSubjects(data || [])
        subjectIds = (data || []).map((s: any) => s.id)
      } else {
        const { data: ts } = await supabase.from('teacher_subjects').select('subject_id, subjects(id, name, icon)').eq('teacher_id', user.id)
        const subs = ts?.map((t: any) => t.subjects).filter(Boolean) || []
        setSubjects(subs)
        subjectIds = subs.map((s: any) => s.id)
      }

      if (!subjectIds.length) { setLoading(false); return }

      // Load enrollments with student profiles
      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('student_id, subject_id, expires_at, created_at, subjects(name, icon), profiles(id, full_name, email)')
        .in('subject_id', subjectIds)

      // Load progress for each student
      const studentList: Student[] = []
      for (const e of enrollments || []) {
        const prof2 = (e as any).profiles
        const sub   = (e as any).subjects
        if (!prof2) continue

        // Get progress
        const { data: prog } = await supabase
          .from('student_progress')
          .select('total_q, correct_q')
          .eq('student_id', prof2.id)

        const totalQ   = prog?.reduce((t: number, p: any) => t + (p.total_q || 0), 0) || 0
        const correctQ = prog?.reduce((t: number, p: any) => t + (p.correct_q || 0), 0) || 0
        const pct      = totalQ ? Math.round(correctQ / totalQ * 100) : 0

        studentList.push({
          id:           prof2.id,
          full_name:    prof2.full_name || 'بدون اسم',
          email:        prof2.email || '',
          subject_name: sub?.name || '',
          subject_icon: sub?.icon || '📚',
          expires_at:   (e as any).expires_at,
          enrolled_at:  (e as any).created_at,
          progress_pct: pct,
        })
      }

      setStudents(studentList)
      setLoading(false)
    }
    load()
  }, [])

  const filtered = students.filter(s => {
    const matchSearch = s.full_name.includes(search) || s.email.includes(search)
    const matchFilter = filter === 'all' || s.subject_name === filter
    return matchSearch && matchFilter
  })

  const subjectNames = [...new Set(students.map(s => s.subject_name))]

  return (
    <div style={{ padding: 24, background: '#f0f4ff', minHeight: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1e293b' }}>👥 طلابي</h1>
        <p style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
          {students.length} طالب مسجّل في موادك
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
               placeholder="🔍 بحث باسم الطالب أو البريد..."
               style={{ flex: 1, minWidth: 200, border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 14px', fontSize: 13, outline: 'none' }} />
        <select value={filter} onChange={e => setFilter(e.target.value)}
                style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 14px', fontSize: 13, outline: 'none', background: 'white' }}>
          <option value="all">كل المواد</option>
          {subjectNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>⏳ جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>لا يوجد طلاب</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 120px 100px', gap: 12, padding: '10px 16px', background: '#e8f0fe', borderRadius: 10, fontSize: 12, fontWeight: 700, color: '#1d4ed8' }}>
            <span>الطالب</span>
            <span>البريد الإلكتروني</span>
            <span>المادة</span>
            <span>التقدم</span>
            <span>الاشتراك</span>
          </div>
          {filtered.map(s => {
            const expired = s.expires_at && new Date(s.expires_at) < new Date()
            const pctColor = s.progress_pct >= 70 ? '#15803d' : s.progress_pct >= 40 ? '#b45309' : '#1d4ed8'
            return (
              <div key={s.id + s.subject_name}
                   style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 120px 100px', gap: 12, padding: '14px 16px', background: 'white', borderRadius: 12, alignItems: 'center', border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
                {/* Name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#1d4ed8', fontSize: 14 }}>
                    {s.full_name[0]}
                  </div>
                  <span style={{ fontWeight: 600, color: '#1e293b', fontSize: 14 }}>{s.full_name}</span>
                </div>
                {/* Email */}
                <span style={{ fontSize: 12, color: '#64748b', direction: 'ltr' }}>{s.email}</span>
                {/* Subject */}
                <span style={{ fontSize: 13 }}>{s.subject_icon} {s.subject_name}</span>
                {/* Progress */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                    <span style={{ color: '#94a3b8' }}>التقدم</span>
                    <span style={{ fontWeight: 700, color: pctColor }}>{s.progress_pct}%</span>
                  </div>
                  <div style={{ height: 5, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${s.progress_pct}%`, height: '100%', background: pctColor, borderRadius: 3 }} />
                  </div>
                </div>
                {/* Status */}
                <span style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20, textAlign: 'center',
                  background: expired ? '#fef2f2' : '#f0fdf4',
                  color: expired ? '#dc2626' : '#15803d' }}>
                  {expired ? '❌ منتهي' : '✅ نشط'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
