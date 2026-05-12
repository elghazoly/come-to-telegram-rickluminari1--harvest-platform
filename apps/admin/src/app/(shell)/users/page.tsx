'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import type { Profile } from '@harvest/db'

type ProfileWithEmail = Profile & { email?: string }

const ROLE_LABELS: Record<string, string> = {
  admin:   '👑 أدمن',
  teacher: '👨‍🏫 معلم',
  student: '👨‍🎓 طالب',
}

const ROLE_COLORS: Record<string, string> = {
  admin:   'bg-purple-100 text-purple-700',
  teacher: 'bg-blue-100 text-blue-700',
  student: 'bg-green-100 text-green-700',
}

export default function UsersPage() {
  const router = useRouter()
  const [users,    setUsers]    = useState<ProfileWithEmail[]>([])
  const [loading,  setLoading]  = useState(true)
  const [filter,   setFilter]   = useState<'all'|'admin'|'teacher'|'student'>('all')
  const [search,   setSearch]   = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const [form,     setForm]     = useState({
    email: '', password: '', full_name: '', role: 'teacher', phone: ''
  })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  async function load() {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
    setUsers(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = users.filter(u => {
    const matchRole   = filter === 'all' || u.role === filter
    const matchSearch = !search || u.full_name?.toLowerCase().includes(search.toLowerCase())
    return matchRole && matchSearch
  })

  async function handleCreate() {
    if (!form.email || !form.password || !form.full_name) {
      setError('البريد الإلكتروني وكلمة المرور والاسم مطلوبة')
      return
    }
    setSaving(true); setError('')

    // Create user via Supabase Admin API (needs service role)
    const res = await fetch('/api/users/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error || 'فشل إنشاء المستخدم')
      setSaving(false)
      return
    }

    await load()
    setSaving(false)
    setShowForm(false)
    setForm({ email: '', password: '', full_name: '', role: 'teacher', phone: '' })
  }

  async function handleDelete(u: ProfileWithEmail) {
    if (!confirm(`حذف "${u.full_name}" نهائياً؟`)) return
    await fetch('/api/users/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: u.id })
    })
    await load()
  }

  async function handleRoleChange(u: ProfileWithEmail, role: string) {
    await supabase.from('profiles').update({ role }).eq('id', u.id)
    await load()
  }

  const counts = {
    all:     users.length,
    admin:   users.filter(u => u.role === 'admin').length,
    teacher: users.filter(u => u.role === 'teacher').length,
    student: users.filter(u => u.role === 'student').length,
  }

  return (
    <div>
      {/* Header */}

      <main className="max-w-5xl mx-auto px-6 py-8">

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {([
            { key: 'all',     label: 'الكل',      icon: '👥', color: '#0a2d6e' },
            { key: 'admin',   label: 'الأدمن',     icon: '👑', color: '#7c3aed' },
            { key: 'teacher', label: 'المعلمون',   icon: '👨‍🏫', color: '#1a4fa8' },
            { key: 'student', label: 'الطلاب',     icon: '👨‍🎓', color: '#0e7a3e' },
          ] as const).map(item => (
            <button key={item.key}
                    onClick={() => setFilter(item.key)}
                    className={`bg-white rounded-2xl p-4 shadow-sm border-2 text-center transition-all ${
                      filter === item.key ? 'border-blue-500' : 'border-slate-100 hover:border-blue-200'
                    }`}>
              <div className="text-2xl mb-1">{item.icon}</div>
              <div className="text-2xl font-black" style={{ color: item.color }}>
                {counts[item.key]}
              </div>
              <div className="text-slate-500 text-xs mt-1">{item.label}</div>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="mb-4">
          <input value={search} onChange={e => setSearch(e.target.value)}
                 className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 shadow-sm"
                 placeholder="🔍 بحث بالاسم..."/>
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-20 text-slate-400">⏳ جاري التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-slate-400">لا يوجد مستخدمون</div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-right px-5 py-3 font-semibold text-slate-600">الاسم</th>
                  <th className="text-right px-5 py-3 font-semibold text-slate-600">الدور</th>
                  <th className="text-right px-5 py-3 font-semibold text-slate-600">الهاتف</th>
                  <th className="text-right px-5 py-3 font-semibold text-slate-600">تاريخ الإنشاء</th>
                  <th className="text-center px-5 py-3 font-semibold text-slate-600">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-700 text-sm">
                          {u.full_name?.charAt(0) || '?'}
                        </div>
                        <span className="font-medium text-slate-800">{u.full_name || '—'}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <select value={u.role}
                              onChange={e => handleRoleChange(u, e.target.value)}
                              className={`text-xs font-bold px-3 py-1.5 rounded-full border-0 cursor-pointer ${ROLE_COLORS[u.role] || ''}`}>
                        <option value="admin">👑 أدمن</option>
                        <option value="teacher">👨‍🏫 معلم</option>
                        <option value="student">👨‍🎓 طالب</option>
                      </select>
                    </td>
                    <td className="px-5 py-4 text-slate-500">{u.phone || '—'}</td>
                    <td className="px-5 py-4 text-slate-400 text-xs">
                      {new Date(u.created_at).toLocaleDateString('ar-EG')}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <button onClick={() => handleDelete(u)}
                              className="text-red-500 hover:text-red-700 text-sm font-medium hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors">
                        🗑️ حذف
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Create User Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 className="font-bold text-lg text-slate-800">➕ مستخدم جديد</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 text-2xl">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">
                  الاسم الكامل <span className="text-red-500">*</span>
                </label>
                <input value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})}
                       className="w-full border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
                       placeholder="اسم المستخدم"/>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">
                  البريد الإلكتروني <span className="text-red-500">*</span>
                </label>
                <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})}
                       className="w-full border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
                       placeholder="user@example.com" dir="ltr"/>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">
                  كلمة المرور <span className="text-red-500">*</span>
                </label>
                <input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})}
                       className="w-full border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
                       placeholder="••••••••" dir="ltr"/>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">الدور</label>
                <select value={form.role} onChange={e => setForm({...form, role: e.target.value})}
                        className="w-full border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500 bg-white">
                  <option value="teacher">👨‍🏫 معلم</option>
                  <option value="student">👨‍🎓 طالب</option>
                  <option value="admin">👑 أدمن</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">رقم الهاتف</label>
                <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})}
                       className="w-full border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
                       placeholder="05xxxxxxxx" dir="ltr"/>
              </div>
              {error && <p className="text-red-600 text-sm font-medium">{error}</p>}
            </div>
            <div className="flex gap-3 p-6 border-t border-slate-100">
              <button onClick={handleCreate} disabled={saving}
                      className="flex-1 py-3 rounded-xl text-white font-bold text-sm disabled:opacity-60"
                      style={{ background: 'linear-gradient(90deg, #0a2d6e, #1a4fa8)' }}>
                {saving ? '⏳ جاري الإنشاء...' : '✅ إنشاء المستخدم'}
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
