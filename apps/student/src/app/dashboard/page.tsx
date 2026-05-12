'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'

type Option      = { id: string; letter: string; text: string; is_correct: boolean; order_num: number }
type Explanation = { id: string; video_url: string | null; text_note: string | null }
type Question    = { id: string; num: number; text: string; year: number | null; image_url: string | null; ans_text: string | null; order_num: number; options: Option[]; explanations: Explanation[] }
type Chapter     = { id: string; name: string; icon: string | null; order_num: number; questions: Question[]; chapter_type?: string; timer_enabled?: boolean; timer_duration?: number }
type Subject     = { id: string; name: string; icon: string | null; chapters: Chapter[] }
type ChatMsg     = { role: 'user' | 'assistant'; content: string }
type Settings    = { CONTACT_EMAIL?: string; CONTACT_WHATSAPP?: string; CONTACT_WEBSITE?: string; PLATFORM_NAME?: string; LOGO_URL?: string }

const LOGO = 'https://www.harvste.com/cdn/shop/files/harv_logo.jpg?v=1775984331&width=195'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function ExamTimer({ seconds, onEnd }: { seconds: number; onEnd: () => void }) {
  const [left, setLeft] = useState(seconds)
  useEffect(() => {
    const t = setInterval(() => setLeft(l => { if (l <= 1) { clearInterval(t); onEnd(); return 0 } return l - 1 }), 1000)
    return () => clearInterval(t)
  }, [])
  const pct = left / seconds * 100
  const col = pct > 50 ? '#16a34a' : pct > 20 ? '#d97706' : '#dc2626'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 120, height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: col, transition: 'width 1s' }} />
      </div>
      <span style={{ fontWeight: 900, color: col, fontVariantNumeric: 'tabular-nums' }}>
        {String(Math.floor(left / 60)).padStart(2, '0')}:{String(left % 60).padStart(2, '0')}
      </span>
    </div>
  )
}

export default function StudentDashboard() {
  const router = useRouter()
  const [subjects,      setSubjects]      = useState<Subject[]>([])
  const [profile,       setProfile]       = useState<{ full_name: string } | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [settings,      setSettings]      = useState<Settings>({})
  const [activeSubject, setActiveSubject] = useState('')
  const [activeChapter, setActiveChapter] = useState('')
  const [yearFilter,    setYearFilter]    = useState('all')
  const [answers,       setAnswers]       = useState<Record<string, { optionId: string; correct: boolean }>>({})
  const [openVideo,     setOpenVideo]     = useState<Record<string, boolean>>({})
  const [openAns,       setOpenAns]       = useState<Record<string, boolean>>({})
  const [hints,         setHints]         = useState<Record<string, string>>({})
  const [hintLoad,      setHintLoad]      = useState('')
  const [aiOpen,        setAiOpen]        = useState('')
  const [aiChats,       setAiChats]       = useState<Record<string, ChatMsg[]>>({})
  const [aiInput,       setAiInput]       = useState('')
  const [aiLoad,        setAiLoad]        = useState(false)
  const [contact,       setContact]       = useState(false)
  const [examStarted,   setExamStarted]   = useState(false)
  const [examTime,      setExamTime]      = useState<number | null>(null)
  const [showResults,   setShowResults]   = useState(false)
  const aiRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(setSettings).catch(() => {})
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      const { data: prof } = await supabase.from('profiles').select('id,full_name,role').eq('id', user.id).single()
      setProfile(prof)
      let ids: string[] = []
      if (prof?.role === 'admin' || prof?.role === 'teacher') {
        const { data } = await supabase.from('subjects').select('id').order('order_num')
        ids = data?.map((s: any) => s.id) || []
      } else {
        const { data } = await supabase.from('enrollments').select('subject_id').eq('student_id', user.id)
        ids = data?.map((e: any) => e.subject_id) || []
      }
      if (!ids.length) { setLoading(false); return }
      const { data: ans } = await supabase.from('student_answers').select('question_id,option_id,is_correct').eq('student_id', user.id)
      const amap: Record<string, { optionId: string; correct: boolean }> = {}
      ans?.forEach((a: any) => { amap[a.question_id] = { optionId: a.option_id, correct: a.is_correct } })
      setAnswers(amap)
      const built: Subject[] = []
      for (const sid of ids) {
        const { data: sub } = await supabase.from('subjects').select('*').eq('id', sid).single()
        if (!sub) continue
        const { data: chs } = await supabase.from('chapters').select('*').eq('subject_id', sid).order('order_num')
        const chapFull: Chapter[] = []
        for (const ch of chs || []) {
          const { data: qs } = await supabase.from('questions').select('*,options(*),explanations(*)').eq('chapter_id', ch.id).order('order_num')
          chapFull.push({ ...ch, questions: qs as Question[] || [] })
        }
        built.push({ ...sub, chapters: chapFull })
      }
      setSubjects(built)
      if (built[0]) { setActiveSubject(built[0].id); if (built[0].chapters[0]) setActiveChapter(built[0].chapters[0].id) }
      setLoading(false)
    })
  }, [])

  useEffect(() => { aiRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [aiChats, aiOpen])

  async function answer(q: Question, opt: Option) {
    if (answers[q.id]) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const next = { ...answers, [q.id]: { optionId: opt.id, correct: opt.is_correct } }
    setAnswers(next)
    await supabase.from('student_answers').upsert({ student_id: user.id, question_id: q.id, option_id: opt.id, is_correct: opt.is_correct, answered_at: new Date().toISOString() })
    const ch = sub?.chapters.find(c => c.id === activeChapter)
    await supabase.from('student_progress').upsert({ student_id: user.id, chapter_id: activeChapter, total_q: ch?.questions.length || 0, correct_q: Object.entries(next).filter(([qid, v]) => ch?.questions.some(q2 => q2.id === qid) && v.correct).length, last_activity: new Date().toISOString() })
    if (aiOpen === q.id) {
      const correct = q.options.find(o => o.is_correct)
      const msg = opt.is_correct ? `أجبت صح! الإجابة ${correct?.letter}: ${correct?.text}. لماذا هي الصحيحة؟` : `اخترت خطأ. الصحيحة ${correct?.letter}: ${correct?.text}. اشرح الفرق.`
      const hist = aiChats[q.id] || []
      setAiChats(p => ({ ...p, [q.id]: [...hist, { role: 'user', content: msg }] }))
      callAI(q, msg, hist)
    }
  }

  async function getHint(q: Question) {
    if (hints[q.id] || hintLoad) return
    setHintLoad(q.id)
    const r = await fetch('/api/ai-assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q.text, options: q.options, ans_text: q.ans_text, user_message: 'تلميح واحد مختصر بدون ذكر الإجابة.', history: [] }) })
    const d = await r.json()
    setHints(h => ({ ...h, [q.id]: d.reply }))
    setHintLoad('')
  }

  async function callAI(q: Question, msg: string, hist: ChatMsg[]) {
    setAiLoad(true)
    const r = await fetch('/api/ai-assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q.text, options: q.options, ans_text: q.ans_text, user_message: msg, history: hist }) })
    const d = await r.json()
    setAiChats(p => ({ ...p, [q.id]: [...(p[q.id] || []), { role: 'assistant', content: d.reply }] }))
    setAiLoad(false)
  }

  async function sendAI(q: Question) {
    if (!aiInput.trim() || aiLoad) return
    const msg = aiInput; setAiInput('')
    const hist = aiChats[q.id] || []
    setAiChats(p => ({ ...p, [q.id]: [...hist, { role: 'user', content: msg }] }))
    callAI(q, msg, hist)
  }

  const sub  = subjects.find(s => s.id === activeSubject)
  const ch   = sub?.chapters.find(c => c.id === activeChapter)
  const allQ = ch?.questions || []
  const qs   = allQ.filter(q => yearFilter === 'all' || String(q.year) === yearFilter)
  const years = [...new Set(allQ.filter(q => q.year).map(q => String(q.year)))].sort((a, b) => +b - +a)
  const answered = qs.filter(q => answers[q.id]).length
  const correct  = qs.filter(q => answers[q.id]?.correct).length
  const pct      = qs.length ? Math.round(answered / qs.length * 100) : 0
  const isExam   = ch?.chapter_type === 'exam'
  const hasTimer = isExam && ch?.timer_enabled
  const logo     = settings.LOGO_URL || LOGO

  const level = (() => {
    if (answered < 3) return { t: 'جاري التقييم', c: '#64748b' }
    const p = correct / answered
    if (p >= 0.9) return { t: 'ممتاز 🌟', c: '#16a34a' }
    if (p >= 0.7) return { t: 'جيد جداً ⭐', c: '#1a4fa8' }
    if (p >= 0.5) return { t: 'جيد 📈', c: '#d97706' }
    return { t: 'يحتاج مراجعة 📚', c: '#dc2626' }
  })()

  // ── Styles ──────────────────────────────────────────────────────────────────
  const S = {
    page:       { height: '100vh', display: 'flex', flexDirection: 'column' as const, background: '#f1f5f9', direction: 'rtl' as const, fontFamily: 'system-ui, sans-serif' },
    header:     { flexShrink: 0, background: 'linear-gradient(135deg,#071d4a,#0a2d6e,#1a4fa8)', boxShadow: '0 4px 20px rgba(0,0,0,.3)' },
    headerTop:  { display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,.1)' },
    tabs:       { display: 'flex', gap: 2, padding: '8px 20px 0', overflowX: 'auto' as const },
    tab:        (active: boolean) => ({ padding: '8px 20px', fontWeight: 700, fontSize: 14, borderRadius: '12px 12px 0 0', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' as const, background: active ? 'white' : 'transparent', color: active ? '#1e3a8a' : 'rgba(255,255,255,.7)' }),
    body:       { display: 'flex', flex: 1, overflow: 'hidden' as const, minHeight: 0 },
    sidebar:    { width: 208, background: 'white', borderLeft: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' as const, overflowY: 'auto' as const, flexShrink: 0 },
    sideItem:   (active: boolean) => ({ display: 'block', width: '100%', textAlign: 'right' as const, padding: '12px', borderBottom: '1px solid #f8fafc', background: active ? '#1d4ed8' : 'white', color: active ? 'white' : '#374151', cursor: 'pointer', border: 'none' }),
    main:       { flex: 1, overflowY: 'auto' as const, minWidth: 0 },
    stickyBar:  { position: 'sticky' as const, top: 0, background: 'white', borderBottom: '1px solid #e2e8f0', padding: '10px 16px', zIndex: 10 },
    card:       { background: 'white', borderRadius: 16, boxShadow: '0 1px 4px rgba(0,0,0,.08)', border: '1px solid #f1f5f9', marginBottom: 20, overflow: 'hidden' },
    cardInner:  { display: 'flex', flexDirection: 'row' as const },
    qCol:       { flex: 1, minWidth: 0 },
    vCol:       { width: 300, flexShrink: 0, borderLeft: '1px solid #a7f3d0', background: '#ecfdf5', display: 'flex', flexDirection: 'column' as const },
    vHeader:    { background: '#059669', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 },
    vPlay:      { flex: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16, cursor: 'pointer', border: 'none', background: 'transparent' },
    playBtn:    { width: 56, height: 56, borderRadius: '50%', background: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(5,150,105,.3)' },
    optBase:    { display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 16px', borderRadius: 12, border: '2px solid', cursor: 'pointer', textAlign: 'right' as const, marginBottom: 8 },
    btnSmall:   (col: string, bg: string, border: string) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 10, border: `1px solid ${border}`, background: bg, color: col, fontSize: 12, fontWeight: 600, cursor: 'pointer', marginLeft: 8 }),
    panel:      (bg: string, border: string) => ({ borderTop: `1px solid ${border}`, background: bg, padding: '12px 20px' }),
  }

  return (
    <div style={S.page}>

      {/* HEADER */}
      <header style={S.header}>
        <div style={S.headerTop}>
          {/* Right: name */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 900, color: 'white', fontSize: 18 }}>منصة هارفست</div>
            <div style={{ color: 'rgba(147,197,253,1)', fontSize: 12 }}>التعليمية</div>
          </div>
          {/* Center: logo */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <img src={logo} alt="هارفست" style={{ height: 52, objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          </div>
          {/* Left: actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            {answered >= 3 && <span style={{ background: 'rgba(255,255,255,.1)', color: 'white', padding: '6px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>{level.t}</span>}
            <button onClick={() => setShowResults(r => !r)} style={{ background: 'rgba(255,255,255,.1)', color: 'white', padding: '6px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>📊 نتائجي</button>
            <button onClick={() => setContact(true)} style={{ background: 'rgba(255,255,255,.1)', color: 'white', padding: '6px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>💬 تواصل</button>
            <button onClick={async () => { await supabase.auth.signOut(); router.push('/login') }} style={{ background: 'rgba(239,68,68,.2)', color: 'white', padding: '6px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>خروج</button>
          </div>
        </div>
        {/* Subject tabs */}
        <div style={S.tabs}>
          {subjects.map(s => (
            <button key={s.id} style={S.tab(activeSubject === s.id)} onClick={() => { setActiveSubject(s.id); setYearFilter('all'); setExamStarted(false); const first = subjects.find(x => x.id === s.id)?.chapters[0]; if (first) setActiveChapter(first.id) }}>
              {s.icon} {s.name}
            </button>
          ))}
        </div>
      </header>

      {/* BODY */}
      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <img src={logo} style={{ height: 60, opacity: .4, display: 'block', margin: '0 auto 12px' }} />
            <div style={{ color: '#94a3b8' }}>⏳ جاري التحميل...</div>
          </div>
        </div>
      ) : subjects.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
          <img src={logo} style={{ height: 70, opacity: .5 }} />
          <p style={{ color: '#64748b', fontWeight: 600 }}>لم يتم تسجيلك في أي مادة بعد</p>
          <button onClick={() => setContact(true)} style={{ background: '#1d4ed8', color: 'white', padding: '10px 24px', borderRadius: 12, border: 'none', cursor: 'pointer', fontWeight: 700 }}>💬 تواصل مع الإدارة</button>
        </div>
      ) : (
        <div style={S.body}>

          {/* SIDEBAR */}
          <div style={S.sidebar}>
            <div style={{ padding: '10px 12px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1 }}>الفصول</div>
            {(sub?.chapters || []).map(c => {
              const cA = c.questions.filter(q => answers[q.id]).length
              const cC = c.questions.filter(q => answers[q.id]?.correct).length
              const cP = c.questions.length ? Math.round(cA / c.questions.length * 100) : 0
              const isA = activeChapter === c.id
              return (
                <button key={c.id} style={S.sideItem(isA)} onClick={() => { setActiveChapter(c.id); setYearFilter('all'); setExamStarted(false); setExamTime(null) }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{c.icon} {c.name}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
                    {c.chapter_type === 'exam' && <span style={{ fontSize: 10, fontWeight: 700, background: isA ? 'rgba(255,255,255,.2)' : '#fff7ed', color: isA ? 'white' : '#c2410c', padding: '2px 6px', borderRadius: 4 }}>📝 اختبار</span>}
                    <span style={{ fontSize: 11, color: isA ? 'rgba(255,255,255,.7)' : '#9ca3af' }}>{cA}/{c.questions.length} • {cP}%</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: isA ? 'rgba(255,255,255,.2)' : '#f1f5f9', marginTop: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${cP}%`, background: isA ? 'white' : cP >= 70 ? '#16a34a' : '#1d4ed8', borderRadius: 2, transition: 'width .5s' }} />
                  </div>
                </button>
              )
            })}
          </div>

          {/* MAIN */}
          <div style={S.main}>

            {/* Results */}
            {showResults && (
              <div style={{ background: 'white', borderBottom: '2px solid #dbeafe', padding: '20px 24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                  <span style={{ fontWeight: 700, fontSize: 18 }}>📊 نتائجك</span>
                  <button onClick={() => setShowResults(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>×</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
                  {[['📝','أجبت',answered,'#0a2d6e'],['✅','صحيح',correct,'#16a34a'],['❌','خطأ',answered-correct,'#dc2626'],['🎯','النسبة',`${answered ? Math.round(correct/answered*100) : 0}%`,level.c]].map(([ic,lb,vl,cl]) => (
                    <div key={String(lb)} style={{ textAlign: 'center', background: '#f8fafc', borderRadius: 12, padding: 12 }}>
                      <div style={{ fontSize: 24 }}>{ic}</div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: String(cl) }}>{vl}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>{lb}</div>
                    </div>
                  ))}
                </div>
                <div style={{ background: '#eff6ff', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 24 }}>🏆</span>
                  <span style={{ fontWeight: 700 }}>مستواك: <span style={{ color: level.c }}>{level.t}</span></span>
                </div>
              </div>
            )}

            {/* Progress + year filter */}
            <div style={S.stickyBar}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <div style={{ flex: 1, height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: pct >= 70 ? '#16a34a' : '#1d4ed8', transition: 'width .7s', borderRadius: 4 }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>{answered}/{qs.length} ({correct}✅)</span>
              </div>
              {years.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                  {['all', ...years].map(y => (
                    <button key={y} onClick={() => setYearFilter(y)} style={{ padding: '2px 12px', borderRadius: 20, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: yearFilter === y ? '#1d4ed8' : '#f1f5f9', color: yearFilter === y ? 'white' : '#475569' }}>
                      {y === 'all' ? 'الكل' : y}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Exam start screen */}
            {hasTimer && !examStarted && (
              <div style={{ background: '#fff7ed', borderBottom: '2px solid #fed7aa', padding: '40px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📝</div>
                <div style={{ fontWeight: 900, fontSize: 22, color: '#9a3412', marginBottom: 8 }}>{ch!.name}</div>
                <div style={{ color: '#c2410c', fontSize: 14, marginBottom: 6 }}>مدة الاختبار: <strong>{Math.round((ch!.timer_duration || 1800) / 60)} دقيقة</strong></div>
                <div style={{ color: '#c2410c', fontSize: 14, marginBottom: 24 }}>عدد الأسئلة: <strong>{qs.length}</strong></div>
                <button onClick={() => { setExamStarted(true); setExamTime(ch!.timer_duration || 1800) }} style={{ background: '#ea580c', color: 'white', border: 'none', borderRadius: 12, padding: '12px 32px', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
                  🚀 ابدأ الاختبار
                </button>
              </div>
            )}

            {/* Exam running timer */}
            {hasTimer && examStarted && examTime !== null && (
              <div style={{ background: 'white', borderBottom: '2px solid #fed7aa', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 52, zIndex: 9 }}>
                <span style={{ fontWeight: 700, color: '#374151' }}>📝 {ch!.name}</span>
                <ExamTimer key={activeChapter} seconds={examTime} onEnd={() => setExamStarted(false)} />
              </div>
            )}

            {/* Questions */}
            {(!hasTimer || examStarted) && (
              <div style={{ padding: 16 }}>
                {qs.map(q => {
                  const exp     = q.explanations?.[0]
                  const hasVid  = !!exp?.video_url
                  const ans     = answers[q.id]
                  const isAns   = !!ans
                  const hint    = hints[q.id]
                  const isAiOp  = aiOpen === q.id
                  const chat    = aiChats[q.id] || []
                  const needImg = q.image_url === '__NEEDS_IMAGE__'

                  return (
                    <div key={q.id} style={S.card}>
                      <div style={S.cardInner}>

                        {/* Question column */}
                        <div style={S.qCol}>
                          <div style={{ padding: 20 }}>
                            {/* Badges */}
                            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' as const }}>
                              <span style={{ background: '#1d4ed8', color: 'white', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6 }}>س {q.num}</span>
                              {q.year && <span style={{ background: '#fef3c7', color: '#92400e', fontSize: 11, fontWeight: 700, padding: '4px 8px', borderRadius: 6 }}>{q.year}</span>}
                              {isAns && <span style={{ background: ans.correct ? '#dcfce7' : '#fee2e2', color: ans.correct ? '#166534' : '#991b1b', fontSize: 11, fontWeight: 700, padding: '4px 8px', borderRadius: 6 }}>{ans.correct ? '✅ صحيح' : '❌ خطأ'}</span>}
                            </div>

                            {/* Question text */}
                            <p style={{ color: '#1e293b', fontWeight: 500, lineHeight: 1.7, marginBottom: 16, fontSize: 15 }}>{q.text}</p>

                            {/* Image */}
                            {q.image_url && !needImg && <img src={q.image_url} alt="" style={{ maxHeight: 200, borderRadius: 12, marginBottom: 16, border: '1px solid #f1f5f9' }} />}
                            {needImg && <div style={{ background: '#f8fafc', border: '2px dashed #e2e8f0', borderRadius: 12, padding: 16, marginBottom: 16, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>🖼️ صورة قيد الإضافة</div>}

                            {/* Options */}
                            <div style={{ marginBottom: 16 }}>
                              {q.options.sort((a, b) => a.order_num - b.order_num).map(opt => {
                                const isSel = ans?.optionId === opt.id
                                let bg = '#f8fafc', border = '#e2e8f0', color = '#374151'
                                if (isAns) {
                                  if (opt.is_correct)     { bg = '#f0fdf4'; border = '#4ade80'; color = '#166534' }
                                  else if (isSel)          { bg = '#fef2f2'; border = '#f87171'; color = '#991b1b' }
                                  else                     { bg = '#f8fafc'; border = '#f1f5f9'; color = '#9ca3af' }
                                }
                                return (
                                  <button key={opt.id} onClick={() => answer(q, opt)} disabled={isAns}
                                          style={{ ...S.optBase, background: bg, borderColor: border, color, opacity: isAns && !opt.is_correct && !isSel ? .5 : 1 }}>
                                    <span style={{ fontWeight: 700, minWidth: 20, fontSize: 13 }}>{opt.letter}</span>
                                    <span style={{ flex: 1, fontSize: 14 }}>{opt.text}</span>
                                    {isAns && opt.is_correct && <span>✅</span>}
                                    {isAns && isSel && !opt.is_correct && <span>❌</span>}
                                  </button>
                                )
                              })}
                            </div>

                            {/* Action buttons */}
                            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
                              <button onClick={() => getHint(q)} disabled={!!hintLoad} style={S.btnSmall('#b45309', '#fffbeb', '#fde68a')}>
                                {hintLoad === q.id ? '⏳' : '💡'} تلميح ذكي
                              </button>
                              <button onClick={() => setOpenAns(a => ({ ...a, [q.id]: !a[q.id] }))} style={S.btnSmall('#1e40af', '#eff6ff', '#bfdbfe')}>
                                🔍 {openAns[q.id] ? 'إخفاء' : 'عرض الإجابة'}
                              </button>
                              <button onClick={() => setAiOpen(aiOpen === q.id ? '' : q.id)} style={S.btnSmall('#6d28d9', '#f5f3ff', '#ddd6fe')}>
                                🤖 المساعد الذكي
                              </button>
                            </div>
                          </div>

                          {/* Hint */}
                          {hint && (
                            <div style={S.panel('#fffbeb', '#fde68a')}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>💡 تلميح ذكي:</div>
                              <div style={{ fontSize: 13, color: '#78350f', lineHeight: 1.6 }}>{hint}</div>
                            </div>
                          )}

                          {/* Answer */}
                          {openAns[q.id] && (
                            <div style={S.panel('#eff6ff', '#bfdbfe')}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#1e40af', marginBottom: 6 }}>🔍 الإجابة الصحيحة:</div>
                              {q.options.filter(o => o.is_correct).map(o => (
                                <div key={o.id} style={{ fontWeight: 700, color: '#1e3a8a', fontSize: 14 }}>{o.letter} — {o.text}</div>
                              ))}
                              {q.ans_text && <div style={{ fontSize: 12, color: '#3b82f6', marginTop: 6 }}>{q.ans_text}</div>}
                            </div>
                          )}

                          {/* AI */}
                          {isAiOp && (
                            <div style={{ borderTop: '1px solid #ede9fe' }}>
                              <div style={{ background: 'linear-gradient(90deg,#7c3aed,#6d28d9)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span>🤖</span>
                                <span style={{ color: 'white', fontWeight: 700, fontSize: 13 }}>المساعد الذكي</span>
                              </div>
                              <div style={{ background: '#faf5ff', padding: 12, maxHeight: 200, overflowY: 'auto' as const }}>
                                {chat.length === 0 && <div style={{ color: '#a78bfa', fontSize: 12, textAlign: 'center', padding: 12 }}>اختر إجابة وسيشرح تلقائياً، أو اسأل مباشرة...</div>}
                                {chat.map((m, i) => (
                                  <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
                                    <div style={{ maxWidth: '85%', padding: '8px 12px', borderRadius: 16, fontSize: 12, lineHeight: 1.5, background: m.role === 'user' ? '#7c3aed' : 'white', color: m.role === 'user' ? 'white' : '#374151', boxShadow: '0 1px 3px rgba(0,0,0,.1)' }}>
                                      {m.content}
                                    </div>
                                  </div>
                                ))}
                                {aiLoad && <div style={{ color: '#a78bfa', fontSize: 12 }}>⏳ يفكر...</div>}
                                <div ref={aiRef} />
                              </div>
                              <div style={{ background: '#faf5ff', borderTop: '1px solid #ede9fe', padding: '8px 12px', display: 'flex', gap: 8 }}>
                                <input value={aiInput} onChange={e => setAiInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendAI(q)}
                                       style={{ flex: 1, border: '1px solid #ddd6fe', borderRadius: 10, padding: '8px 12px', fontSize: 12, outline: 'none', background: 'white' }}
                                       placeholder="اسأل عن السؤال..." />
                                <button onClick={() => sendAI(q)} disabled={aiLoad || !aiInput.trim()} style={{ background: '#7c3aed', color: 'white', border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: aiLoad || !aiInput.trim() ? .4 : 1 }}>↑</button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Video column */}
                        {hasVid && (
                          <div style={S.vCol}>
                            <div style={S.vHeader}>
                              <span style={{ color: 'white', fontSize: 16 }}>🎬</span>
                              <span style={{ color: 'white', fontWeight: 700, fontSize: 12 }}>شرح المعلم</span>
                            </div>
                            {openVideo[q.id] ? (
                              <div style={{ padding: 8, flex: 1 }}>
                                <video src={exp!.video_url!} controls style={{ width: '100%', borderRadius: 8, background: 'black', minHeight: 180 }} />
                                {exp!.text_note && <p style={{ fontSize: 11, color: '#065f46', marginTop: 8 }}>✏️ {exp!.text_note}</p>}
                                <button onClick={() => setOpenVideo(v => ({ ...v, [q.id]: false }))} style={{ marginTop: 8, width: '100%', background: 'none', border: 'none', color: '#059669', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>▲ إخفاء</button>
                              </div>
                            ) : (
                              <button style={S.vPlay} onClick={() => setOpenVideo(v => ({ ...v, [q.id]: true }))}>
                                <div style={S.playBtn}>
                                  <span style={{ color: 'white', fontSize: 24, marginRight: -4 }}>▶</span>
                                </div>
                                <span style={{ fontSize: 12, fontWeight: 600, color: '#065f46', lineHeight: 1.5 }}>اضغط لمشاهدة<br />شرح المعلم</span>
                              </button>
                            )}
                          </div>
                        )}

                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Contact modal */}
      {contact && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 380, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
            <div style={{ background: 'linear-gradient(135deg,#0a2d6e,#1a4fa8)', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <img src={logo} style={{ height: 28, objectFit: 'contain' }} />
                <span style={{ color: 'white', fontWeight: 700 }}>تواصل معنا</span>
              </div>
              <button onClick={() => setContact(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.6)', fontSize: 22, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { ic: '📧', lb: 'البريد الإلكتروني', val: settings.CONTACT_EMAIL || 'info@harvste.com', fn: () => window.open(`mailto:${settings.CONTACT_EMAIL || 'info@harvste.com'}`) },
                { ic: '💬', lb: 'واتساب', val: 'تواصل عبر واتساب', fn: () => window.open(`https://wa.me/${settings.CONTACT_WHATSAPP || '966500000000'}`) },
                { ic: '🌐', lb: 'الموقع الرسمي', val: settings.CONTACT_WEBSITE || 'harvste.com', fn: () => window.open(settings.CONTACT_WEBSITE || 'https://www.harvste.com') },
              ].map(item => (
                <button key={item.lb} onClick={item.fn} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', textAlign: 'right' as const, width: '100%' }}>
                  <span style={{ fontSize: 24 }}>{item.ic}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>{item.lb}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>{item.val}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
