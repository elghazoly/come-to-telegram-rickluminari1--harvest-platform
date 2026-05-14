'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Chapter { id: string; name: string; chapter_type: string }
interface Subject { id: string; name: string; icon: string | null; chapters: Chapter[] }

export default function SubjectsPage() {
  const router = useRouter()
  const [subjects,  setSubjects]  = useState<Subject[]>([])
  const [expanded,  setExpanded]  = useState<string | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [exportModal, setExportModal] = useState<{ subjectId: string; chapterId?: string; mode: 'solved'|'unsolved' } | null>(null)
  const [coverImage,  setCoverImage]  = useState<string>('')
  const [logoImage,   setLogoImage]   = useState<string>('')
  const [orientation, setOrientation] = useState<'portrait'|'landscape'>('portrait')
  const [exporting,   setExporting]   = useState(false)
  const [teacherName, setTeacherName] = useState<string>('')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      let subjectIds: string[] = []

      if ((prof as any)?.role === 'admin') {
        const { data } = await supabase.from('subjects').select('id').order('order_num')
        subjectIds = data?.map((s: any) => s.id) || []
      } else {
        const { data: ts } = await supabase.from('teacher_subjects').select('subject_id').eq('teacher_id', user.id)
        subjectIds = ts?.map((t: any) => t.subject_id) || []
      }

      // Parallel: fetch all subjects + all chapters in 2 queries
      const [{ data: subsData }, { data: chsData }] = await Promise.all([
        supabase.from('subjects').select('id, name, icon').in('id', subjectIds).order('order_num'),
        supabase.from('chapters').select('id, name, chapter_type, subject_id').in('subject_id', subjectIds).order('order_num'),
      ])

      const built: Subject[] = (subsData || []).map((sub: any) => ({
        ...sub,
        chapters: (chsData || []).filter((c: any) => c.subject_id === sub.id),
      }))
      setSubjects(built)
      setLoading(false)
    }
    load()
  }, [])

  async function openExportModal(subjectId: string, mode: 'solved'|'unsolved', chapterId?: string) {
    setExportModal({ subjectId, chapterId, mode })
    setCoverImage('')
    setLogoImage('')
    setOrientation('portrait')
    // fetch teacher name
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
        if (prof?.full_name) setTeacherName(prof.full_name)
      }
    } catch {}
  }

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setLogoImage(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setCoverImage(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  async function doExport() {
    if (!exportModal) return
    setExporting(true)
    try {
      const body: Record<string, string> = {
        subject_id:  exportModal.subjectId,
        mode:        exportModal.mode,
        orientation,
      }
      if (exportModal.chapterId) body.chapter_id = exportModal.chapterId
      if (coverImage) body.cover = coverImage
      if (logoImage)  body.logo = logoImage
      if (teacherName) body.teacher_name = teacherName

      const res = await fetch('/api/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const html = await res.text()
      const blob = new Blob([html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } finally {
      setExporting(false)
      setExportModal(null)
    }
  }

  const colors = [
    { bg: '#eff6ff', border: '#bfdbfe', col: '#1d4ed8' },
    { bg: '#f0fdf4', border: '#bbf7d0', col: '#15803d' },
    { bg: '#f5f3ff', border: '#ddd6fe', col: '#6d28d9' },
    { bg: '#fff7ed', border: '#fed7aa', col: '#c2410c' },
    { bg: '#fdf4ff', border: '#e9d5ff', col: '#7e22ce' },
    { bg: '#f0fdfa', border: '#99f6e4', col: '#0f766e' },
  ]

  return (
    <div style={{ padding: 24, background: '#f0f4ff', minHeight: '100%' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1e293b' }}>📚 موادي</h1>
        <p style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>إدارة المواد وتصدير الأسئلة</p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>⏳ جاري التحميل...</div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {subjects.map((sub, i) => {
            const c = colors[i % colors.length]
            const isOpen = expanded === sub.id
            const lessonChs = sub.chapters.filter(ch => ch.chapter_type !== 'exam').length
            const examChs   = sub.chapters.filter(ch => ch.chapter_type === 'exam').length

            return (
              <div key={sub.id} style={{ background: 'white', borderRadius: 16, border: `1.5px solid ${c.border}`, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>

                {/* Subject header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px' }}>
                  <div style={{ width: 52, height: 52, borderRadius: 13, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0 }}>
                    {sub.icon || '📚'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 17, fontWeight: 800, color: '#1e293b', marginBottom: 5 }}>{sub.name}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ background: c.bg, color: c.col, fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 20 }}>{sub.chapters.length} فصل</span>
                      {lessonChs > 0 && <span style={{ background: '#f0fdf4', color: '#15803d', fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 20 }}>{lessonChs} شرح</span>}
                      {examChs > 0  && <span style={{ background: '#fff7ed', color: '#c2410c', fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 20 }}>{examChs} اختبار</span>}
                    </div>
                  </div>

                  {/* Manage chapters button */}
                  <button onClick={() => router.push(`/subjects/${sub.id}/chapters`)}
                          style={{ background: '#1d4ed8', color: 'white', border: 'none', padding: '7px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                    ✏️ إدارة الفصول
                  </button>

                  {/* Export buttons */}
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button onClick={() => openExportModal(sub.id, 'unsolved')}
                            style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '7px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                      📄 تصدير أسئلة
                    </button>
                    <button onClick={() => openExportModal(sub.id, 'solved')}
                            style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', padding: '7px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                      ✅ تصدير محلول
                    </button>
                    <button onClick={() => setExpanded(isOpen ? null : sub.id)}
                            style={{ background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', padding: '7px 12px', borderRadius: 10, fontSize: 12, cursor: 'pointer' }}>
                      {isOpen ? '▲' : '▼'} الفصول
                    </button>
                  </div>
                </div>

                {/* Chapters list */}
                {isOpen && (
                  <div style={{ borderTop: `1px solid ${c.border}`, background: c.bg }}>
                    {sub.chapters.map((ch, ci) => (
                      <div key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: ci < sub.chapters.length - 1 ? `1px solid ${c.border}` : 'none' }}>
                        <span style={{ background: ch.chapter_type === 'exam' ? '#fff7ed' : '#eff6ff', color: ch.chapter_type === 'exam' ? '#c2410c' : '#1d4ed8', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, flexShrink: 0 }}>
                          {ch.chapter_type === 'exam' ? 'اختبار' : 'شرح'}
                        </span>
                        <span style={{ flex: 1, fontSize: 13, color: '#374151', fontWeight: 500 }}>{ch.name}</span>
                        <button onClick={() => openExportModal(sub.id, 'unsolved', ch.id)}
                                style={{ background: 'white', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                          📄 أسئلة
                        </button>
                        <button onClick={() => openExportModal(sub.id, 'solved', ch.id)}
                                style={{ background: 'white', color: '#15803d', border: '1px solid #bbf7d0', padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                          ✅ محلول
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {/* Export Modal */}
      {exportModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:20 }}>
          <div style={{ background:'white', borderRadius:20, padding:28, width:'100%', maxWidth:480, boxShadow:'0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <h3 style={{ fontSize:18, fontWeight:800, color:'#1e293b' }}>
                {exportModal.mode === 'solved' ? '✅ تصدير النموذج المحلول' : '📄 تصدير نموذج الأسئلة'}
              </h3>
              <button onClick={() => setExportModal(null)} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'#94a3b8' }}>×</button>
            </div>

            {/* Logo */}
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:13, fontWeight:700, color:'#374151', display:'block', marginBottom:8 }}>شعار اللوجو (اختياري)</label>
              {logoImage ? (
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <img src={logoImage} alt="لوجو" style={{ width:56, height:56, objectFit:'contain', borderRadius:10, border:'1px solid #e2e8f0', background:'#f8fafc', padding:4 }} />
                  <button onClick={() => setLogoImage('')} style={{ background:'#fee2e2', color:'#dc2626', border:'none', padding:'5px 12px', borderRadius:8, cursor:'pointer', fontSize:12, fontWeight:700 }}>حذف</button>
                </div>
              ) : (
                <label style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', border:'2px dashed #e2e8f0', borderRadius:10, cursor:'pointer', background:'#f8fafc', color:'#94a3b8', fontSize:13 }}>
                  <span style={{ fontSize:22 }}>🏷️</span>
                  <span>اضغط لرفع اللوجو</span>
                  <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display:'none' }} />
                </label>
              )}
            </div>

            {/* Teacher name */}
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:13, fontWeight:700, color:'#374151', display:'block', marginBottom:8 }}>اسم المعلم</label>
              <input
                type="text"
                value={teacherName}
                onChange={e => setTeacherName(e.target.value)}
                placeholder="اسم المعلم..."
                style={{ width:'100%', padding:'9px 12px', border:'1px solid #e2e8f0', borderRadius:10, fontSize:13, fontFamily:'inherit', direction:'rtl', outline:'none' }}
              />
            </div>

            {/* Cover image */}
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:13, fontWeight:700, color:'#374151', display:'block', marginBottom:8 }}>صورة الغلاف (اختياري)</label>
              {coverImage ? (
                <div style={{ position:'relative', marginBottom:8 }}>
                  <img src={coverImage} alt="غلاف" style={{ width:'100%', height:140, objectFit:'cover', borderRadius:10, border:'1px solid #e2e8f0' }} />
                  <button onClick={() => setCoverImage('')}
                          style={{ position:'absolute', top:8, left:8, background:'rgba(0,0,0,.6)', color:'white', border:'none', borderRadius:'50%', width:28, height:28, cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
                </div>
              ) : (
                <label style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, padding:20, border:'2px dashed #e2e8f0', borderRadius:10, cursor:'pointer', background:'#f8fafc', color:'#94a3b8', fontSize:13 }}>
                  <span style={{ fontSize:28 }}>🖼️</span>
                  <span>اضغط لرفع صورة الغلاف</span>
                  <input type="file" accept="image/*" onChange={handleCoverUpload} style={{ display:'none' }} />
                </label>
              )}
            </div>

            {/* Orientation */}
            <div style={{ marginBottom:24 }}>
              <label style={{ fontSize:13, fontWeight:700, color:'#374151', display:'block', marginBottom:10 }}>اتجاه الصفحة</label>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                {[
                  { val:'portrait',  label:'بورتريه', icon:'📄', desc:'طولي — A4 عمودي' },
                  { val:'landscape', label:'لاندسكيب', icon:'🗒️', desc:'أفقي — A4 عرضي' },
                ].map(opt => (
                  <button key={opt.val} onClick={() => setOrientation(opt.val as any)}
                          style={{ padding:'14px 12px', borderRadius:12, border:`2px solid ${orientation===opt.val ? '#1d4ed8' : '#e2e8f0'}`, background: orientation===opt.val ? '#eff6ff' : 'white', cursor:'pointer', textAlign:'center' }}>
                    <div style={{ fontSize:24, marginBottom:4 }}>{opt.icon}</div>
                    <div style={{ fontSize:13, fontWeight:700, color: orientation===opt.val ? '#1d4ed8' : '#1e293b' }}>{opt.label}</div>
                    <div style={{ fontSize:11, color:'#94a3b8', marginTop:2 }}>{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={doExport} disabled={exporting}
                      style={{ flex:1, background:'#1d4ed8', color:'white', border:'none', padding:'12px 20px', borderRadius:12, fontSize:14, fontWeight:700, cursor:'pointer' }}>
                {exporting ? '⏳ جاري الفتح...' : '🚀 تصدير PDF'}
              </button>
              <button onClick={() => setExportModal(null)}
                      style={{ background:'#f1f5f9', color:'#475569', border:'none', padding:'12px 20px', borderRadius:12, fontSize:14, fontWeight:600, cursor:'pointer' }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
