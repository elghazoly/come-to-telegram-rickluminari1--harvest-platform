'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import type { Subject } from '@harvest/db'

export default function TeacherDashboard() {
  const router = useRouter()
  const [subjects,  setSubjects]  = useState<Subject[]>([])
  const [profile,   setProfile]   = useState<{ full_name: string; role: string } | null>(null)
  const [loading,   setLoading]   = useState(true)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: prof } = await supabase
        .from('profiles').select('full_name, role').eq('id', user.id).single()
      setProfile(prof)

      // Admin sees all subjects, teacher sees only assigned subjects
      let subjectsData: Subject[] = []
      if (prof?.role === 'admin') {
        const { data } = await supabase.from('subjects').select('*').order('order_num')
        subjectsData = data || []
      } else {
        const { data } = await supabase
          .from('teacher_subjects')
          .select('subjects(*)')
          .eq('teacher_id', user.id)
        subjectsData = data?.map((ts: any) => ts.subjects).filter(Boolean) || []
      }

      setSubjects(subjectsData)
      setLoading(false)
    }
    load()
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header style={{ background: 'linear-gradient(90deg, #0a2d6e, #1a4fa8)' }}
              className="text-white px-6 py-4 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <span className="text-2xl">👨‍🏫</span>
          <div>
            <h1 className="font-bold text-lg leading-none">منصة المعلم</h1>
            <p className="text-blue-200 text-xs">{profile?.full_name || 'جاري التحميل...'}</p>
          </div>
        </div>
        <button onClick={handleSignOut}
                className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          تسجيل الخروج
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <h2 className="text-xl font-bold text-slate-700 mb-6">📚 موادي</h2>

        {loading ? (
          <div className="text-center py-20 text-slate-400">⏳ جاري التحميل...</div>
        ) : subjects.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">📚</div>
            <p className="text-slate-500">لم يتم تعيينك لأي مادة بعد</p>
            <p className="text-slate-400 text-sm mt-2">تواصل مع الأدمن لتعيينك لمادة</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {subjects.map(s => (
              <button key={s.id}
                      onClick={() => router.push(`/subjects/${s.id}/chapters`)}
                      className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 text-center hover:shadow-md hover:border-blue-200 transition-all group">
                <div className="text-4xl mb-3">{s.icon || '📚'}</div>
                <h3 className="font-bold text-slate-800 group-hover:text-blue-700 transition-colors">{s.name}</h3>
                {s.description && <p className="text-slate-400 text-xs mt-2 line-clamp-2">{s.description}</p>}
                <div className="mt-4 bg-blue-50 group-hover:bg-blue-100 text-blue-700 text-xs font-bold py-1.5 px-3 rounded-lg transition-colors">
                  إدارة الفصول →
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
