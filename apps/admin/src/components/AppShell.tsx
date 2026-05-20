'use client'
import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const LOGO = 'https://www.harvste.com/cdn/shop/files/harv_logo.jpg?v=1775984331&width=195'

const NAV_ITEMS = [
  { label: 'الرئيسية',    href: '/dashboard',   icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10' },
  { label: 'المواد',       href: '/subjects',    icon: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z' },
  { label: 'المستخدمون',  href: '/users',       icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75' },
  { label: 'التعيينات',   href: '/assignments', icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M12 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 11l-4 4-2-2' },
  { label: 'الميديا',     href: '/media',       icon: 'M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z M14 2v6h6' },
  { label: 'الاشتراكات',  href: '/enrollments', icon: 'M20 12V22H4V12 M22 7H2v5h20V7z M12 22V7' },
  { label: 'Shopify',        href: '/shopify',    icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z' },
  { label: 'الإعدادات',   href: '/settings',    icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9' },
]

function NavIcon({ d }: { d: string }) {
  const paths = d.split(' M').map((p, i) => i === 0 ? p : 'M' + p)
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {paths.map((p, i) => <path key={i} d={p} />)}
    </svg>
  )
}

export default function AppShell({ children, title = 'لوحة الإدارة' }: { children: React.ReactNode; title?: string }) {
  const router   = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(true)

  // Auto-collapse sidebar on mobile
  if (typeof window !== 'undefined') {
    // handled via CSS media queries
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>

      {/* HEADER */}
      <header style={{ background: 'white', borderBottom: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,.06)', flexShrink: 0, zIndex: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto 1fr', alignItems: 'center', padding: '10px 20px', gap: 12 }}>
          {/* Menu toggle */}
          <button onClick={() => setOpen(o => !o)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8, color: '#475569', display: 'flex' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          {/* Name */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 800, color: '#1e293b', fontSize: 17 }}>منصة هارفست</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>{title}</div>
          </div>
          {/* Logo */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <img src={LOGO} alt="هارفست" style={{ height: 'clamp(32px, 4vw, 44px)', objectFit: 'contain' }} />
          </div>
          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={signOut}
                    style={{ background: '#fef2f2', color: '#dc2626', border: 'none', padding: '6px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              خروج
            </button>
          </div>
        </div>
      </header>

      {/* BODY */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

        {/* SIDEBAR */}
        <div style={{
          width: open ? 220 : 0, minWidth: open ? 220 : 0, flexShrink: 0,
          background: 'white', borderLeft: '1px solid #e2e8f0',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          transition: 'width .25s ease, min-width .25s ease'
        }}>
          <div style={{ padding: '16px 12px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src={LOGO} alt="" style={{ height: 30, objectFit: 'contain' }} />
            <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>منصة هارفست</span>
          </div>

          <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
            {NAV_ITEMS.map(item => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
              return (
                <button key={item.href} onClick={() => router.push(item.href)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 16px', width: '100%', border: 'none',
                          background: isActive ? '#eff6ff' : 'none',
                          color: isActive ? '#1d4ed8' : '#475569',
                          borderRight: `3px solid ${isActive ? '#1d4ed8' : 'transparent'}`,
                          fontSize: 13, fontWeight: isActive ? 600 : 500,
                          cursor: 'pointer', textAlign: 'right', whiteSpace: 'nowrap',
                          transition: 'all .15s'
                        }}>
                  <NavIcon d={item.icon} />
                  {item.label}
                </button>
              )
            })}
          </nav>
        </div>

        {/* CONTENT */}
        <div style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
          {children}
        </div>

      </div>
    </div>
  )
}
