'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

interface Setting { key: string; value: string; label: string; description: string; type: 'text'|'password'|'url'; icon: string; group: string }

const SETTINGS_SCHEMA: Setting[] = [
  // Anthropic
  { key: 'ANTHROPIC_API_KEY',      label: 'Anthropic API Key',     description: 'مطلوب لاستخراج الأسئلة بالذكاء الاصطناعي والمساعد الذكي',                  type: 'password', icon: '🤖', group: 'AI' },
  // Supabase
  { key: 'SUPABASE_URL',           label: 'Supabase URL',           description: 'رابط مشروع Supabase',                                                        type: 'url',      icon: '🗄️', group: 'Database' },
  { key: 'SUPABASE_ANON_KEY',      label: 'Supabase Anon Key',      description: 'مفتاح القراءة العام',                                                         type: 'password', icon: '🗄️', group: 'Database' },
  { key: 'SUPABASE_SERVICE_KEY',   label: 'Supabase Service Key',   description: 'مفتاح الخدمة (يتجاوز RLS) — احتفظ به سراً',                                 type: 'password', icon: '🔐', group: 'Database' },
  // Cloudflare
  { key: 'CF_WORKER_URL',          label: 'Cloudflare Worker URL',  description: 'رابط Worker لرفع الفيديوهات والصور',                                         type: 'url',      icon: '☁️', group: 'Storage' },
  { key: 'CF_WORKER_TOKEN',        label: 'Cloudflare Worker Token','description': 'مفتاح المصادقة للـ Worker',                                                  type: 'password', icon: '☁️', group: 'Storage' },
  // Shopify
  { key: 'SHOPIFY_WEBHOOK_SECRET', label: 'Shopify Webhook Secret', description: 'سيكريت الـ Webhook لربط الاشتراكات تلقائياً',                               type: 'password', icon: '🛒', group: 'Shopify' },
  { key: 'SHOPIFY_STORE_URL',      label: 'Shopify Store URL',      description: 'رابط متجر Shopify',                                                           type: 'url',      icon: '🛒', group: 'Shopify' },
  // Contact
  { key: 'CONTACT_EMAIL',         label: 'البريد الإلكتروني',      description: 'يظهر في صفحة تواصل الطالب',                                                  type: 'text',     icon: '📧', group: 'Contact' },
  { key: 'CONTACT_WHATSAPP',      label: 'رقم واتساب',             description: 'رقم واتساب للتواصل (مع كود الدولة مثل 966501234567)',                        type: 'text',     icon: '💬', group: 'Contact' },
  { key: 'CONTACT_WEBSITE',       label: 'الموقع الرسمي',          description: 'رابط الموقع الرسمي للمنصة',                                                  type: 'url',      icon: '🌐', group: 'Contact' },
  { key: 'PLATFORM_NAME',         label: 'اسم المنصة',             description: 'يظهر في الهيدر وجميع الصفحات',                                               type: 'text',     icon: '🏫', group: 'Contact' },
  { key: 'LOGO_URL',              label: 'رابط اللوجو',            description: 'رابط مباشر لصورة اللوجو',                                                    type: 'url',      icon: '🖼️', group: 'Contact' },
]

const GROUPS = ['AI', 'Database', 'Storage', 'Shopify', 'Contact']
const GROUP_LABELS: Record<string, string> = {
  AI: '🤖 الذكاء الاصطناعي',
  Database: '🗄️ قاعدة البيانات',
  Storage: '☁️ التخزين السحابي',
  Shopify: '🛒 Shopify',
  Contact: '📞 معلومات التواصل',
}

export default function SettingsPage() {
  const router = useRouter()
  const [values,  setValues]  = useState<Record<string, string>>({})
  const [saved,   setSaved]   = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState<Record<string, boolean>>({})
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; msg: string }>>({})

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    async function load() {
      // Load settings from a settings table or use env as fallback
      const { data } = await supabase.from('platform_settings').select('key, value')
      const map: Record<string, string> = {}
      data?.forEach((r: any) => { map[r.key] = r.value })
      setValues(map)
      setLoading(false)
    }
    // Try to load — if table doesn't exist, just show empty
    load().catch(() => setLoading(false))
  }, [])

  async function saveSetting(key: string) {
    const val = values[key] || ''
    const { error } = await supabase.from('platform_settings')
      .upsert({ key, value: val, updated_at: new Date().toISOString() })
    if (!error) {
      setSaved(s => ({ ...s, [key]: true }))
      setTimeout(() => setSaved(s => ({ ...s, [key]: false })), 2000)
    }
  }

  async function testConnection(group: string) {
    setTesting(group)
    try {
      if (group === 'AI') {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': values['ANTHROPIC_API_KEY'] || '', 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] })
        })
        setTestResult(t => ({ ...t, AI: r.ok ? { ok: true, msg: '✅ API Key صالح' } : { ok: false, msg: '❌ API Key غير صالح' } }))
      } else if (group === 'Storage') {
        const url = values['CF_WORKER_URL']?.replace(/\/$/, '')
        const r = await fetch(url + '/', { headers: { 'X-Auth-Token': values['CF_WORKER_TOKEN'] || '' } })
        setTestResult(t => ({ ...t, Storage: r.ok ? { ok: true, msg: '✅ Worker يعمل' } : { ok: false, msg: '❌ Worker لا يستجيب' } }))
      }
    } catch {
      setTestResult(t => ({ ...t, [group]: { ok: false, msg: '❌ فشل الاتصال' } }))
    }
    setTesting(null)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header style={{ background: 'linear-gradient(90deg, #0a2d6e, #1a4fa8)' }}
              className="text-white px-6 py-4 flex items-center gap-3 shadow-lg">
        <button onClick={() => router.push('/dashboard')} className="text-blue-200 hover:text-white text-sm">← العودة</button>
        <span className="text-blue-300">|</span>
        <h1 className="font-bold text-lg">⚙️ إعدادات المنصة</h1>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {loading ? (
          <div className="text-center py-20 text-slate-400">⏳ جاري التحميل...</div>
        ) : GROUPS.map(group => {
          const groupSettings = SETTINGS_SCHEMA.filter(s => s.group === group)
          const result = testResult[group]
          return (
            <div key={group} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              {/* Group header */}
              <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-100">
                <h2 className="font-bold text-slate-800">{GROUP_LABELS[group]}</h2>
                {(group === 'AI' || group === 'Storage') && (
                  <div className="flex items-center gap-3">
                    {result && (
                      <span className={`text-xs font-semibold ${result.ok ? 'text-green-600' : 'text-red-600'}`}>
                        {result.msg}
                      </span>
                    )}
                    <button onClick={() => testConnection(group)} disabled={testing === group}
                            className="bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50">
                      {testing === group ? '⏳ جاري الاختبار...' : '🔍 اختبار الاتصال'}
                    </button>
                  </div>
                )}
              </div>

              {/* Settings */}
              <div className="divide-y divide-slate-50">
                {groupSettings.map(s => {
                  const isVisible = visible[s.key]
                  const isSaved   = saved[s.key]
                  const inputType = s.type === 'password' && !isVisible ? 'password' : 'text'
                  return (
                    <div key={s.key} className="px-6 py-4 flex items-start gap-4">
                      <span className="text-2xl flex-shrink-0 mt-1">{s.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <label className="font-semibold text-slate-700 text-sm">{s.label}</label>
                          <span className="text-slate-400 text-xs font-mono bg-slate-100 px-1.5 py-0.5 rounded">{s.key}</span>
                        </div>
                        <p className="text-slate-400 text-xs mb-2">{s.description}</p>
                        <div className="flex gap-2">
                          <div className="flex-1 relative">
                            <input
                              type={inputType}
                              value={values[s.key] || ''}
                              onChange={e => setValues(v => ({ ...v, [s.key]: e.target.value }))}
                              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 font-mono pr-10"
                              placeholder={s.type === 'url' ? 'https://...' : s.type === 'password' ? '••••••••' : ''}
                              dir="ltr"
                            />
                            {s.type === 'password' && (
                              <button onClick={() => setVisible(v => ({ ...v, [s.key]: !v[s.key] }))}
                                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs">
                                {isVisible ? '🙈' : '👁️'}
                              </button>
                            )}
                          </div>
                          <button onClick={() => saveSetting(s.key)}
                                  className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex-shrink-0 ${
                                    isSaved
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-blue-700 hover:bg-blue-600 text-white'
                                  }`}>
                            {isSaved ? '✅' : '💾 حفظ'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {/* Note */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 text-sm text-yellow-800">
          <p className="font-bold mb-1">⚠️ ملاحظة مهمة</p>
          <p>التغييرات تُحفظ في قاعدة البيانات وتنعكس فوراً. للـ Keys الحساسة (مثل Service Key) تأكد من تقييد الوصول بـ RLS.</p>
        </div>
      </main>
    </div>
  )
}
