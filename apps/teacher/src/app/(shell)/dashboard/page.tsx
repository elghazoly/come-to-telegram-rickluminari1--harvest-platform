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

  const [view,           setView]           = useState<'home'|'subjects'>('home')
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

      const { data: prof } = await supabase
        .from('profiles').select('id, full_name, role').eq('id', user.id).single()
      setProfile(prof)

      // Get subjects
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

      // Load full data
      const built: SubjectFull[] = []
      for (const sid of subjectIds) {
        const { data: sub } = await supabase.from('subjects').select('*').eq('id', sid).single()
        if (!sub) continue

        const { data: chs } = await supabase
          .from('chapters').select('*').eq('subject_id', sid).order('order_num')

        const chapFull: ChapterFull[] = []
        for (const ch of chs || []) {
          const { data: qs } = await supabase
            .from('questions')
            .select('*, options(*), explanations(*)')
            .eq('chapter_id', ch.id)
            .order('order_num')
          chapFull.push({ ...ch, questions: (qs || []) as QuestionFull[] })
        }
        built.push({ ...sub, chapters: chapFull })
      }

      setSubjects(built)

      // Set defaults
      if (built.length > 0) {
        setActiveSubject(built[0].id)
        if (built[0].chapters.length > 0) setActiveChapter(built[0].chapters[0].id)
      }

      // Pre-fill notes
      const notesMap: Record<string, string> = {}
      built.forEach(s => s.chapters.forEach(c => c.questions.forEach(q => {
        notesMap[q.id] = q.explanations?.[0]?.text_note || ''
      })))
      setNotes(notesMap)
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

  if (view === 'home') return (
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
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16 }}>
              {/* المواد */}
              <div onClick={() => setView('subjects')}
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
              <div style={{ background:'white', borderRadius:18, padding:24, cursor:'pointer', border:'1.5px solid #fef08a', boxShadow:'0 2px 12px rgba(202,138,4,.08)', transition:'all .2s' }}
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
            </div>
          </div>

          {/* RIGHT — 3 blocks stacked */}
          <div style={{ width:260, flexShrink:0, padding:'24px 16px', overflowY:'auto' as const, background:'#f8faff', borderRight:'1px solid #e8f0fe' }}>
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

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col" dir="rtl">
      {ToastComponent}
      <div style={{ padding:'8px 16px', background:'white', borderBottom:'1px solid #e2e8f0' }}>
        <button onClick={() => setView('home')}
                style={{ background:'#f1f5f9', border:'none', color:'#475569', padding:'6px 14px', borderRadius:10, fontSize:13, fontWeight:600, cursor:'pointer' }}>
          ← الرئيسية
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-slate-400">⏳ جاري التحميل...</div>
      ) : subjects.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
          <div className="text-6xl mb-4">📚</div>
          <p className="text-slate-500 font-medium">لم يتم تعيينك لأي مادة بعد</p>
          <p className="text-slate-400 text-sm mt-1">تواصل مع الأدمن</p>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">

          {/* ── Chapter sidebar ── */}
          <aside className="w-52 bg-white border-l border-slate-200 flex flex-col flex-shrink-0 overflow-y-auto">
            <div className="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
              الفصول
            </div>
            {(currentSubject?.chapters || []).map(c => (
              <button key={c.id} onClick={() => { setActiveChapter(c.id); setYearFilter('all') }}
                      className={`w-full text-right px-3 py-3 text-sm font-medium border-b border-slate-50 transition-colors ${
                        activeChapter === c.id
                          ? 'bg-blue-700 text-white'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}>
                <span className="ml-1">{c.icon}</span>
                {c.name}
              </button>
            ))}
          </aside>

          {/* ── Main content ── */}
          <main className="flex-1 overflow-y-auto">

            {/* Year filter */}
            {availableYears.length > 0 && (
              <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-2 flex-wrap sticky top-0 z-10">
                <span className="text-xs font-bold text-slate-500 ml-1">السنة:</span>
                {(['all', ...availableYears]).map(y => (
                  <button key={y} onClick={() => setYearFilter(y)}
                          className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                            yearFilter === y
                              ? 'bg-blue-700 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-blue-100'
                          }`}>
                    {y === 'all' ? 'الكل' : y}
                  </button>
                ))}
              </div>
            )}

            {/* Questions */}
            <div className="p-4 space-y-4">
              {currentQuestions.length === 0 ? (
                <div className="text-center py-20 text-slate-400">
                  <div className="text-5xl mb-3">❓</div>
                  <p>لا توجد أسئلة</p>
                </div>
              ) : currentQuestions.map(q => {
                const exp = q.explanations?.[0]
                const isUpl = uploading[q.id]

                return (
                  <div key={q.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                    {/* Question */}
                    <div className="p-4">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="bg-blue-700 text-white text-xs font-bold px-2 py-1 rounded-lg">
                          س {q.num}
                        </span>
                        {q.year && (
                          <span className="bg-yellow-100 text-yellow-800 text-xs font-bold px-2 py-1 rounded-lg">
                            {q.year}
                          </span>
                        )}
                        {exp?.video_url && (
                          <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded-lg">
                            🎬 يوجد شرح
                          </span>
                        )}
                        {exp?.text_note && (
                          <span className="bg-purple-100 text-purple-700 text-xs font-bold px-2 py-1 rounded-lg">
                            ✏️ يوجد ملاحظة
                          </span>
                        )}
                      </div>

                      <p className="text-slate-800 font-medium mb-3 leading-relaxed">{q.text}</p>

                      {q.image_url && (
                        <img src={q.image_url} alt="" className="max-h-48 rounded-xl mb-3 object-contain border border-slate-100"/>
                      )}

                      <div className="grid grid-cols-2 gap-2">
                        {q.options.sort((a,b) => a.order_num-b.order_num).map(o => (
                          <div key={o.id} className={`text-sm px-3 py-2 rounded-xl flex items-center gap-2 ${
                            o.is_correct
                              ? 'bg-green-50 text-green-700 font-semibold border border-green-200'
                              : 'bg-slate-50 text-slate-600'
                          }`}>
                            <span className="font-bold w-5 flex-shrink-0">{o.letter}</span>
                            <span className="flex-1">{o.text}</span>
                            {o.is_correct && <span>✅</span>}
                          </div>
                        ))}
                      </div>

                      {q.ans_text && (
                        <div className="mt-3 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-sm text-blue-800">
                          💡 {q.ans_text}
                        </div>
                      )}
                    </div>

                    {/* Teacher tools */}
                    <div className="border-t border-slate-100 grid grid-cols-2 divide-x divide-x-reverse divide-slate-100 bg-slate-50">

                      {/* Video */}
                      <div className="p-3">
                        <p className="text-xs font-bold text-slate-400 mb-2">🎬 فيديو الشرح</p>
                        {exp?.video_url ? (
                          <div className="relative">
                            <video src={exp.video_url} controls
                                   className="w-full h-32 rounded-xl bg-black"/>
                            <button onClick={() => deleteVideo(q)}
                                    className="absolute top-1 left-1 bg-red-500 text-white rounded-full w-6 h-6 text-xs flex items-center justify-center shadow">
                              ×
                            </button>
                          </div>
                        ) : (
                          <label className={`flex flex-col items-center justify-center h-32 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                            isUpl
                              ? 'border-blue-300 bg-blue-50 opacity-60 pointer-events-none'
                              : 'border-slate-200 hover:border-purple-300 hover:bg-purple-50'
                          }`}>
                            <span className="text-2xl mb-1">{isUpl ? '⏳' : '🎬'}</span>
                            <span className="text-xs text-slate-400">
                              {isUpl ? 'جاري الرفع...' : 'رفع فيديو'}
                            </span>
                            <input type="file" accept="video/*" className="hidden"
                                   onChange={e => e.target.files?.[0] && uploadVideo(q, e.target.files[0])}/>
                          </label>
                        )}
                      </div>

                      {/* Notes */}
                      <div className="p-3">
                        <p className="text-xs font-bold text-slate-400 mb-2">✏️ ملاحظات المعلم</p>
                        <textarea
                          value={notes[q.id] || ''}
                          onChange={e => setNotes(n => ({ ...n, [q.id]: e.target.value }))}
                          rows={4}
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none bg-white"
                          placeholder="أضف شرحاً أو ملاحظة..."/>
                        <button onClick={() => saveNote(q)} disabled={savingNote === q.id}
                                className="mt-1.5 w-full py-1.5 rounded-lg text-white text-xs font-bold disabled:opacity-50"
                                style={{ background: 'linear-gradient(90deg, #0a2d6e, #1a4fa8)' }}>
                          {savingNote === q.id ? '⏳...' : '💾 حفظ'}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </main>
        </div>
      )}
    </div>
  )
}
