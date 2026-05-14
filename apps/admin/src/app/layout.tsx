import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'هارفست — لوحة الإدارة',
  description: 'منصة هارفست التعليمية',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/tailwindcss/2.2.19/tailwind.min.css"
          crossOrigin="anonymous"
        />
      </head>
      <body style={{ margin: 0, padding: 0, background: '#f8fafc', fontFamily: "'Segoe UI', Tahoma, Arial, sans-serif" }}>
        {children}
      </body>
    </html>
  )
}
