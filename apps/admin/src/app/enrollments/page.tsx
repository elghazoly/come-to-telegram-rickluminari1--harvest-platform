'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'

type Profile    = { id: string; full_name: string; role: string; shopify_customer_id: string | null }
type Subject    = { id: string; name: string; icon: string | null }
type Enrollment = {
  id: string
  student_id: string
  subject_id: string
  expires_at: string | null
  shopify_order_id: string | null
  created_at: string
  student?: Profile
  subject?: Subject
}

const ACCESS_TYPES = [
  { value: 'permanent', label: '♾️ دائم',          expires: null },
  { value: '30days',    label: '📅 30 يوم',         days: 30 },
  { value: '90days',    label: '📅 90 يوم',         days: 90 },
  { value: '180days',   label: '📅 6 أشهر',         days: 180 },
  { value: '365days',   label: '📅 سنة',            days: 365 },
  { value: 'custom',    label: '📅 تاريخ مخصص',     days: null },
]

export default function EnrollmentsPage() {
  const router = useRouter()
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [students,    setStudents]    = useState<Profile[]>([])
  const [subjects,    setSubjects]    = useState<Subject[]>([])
  const [loading,     setLoading]     = useState(true)
  const [showForm,    setShowForm]    = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [toast,       setToast]       = useState('')
  const [filterSub,   setFilterSub]   = useState('')
  const [filterStatus,setFilterStatus]= useState<'all'|'active'|'expired'>('all')
  const [search,      setSearch]      = useState('')

  const [form, setForm] = useState({
    student_id:   '',
    subject_id:   '',
    access_type:  'permanent',
    custom_date:  '',
    shopify_order_id: '',
  })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  async function load() {
    const [{ data: enrData }, { data: stuData }, { data: subData }] = await Promise.all([
      supabase.from('enrollments').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').in('role', ['student']).order('full_name'),
      supabase.from('subjects').select('id, name, icon').order('order_num'),
    ])

    // Enrich enrollments
    const studentMap: Record<string, Profile> = {}
    const subjectMap: Record<string, Subject> = {}
    stuData?.forEach((s: Profile) => { studentMap[s.id] = s })
    subData?.forEach((s: Subject) => { subjectMap[s.id] = s })

    const enriched = (enrData || []).map((e: Enrollment) => ({
      ...e,
      student: studentMap[e.student_id],
      subject: subjectMap[e.subject_id],
    }))

    setEnrollments(enriched)
    setStudents(stuData || [])
    setSubjects(subData || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function getExpiresAt(): string | null {
    const type = ACCESS_TYPES.find(t => t.value === form.access_type)
    if (!type) return null
    if (form.access_type === 'permanent') return null
    if (form.access_type === 'custom') return form.custom_date ? new Date(form.custom_date).toISOString() : null
    const d = new Date()
    d.setDate(d.getDate() + (type as any).days)
    return d.toISOString()
  }

  async function handleSave() {
    if (!form.student_id || !form.subject_id) { showToast('❌ اختر الطالب والمادة'); return }
    setSaving(true)

    // Check if already enrolled
    const { data: existing } = await supabase
      .from('enrollments')
      .select('id')
      .eq('student_id', form.student_id)
      .eq('subject_id', form.subject_id)
      .single()

    const expiresAt = getExpiresAt()
    const payload = {
      student_id:       form.student_id,
      subject_id:       form.subject_id,
      expires_at:       expiresAt,
      shopify_order_id: form.shopify_order_id || null,
    }

    if (existing) {
      await supabase.from('enrollments').update({ expires_at: expiresAt, shopify_order_id: form.shopify_order_id || null }).eq('id', existing.id)
      showToast('✅ تم تحديث الاشتراك')
    } else {
      await supabase.from('enrollments').insert(payload)
      showToast('✅ تم إضافة الاشتراك')
    }

    await load()
    setSaving(false)
    setShowForm(false)
    setForm({ student_id: '', subject_id: '', access_type: 'permanent', custom_date: '', shopify_order_id: '' })
  }

  async function handleDelete(id: string) {
    if (!confirm('إلغاء هذا الاشتراك؟')) return
    await supabase.from('enrollments').delete().eq('id', id)
    await load()
    showToast('تم إلغاء الاشتراك')
  }

  async function handleExtend(e: Enrollment, days: number) {
    const base = e.expires_at ? new Date(e.expires_at) : new Date()
    base.setDate(base.getDate() + days)
    await supabase.from('enrollments').update({ expires_at: base.toISOString() }).eq('id', e.id)
    await load()
    showToast(`✅ تم تمديد الاشتراك ${days} يوم`)
  }

  function isExpired(e: Enrollment) {
    if (!e.expires_at) return false
    return new Date(e.expires_at) < new Date()
  }

  function isExpiringSoon(e: Enrollment) {
    if (!e.expires_at) return false
    const diff = (new Date(e.expires_at).getTime() - Date.now()) / 86400000
    return diff >= 0 && diff <= 7
  }

  const filtered = enrollments.filter(e => {
    const matchSub    = !filterSub || e.subject_id === filterSub
    const matchStatus = filterStatus === 'all' || (filterStatus === 'active' ? !isExpired(e) : isExpired(e))
    const matchSearch = !search || e.student?.full_name?.toLowerCase().includes(search.toLowerCase())
    return matchSub && matchStatus && matchSearch
  })

  const stats = {
    total:   enrollments.length,
    active:  enrollments.filter(e => !isExpired(e)).length,
    expired: enrollments.filter(e => isExpired(e)).length,
    soon:    enrollments.filter(e => isExpiringSoon(e)).length,
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-6 py-3 rounded-xl shadow-2xl text-sm font-semibold">
          {toast}
        </div>
      )}

      <header style={{ background: 'linear-gradient(90deg, #0a2d6e, #1a4fa8)' }}
              className="text-white px-6 py-4 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')} className="text-blue-200 hover:text-white text-sm">← العودة</button>
          <span className="text-blue-300">|</span>
          <h1 className="font-bold text-lg">📋 إدارة الاشتراكات</h1>
        </div>
        <button onClick={() => setShowForm(true)}
                className="bg-yellow-500 hover:bg-yellow-400 text-white font-bold px-4 py-2 rounded-lg text-sm">
          ➕ اشتراك جديد
        </button>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'إجمالي',         value: stats.total,   color: '#0a2d6e', icon: '📋' },
            { label: 'نشط',            value: stats.active,  color: '#0e7a3e', icon: '✅' },
            { label: 'منتهي',          value: stats.expired, color: '#c0002a', icon: '❌' },
            { label: 'ينتهي خلال 7 أيام', value: stats.soon, color: '#b45309', icon: '⚠️' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 text-center">
              <div className="text-2xl mb-1">{s.icon}</div>
              <div className="text-2xl font-black" style={{ color: s.color }}>{s.value}</div>
              <div className="text-slate-500 text-xs mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-4 flex-wrap">
          <input value={search} onChange={e => setSearch(e.target.value)}
                 className="flex-1 min-w-48 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 shadow-sm"
                 placeholder="🔍 بحث بالاسم..."/>
          <select value={filterSub} onChange={e => setFilterSub(e.target.value)}
                  className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 shadow-sm">
            <option value="">📚 كل المواد</option>
            {subjects.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
          </select>
          <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
            {([['all','الكل'],['active','نشط'],['expired','منتهي']] as const).map(([v,l]) => (
              <button key={v} onClick={() => setFilterStatus(v)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        filterStatus === v ? 'bg-blue-700 text-white' : 'text-slate-500 hover:bg-slate-100'
                      }`}>{l}</button>
            ))}
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-20 text-slate-400">⏳ جاري التحميل...</div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-right px-5 py-3 font-semibold text-slate-600">الطالب</th>
                  <th className="text-right px-5 py-3 font-semibold text-slate-600">المادة</th>
                  <th className="text-right px-5 py-3 font-semibold text-slate-600">الحالة</th>
                  <th className="text-right px-5 py-3 font-semibold text-slate-600">انتهاء الصلاحية</th>
                  <th className="text-right px-5 py-3 font-semibold text-slate-600">Shopify</th>
                  <th className="text-center px-5 py-3 font-semibold text-slate-600">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-slate-400">لا توجد اشتراكات</td></tr>
                ) : filtered.map(e => {
                  const expired = isExpired(e)
                  const soon    = isExpiringSoon(e)
                  return (
                    <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-700 text-xs flex-shrink-0">
                            {e.student?.full_name?.charAt(0) || '?'}
                          </div>
                          <span className="font-medium text-slate-800">{e.student?.full_name || e.student_id.slice(0,8)}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-lg text-xs font-semibold">
                          {e.subject?.icon} {e.subject?.name || '—'}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                          expired ? 'bg-red-100 text-red-700' :
                          soon    ? 'bg-orange-100 text-orange-700' :
                                    'bg-green-100 text-green-700'
                        }`}>
                          {expired ? '❌ منتهي' : soon ? '⚠️ ينتهي قريباً' : '✅ نشط'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-slate-500 text-xs">
                        {e.expires_at
                          ? new Date(e.expires_at).toLocaleDateString('ar-EG', { year:'numeric', month:'short', day:'numeric' })
                          : <span className="text-green-600 font-semibold">♾️ دائم</span>
                        }
                      </td>
                      <td className="px-5 py-4 text-slate-400 text-xs font-mono">
                        {e.shopify_order_id ? `#${e.shopify_order_id}` : '—'}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => handleExtend(e, 30)}
                                  title="تمديد 30 يوم"
                                  className="bg-blue-50 hover:bg-blue-100 text-blue-700 px-2 py-1 rounded-lg text-xs font-semibold">
                            +30
                          </button>
                          <button onClick={() => handleExtend(e, 90)}
                                  title="تمديد 90 يوم"
                                  className="bg-blue-50 hover:bg-blue-100 text-blue-700 px-2 py-1 rounded-lg text-xs font-semibold">
                            +90
                          </button>
                          <button onClick={() => handleDelete(e.id)}
                                  className="bg-red-50 hover:bg-red-100 text-red-600 px-2 py-1 rounded-lg text-xs font-semibold">
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
      </main>

      {/* Add enrollment modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 className="font-bold text-lg text-slate-800">➕ اشتراك جديد</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
            </div>
            <div className="p-6 space-y-4">

              {/* Student */}
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">
                  الطالب <span className="text-red-500">*</span>
                </label>
                <select value={form.student_id} onChange={e => setForm({...form, student_id: e.target.value})}
                        className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 bg-white">
                  <option value="">اختر الطالب...</option>
                  {students.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.full_name} {s.shopify_customer_id ? `(Shopify: ${s.shopify_customer_id})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">
                  المادة <span className="text-red-500">*</span>
                </label>
                <select value={form.subject_id} onChange={e => setForm({...form, subject_id: e.target.value})}
                        className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 bg-white">
                  <option value="">اختر المادة...</option>
                  {subjects.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
                </select>
              </div>

              {/* Access type */}
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-2">مدة الوصول</label>
                <div className="grid grid-cols-3 gap-2">
                  {ACCESS_TYPES.map(t => (
                    <button key={t.value} type="button"
                            onClick={() => setForm({...form, access_type: t.value})}
                            className={`py-2 px-3 rounded-xl border-2 text-xs font-bold transition-all ${
                              form.access_type === t.value
                                ? 'border-blue-500 bg-blue-50 text-blue-700'
                                : 'border-slate-200 text-slate-500 hover:border-blue-200'
                            }`}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom date */}
              {form.access_type === 'custom' && (
                <div>
                  <label className="block text-sm font-semibold text-slate-600 mb-1">تاريخ الانتهاء</label>
                  <input type="date" value={form.custom_date}
                         min={new Date().toISOString().split('T')[0]}
                         onChange={e => setForm({...form, custom_date: e.target.value})}
                         className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500"/>
                </div>
              )}

              {/* Shopify order ID */}
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">
                  رقم طلب Shopify
                  <span className="text-slate-400 font-normal mr-1">(اختياري)</span>
                </label>
                <input value={form.shopify_order_id}
                       onChange={e => setForm({...form, shopify_order_id: e.target.value})}
                       className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 font-mono"
                       placeholder="12345" dir="ltr"/>
              </div>

              {/* Summary */}
              {form.student_id && form.subject_id && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700">
                  <strong>ملخص الاشتراك:</strong><br/>
                  {students.find(s => s.id === form.student_id)?.full_name} ←
                  {subjects.find(s => s.id === form.subject_id)?.name}<br/>
                  الصلاحية: {ACCESS_TYPES.find(t => t.value === form.access_type)?.label}
                  {form.access_type === 'custom' && form.custom_date && ` — حتى ${new Date(form.custom_date).toLocaleDateString('ar-EG')}`}
                </div>
              )}
            </div>

            <div className="flex gap-3 p-6 border-t border-slate-100">
              <button onClick={handleSave} disabled={saving}
                      className="flex-1 py-3 rounded-xl text-white font-bold text-sm disabled:opacity-60"
                      style={{ background: 'linear-gradient(90deg, #0a2d6e, #1a4fa8)' }}>
                {saving ? '⏳ جاري الحفظ...' : '✅ حفظ الاشتراك'}
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
