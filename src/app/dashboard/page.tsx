import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single()
  const role = profile?.role || 'student'

  if (role === 'admin')   redirect('/admin/dashboard')
  if (role === 'teacher') redirect('/teacher/dashboard')
  redirect('/student/dashboard')
}
