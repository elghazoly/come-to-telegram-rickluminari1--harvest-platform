import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function AdminDashboard() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const [
    { count: subjectsCount },
    { count: questionsCount },
    { count: studentsCount },
    { data: recentEnrollments },
  ] = await Promise.all([
    sb.from('subjects').select('*', { count: 'exact', head: true }),
    sb.from('questions').select('*', { count: 'exact', head: true }),
    sb.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student'),
    sb.from('enrollments').select('*, profiles(full_name), subjects(name)')
      .order('created_at', { ascending: false }).limit(5),
  ])

  return (
    <div dir="rtl" className="p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold text-[#0a2d6e] mb-8">لوحة تحكم الأدمن</h1>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-6 mb-10">
        {[
          { label: 'المواد', value: subjectsCount, icon: '📚', color: 'bg-blue-50 border-blue-200' },
          { label: 'الأسئلة', value: questionsCount, icon: '❓', color: 'bg-green-50 border-green-200' },
          { label: 'الطلاب', value: studentsCount, icon: '👨‍🎓', color: 'bg-purple-50 border-purple-200' },
        ].map(s => (
          <div key={s.label} className={`${s.color} border rounded-xl p-6 text-center`}>
            <div className="text-4xl mb-2">{s.icon}</div>
            <div className="text-3xl font-bold text-[#0a2d6e]">{s.value ?? 0}</div>
            <div className="text-gray-500 text-sm mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-4 mb-10">
        {[
          { href: '/admin/subjects', label: '📚 إدارة المواد والفصول', color: 'bg-[#0a2d6e]' },
          { href: '/admin/users', label: '👥 إدارة المستخدمين', color: 'bg-[#1a4fa8]' },
        ].map(l => (
          <a key={l.href} href={l.href}
            className={`${l.color} text-white font-bold py-4 px-6 rounded-xl text-center hover:opacity-90 transition`}>
            {l.label}
          </a>
        ))}
      </div>

      {/* Recent enrollments */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-[#0a2d6e] text-white px-6 py-4 font-bold">آخر الاشتراكات</div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-6 py-3 text-right">الطالب</th>
              <th className="px-6 py-3 text-right">المادة</th>
              <th className="px-6 py-3 text-right">التاريخ</th>
            </tr>
          </thead>
          <tbody>
            {recentEnrollments?.map((e: any) => (
              <tr key={e.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-6 py-3">{e.profiles?.full_name || '—'}</td>
                <td className="px-6 py-3">{e.subjects?.name || '—'}</td>
                <td className="px-6 py-3 text-gray-400">{new Date(e.created_at).toLocaleDateString('ar')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
