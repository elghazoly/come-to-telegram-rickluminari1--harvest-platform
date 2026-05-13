'use client'
import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const LOGO = 'https://www.harvste.com/cdn/shop/files/harv_logo.jpg?v=1775984331&width=195'

const NAV_ITEMS = [
  { label: 'الرئيسية',   href: '/dashboard', icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10' },
  { label: 'موادي',      href: '/subjects',  icon: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z' },
  { label: 'طلابي',      href: '/students',  icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75' },
  { label: 'الميديا',    href: '/media',     icon: 'M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z M14 2v6h6' },
]

function NavIcon({ d }: { d: string }) {
  const paths = d.split(' M').map((p, i) => i === 0 ? p : 'M' + p)
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {paths.map((p, i) => <path key={i} d={p} />)}
    </svg>
  )
}

export default function AppShell({ children, title = 'منصة المعلم' }: { children: React.ReactNode; title?: string }) {
  const router   = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(true)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    function check() {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (mobile) setOpen(false)
      else setOpen(true)
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const navItemStyle = (isActive: boolean) => isMobile ? {
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
    gap: 3, padding: '8px 12px', border: 'none', cursor: 'pointer',
    background: isActive ? '#eff6ff' : 'none',
    color: isActive ? '#1d4ed8' : '#64748b',
    borderBottom: `2px solid ${isActive ? '#1d4ed8' : 'transparent'}`,
    fontSize: 10, fontWeight: isActive ? 600 : 500,
    whiteSpace: 'nowrap' as const, minWidth: 55, flexShrink: 0,
  } : {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 16px', width: '100%', border: 'none',
    background: isActive ? '#eff6ff' : 'none',
    color: isActive ? '#1d4ed8' : '#475569',
    borderRight: `3px solid ${isActive ? '#1d4ed8' : 'transparent'}`,
    fontSize: 13, fontWeight: isActive ? 600 : 500,
    cursor: 'pointer', textAlign: 'right' as const,
    whiteSpace: 'nowrap' as const, transition: 'all .15s',
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc', overflow: 'hidden' }}>

      {/* HEADER */}
      <header style={{ background: 'white', borderBottom: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,.06)', flexShrink: 0, zIndex: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto 1fr', alignItems: 'center', padding: isMobile ? '8px 12px' : '10px 20px', gap: 8 }}>
          {/* Menu toggle */}
          <button onClick={() => setOpen(o => !o)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8, color: '#475569', display: 'flex', alignItems: 'center' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          {/* Name */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 800, color: '#1e293b', fontSize: isMobile ? 15 : 17 }}>منصة هارفست</div>
            {!isMobile && <div style={{ fontSize: 11, color: '#94a3b8' }}>{title}</div>}
          </div>
          {/* Logo */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <img src={LOGO} alt="هارفست" style={{ height: isMobile ? 36 : 60, objectFit: 'contain' }} />
          </div>
          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            {!isMobile && <span style={{ fontSize: 12, color: '#94a3b8', padding: '6px 0' }}>{title}</span>}
            <button onClick={signOut}
                    style={{ background: '#fef2f2', color: '#dc2626', border: 'none', padding: isMobile ? '5px 10px' : '6px 14px', borderRadius: 10, fontSize: isMobile ? 12 : 13, fontWeight: 600, cursor: 'pointer' }}>
              خروج
            </button>
          </div>
        </div>
      </header>

      {/* BODY */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0, flexDirection: isMobile ? 'column' : 'row' }}>

        {/* SIDEBAR — horizontal on mobile, vertical on desktop */}
        {isMobile ? (
          // Mobile: horizontal tab bar
          <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', display: 'flex', overflowX: 'auto', flexShrink: 0 }}>
            {NAV_ITEMS.map(item => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
              return (
                <button key={item.href} onClick={() => router.push(item.href)} style={navItemStyle(isActive)}>
                  <NavIcon d={item.icon} />
                  {item.label}
                </button>
              )
            })}
          </div>
        ) : (
          // Desktop: vertical sidebar
          <div style={{
            width: open ? 220 : 0, minWidth: open ? 220 : 0, flexShrink: 0,
            background: 'white', borderLeft: '1px solid #e2e8f0',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            transition: 'width .25s ease, min-width .25s ease'
          }}>
            <div style={{ padding: '16px 12px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src={LOGO} alt="" style={{ height: 30, objectFit: 'contain', flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>منصة المعلم</span>
            </div>
            <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
              {NAV_ITEMS.map(item => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                return (
                  <button key={item.href} onClick={() => router.push(item.href)} style={navItemStyle(isActive)}>
                    <NavIcon d={item.icon} />
                    {item.label}
                  </button>
                )
              })}
            </nav>
          </div>
        )}

        {/* CONTENT */}
        <div style={{ flex: 1, overflowY: 'auto', minWidth: 0, minHeight: 0 }}>
          {children}
        </div>

      </div>
    </div>
  )
}
