import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data } = await supabase
      .from('platform_settings')
      .select('key, value')
      .in('key', ['CONTACT_EMAIL','CONTACT_WHATSAPP','CONTACT_WEBSITE','PLATFORM_NAME','LOGO_URL'])

    const settings: Record<string, string> = {}
    data?.forEach((r: any) => { settings[r.key] = r.value })
    return NextResponse.json(settings)
  } catch {
    return NextResponse.json({})
  }
}
