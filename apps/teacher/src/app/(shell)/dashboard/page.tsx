'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/Toast'
import type { Subject, Chapter, Question, Option, Explanation } from '@harvest/db'

type QuestionFull = Question & { options: Option[]; explanations: Explanation[] }
type ChapterFull  = Chapter  & { questions: QuestionFull[] }
type SubjectFull  = Subject  & { chapters: ChapterFull[] }

export default function TeacherDashboard() {
  const router = useRouter()
  const { show, ToastComponent } = useToast()

  const [subjects,       setSubjects]       = useState<SubjectFull[]>([])
  const [profile,        setProfile]        = useState<{ full_name: string; role: string; id: string } | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [activeSubject,  setActiveSubject]  = useState<string>('')
  const [activeChapter,  setActiveChapter]  = useState<string>('')
  const [uploading,      setUploading]      = useState<Record<string, boolean>>({})
  const [notes,          setNotes]          = useState<Record<string, string>>({})
  const [savingNote,     setSavingNote]     = useState<string | null>(null)
  const [yearFilter,     setYearFilter]     = useState<string>('all')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      // Load profile + subjects in parallel
      const [{ data: prof }, subjectsResult] = await Promise.all([
        supabase.from('profiles').select('id, full_name, role').eq('id', user.id).single(),
        supabase.auth.getUser(),
      ])
      setProfile(prof)

      // Get subject IDs
      let subjectIds: string[] = []
      if (prof?.role === 'admin') {
        const { data } = await supabase.from('subjects').select('id').order('order_num')
        subjectIds = data?.map((s: any) => s.id) || []
      } else {
        const { data } = await supabase
          .from('teacher_subjects').select('subject_id').eq('teacher_id', user.id)
        subjectIds = data?.map((ts: any) => ts.subject_id) || []
      }

      if (!subjectIds.length) { setLoading(false); return }

      // Load only subject names/icons for dashboard display — no chapters/questions
      const { data: subs } = await supabase
        .from('subjects').select('id, name, icon').in('id', subjectIds).order('order_num')

      setSubjects((subs || []).map((s: any) => ({ ...s, chapters: [] })) as SubjectFull[])
      setLoading(false)
    }
    load()
  }, [])

  // When subject changes, reset chapter
  function switchSubject(sid: string) {
    setActiveSubject(sid)
    setYearFilter('all')
    const sub = subjects.find(s => s.id === sid)
    if (sub?.chapters.length) setActiveChapter(sub.chapters[0].id)
    else setActiveChapter('')
  }

  // Current data
  const currentSubject = subjects.find(s => s.id === activeSubject)
  const currentChapter = currentSubject?.chapters.find(c => c.id === activeChapter)
  const currentQuestions = (currentChapter?.questions || []).filter(q =>
    yearFilter === 'all' || String(q.year) === yearFilter
  )

  // Years available in current chapter
  const availableYears = [...new Set(
    (currentChapter?.questions || []).filter(q => q.year).map(q => String(q.year))
  )].sort((a, b) => parseInt(b) - parseInt(a))

  async function uploadVideo(q: QuestionFull, file: File) {
    setUploading(u => ({ ...u, [q.id]: true }))
    show('جاري رفع الفيديو...', 'loading')
    const ext  = file.name.split('.').pop() || 'mp4'
    const path = `videos/${activeChapter}/${q.id}.${ext}`
    const fd   = new FormData()
    fd.append('file', file); fd.append('path', path)
    const r = await fetch('/api/upload', { method: 'POST', body: fd })
    const d = await r.json()
    if (d.url) {
      const ex = q.explanations?.[0]
      if (ex) {
        await supabase.from('explanations')
          .update({ video_url: d.url, video_cf_key: path, video_uploaded_at: new Date().toISOString() })
          .eq('id', ex.id)
      } else {
        await supabase.from('explanations')
          .insert({ question_id: q.id, video_url: d.url, video_cf_key: path, video_uploaded_at: new Date().toISOString() })
      }
      show('✅ تم رفع الفيديو', 'success')
      // Refresh just this chapter
      const { data: qs } = await supabase
        .from('questions').select('*, options(*), explanations(*)')
        .eq('chapter_id', activeChapter).order('order_num')
      setSubjects(prev => prev.map(s => ({
        ...s, chapters: s.chapters.map(c =>
          c.id === activeChapter ? { ...c, questions: (qs || []) as QuestionFull[] } : c
        )
      })))
    } else { show('فشل رفع الفيديو', 'error') }
    setUploading(u => ({ ...u, [q.id]: false }))
  }

  async function deleteVideo(q: QuestionFull) {
    if (!confirm('حذف فيديو الشرح؟')) return
    const exp = q.explanations?.[0]
    if (exp?.video_cf_key) {
      await fetch('/api/upload', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: exp.video_cf_key })
      })
    }
    if (exp) await supabase.from('explanations')
      .update({ video_url: null, video_cf_key: null }).eq('id', exp.id)
    show('تم حذف الفيديو', 'success')
    const { data: qs } = await supabase
      .from('questions').select('*, options(*), explanations(*)')
      .eq('chapter_id', activeChapter).order('order_num')
    setSubjects(prev => prev.map(s => ({
      ...s, chapters: s.chapters.map(c =>
        c.id === activeChapter ? { ...c, questions: (qs || []) as QuestionFull[] } : c
      )
    })))
  }

  async function saveNote(q: QuestionFull) {
    setSavingNote(q.id)
    const note = notes[q.id] || ''
    const ex = q.explanations?.[0]
    if (ex) {
      await supabase.from('explanations').update({ text_note: note }).eq('id', ex.id)
    } else {
      await supabase.from('explanations').insert({ question_id: q.id, text_note: note })
    }
    show('✅ تم حفظ الملاحظة', 'success')
    setSavingNote(null)
  }

  async function handleSignOut() {
    await supabase.auth.signOut(); router.push('/login')
  }

  const LOGO = 'https://www.harvste.com/cdn/shop/files/harv_logo.jpg?v=1775984331&width=195'

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', background:'#f0f4ff', direction:'rtl' }}>
      {ToastComponent}
      {loading ? (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#94a3b8' }}>⏳ جاري التحميل...</div>
      ) : (
        <div style={{ display:'flex', flex:1, overflow:'hidden', minHeight:0 }}>

          {/* CENTER — 3 blocks */}
          <div style={{ flex:1, padding:24, overflowY:'auto' as const }}>
            <div style={{ marginBottom:20 }}>
              <h2 style={{ fontSize:22, fontWeight:800, color:'#1e293b' }}>مرحباً، {profile?.full_name} 👋</h2>
              <p style={{ color:'#64748b', fontSize:13, marginTop:4 }}>لوحة تحكم المعلم</p>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))', gap:16 }}>
              {/* المواد */}
              <div onClick={() => window.location.href='/subjects'}
                   style={{ background:'white', borderRadius:18, padding:24, cursor:'pointer', border:'1.5px solid #bfdbfe', boxShadow:'0 2px 12px rgba(29,78,216,.08)', transition:'all .2s' }}
                   onMouseEnter={e => (e.currentTarget.style.transform='translateY(-3px)')}
                   onMouseLeave={e => (e.currentTarget.style.transform='translateY(0)')}>
                <div style={{ width:48, height:48, borderRadius:14, background:'#eff6ff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, marginBottom:14 }}>📚</div>
                <div style={{ fontSize:17, fontWeight:800, color:'#1e293b', marginBottom:6 }}>موادي</div>
                <div style={{ fontSize:12, color:'#64748b', lineHeight:1.5 }}>إدارة المواد وفصول الشرح والاختبارات</div>
                <div style={{ marginTop:16, display:'flex', gap:8, flexWrap:'wrap' as const }}>
                  {subjects.map(s => (
                    <span key={s.id} style={{ background:'#eff6ff', color:'#1d4ed8', fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:20 }}>{s.icon} {s.name}</span>
                  ))}
                </div>
                <div style={{ marginTop:14, color:'#1d4ed8', fontSize:13, fontWeight:600 }}>إدارة المواد ←</div>
              </div>

              {/* طلابي */}
              <div onClick={() => window.location.href='/students'} style={{ background:'white', borderRadius:18, padding:24, cursor:'pointer', border:'1.5px solid #fef08a', boxShadow:'0 2px 12px rgba(202,138,4,.08)', transition:'all .2s' }}
                   onMouseEnter={e => (e.currentTarget.style.transform='translateY(-3px)')}
                   onMouseLeave={e => (e.currentTarget.style.transform='translateY(0)')}>
                <div style={{ width:48, height:48, borderRadius:14, background:'#fefce8', display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, marginBottom:14 }}>👥</div>
                <div style={{ fontSize:17, fontWeight:800, color:'#1e293b', marginBottom:6 }}>طلابي</div>
                <div style={{ fontSize:12, color:'#64748b', lineHeight:1.5 }}>متابعة تقدم الطلاب وأدائهم في المواد</div>
                <div style={{ marginTop:14, color:'#ca8a04', fontSize:13, fontWeight:600 }}>عرض الطلاب ←</div>
              </div>

              {/* رصيدي */}
              <div style={{ background:'white', borderRadius:18, padding:24, cursor:'pointer', border:'1.5px solid #fecaca', boxShadow:'0 2px 12px rgba(220,38,38,.08)', transition:'all .2s' }}
                   onMouseEnter={e => (e.currentTarget.style.transform='translateY(-3px)')}
                   onMouseLeave={e => (e.currentTarget.style.transform='translateY(0)')}>
                <div style={{ width:48, height:48, borderRadius:14, background:'#fef2f2', display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, marginBottom:14 }}>💰</div>
                <div style={{ fontSize:17, fontWeight:800, color:'#1e293b', marginBottom:6 }}>رصيدي</div>
                <div style={{ fontSize:12, color:'#64748b', lineHeight:1.5 }}>عرض الأرباح والمدفوعات المستحقة</div>
                <div style={{ marginTop:14, color:'#dc2626', fontSize:13, fontWeight:600 }}>عرض الرصيد ←</div>
              </div>

              {/* الميديا */}
              <div onClick={() => window.location.href='/media'}
                   style={{ background:'white', borderRadius:18, padding:24, cursor:'pointer', border:'1.5px solid #d1fae5', boxShadow:'0 2px 12px rgba(5,150,105,.08)', transition:'all .2s' }}
                   onMouseEnter={e => (e.currentTarget.style.transform='translateY(-3px)')}
                   onMouseLeave={e => (e.currentTarget.style.transform='translateY(0)')}>
                <div style={{ width:48, height:48, borderRadius:14, background:'#ecfdf5', display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, marginBottom:14 }}>🎬</div>
                <div style={{ fontSize:17, fontWeight:800, color:'#1e293b', marginBottom:6 }}>الميديا</div>
                <div style={{ fontSize:12, color:'#64748b', lineHeight:1.5 }}>رفع وإدارة فيديوهات الشرح والملفات</div>
                <div style={{ marginTop:14, color:'#059669', fontSize:13, fontWeight:600 }}>إدارة الميديا ←</div>
              </div>
            </div>
          </div>

          {/* RIGHT — 3 blocks stacked */}
          <div style={{ width:'min(260px, 100%)', flexShrink:0, padding:'24px 16px', overflowY:'auto' as const, background:'#f8faff', borderRight:'1px solid #e8f0fe' }}>
            {[
              { icon:'📅', title:'أنشئ جدول مذاكرة لطلابك', desc:'خطة دراسية أسبوعية مخصصة', color:'#1d4ed8', bg:'#eff6ff', border:'#bfdbfe' },
              { icon:'🎥', title:'جدول الحصص المباشرة', desc:'المواعيد المتاحة للحصص الخاصة', color:'#15803d', bg:'#f0fdf4', border:'#bbf7d0' },
              { icon:'🏅', title:'شهادات التقدير', desc:'منح الطلاب شهادات التميز', color:'#7c3aed', bg:'#f5f3ff', border:'#ddd6fe' },
            ].map((item, i) => (
              <div key={i} style={{ background:'white', borderRadius:16, padding:18, marginBottom:14, cursor:'pointer', border:'1.5px solid ' + item.border, transition:'all .2s' }}
                   onMouseEnter={e => (e.currentTarget.style.transform='translateY(-2px)')}
                   onMouseLeave={e => (e.currentTarget.style.transform='translateY(0)')}>
                <div style={{ fontSize:28, marginBottom:10 }}>{item.icon}</div>
                <div style={{ fontSize:14, fontWeight:700, color:'#1e293b', lineHeight:1.4, marginBottom:6 }}>{item.title}</div>
                <div style={{ fontSize:11, color:'#94a3b8', lineHeight:1.5 }}>{item.desc}</div>
                <div style={{ marginTop:10, fontSize:12, fontWeight:600, color:item.color }}>ابدأ الآن ←</div>
              </div>
            ))}
          </div>

        </div>
      )}
    </div>
  )

}