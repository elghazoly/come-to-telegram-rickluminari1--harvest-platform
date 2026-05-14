'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

type Profile    = { id: string; full_name: string; role: string; shopify_customer_id: string | null }
type Subject    = { id: string; name: string; icon: string | null }
type Enrollment = {
  id: string; student_id: string; subject_id: string
  expires_at: string | null; shopify_order_id: string | null; created_at: string
  student?: Profile; subject?: Subject
}

const ACCESS_TYPES = [
  { value: 'permanent', label: '♾️ دائم',       days: 0   },
  { value: '30days',    label: '📅 30 يوم',      days: 30  },
  { value: '90days',    label: '📅 90 يوم',      days: 90  },
  { value: '180days',   label: '📅 6 أشهر',      days: 180 },
  { value: '365days',   label: '📅 سنة',         days: 365 },
  { value: 'custom',    label: '📅 تاريخ مخصص',  days: -1  },
]

const inp: React.CSSProperties = { width: '100%', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', fontSize: 13, outline: 'none', background: 'white', fontFamily: 'inherit' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function EnrollmentsPage() {
  const [enrollments,  setEnrollments]  = useState<Enrollment[]>([])
  const [students,     setStudents]     = useState<Profile[]>([])
  const [subjects,     setSubjects]     = useState<Subject[]>([])
  const [loading,      setLoading]      = useState(true)
  const [showForm,     setShowForm]     = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [toast,        setToast]        = useState('')
  const [filterSub,    setFilterSub]    = useState('')
  const [filterStatus, setFilterStatus] = useState<'all'|'active'|'expired'>('all')
  const [search,       setSearch]       = useState('')
  const [form, setForm] = useState({ student_id: '', subject_id: '', access_type: 'permanent', custom_date: '', shopify_order_id: '' })

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  async function load() {
    const [{ data: enrData }, { data: stuData }, { data: subData }] = await Promise.all([
      supabase.from('enrollments').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').eq('role', 'student').order('full_name'),
      supabase.from('subjects').select('id, name, icon').order('order_num'),
    ])
    const sMap: Record<string, Profile> = {}
    const sbMap: Record<string, Subject> = {}
    stuData?.forEach((s: Profile) => { sMap[s.id] = s })
    subData?.forEach((s: Subject) => { sbMap[s.id] = s })
    setEnrollments((enrData || []).map((e: Enrollment) => ({ ...e, student: sMap[e.student_id], subject: sbMap[e.subject_id] })))
    setStudents(stuData || [])
    setSubjects(subData || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function getExpiresAt(): string | null {
    if (form.access_type === 'permanent') return null
    if (form.access_type === 'custom') return form.custom_date ? new Date(form.custom_date).toISOString() : null
    const days = ACCESS_TYPES.find(t => t.value === form.access_type)?.days || 0
    const d = new Date(); d.setDate(d.getDate() + days)
    return d.toISOString()
  }

  async function handleSave() {
    if (!form.student_id || !form.subject_id) { showToast('❌ اختر الطالب والمادة'); return }
    setSaving(true)
    const { data: existing } = await supabase.from('enrollments').select('id').eq('student_id', form.student_id).eq('subject_id', form.subject_id).single()
    const expiresAt = getExpiresAt()
    const payload   = { student_id: form.student_id, subject_id: form.subject_id, expires_at: expiresAt, shopify_order_id: form.shopify_order_id || null }
    if (existing) {
      await supabase.from('enrollments').update({ expires_at: expiresAt, shopify_order_id: payload.shopify_order_id }).eq('id', existing.id)
      showToast('✅ تم تحديث الاشتراك')
    } else {
      await supabase.from('enrollments').insert(payload)
      showToast('✅ تم إضافة الاشتراك')
    }
    await load(); setSaving(false); setShowForm(false)
    setForm({ student_id: '', subject_id: '', access_type: 'permanent', custom_date: '', shopify_order_id: '' })
  }

  async function handleDelete(id: string) {
    if (!confirm('إلغاء هذا الاشتراك؟')) return
    await supabase.from('enrollments').delete().eq('id', id)
    await load(); showToast('تم إلغاء الاشتراك')
  }

  async function handleExtend(e: Enrollment, days: number) {
    const base = e.expires_at ? new Date(e.expires_at) : new Date()
    base.setDate(base.getDate() + days)
    await supabase.from('enrollments').update({ expires_at: base.toISOString() }).eq('id', e.id)
    await load(); showToast(`✅ تم تمديد ${days} يوم`)
  }

  const isExpired = (e: Enrollment) => !!e.expires_at && new Date(e.expires_at) < new Date()
  const isSoon    = (e: Enrollment) => { if (!e.expires_at) return false; const d = (new Date(e.expires_at).getTime() - Date.now()) / 86400000; return d >= 0 && d <= 7 }

  const filtered = enrollments.filter(e => {
    const matchSub  = !filterSub || e.subject_id === filterSub
    const matchSt   = filterStatus === 'all' || (filterStatus === 'active' ? !isExpired(e) : isExpired(e))
    const matchSrch = !search || e.student?.full_name?.toLowerCase().includes(search.toLowerCase())
    return matchSub && matchSt && matchSrch
  })

  const stats = { total: enrollments.length, active: enrollments.filter(e => !isExpired(e)).length, expired: enrollments.filter(e => isExpired(e)).length, soon: enrollments.filter(e => isSoon(e)).length }
  const statItems = [
    { label: 'إجمالي', value: stats.total,   color: '#0a2d6e', icon: '📋' },
    { label: 'نشط',    value: stats.active,  color: '#0e7a3e', icon: '✅' },
    { label: 'منتهي',  value: stats.expired, color: '#c0002a', icon: '❌' },
    { label: 'ينتهي قريباً', value: stats.soon, color: '#b45309', icon: '⚠️' },
  ]

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px' }}>
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#16a34a', color: 'white', padding: '10px 24px', borderRadius: 12, fontSize: 13, fontWeight: 700, zIndex: 100 }}>
          {toast}
        </div>
      )}

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1e293b', margin: 0 }}>🎓 الاشتراكات</h1>
        <button onClick={() => setShowForm(true)}
                style={{ background: 'linear-gradient(90deg,#0a2d6e,#1a4fa8)', color: 'white', border: 'none', padding: '9px 18px', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          ➕ اشتراك جديد
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {statItems.map(s => (
          <div key={s.label} style={{ background: 'white', borderRadius: 16, padding: '16px 12px', border: '1px solid #e2e8f0', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
            <div style={{ fontSize: 26, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
               style={{ ...inp, flex: 1, minWidth: 180 }} placeholder="🔍 بحث بالاسم..."/>
        <select value={filterSub} onChange={e => setFilterSub(e.target.value)} style={{ ...inp, width: 'auto' }}>
          <option value="">📚 كل المواد</option>
          {subjects.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
        </select>
        <div style={{ display: 'flex', background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 4, gap: 4 }}>
          {([['all','الكل'],['active','نشط'],['expired','منتهي']] as const).map(([v,l]) => (
            <button key={v} onClick={() => setFilterStatus(v)}
                    style={{ padding: '6px 14px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: filterStatus === v ? '#1d4ed8' : 'none', color: filterStatus === v ? 'white' : '#64748b' }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>⏳ جاري التحميل...</div>
      ) : (
        <div style={{ background: 'white', borderRadius: 18, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['الطالب','المادة','الحالة','انتهاء الصلاحية','Shopify','إجراءات'].map(h => (
                  <th key={h} style={{ textAlign: 'right', padding: '12px 16px', fontWeight: 700, color: '#475569', fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '48px 0', color: '#94a3b8' }}>لا توجد اشتراكات</td></tr>
              ) : filtered.map(e => {
                const expired = isExpired(e); const soon = isSoon(e)
                const statusBg = expired ? '#fef2f2' : soon ? '#fff7ed' : '#f0fdf4'
                const statusCo = expired ? '#dc2626' : soon ? '#ea580c' : '#16a34a'
                const statusTx = expired ? '❌ منتهي' : soon ? '⚠️ قريباً' : '✅ نشط'
                return (
                  <tr key={e.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#eff6ff', color: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                          {e.student?.full_name?.charAt(0) || '?'}
                        </div>
                        <span style={{ fontWeight: 600, color: '#1e293b' }}>{e.student?.full_name || e.student_id.slice(0,8)}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '3px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600 }}>
                        {e.subject?.icon} {e.subject?.name || '—'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ background: statusBg, color: statusCo, padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{statusTx}</span>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#64748b', fontSize: 12 }}>
                      {e.expires_at
                        ? new Date(e.expires_at).toLocaleDateString('ar-EG', { year:'numeric', month:'short', day:'numeric' })
                        : <span style={{ color: '#16a34a', fontWeight: 600 }}>♾️ دائم</span>
                      }
                    </td>
                    <td style={{ padding: '12px 16px', color: '#94a3b8', fontSize: 12, fontFamily: 'monospace' }}>
                      {e.shopify_order_id ? `#${e.shopify_order_id}` : '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        {[30,90].map(d => (
                          <button key={d} onClick={() => handleExtend(e, d)}
                                  style={{ background: '#eff6ff', color: '#1d4ed8', border: 'none', padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                            +{d}
                          </button>
                        ))}
                        <button onClick={() => handleDelete(e.id)}
                                style={{ background: '#fef2f2', color: '#dc2626', border: 'none', padding: '4px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 500, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #f1f5f9', position: 'sticky', top: 0, background: 'white', zIndex: 1 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#1e293b' }}>➕ اشتراك جديد</h2>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Student */}
              <div>
                <label style={lbl}>الطالب <span style={{ color: '#ef4444' }}>*</span></label>
                <select value={form.student_id} onChange={e => setForm({...form, student_id: e.target.value})} style={inp}>
                  <option value="">اختر الطالب...</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                </select>
              </div>
              {/* Subject */}
              <div>
                <label style={lbl}>المادة <span style={{ color: '#ef4444' }}>*</span></label>
                <select value={form.subject_id} onChange={e => setForm({...form, subject_id: e.target.value})} style={inp}>
                  <option value="">اختر المادة...</option>
                  {subjects.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
                </select>
              </div>
              {/* Access type */}
              <div>
                <label style={lbl}>مدة الوصول</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                  {ACCESS_TYPES.map(t => (
                    <button key={t.value} type="button" onClick={() => setForm({...form, access_type: t.value})}
                            style={{ padding: '8px 4px', borderRadius: 10, border: `2px solid ${form.access_type === t.value ? '#1d4ed8' : '#e2e8f0'}`, background: form.access_type === t.value ? '#eff6ff' : 'white', color: form.access_type === t.value ? '#1d4ed8' : '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              {form.access_type === 'custom' && (
                <div>
                  <label style={lbl}>تاريخ الانتهاء</label>
                  <input type="date" value={form.custom_date} min={new Date().toISOString().split('T')[0]}
                         onChange={e => setForm({...form, custom_date: e.target.value})} style={inp}/>
                </div>
              )}
              {/* Shopify */}
              <div>
                <label style={lbl}>رقم طلب Shopify <span style={{ color: '#94a3b8', fontWeight: 400 }}>(اختياري)</span></label>
                <input value={form.shopify_order_id} onChange={e => setForm({...form, shopify_order_id: e.target.value})}
                       style={{ ...inp, fontFamily: 'monospace' }} placeholder="12345" dir="ltr"/>
              </div>
              {/* Summary */}
              {form.student_id && form.subject_id && (
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#1d4ed8' }}>
                  <strong>ملخص:</strong> {students.find(s => s.id === form.student_id)?.full_name} ← {subjects.find(s => s.id === form.subject_id)?.name} — {ACCESS_TYPES.find(t => t.value === form.access_type)?.label}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, padding: '16px 24px', borderTop: '1px solid #f1f5f9', position: 'sticky', bottom: 0, background: 'white' }}>
              <button onClick={handleSave} disabled={saving}
                      style={{ flex: 1, padding: '12px 0', borderRadius: 12, border: 'none', background: 'linear-gradient(90deg,#0a2d6e,#1a4fa8)', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: saving ? .6 : 1 }}>
                {saving ? '⏳ جاري الحفظ...' : '✅ حفظ الاشتراك'}
              </button>
              <button onClick={() => setShowForm(false)}
                      style={{ padding: '12px 20px', borderRadius: 12, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
