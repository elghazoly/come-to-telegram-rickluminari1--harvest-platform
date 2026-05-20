import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect('https://admin.harvste.com/shopify')
  }

  const clientId = 'f93abc678d40c1a2f399579843d9e2c5'
  const clientSecret = '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'
  const shop = 'w4yqiq-n0.myshopify.com'

  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code })
  })

  const tokenData = await tokenRes.json()
  console.log('tokenData:', JSON.stringify(tokenData))
  const accessToken = tokenData.access_token

  if (accessToken) {
    await supabase
      .from('platform_settings')
      .update({ value: accessToken })
      .eq('key', 'shopify_access_token')
    console.log('token saved:', accessToken)
  }

  return NextResponse.redirect('https://admin.harvste.com/shopify')
}
