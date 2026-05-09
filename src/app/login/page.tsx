'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const sb = createClient()
    const { error } = await sb.auth.signInWithPassword({ email, password })
    if (error) { setError('بيانات الدخول غير صحيحة'); setLoading(false); return }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0a2d6e] to-[#1a4fa8] p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-10 w-full max-w-sm text-center">
        <div className="text-6xl mb-2">🌾</div>
        <h1 className="text-2xl font-bold text-[#0a2d6e] mb-1">منصة هارفست</h1>
        <p className="text-gray-400 text-sm mb-8">تجميعات الأسئلة التعليمية</p>
        <form onSubmit={handleLogin} className="space-y-4 text-right" dir="rtl">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">البريد الإلكتروني</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#1a4fa8] bg-gray-50"
              placeholder="admin@harvest.com" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">كلمة المرور</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#1a4fa8] bg-gray-50" />
          </div>
          {error && <p className="text-red-600 text-sm font-semibold">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-gradient-to-r from-[#0a2d6e] to-[#1a4fa8] text-white font-bold py-3 rounded-xl text-sm mt-2 disabled:opacity-60">
            {loading ? 'جاري الدخول...' : 'تسجيل الدخول ←'}
          </button>
        </form>
      </div>
    </div>
  )
}
