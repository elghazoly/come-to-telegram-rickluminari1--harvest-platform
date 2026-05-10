'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter, useParams } from 'next/navigation'
import type { Chapter, Subject } from '@harvest/db'

export default function ChaptersPage() {
  const router   = useRouter()
  const params   = useParams()
  const subjectId = params.id as string

  const [subject,  setSubject]  = useState<Subject | null>(null)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<Chapter | null>(null)
  const [form,     setForm]     = useState({ name: '', icon: '' })
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  async function load() {
    const [{ data: sub }, { data: chs }] = await Promise.all([
      supabase.from('subjects').select('*').eq('id', subjectId).single(),
      supabase.from('chapters').select('*').eq('subject_id', subjectId).order('order_num'),
    ])
    setSubject(sub)
    setChapters(chs || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [subjectId])

  function openAdd() {
    setEditItem(null)
    setForm({ name: '', icon: '' })
    setError('')
    setShowForm(true)
  }

  function openEdit(c: Chapter) {
    setEditItem(c)
    setForm({ name: c.name, icon: c.icon || '' })
    setError('')
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('اسم الفصل مطلوب'); return }
    setSaving(true)
    setError('')

    if (editItem) {
      const { error: err } = await supabase
        .from('chapters')
        .update({ name: form.name, icon: form.icon, updated_at: new Date().toISOString() })
        .eq('id', editItem.id)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const maxOrder = chapters.length ? Math.max(...chapters.map(c => c.order_num)) + 1 : 1
      const { error: err } = await supabase
        .from('chapters')
        .insert({ name: form.name, icon: form.icon, subject_id: subjectId, order_num: maxOrder })
      if (err) { setError(err.message); setSaving(false); return }
    }

    await load()
    setSaving(false)
    setShowForm(false)
  }

  async function handleDelete(c: Chapter) {
    if (!confirm(`حذف فصل "${c.name}" وكل أسئلته؟`)) return
    await supabase.from('chapters').delete().eq('id', c.id)
    await load()
  }

  async function handlePublish(c: Chapter) {
    const published = c.published_at ? null : new Date().toISOString()
    await supabase.from('chapters').update({ published_at: published }).eq('id', c.id)
    await load()
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header style={{ background: 'linear-gradient(90deg, #0a2d6e, #1a4fa8)' }}
              className="text-white px-6 py-4 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/subjects')}
                  className="text-blue-200 hover:text-white text-sm">← المواد</button>
          <span className="text-blue-300">|</span>
          <h1 className="font-bold text-lg">
            {subject?.icon} {subject?.name} — الفصول
          </h1>
        </div>
        <button onClick={openAdd}
                className="bg-yellow-500 hover:bg-yellow-400 text-white font-bold px-4 py-2 rounded-lg text-sm">
          ➕ فصل جديد
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {loading ? (
          <div className="text-center py-20 text-slate-400">⏳ جاري التحميل...</div>
        ) : chapters.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">📂</div>
            <p className="text-slate-500 mb-4">لا توجد فصول بعد</p>
            <button onClick={openAdd}
                    className="bg-blue-700 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-600">
              ➕ أضف أول فصل
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {chapters.map(c => (
              <div key={c.id}
                   className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex items-center gap-4 hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl bg-blue-50 flex-shrink-0">
                  {c.icon || '📂'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="font-bold text-slate-800">{c.name}</h2>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      c.published_at ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {c.published_at ? '✅ منشور' : '⏸ مسودة'}
                    </span>
                  </div>
                  <p className="text-slate-400 text-xs">الترتيب: {c.order_num}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => router.push(`/subjects/${subjectId}/chapters/${c.id}/questions`)}
                          className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold px-3 py-2 rounded-lg text-sm">
                    ❓ الأسئلة
                  </button>
                  <button onClick={() => handlePublish(c)}
                          className={`font-semibold px-3 py-2 rounded-lg text-sm ${
                            c.published_at
                              ? 'bg-orange-50 hover:bg-orange-100 text-orange-700'
                              : 'bg-green-50 hover:bg-green-100 text-green-700'
                          }`}>
                    {c.published_at ? '⏸' : '✅'}
                  </button>
                  <button onClick={() => openEdit(c)}
                          className="bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold px-3 py-2 rounded-lg text-sm">
                    ✏️
                  </button>
                  <button onClick={() => handleDelete(c)}
                          className="bg-red-50 hover:bg-red-100 text-red-600 font-semibold px-3 py-2 rounded-lg text-sm">
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 className="font-bold text-lg text-slate-800">
                {editItem ? '✏️ تعديل الفصل' : '➕ فصل جديد'}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 text-2xl">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">
                  اسم الفصل <span className="text-red-500">*</span>
                </label>
                <input value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                       className="w-full border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
                       placeholder="مثال: الأنماط والمنطق"/>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">الأيقونة (emoji)</label>
                <input value={form.icon} onChange={e => setForm({...form, icon: e.target.value})}
                       className="w-full border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
                       placeholder="📐"/>
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
            </div>
            <div className="flex gap-3 p-6 border-t border-slate-100">
              <button onClick={handleSave} disabled={saving}
                      className="flex-1 py-3 rounded-xl text-white font-bold text-sm disabled:opacity-60"
                      style={{ background: 'linear-gradient(90deg, #0a2d6e, #1a4fa8)' }}>
                {saving ? '⏳...' : '💾 حفظ'}
              </button>
              <button onClick={() => setShowForm(false)}
                      className="px-6 py-3 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
