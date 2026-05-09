import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'هارفست — لوحة الإدارة',
  description: 'منصة هارفست التعليمية',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="bg-slate-50 text-slate-900 font-sans">
        {children}
      </body>
    </html>
  )
}
