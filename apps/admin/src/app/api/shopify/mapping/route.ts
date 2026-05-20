import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  const { shopify_product_id, subject_id, duration_days } = await req.json()

  if (!shopify_product_id || !subject_id) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const { error } = await supabase
    .from('shopify_products')
    .upsert({
      shopify_product_id: String(shopify_product_id),
      subject_id,
      duration_days: duration_days || null
    }, { onConflict: 'shopify_product_id' })

  console.log('mapping error:', error)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(req: Request) {
  const { shopify_product_id } = await req.json()

  const { error } = await supabase
    .from('shopify_products')
    .delete()
    .eq('shopify_product_id', String(shopify_product_id))

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
