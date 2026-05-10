'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'

interface Stats {
  subjects: number
  chapters: number
  questions: number
  students: number
  teachers: number
}

export default function DashboardPage() {
  const router = useRouter()
  const [stats,   setStats]   = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const [subjects, chapters, questions, students, teachers] = await Promise.all([
        supabase.from('subjects').select('id', { count: 'exact', head: true }),
        supabase.from('chapters').select('id', { count: 'exact', head: true }),
        supabase.from('questions').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student'),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'teacher'),
      ])

      setStats({
        subjects:  subjects.count  ?? 0,
        chapters:  chapters.count  ?? 0,
        questions: questions.count ?? 0,
        students:  students.count  ?? 0,
        teachers:  teachers.count  ?? 0,
      })
      setLoading(false)
    }
    load()
  }, [router])

  const cards = [
    { label: 'المواد',     value: stats?.subjects,  icon: '📚', color: '#0a2d6e' },
    { label: 'الفصول',    value: stats?.chapters,  icon: '📂', color: '#1a4fa8' },
    { label: 'الأسئلة',   value: stats?.questions, icon: '❓', color: '#6d28d9' },
    { label: 'الطلاب',    value: stats?.students,  icon: '👨‍🎓', color: '#0e7a3e' },
    { label: 'المعلمون',  value: stats?.teachers,  icon: '👨‍🏫', color: '#b45309' },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header style={{ background: 'linear-gradient(90deg, #0a2d6e, #1a4fa8)' }}
              className="text-white px-6 py-4 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🌾</span>
          <div>
            <h1 className="font-bold text-lg leading-none">منصة هارفست</h1>
            <p className="text-blue-200 text-xs">لوحة الإدارة</p>
          </div>
        </div>
        <nav className="flex gap-2">
          {[
            { label: '📚 المواد',    href: '/subjects' },
            { label: '👥 المستخدمون', href: '/users' },
            { label: '🗂️ الميديا',   href: '/media' },
            { label: '⚙️ الإعدادات',  href: '/settings' },
          ].map(item => (
            <a key={item.href} href={item.href}
               className="px-3 py-2 rounded-lg text-sm font-medium hover:bg-white/10 transition-colors">
              {item.label}
            </a>
          ))}
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <h2 className="text-xl font-bold text-slate-700 mb-6">نظرة عامة</h2>

        {loading ? (
          <div className="text-center py-20 text-slate-400">⏳ جاري التحميل...</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            {cards.map(card => (
              <div key={card.label} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 text-center">
                <div className="text-3xl mb-2">{card.icon}</div>
                <div className="text-3xl font-black" style={{ color: card.color }}>
                  {card.value ?? 0}
                </div>
                <div className="text-slate-500 text-sm mt-1 font-medium">{card.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Quick actions */}
        <h2 className="text-xl font-bold text-slate-700 mb-4">إجراءات سريعة</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'إضافة مادة جديدة',   href: '/subjects',  icon: '➕' },
            { label: 'إضافة معلم',          href: '/users',     icon: '👨‍🏫' },
            { label: 'إدارة الفيديوهات',    href: '/media',     icon: '🎬' },
            { label: 'إدارة الصور',          href: '/media',     icon: '🖼️' },
            { label: 'الاشتراكات',           href: '/enrollments', icon: '📋' },
            { label: 'تقارير الطلاب',        href: '/reports',   icon: '📊' },
          ].map(action => (
            <a key={action.href} href={action.href}
               className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 hover:border-blue-200 hover:shadow-md transition-all flex items-center gap-3">
              <span className="text-2xl">{action.icon}</span>
              <span className="font-semibold text-slate-700 text-sm">{action.label}</span>
            </a>
          ))}
        </div>
      </main>
    </div>
  )
}
