'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import type { Subject, Profile } from '@harvest/db'

interface Assignment {
  teacher_id: string
  subject_id: string
}

export default function AssignmentsPage() {
  const router = useRouter()
  const [subjects,     setSubjects]     = useState<Subject[]>([])
  const [teachers,     setTeachers]     = useState<Profile[]>([])
  const [assignments,  setAssignments]  = useState<Assignment[]>([])
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [toast,        setToast]        = useState('')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  async function load() {
    const [{ data: subs }, { data: teachers }, { data: assigns }] = await Promise.all([
      supabase.from('subjects').select('*').order('order_num'),
      supabase.from('profiles').select('*').eq('role', 'teacher').order('full_name'),
      supabase.from('teacher_subjects').select('*'),
    ])
    setSubjects(subs || [])
    setTeachers(teachers || [])
    setAssignments(assigns || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function isAssigned(teacherId: string, subjectId: string) {
    return assignments.some(a => a.teacher_id === teacherId && a.subject_id === subjectId)
  }

  async function toggleAssignment(teacherId: string, subjectId: string) {
    setSaving(true)
    if (isAssigned(teacherId, subjectId)) {
      await supabase.from('teacher_subjects')
        .delete()
        .eq('teacher_id', teacherId)
        .eq('subject_id', subjectId)
      setAssignments(a => a.filter(x => !(x.teacher_id === teacherId && x.subject_id === subjectId)))
      showToast('تم إلغاء التعيين')
    } else {
      await supabase.from('teacher_subjects')
        .insert({ teacher_id: teacherId, subject_id: subjectId })
      setAssignments(a => [...a, { teacher_id: teacherId, subject_id: subjectId }])
      showToast('✅ تم التعيين بنجاح')
    }
    setSaving(false)
  }

  // Teachers per subject
  function getSubjectTeachers(subjectId: string) {
    return teachers.filter(t => isAssigned(t.id, subjectId))
  }

  // Subjects per teacher
  function getTeacherSubjects(teacherId: string) {
    return subjects.filter(s => isAssigned(teacherId, s.id))
  }

  const [viewMode, setViewMode] = useState<'by-subject'|'by-teacher'>('by-subject')

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-6 py-3 rounded-xl shadow-2xl text-sm font-semibold">
          {toast}
        </div>
      )}

      {/* Header */}

      <main className="max-w-5xl mx-auto px-6 py-8">
        {loading ? (
          <div className="text-center py-20 text-slate-400">⏳ جاري التحميل...</div>
        ) : teachers.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">👨‍🏫</div>
            <p className="text-slate-500 mb-2">لا يوجد معلمون بعد</p>
            <button onClick={() => router.push('/users')}
                    className="text-blue-600 hover:underline text-sm">
              إضافة معلمين من صفحة المستخدمين →
            </button>
          </div>
        ) : viewMode === 'by-subject' ? (

          /* ── View by Subject ── */
          <div className="space-y-4">
            {subjects.map(s => (
              <div key={s.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                {/* Subject header */}
                <div className="flex items-center gap-3 px-5 py-4 bg-blue-50 border-b border-blue-100">
                  <span className="text-2xl">{s.icon || '📚'}</span>
                  <h2 className="font-bold text-blue-900">{s.name}</h2>
                  <span className="text-blue-500 text-xs mr-auto">
                    {getSubjectTeachers(s.id).length} معلم مُعيَّن
                  </span>
                </div>
                {/* Teachers grid */}
                <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                  {teachers.map(t => {
                    const assigned = isAssigned(t.id, s.id)
                    return (
                      <button key={t.id}
                              onClick={() => toggleAssignment(t.id, s.id)}
                              disabled={saving}
                              className={`flex items-center gap-3 p-3 rounded-xl border-2 text-right transition-all disabled:opacity-50 ${
                                assigned
                                  ? 'border-green-400 bg-green-50 text-green-800'
                                  : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50'
                              }`}>
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                          assigned ? 'bg-green-500 text-white' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {t.full_name?.charAt(0) || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{t.full_name}</p>
                          <p className="text-xs opacity-60">{assigned ? '✅ مُعيَّن' : 'اضغط للتعيين'}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

        ) : (

          /* ── View by Teacher ── */
          <div className="space-y-4">
            {teachers.map(t => (
              <div key={t.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                {/* Teacher header */}
                <div className="flex items-center gap-3 px-5 py-4 bg-purple-50 border-b border-purple-100">
                  <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center font-bold text-white">
                    {t.full_name?.charAt(0) || '?'}
                  </div>
                  <div>
                    <h2 className="font-bold text-purple-900">{t.full_name}</h2>
                    {t.phone && <p className="text-purple-500 text-xs">{t.phone}</p>}
                  </div>
                  <span className="text-purple-500 text-xs mr-auto">
                    {getTeacherSubjects(t.id).length} مادة مُعيَّنة
                  </span>
                </div>
                {/* Subjects grid */}
                <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                  {subjects.map(s => {
                    const assigned = isAssigned(t.id, s.id)
                    return (
                      <button key={s.id}
                              onClick={() => toggleAssignment(t.id, s.id)}
                              disabled={saving}
                              className={`flex items-center gap-3 p-3 rounded-xl border-2 text-right transition-all disabled:opacity-50 ${
                                assigned
                                  ? 'border-green-400 bg-green-50 text-green-800'
                                  : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50'
                              }`}>
                        <span className="text-2xl flex-shrink-0">{s.icon || '📚'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{s.name}</p>
                          <p className="text-xs opacity-60">{assigned ? '✅ مُعيَّنة' : 'اضغط للتعيين'}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
