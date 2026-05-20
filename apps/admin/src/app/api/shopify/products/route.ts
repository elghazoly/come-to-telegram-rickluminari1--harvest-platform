import { NextResponse } from 'next/server'

const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || ''
const STORE = process.env.SHOPIFY_STORE || 'w4yqiq-n0.myshopify.com'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function supabaseGet(table: string, select: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${select}`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    }
  })
  return res.json()
}

export async function GET() {
  if (!TOKEN) {
    return NextResponse.json({ error: 'not_connected' }, { status: 401 })
  }

  const [shopifyRes, mappings, subjects] = await Promise.all([
    fetch(`https://${STORE}/admin/api/2026-04/products.json?limit=250`, {
      headers: { 'X-Shopify-Access-Token': TOKEN }
    }),
    supabaseGet('shopify_products', 'shopify_product_id,subject_id,duration_days'),
    supabaseGet('subjects', 'id,name')
  ])

  const shopifyData = await shopifyRes.json()

  console.log('mappings from REST:', JSON.stringify(mappings))

  if (!shopifyData.products) {
    return NextResponse.json({ error: 'not_connected' }, { status: 401 })
  }

  return NextResponse.json({
    products: shopifyData.products || [],
    mappings: mappings || [],
    subjects: subjects || []
  })
}
