'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import type { Subject, Profile } from '@harvest/db'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function SubjectsPage() {
  const router = useRouter()

  const [subjects,          setSubjects]          = useState<Subject[]>([])
  const [teachers,          setTeachers]          = useState<Profile[]>([])
  const [assignmentsMap,    setAssignmentsMap]    = useState<Record<string, string[]>>({})
  const [loading,           setLoading]           = useState(true)
  const [showForm,          setShowForm]          = useState(false)
  const [editItem,          setEditItem]          = useState<Subject | null>(null)
  const [form,              setForm]              = useState({ name: '', icon: '', description: '' })
  const [selectedTeachers,  setSelectedTeachers]  = useState<string[]>([])
  const [saving,            setSaving]            = useState(false)
  const [error,             setError]             = useState('')

  async function load() {
    const [{ data: subs }, { data: tchs }, { data: ts }] = await Promise.all([
      supabase.from('subjects').select('*').order('order_num'),
      supabase.from('profiles').select('id, full_name, phone').eq('role', 'teacher').order('full_name'),
      supabase.from('teacher_subjects').select('teacher_id, subject_id'),
    ])
    setSubjects(subs || [])
    setTeachers(tchs || [])

    // Build map: subject_id → [teacher_id, ...]
    const map: Record<string, string[]> = {}
    for (const row of ts || []) {
      if (!map[row.subject_id]) map[row.subject_id] = []
      map[row.subject_id].push(row.teacher_id)
    }
    setAssignmentsMap(map)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openAdd() {
    setEditItem(null)
    setForm({ name: '', icon: '', description: '' })
    setSelectedTeachers([])
    setError('')
    setShowForm(true)
  }

  function openEdit(s: Subject) {
    setEditItem(s)
    setForm({ name: s.name, icon: s.icon || '', description: s.description || '' })
    setSelectedTeachers(assignmentsMap[s.id] || [])
    setError('')
    setShowForm(true)
  }

  function toggleTeacher(id: string) {
    setSelectedTeachers(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    )
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('اسم المادة مطلوب'); return }
    setSaving(true); setError('')

    let subjectId = editItem?.id || ''

    if (editItem) {
      const { error: err } = await supabase
        .from('subjects')
        .update({ name: form.name, icon: form.icon, description: form.description, updated_at: new Date().toISOString() })
        .eq('id', editItem.id)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const maxOrder = subjects.length ? Math.max(...subjects.map(s => s.order_num)) + 1 : 1
      const { data, error: err } = await supabase
        .from('subjects')
        .insert({ name: form.name, icon: form.icon, description: form.description, order_num: maxOrder })
        .select('id').single()
      if (err || !data) { setError(err?.message || 'فشل الإنشاء'); setSaving(false); return }
      subjectId = data.id
    }

    // Sync teacher assignments
    const existing = assignmentsMap[subjectId] || []
    const toAdd    = selectedTeachers.filter(t => !existing.includes(t))
    const toRemove = existing.filter(t => !selectedTeachers.includes(t))

    await Promise.all([
      toAdd.length
        ? supabase.from('teacher_subjects').insert(toAdd.map(tid => ({ teacher_id: tid, subject_id: subjectId })))
        : Promise.resolve(),
      ...toRemove.map(tid =>
        supabase.from('teacher_subjects').delete().eq('teacher_id', tid).eq('subject_id', subjectId)
      ),
    ])

    await load()
    setSaving(false)
    setShowForm(false)
  }

  async function handleDelete(s: Subject) {
    if (!confirm(`حذف مادة "${s.name}" وكل فصولها وأسئلتها؟`)) return
    await supabase.from('subjects').delete().eq('id', s.id)
    await load()
  }

  async function handlePublish(s: Subject) {
    const published = s.published_at ? null : new Date().toISOString()
    await supabase.from('subjects').update({ published_at: published }).eq('id', s.id)
    await load()
  }

  return (
    <div>
      <main className="max-w-5xl mx-auto px-6 py-8">

        {/* Top bar */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-bold text-xl text-slate-800">📚 المواد الدراسية</h1>
          <button onClick={openAdd}
                  className="bg-blue-700 hover:bg-blue-600 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors">
            ➕ مادة جديدة
          </button>
        </div>

        {loading ? (
          <div className="text-center py-20 text-slate-400">⏳ جاري التحميل...</div>
        ) : subjects.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">📚</div>
            <p className="text-slate-500 text-lg mb-4">لا توجد مواد بعد</p>
            <button onClick={openAdd}
                    className="bg-blue-700 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-600 transition-colors">
              ➕ أضف أول مادة
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {subjects.map(s => {
              const subjectTeachers = (assignmentsMap[s.id] || [])
                .map(tid => teachers.find(t => t.id === tid))
                .filter(Boolean) as Profile[]
              return (
                <div key={s.id}
                     className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 hover:shadow-md transition-shadow">
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div className="w-14 h-14 rounded-xl flex items-center justify-center text-3xl bg-blue-50 flex-shrink-0">
                      {s.icon || '📚'}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h2 className="font-bold text-slate-800 text-lg">{s.name}</h2>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          s.published_at
                            ? 'bg-green-100 text-green-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}>
                          {s.published_at ? '✅ منشور' : '⏸ مسودة'}
                        </span>
                      </div>
                      {s.description && (
                        <p className="text-slate-500 text-sm mb-2">{s.description}</p>
                      )}

                      {/* Teachers assigned */}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {subjectTeachers.length === 0 ? (
                          <span className="text-xs text-slate-400 italic">لا يوجد معلمون مُعيَّنون</span>
                        ) : (
                          subjectTeachers.map(t => (
                            <span key={t.id}
                                  className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs font-semibold px-2 py-1 rounded-full border border-blue-100">
                              👨‍🏫 {t.full_name}
                            </span>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => router.push(`/subjects/${s.id}/chapters`)}
                              className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold px-3 py-2 rounded-lg text-sm transition-colors">
                        📂 الفصول
                      </button>
                      <button onClick={() => handlePublish(s)}
                              className={`font-semibold px-3 py-2 rounded-lg text-sm transition-colors ${
                                s.published_at
                                  ? 'bg-orange-50 hover:bg-orange-100 text-orange-700'
                                  : 'bg-green-50 hover:bg-green-100 text-green-700'
                              }`}>
                        {s.published_at ? '⏸ إلغاء النشر' : '✅ نشر'}
                      </button>
                      <button onClick={() => openEdit(s)}
                              className="bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold px-3 py-2 rounded-lg text-sm transition-colors">
                        ✏️ تعديل
                      </button>
                      <button onClick={() => handleDelete(s)}
                              className="bg-red-50 hover:bg-red-100 text-red-600 font-semibold px-3 py-2 rounded-lg text-sm transition-colors">
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h2 className="font-bold text-lg text-slate-800">
                {editItem ? '✏️ تعديل المادة' : '➕ مادة جديدة'}
              </h2>
              <button onClick={() => setShowForm(false)}
                      className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
            </div>

            <div className="p-6 space-y-5">
              {/* Name */}
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">
                  اسم المادة <span className="text-red-500">*</span>
                </label>
                <input value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                       className="w-full border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
                       placeholder="مثال: الرياضيات"/>
              </div>

              {/* Icon */}
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">الأيقونة (emoji)</label>
                <input value={form.icon} onChange={e => setForm({...form, icon: e.target.value})}
                       className="w-full border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
                       placeholder="📐"/>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">الوصف</label>
                <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                          className="w-full border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500 resize-none"
                          rows={2} placeholder="وصف مختصر للمادة"/>
              </div>

              {/* Teachers */}
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-2">
                  المعلمون المُعيَّنون على هذه المادة
                </label>
                {teachers.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">
                    لا يوجد معلمون — أضف معلمين أولاً من صفحة المستخدمين
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border border-slate-100 rounded-xl p-3">
                    {teachers.map(t => {
                      const selected = selectedTeachers.includes(t.id)
                      return (
                        <button key={t.id} type="button"
                                onClick={() => toggleTeacher(t.id)}
                                className={`flex items-center gap-2 p-2 rounded-lg border text-right text-sm transition-all ${
                                  selected
                                    ? 'border-blue-400 bg-blue-50 text-blue-800'
                                    : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200'
                                }`}>
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                            selected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {selected ? '✓' : (t.full_name?.charAt(0) || '؟')}
                          </div>
                          <span className="truncate font-medium">{t.full_name}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
                {selectedTeachers.length > 0 && (
                  <p className="text-xs text-blue-600 mt-1 font-medium">
                    {selectedTeachers.length} معلم محدد
                  </p>
                )}
              </div>

              {error && <p className="text-red-600 text-sm font-medium">{error}</p>}
            </div>

            <div className="flex gap-3 p-6 border-t border-slate-100 sticky bottom-0 bg-white">
              <button onClick={handleSave} disabled={saving}
                      className="flex-1 py-3 rounded-xl text-white font-bold text-sm disabled:opacity-60 transition-opacity"
                      style={{ background: 'linear-gradient(90deg, #0a2d6e, #1a4fa8)' }}>
                {saving ? '⏳ جاري الحفظ...' : '💾 حفظ'}
              </button>
              <button onClick={() => setShowForm(false)}
                      className="px-6 py-3 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
