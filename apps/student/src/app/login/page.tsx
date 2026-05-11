'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

export default function StudentLogin() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError || !data.user) { setError('البريد أو كلمة المرور غير صحيحة'); setLoading(false); return }
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
         style={{ background: 'linear-gradient(135deg, #0a2d6e, #1a4fa8)' }}>
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-2">🎓</div>
          <h1 className="text-2xl font-bold text-blue-900">منصة الطالب</h1>
          <p className="text-slate-500 text-sm mt-1">هارفست التعليمية</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-600 mb-1">البريد الإلكتروني</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                   className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 bg-slate-50"
                   placeholder="student@example.com" dir="ltr"/>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-600 mb-1">كلمة المرور</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                   className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 bg-slate-50"
                   placeholder="••••••••" dir="ltr"/>
          </div>
          {error && <p className="text-red-600 text-sm text-center font-medium">{error}</p>}
          <button type="submit" disabled={loading}
                  className="w-full py-3 rounded-xl text-white font-bold text-sm disabled:opacity-60"
                  style={{ background: 'linear-gradient(90deg, #0a2d6e, #1a4fa8)' }}>
            {loading ? '⏳ جاري الدخول...' : 'تسجيل الدخول →'}
          </button>
        </form>
      </div>
    </div>
  )
}
