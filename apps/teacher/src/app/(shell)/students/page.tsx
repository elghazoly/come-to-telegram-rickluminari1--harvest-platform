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
  subject_id: string
  subject_name: string
  subject_icon: string
  expires_at: string | null
  total_q: number
  answered: number
  correct: number
  pct: number
}

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [filterSub, setFilterSub] = useState('all')
  const [subjectNames, setSubjectNames] = useState<string[]>([])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single()

      // Get teacher's subject IDs
      let subjectIds: string[] = []
      let subjectsMap: Record<string, { name: string; icon: string }> = {}

      if ((prof as any)?.role === 'admin') {
        const { data } = await supabase.from('subjects').select('id, name, icon')
        subjectIds = data?.map((s: any) => s.id) || []
        data?.forEach((s: any) => { subjectsMap[s.id] = { name: s.name, icon: s.icon || '📚' } })
      } else {
        const { data: ts } = await supabase.from('teacher_subjects')
          .select('subject_id, subjects(id, name, icon)').eq('teacher_id', user.id)
        ts?.forEach((t: any) => {
          const s = t.subjects
          if (s) { subjectIds.push(s.id); subjectsMap[s.id] = { name: s.name, icon: s.icon || '📚' } }
        })
      }

      if (!subjectIds.length) { setLoading(false); return }

      // Load enrollments
      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('student_id, subject_id, expires_at')
        .in('subject_id', subjectIds)

      if (!enrollments?.length) { setLoading(false); return }

      // Get unique student IDs
      const studentIds = [...new Set(enrollments.map((e: any) => e.student_id))]

      // Load profiles for all students
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', studentIds)

      const profileMap: Record<string, { full_name: string; email: string }> = {}
      profiles?.forEach((p: any) => { profileMap[p.id] = p })

      // Load total questions per subject
      const totalQMap: Record<string, number> = {}
      for (const sid of subjectIds) {
        const { data: chs } = await supabase.from('chapters').select('id').eq('subject_id', sid)
        const chIds = chs?.map((c: any) => c.id) || []
        if (chIds.length) {
          const { count } = await supabase.from('questions').select('id', { count: 'exact', head: true }).in('chapter_id', chIds)
          totalQMap[sid] = count || 0
        }
      }

      // Load student_answers for all students
      const { data: answers } = await supabase
        .from('student_answers')
        .select('student_id, question_id, is_correct')
        .in('student_id', studentIds)

      // Build answered/correct per (student, subject) — need chapters mapping
      const { data: allChapters } = await supabase
        .from('chapters').select('id, subject_id').in('subject_id', subjectIds)
      const { data: allQuestions } = await supabase
        .from('questions').select('id, chapter_id')
        .in('chapter_id', (allChapters || []).map((c: any) => c.id))

      const qToSubject: Record<string, string> = {}
      const chToSubject: Record<string, string> = {}
      allChapters?.forEach((c: any) => { chToSubject[c.id] = c.subject_id })
      allQuestions?.forEach((q: any) => { qToSubject[q.id] = chToSubject[q.chapter_id] })

      // Count per (student_id, subject_id)
      const ansMap: Record<string, { answered: number; correct: number }> = {}
      answers?.forEach((a: any) => {
        const sid = qToSubject[a.question_id]
        if (!sid) return
        const key = `${a.student_id}_${sid}`
        if (!ansMap[key]) ansMap[key] = { answered: 0, correct: 0 }
        ansMap[key].answered++
        if (a.is_correct) ansMap[key].correct++
      })

      // Build student list
      const list: Student[] = enrollments.map((e: any) => {
        const p    = profileMap[e.student_id]
        const sub  = subjectsMap[e.subject_id]
        const key  = `${e.student_id}_${e.subject_id}`
        const ans  = ansMap[key] || { answered: 0, correct: 0 }
        const tot  = totalQMap[e.subject_id] || 0
        const pct  = tot ? Math.round(ans.answered / tot * 100) : 0
        return {
          id:           e.student_id,
          full_name:    p?.full_name || 'بدون اسم',
          email:        p?.email || '',
          subject_id:   e.subject_id,
          subject_name: sub?.name || '',
          subject_icon: sub?.icon || '📚',
          expires_at:   e.expires_at,
          total_q:      tot,
          answered:     ans.answered,
          correct:      ans.correct,
          pct,
        }
      })

      setSubjectNames([...new Set(list.map(s => s.subject_name))])
      setStudents(list)
      setLoading(false)
    }
    load()
  }, [])

  const filtered = students.filter(s => {
    const matchSearch = s.full_name.includes(search) || s.email.includes(search)
    const matchFilter = filterSub === 'all' || s.subject_name === filterSub
    return matchSearch && matchFilter
  })

  return (
    <div style={{ padding: 24, background: '#f0f4ff', minHeight: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1e293b' }}>👥 طلابي</h1>
        <p style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>{students.length} طالب مسجّل في موادك</p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
               placeholder="🔍 بحث..."
               style={{ flex: 1, minWidth: 180, border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 14px', fontSize: 13, outline: 'none', background: 'white' }} />
        <select value={filterSub} onChange={e => setFilterSub(e.target.value)}
                style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 14px', fontSize: 13, outline: 'none', background: 'white' }}>
          <option value="all">كل المواد</option>
          {subjectNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <div style={{ background: '#eff6ff', color: '#1d4ed8', padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700 }}>
          {filtered.length} طالب
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>⏳ جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', background: 'white', borderRadius: 16 }}>لا يوجد طلاب مسجّلون</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {/* Header row */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1.5fr 180px 90px', gap: 12, padding: '10px 16px', background: '#1d4ed8', borderRadius: 12, fontSize: 12, fontWeight: 700, color: 'white' }}>
            <span>الطالب</span>
            <span>البريد الإلكتروني</span>
            <span>المادة</span>
            <span>درجة الوصول</span>
            <span>الاشتراك</span>
          </div>

          {filtered.map((s, i) => {
            const expired  = s.expires_at && new Date(s.expires_at) < new Date()
            const pctColor = s.pct >= 70 ? '#15803d' : s.pct >= 40 ? '#b45309' : s.pct > 0 ? '#1d4ed8' : '#94a3b8'
            const level    = s.pct >= 90 ? 'ممتاز 🌟' : s.pct >= 70 ? 'جيد جداً ⭐' : s.pct >= 50 ? 'جيد' : s.pct > 0 ? 'مبتدئ' : 'لم يبدأ'
            return (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1.5fr 180px 90px', gap: 12, padding: '14px 16px', background: 'white', borderRadius: 12, alignItems: 'center', border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
                {/* Name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#1d4ed8', fontSize: 15, flexShrink: 0 }}>
                    {s.full_name[0] || '?'}
                  </div>
                  <span style={{ fontWeight: 600, color: '#1e293b', fontSize: 14 }}>{s.full_name}</span>
                </div>
                {/* Email */}
                <span style={{ fontSize: 12, color: '#64748b', direction: 'ltr', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.email}</span>
                {/* Subject */}
                <span style={{ fontSize: 13 }}>{s.subject_icon} {s.subject_name}</span>
                {/* Progress */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                    <span style={{ color: '#94a3b8' }}>{s.answered}/{s.total_q} سؤال • {s.correct} صح</span>
                    <span style={{ fontWeight: 700, color: pctColor }}>{s.pct}%</span>
                  </div>
                  <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden', marginBottom: 3 }}>
                    <div style={{ width: `${s.pct}%`, height: '100%', background: pctColor, borderRadius: 3, transition: 'width .5s' }} />
                  </div>
                  <div style={{ fontSize: 10, color: pctColor, fontWeight: 600 }}>{level}</div>
                </div>
                {/* Status */}
                <span style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20, textAlign: 'center',
                  background: expired ? '#fef2f2' : '#f0fdf4',
                  color: expired ? '#dc2626' : '#15803d' }}>
                  {expired ? 'منتهي' : 'نشط ✓'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
