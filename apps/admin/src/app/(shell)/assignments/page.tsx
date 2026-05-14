'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import type { Subject, Profile } from '@harvest/db'

interface Assignment { teacher_id: string; subject_id: string }

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const S: Record<string, React.CSSProperties> = {
  page:      { maxWidth: 960, margin: '0 auto', padding: '28px 24px' },
  topBar:    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  h1:        { fontSize: 20, fontWeight: 800, color: '#1e293b', margin: 0 },
  tabs:      { display: 'flex', gap: 8, background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 4 },
  tabActive: { background: '#eff6ff', color: '#1d4ed8', border: 'none', padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  tabIdle:   { background: 'none', color: '#64748b', border: 'none', padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  card:      { background: 'white', borderRadius: 18, border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,.05)' },
  subHdr:    { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', background: '#eff6ff', borderBottom: '1px solid #bfdbfe' },
  tchHdr:    { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', background: '#f5f3ff', borderBottom: '1px solid #ddd6fe' },
  grid:      { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: 10, padding: 14 },
  btnOn:     { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, border: '2px solid #4ade80', background: '#f0fdf4', cursor: 'pointer', textAlign: 'right' as const, transition: 'all .15s' },
  btnOff:    { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, border: '2px solid #e2e8f0', background: 'white', cursor: 'pointer', textAlign: 'right' as const, transition: 'all .15s' },
  avatar:    { width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 },
  toast:     { position: 'fixed' as const, bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#16a34a', color: 'white', padding: '10px 24px', borderRadius: 12, fontSize: 13, fontWeight: 700, zIndex: 100, boxShadow: '0 4px 20px rgba(0,0,0,.2)' },
  empty:     { textAlign: 'center' as const, padding: '60px 0', color: '#94a3b8' },
}

export default function AssignmentsPage() {
  const router = useRouter()
  const [subjects,    setSubjects]    = useState<Subject[]>([])
  const [teachers,    setTeachers]    = useState<Profile[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [toast,       setToast]       = useState('')
  const [viewMode,    setViewMode]    = useState<'by-subject'|'by-teacher'>('by-subject')

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  async function load() {
    const [{ data: subs }, { data: tchs }, { data: asgn }] = await Promise.all([
      supabase.from('subjects').select('*').order('order_num'),
      supabase.from('profiles').select('*').eq('role', 'teacher').order('full_name'),
      supabase.from('teacher_subjects').select('*'),
    ])
    setSubjects(subs || [])
    setTeachers(tchs || [])
    setAssignments(asgn || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function isAssigned(tId: string, sId: string) {
    return assignments.some(a => a.teacher_id === tId && a.subject_id === sId)
  }

  async function toggle(tId: string, sId: string) {
    setSaving(true)
    if (isAssigned(tId, sId)) {
      await supabase.from('teacher_subjects').delete().eq('teacher_id', tId).eq('subject_id', sId)
      setAssignments(a => a.filter(x => !(x.teacher_id === tId && x.subject_id === sId)))
      showToast('تم إلغاء التعيين')
    } else {
      await supabase.from('teacher_subjects').insert({ teacher_id: tId, subject_id: sId })
      setAssignments(a => [...a, { teacher_id: tId, subject_id: sId }])
      showToast('✅ تم التعيين')
    }
    setSaving(false)
  }

  return (
    <div style={S.page}>
      {toast && <div style={S.toast}>{toast}</div>}

      <div style={S.topBar}>
        <h1 style={S.h1}>🔗 التعيينات</h1>
        <div style={S.tabs}>
          <button style={viewMode === 'by-subject' ? S.tabActive : S.tabIdle}
                  onClick={() => setViewMode('by-subject')}>حسب المادة</button>
          <button style={viewMode === 'by-teacher' ? S.tabActive : S.tabIdle}
                  onClick={() => setViewMode('by-teacher')}>حسب المعلم</button>
        </div>
      </div>

      {loading ? (
        <div style={S.empty}>⏳ جاري التحميل...</div>
      ) : teachers.length === 0 ? (
        <div style={S.empty}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>👨‍🏫</div>
          <p style={{ marginBottom: 8 }}>لا يوجد معلمون بعد</p>
          <button onClick={() => router.push('/users')}
                  style={{ background: 'none', border: 'none', color: '#1d4ed8', cursor: 'pointer', fontSize: 13 }}>
            إضافة معلمين من صفحة المستخدمين ←
          </button>
        </div>
      ) : viewMode === 'by-subject' ? (
        subjects.map(s => (
          <div key={s.id} style={S.card}>
            <div style={S.subHdr}>
              <span style={{ fontSize: 24 }}>{s.icon || '📚'}</span>
              <span style={{ fontWeight: 700, color: '#1e3a8a', fontSize: 15 }}>{s.name}</span>
              <span style={{ marginRight: 'auto', fontSize: 12, color: '#3b82f6' }}>
                {assignments.filter(a => a.subject_id === s.id).length} معلم مُعيَّن
              </span>
            </div>
            <div style={S.grid}>
              {teachers.map(t => {
                const on = isAssigned(t.id, s.id)
                return (
                  <button key={t.id} onClick={() => toggle(t.id, s.id)} disabled={saving}
                          style={{ ...(on ? S.btnOn : S.btnOff), opacity: saving ? .6 : 1 }}>
                    <div style={{ ...S.avatar, background: on ? '#16a34a' : '#f1f5f9', color: on ? 'white' : '#64748b' }}>
                      {on ? '✓' : (t.full_name?.charAt(0) || '؟')}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: on ? '#15803d' : '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.full_name}</div>
                      <div style={{ fontSize: 11, color: on ? '#16a34a' : '#94a3b8' }}>{on ? '✅ مُعيَّن' : 'اضغط للتعيين'}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))
      ) : (
        teachers.map(t => (
          <div key={t.id} style={S.card}>
            <div style={S.tchHdr}>
              <div style={{ ...S.avatar, background: '#7c3aed', color: 'white', fontSize: 15 }}>
                {t.full_name?.charAt(0) || '؟'}
              </div>
              <div>
                <div style={{ fontWeight: 700, color: '#4c1d95', fontSize: 15 }}>{t.full_name}</div>
                {t.phone && <div style={{ fontSize: 11, color: '#7c3aed' }}>{t.phone}</div>}
              </div>
              <span style={{ marginRight: 'auto', fontSize: 12, color: '#7c3aed' }}>
                {assignments.filter(a => a.teacher_id === t.id).length} مادة مُعيَّنة
              </span>
            </div>
            <div style={S.grid}>
              {subjects.map(s => {
                const on = isAssigned(t.id, s.id)
                return (
                  <button key={s.id} onClick={() => toggle(t.id, s.id)} disabled={saving}
                          style={{ ...(on ? S.btnOn : S.btnOff), opacity: saving ? .6 : 1 }}>
                    <span style={{ fontSize: 22, flexShrink: 0 }}>{s.icon || '📚'}</span>
                    <div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: on ? '#15803d' : '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: on ? '#16a34a' : '#94a3b8' }}>{on ? '✅ مُعيَّنة' : 'اضغط للتعيين'}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
