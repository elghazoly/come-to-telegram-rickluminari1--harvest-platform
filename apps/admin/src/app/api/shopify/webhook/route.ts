import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

const CLIENT_SECRET = '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'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function supabaseGet(table: string, filters: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filters}`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  })
  return res.json()
}

async function supabasePost(table: string, body: object) {
  return fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(body)
  })
}

async function supabasePatch(table: string, filters: string, body: object) {
  return fetch(`${SUPABASE_URL}/rest/v1/${table}?${filters}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
}

async function verifyWebhook(req: NextRequest, body: string): Promise<boolean> {
  const hmac = req.headers.get('x-shopify-hmac-sha256')
  if (!hmac) return false
  const hash = crypto.createHmac('sha256', CLIENT_SECRET).update(body).digest('base64')
  return hash === hmac
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const valid = await verifyWebhook(req, body)
  if (!valid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const order = JSON.parse(body)
  const email = order.email?.toLowerCase()
  const phone = order.phone || order.billing_address?.phone || ''
  const lineItems = order.line_items || []
  const shopifyOrderId = String(order.id)
  const shopifyCustomerId = String(order.customer?.id || '')
  const fullName = `${order.customer?.first_name || ''} ${order.customer?.last_name || ''}`.trim()

  for (const item of lineItems) {
    const productId = String(item.product_id)

    const mappings = await supabaseGet('shopify_products',
      `shopify_product_id=eq.${productId}&select=subject_id,duration_days`)

    if (!mappings?.length) continue
    const mapping = mappings[0]

    const expiresAt = mapping.duration_days
      ? new Date(Date.now() + mapping.duration_days * 86400000).toISOString()
      : null

    let studentId: string | null = null

    const existing = await supabaseGet('profiles',
      `or=(email.eq.${email},phone.eq.${phone})&select=id&limit=1`)

    if (existing?.length) {
      studentId = existing[0].id
      await supabasePatch('profiles', `id=eq.${studentId}`, {
        full_name: fullName,
        phone,
        shopify_customer_id: shopifyCustomerId
      })
    } else {
      const countRes = await supabaseGet('enrollments', 'select=id')
      const sequence = (countRes?.length || 0) + 1
      const emailPrefix = email.split('@')[0]
      const last3Phone = phone.replace(/\D/g, '').slice(-3)
      const password = `${emailPrefix}${last3Phone}_${sequence}`

      const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password, email_confirm: true })
      })

      const authData = await authRes.json()
      if (!authData?.id) continue
      studentId = authData.id

      await supabasePatch('profiles', `id=eq.${studentId}`, {
        full_name: fullName,
        phone,
        shopify_customer_id: shopifyCustomerId
      })
    }

    await supabasePost('enrollments', {
      student_id: studentId,
      subject_id: mapping.subject_id,
      expires_at: expiresAt,
      shopify_order_id: shopifyOrderId
    })
  }

  return NextResponse.json({ success: true })
}
