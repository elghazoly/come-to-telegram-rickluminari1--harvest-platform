import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function AdminSubjects() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: subjects } = await sb.from('subjects')
    .select('*, chapters(id, name, order_num)')
    .order('order_num')

  return (
    <div dir="rtl" className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-[#0a2d6e]">📚 إدارة المواد والفصول</h1>
        <a href="/admin/subjects/new"
          className="bg-[#0a2d6e] text-white px-6 py-3 rounded-xl font-bold hover:bg-[#1a4fa8] transition">
          ➕ مادة جديدة
        </a>
      </div>

      <div className="space-y-4">
        {subjects?.map((s: any) => (
          <div key={s.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {/* Subject header */}
            <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-b">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{s.icon}</span>
                <div>
                  <span className="font-bold text-[#0a2d6e]">{s.name}</span>
                  <span className="text-xs text-gray-400 mr-3">{s.chapters?.length || 0} فصول</span>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-bold ${
                  s.published_at ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {s.published_at ? '✅ منشور' : '⏳ مسودة'}
                </span>
              </div>
              <div className="flex gap-2">
                <a href={`/admin/subjects/${s.id}`}
                  className="text-sm bg-blue-50 text-blue-700 px-4 py-2 rounded-lg hover:bg-blue-100">
                  تعديل
                </a>
              </div>
            </div>
            {/* Chapters */}
            <div className="divide-y divide-gray-50">
              {s.chapters?.sort((a:any,b:any) => a.order_num - b.order_num).map((ch: any) => (
                <div key={ch.id} className="flex items-center justify-between px-8 py-3 hover:bg-gray-50">
                  <span className="text-sm text-gray-600">└ {ch.name}</span>
                  <a href={`/admin/chapters/${ch.id}`}
                    className="text-xs text-blue-600 hover:underline">إدارة الأسئلة</a>
                </div>
              ))}
              <div className="px-8 py-3">
                <a href={`/admin/chapters/new?subject_id=${s.id}`}
                  className="text-xs text-[#1a4fa8] hover:underline">+ إضافة فصل</a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
