import { NextResponse } from 'next/server'

export async function GET() {
  const clientId = 'f93abc678d40c1a2f399579843d9e2c5'
  const shop = 'w4yqiq-n0.myshopify.com'
  const redirectUri = 'https://admin.harvste.com/api/shopify/callback'
  const scopes = 'read_orders,read_customers,write_customers,read_products'

  const authUrl = `https://${shop}/admin/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${redirectUri}`

  return NextResponse.redirect(authUrl)
}
