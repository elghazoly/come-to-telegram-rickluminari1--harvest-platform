'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter, useParams } from 'next/navigation'
import type { Chapter, Subject } from '@harvest/db'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const inp: React.CSSProperties = { width: '100%', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', fontSize: 13, outline: 'none', background: 'white', fontFamily: 'inherit', boxSizing: 'border-box' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }

export default function ChaptersPage() {
  const router    = useRouter()
  const params    = useParams()
  const subjectId = params.id as string

  const [subject,  setSubject]  = useState<Subject | null>(null)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<Chapter | null>(null)
  const [form,     setForm]     = useState({ name: '', icon: '', chapter_type: 'lesson', timer_enabled: false, timer_duration: 1800 })
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

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
    setForm({ name: '', icon: '', chapter_type: 'lesson', timer_enabled: false, timer_duration: 1800 })
    setError(''); setShowForm(true)
  }

  function openEdit(c: Chapter) {
    setEditItem(c)
    setForm({ name: c.name, icon: c.icon || '', chapter_type: (c as any).chapter_type || 'lesson', timer_enabled: (c as any).timer_enabled || false, timer_duration: (c as any).timer_duration || 1800 })
    setError(''); setShowForm(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('اسم الفصل مطلوب'); return }
    setSaving(true); setError('')
    if (editItem) {
      const { error: err } = await supabase.from('chapters').update({ name: form.name, icon: form.icon, chapter_type: form.chapter_type, timer_enabled: form.timer_enabled, timer_duration: form.timer_duration, updated_at: new Date().toISOString() }).eq('id', editItem.id)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const maxOrder = chapters.length ? Math.max(...chapters.map(c => c.order_num)) + 1 : 1
      const { error: err } = await supabase.from('chapters').insert({ name: form.name, icon: form.icon, subject_id: subjectId, order_num: maxOrder, chapter_type: form.chapter_type, timer_enabled: form.timer_enabled, timer_duration: form.timer_duration })
      if (err) { setError(err.message); setSaving(false); return }
    }
    await load(); setSaving(false); setShowForm(false)
  }

  async function handleDelete(c: Chapter) {
    if (!confirm(`حذف فصل "${c.name}" وكل أسئلته؟`)) return
    await supabase.from('chapters').delete().eq('id', c.id)
    await load()
  }

  async function handlePublish(c: Chapter) {
    await supabase.from('chapters').update({ published_at: c.published_at ? null : new Date().toISOString() }).eq('id', c.id)
    await load()
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>

      {/* Header */}
      <header style={{ background: 'linear-gradient(90deg,#0a2d6e,#1a4fa8)', color: 'white', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 2px 8px rgba(0,0,0,.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.push('/subjects')}
                  style={{ background: 'rgba(255,255,255,.15)', border: 'none', color: 'white', padding: '6px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
            ← المواد
          </button>
          <span style={{ opacity: .4 }}>|</span>
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>
            {subject?.icon} {subject?.name} — الفصول
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => router.push(`/subjects/${subjectId}/chapters/new`)}
                  style={{ background: '#16a34a', border: 'none', color: 'white', padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            🤖 إضافة بالذكاء الاصطناعي
          </button>
          <button onClick={openAdd}
                  style={{ background: '#eab308', border: 'none', color: 'white', padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            ➕ فصل يدوي
          </button>
        </div>
      </header>

      {/* Content */}
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '28px 24px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>⏳ جاري التحميل...</div>
        ) : chapters.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 52, marginBottom: 12 }}>📂</div>
            <p style={{ color: '#64748b', marginBottom: 16 }}>لا توجد فصول بعد</p>
            <button onClick={openAdd}
                    style={{ background: 'linear-gradient(90deg,#0a2d6e,#1a4fa8)', color: 'white', border: 'none', padding: '10px 24px', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              ➕ أضف أول فصل
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {chapters.map(c => {
              const isExam    = (c as any).chapter_type === 'exam'
              const isPublish = !!c.published_at
              return (
                <div key={c.id} style={{ background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
                  {/* Icon */}
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                    {c.icon || '📂'}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, color: '#1e293b', fontSize: 15 }}>{c.name}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: isPublish ? '#dcfce7' : '#f1f5f9', color: isPublish ? '#16a34a' : '#64748b' }}>
                        {isPublish ? '✅ منشور' : '⏸ مسودة'}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: isExam ? '#fff7ed' : '#eff6ff', color: isExam ? '#ea580c' : '#1d4ed8' }}>
                        {isExam ? '📝 اختبار' : '📖 شرح'}
                      </span>
                      {isExam && (c as any).timer_enabled && (
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#fff7ed', color: '#ea580c' }}>
                          ⏱️ {Math.round((c as any).timer_duration / 60)} دق
                        </span>
                      )}
                    </div>
                    <p style={{ color: '#94a3b8', fontSize: 11, margin: 0 }}>الترتيب: {c.order_num}</p>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => router.push(`/subjects/${subjectId}/chapters/${c.id}/questions`)}
                            style={{ background: '#eff6ff', color: '#1d4ed8', border: 'none', padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                      ❓ الأسئلة
                    </button>
                    <button onClick={() => handlePublish(c)}
                            style={{ background: isPublish ? '#fff7ed' : '#f0fdf4', color: isPublish ? '#ea580c' : '#16a34a', border: 'none', padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {isPublish ? '⏸' : '✅'}
                    </button>
                    <button onClick={() => openEdit(c)}
                            style={{ background: '#f8fafc', color: '#475569', border: 'none', padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                      ✏️
                    </button>
                    <button onClick={() => handleDelete(c)}
                            style={{ background: '#fef2f2', color: '#dc2626', border: 'none', padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                      🗑️
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 480, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>

            {/* Modal header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #f1f5f9', position: 'sticky', top: 0, background: 'white', zIndex: 1 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#1e293b' }}>
                {editItem ? '✏️ تعديل الفصل' : '➕ فصل جديد'}
              </h2>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8', lineHeight: 1 }}>×</button>
            </div>

            {/* Modal body */}
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>

              <div>
                <label style={lbl}>اسم الفصل <span style={{ color: '#ef4444' }}>*</span></label>
                <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} style={inp} placeholder="مثال: الأنماط والمنطق"/>
              </div>

              <div>
                <label style={lbl}>الأيقونة (emoji)</label>
                <input value={form.icon} onChange={e => setForm({...form, icon: e.target.value})} style={inp} placeholder="📐"/>
              </div>

              {/* Chapter type */}
              <div>
                <label style={lbl}>نوع الفصل</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[
                    { value: 'lesson', label: '📖 شرح مع أسئلة', desc: 'فيديو + أسئلة تدريبية' },
                    { value: 'exam',   label: '📝 اختبار',        desc: 'أسئلة فقط بدون شرح' },
                  ].map(t => (
                    <button key={t.value} type="button" onClick={() => setForm({...form, chapter_type: t.value})}
                            style={{ padding: '12px 10px', borderRadius: 12, border: `2px solid ${form.chapter_type === t.value ? '#1d4ed8' : '#e2e8f0'}`, background: form.chapter_type === t.value ? '#eff6ff' : 'white', cursor: 'pointer', textAlign: 'right', fontFamily: 'inherit' }}>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: form.chapter_type === t.value ? '#1d4ed8' : '#1e293b' }}>{t.label}</p>
                      <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94a3b8' }}>{t.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Timer */}
              {form.chapter_type === 'exam' && (
                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12, padding: 16 }}>
                  <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#92400e' }}>⏱️ إعدادات التايمر</p>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 10 }}>
                    <input type="checkbox" checked={form.timer_enabled} onChange={e => setForm({...form, timer_enabled: e.target.checked})} style={{ width: 16, height: 16 }}/>
                    <span style={{ fontSize: 13, color: '#374151' }}>تفعيل التايمر للاختبار</span>
                  </label>
                  {form.timer_enabled && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {[15,20,30,45,60,90].map(m => (
                        <button key={m} type="button" onClick={() => setForm({...form, timer_duration: m*60})}
                                style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #fed7aa', background: form.timer_duration === m*60 ? '#ea580c' : 'white', color: form.timer_duration === m*60 ? 'white' : '#ea580c', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                          {m} دقيقة
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {error && <p style={{ color: '#dc2626', fontSize: 13, margin: 0 }}>{error}</p>}
            </div>

            {/* Modal footer */}
            <div style={{ display: 'flex', gap: 10, padding: '16px 24px', borderTop: '1px solid #f1f5f9', position: 'sticky', bottom: 0, background: 'white' }}>
              <button onClick={handleSave} disabled={saving}
                      style={{ flex: 1, padding: '12px 0', borderRadius: 12, border: 'none', background: 'linear-gradient(90deg,#0a2d6e,#1a4fa8)', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: saving ? .6 : 1, fontFamily: 'inherit' }}>
                {saving ? '⏳ جاري الحفظ...' : '💾 حفظ'}
              </button>
              <button onClick={() => setShowForm(false)}
                      style={{ padding: '12px 20px', borderRadius: 12, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
