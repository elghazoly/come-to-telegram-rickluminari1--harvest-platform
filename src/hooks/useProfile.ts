'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types/database'

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const sb = createClient()
    sb.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoading(false); return }
      sb.from('profiles').select('*').eq('id', user.id).single()
        .then(({ data }) => { setProfile(data); setLoading(false) })
    })
  }, [])

  return { profile, loading }
}
