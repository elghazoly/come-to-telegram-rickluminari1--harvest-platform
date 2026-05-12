'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import type { Subject } from '@harvest/db'

export default function SubjectsPage() {
  const router = useRouter()
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<Subject | null>(null)
  const [form,     setForm]     = useState({ name: '', icon: '', description: '' })
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  async function loadSubjects() {
    const { data } = await supabase
      .from('subjects')
      .select('*')
      .order('order_num')
    setSubjects(data || [])
    setLoading(false)
  }

  useEffect(() => { loadSubjects() }, [])

  function openAdd() {
    setEditItem(null)
    setForm({ name: '', icon: '', description: '' })
    setError('')
    setShowForm(true)
  }

  function openEdit(s: Subject) {
    setEditItem(s)
    setForm({ name: s.name, icon: s.icon || '', description: s.description || '' })
    setError('')
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('اسم المادة مطلوب'); return }
    setSaving(true)
    setError('')

    if (editItem) {
      const { error: err } = await supabase
        .from('subjects')
        .update({ name: form.name, icon: form.icon, description: form.description, updated_at: new Date().toISOString() })
        .eq('id', editItem.id)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const maxOrder = subjects.length ? Math.max(...subjects.map(s => s.order_num)) + 1 : 1
      const { error: err } = await supabase
        .from('subjects')
        .insert({ name: form.name, icon: form.icon, description: form.description, order_num: maxOrder })
      if (err) { setError(err.message); setSaving(false); return }
    }

    await loadSubjects()
    setSaving(false)
    setShowForm(false)
  }

  async function handleDelete(s: Subject) {
    if (!confirm(`حذف مادة "${s.name}" وكل فصولها وأسئلتها؟`)) return
    await supabase.from('subjects').delete().eq('id', s.id)
    await loadSubjects()
  }

  async function handlePublish(s: Subject) {
    const published = s.published_at ? null : new Date().toISOString()
    await supabase.from('subjects').update({ published_at: published }).eq('id', s.id)
    await loadSubjects()
  }

  return (
    <div>
      {/* Header */}

      <main className="max-w-5xl mx-auto px-6 py-8">
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
            {subjects.map(s => (
              <div key={s.id}
                   className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex items-center gap-4 hover:shadow-md transition-shadow">
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
                    <p className="text-slate-500 text-sm truncate">{s.description}</p>
                  )}
                  <p className="text-slate-400 text-xs mt-1">
                    الترتيب: {s.order_num}
                  </p>
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
            ))}
          </div>
        )}
      </main>

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 className="font-bold text-lg text-slate-800">
                {editItem ? '✏️ تعديل المادة' : '➕ مادة جديدة'}
              </h2>
              <button onClick={() => setShowForm(false)}
                      className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">
                  اسم المادة <span className="text-red-500">*</span>
                </label>
                <input value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                       className="w-full border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
                       placeholder="مثال: الرياضيات"/>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">الأيقونة (emoji)</label>
                <input value={form.icon} onChange={e => setForm({...form, icon: e.target.value})}
                       className="w-full border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
                       placeholder="📐"/>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">الوصف</label>
                <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                          className="w-full border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500 resize-none"
                          rows={3} placeholder="وصف مختصر للمادة"/>
              </div>
              {error && <p className="text-red-600 text-sm font-medium">{error}</p>}
            </div>
            <div className="flex gap-3 p-6 border-t border-slate-100">
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
