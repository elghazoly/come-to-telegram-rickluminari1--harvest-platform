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

const DEFAULT_LOGO = 'https://www.harvste.com/cdn/shop/files/harv_logo.jpg?v=1775984331&width=195'

// Single supabase instance — outside component to prevent re-creation on re-render
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function ExamTimer({ seconds, onEnd }: { seconds: number; onEnd: () => void }) {
  const [left, setLeft] = useState(seconds)
  useEffect(() => {
    const t = setInterval(() => {
      setLeft(l => { if (l <= 1) { clearInterval(t); onEnd(); return 0 } return l - 1 })
    }, 1000)
    return () => clearInterval(t)
  }, [])
  const pct   = (left / seconds) * 100
  const color = pct > 50 ? '#16a34a' : pct > 20 ? '#d97706' : '#dc2626'
  const m     = Math.floor(left / 60).toString().padStart(2, '0')
  const s     = (left % 60).toString().padStart(2, '0')
  return (
    <div className="flex items-center gap-3">
      <div className="w-32 bg-slate-200 rounded-full h-2 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-base font-black tabular-nums" style={{ color }}>{m}:{s}</span>
      {left <= 60 && <span className="text-xs text-red-500 font-bold animate-pulse">⚠️ دقيقة!</span>}
    </div>
  )
}

export default function StudentDashboard() {
  const router = useRouter()
  const [subjects,       setSubjects]       = useState<Subject[]>([])
  const [profile,        setProfile]        = useState<{ full_name: string; id: string } | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [siteSettings,   setSiteSettings]   = useState<Settings>({})
  const [activeSubject,  setActiveSubject]  = useState('')
  const [activeChapter,  setActiveChapter]  = useState('')
  const [yearFilter,     setYearFilter]     = useState('all')
  const [answers,        setAnswers]        = useState<Record<string, { optionId: string; correct: boolean }>>({})
  const [revealedVideos, setRevealedVideos] = useState<Record<string, boolean>>({})
  const [revealedAns,    setRevealedAns]    = useState<Record<string, boolean>>({})
  const [hints,          setHints]          = useState<Record<string, string>>({})
  const [hintLoading,    setHintLoading]    = useState<string | null>(null)
  const [aiOpen,         setAiOpen]         = useState<string | null>(null)
  const [aiChats,        setAiChats]        = useState<Record<string, ChatMsg[]>>({})
  const [aiInput,        setAiInput]        = useState('')
  const [aiLoading,      setAiLoading]      = useState(false)
  const [contactOpen,    setContactOpen]    = useState(false)
  const [examStarted,    setExamStarted]    = useState(false)
  const [examTimeLeft,   setExamTimeLeft]   = useState<number | null>(null)
  const [showResults,    setShowResults]    = useState(false)
  const aiEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      // Load settings
      fetch('/api/settings').then(r => r.json()).then(d => setSiteSettings(d)).catch(() => {})

      const { data: prof } = await supabase.from('profiles').select('id, full_name, role').eq('id', user.id).single()
      setProfile(prof)

      let subjectIds: string[] = []
      if (prof?.role === 'admin' || prof?.role === 'teacher') {
        const { data } = await supabase.from('subjects').select('id').order('order_num')
        subjectIds = data?.map((s: any) => s.id) || []
      } else {
        const { data } = await supabase.from('enrollments').select('subject_id').eq('student_id', user.id)
        subjectIds = data?.map((e: any) => e.subject_id) || []
      }
      if (!subjectIds.length) { setLoading(false); return }

      const { data: existingAnswers } = await supabase
        .from('student_answers').select('question_id, option_id, is_correct').eq('student_id', user.id)
      const answersMap: Record<string, { optionId: string; correct: boolean }> = {}
      existingAnswers?.forEach((a: any) => { answersMap[a.question_id] = { optionId: a.option_id, correct: a.is_correct } })
      setAnswers(answersMap)

      const built: Subject[] = []
      for (const sid of subjectIds) {
        const { data: sub } = await supabase.from('subjects').select('*').eq('id', sid).single()
        if (!sub) continue
        const { data: chs } = await supabase.from('chapters').select('*').eq('subject_id', sid).order('order_num')
        const chapFull: Chapter[] = []
        for (const ch of chs || []) {
          const { data: qs } = await supabase.from('questions')
            .select('*, options(*), explanations(*)').eq('chapter_id', ch.id).order('order_num')
          console.log('Chapter:', ch.name, 'Questions:', qs?.length, 'Sample explanations:', qs?.[0]?.explanations)
          chapFull.push({ ...ch, questions: (qs || []) as Question[] })
        }
        built.push({ ...sub, chapters: chapFull })
      }
      setSubjects(built)
      if (built.length > 0) {
        setActiveSubject(built[0].id)
        if (built[0].chapters.length > 0) setActiveChapter(built[0].chapters[0].id)
      }
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => { aiEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [aiChats, aiOpen])

  async function handleAnswer(q: Question, option: Option) {
    if (answers[q.id]) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const newAnswers = { ...answers, [q.id]: { optionId: option.id, correct: option.is_correct } }
    setAnswers(newAnswers)
    await supabase.from('student_answers').upsert({
      student_id: user.id, question_id: q.id, option_id: option.id,
      is_correct: option.is_correct, answered_at: new Date().toISOString(),
    })
    const chapter  = currentSubject?.chapters.find(c => c.id === activeChapter)
    const totalQ   = chapter?.questions.length || 0
    const correctQ = Object.entries(newAnswers)
      .filter(([qid]) => chapter?.questions.some(q2 => q2.id === qid))
      .filter(([, v]) => v.correct).length
    await supabase.from('student_progress').upsert({
      student_id: user.id, chapter_id: activeChapter,
      total_q: totalQ, correct_q: correctQ, last_activity: new Date().toISOString(),
    })
    // Auto explain in AI
    if (aiOpen === q.id) {
      const correctOpt = q.options.find(o => o.is_correct)
      const autoMsg = option.is_correct
        ? `أجبت صح! الإجابة: ${correctOpt?.letter}: ${correctOpt?.text}. اشرح لي لماذا هي الصحيحة.`
        : `اخترت ${option.letter} وهي خطأ. الصحيحة: ${correctOpt?.letter}: ${correctOpt?.text}. اشرح لي الفرق.`
      const history = aiChats[q.id] || []
      const newH: ChatMsg[] = [...history, { role: 'user', content: autoMsg }]
      setAiChats(prev => ({ ...prev, [q.id]: newH }))
      sendAiDirect(q, autoMsg, history)
    }
  }

  async function getHint(q: Question) {
    if (hints[q.id] || hintLoading) return
    setHintLoading(q.id)
    const r = await fetch('/api/ai-assistant', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q.text, options: q.options, ans_text: q.ans_text,
        user_message: 'أعطني تلميحاً واحداً مختصراً (جملة واحدة) يساعدني على التفكير بدون ذكر الإجابة.',
        history: [] })
    })
    const d = await r.json()
    setHints(h => ({ ...h, [q.id]: d.reply }))
    setHintLoading(null)
  }

  async function sendAiDirect(q: Question, msg: string, history: ChatMsg[]) {
    setAiLoading(true)
    const r = await fetch('/api/ai-assistant', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q.text, options: q.options, ans_text: q.ans_text,
        user_message: msg, history: history.map(m => ({ role: m.role, content: m.content })) })
    })
    const d = await r.json()
    setAiChats(prev => ({ ...prev, [q.id]: [...(prev[q.id] || []), { role: 'assistant', content: d.reply }] }))
    setAiLoading(false)
  }

  async function sendAiMessage(q: Question) {
    if (!aiInput.trim() || aiLoading) return
    const msg = aiInput.trim(); setAiInput('')
    const history = aiChats[q.id] || []
    setAiChats(prev => ({ ...prev, [q.id]: [...history, { role: 'user', content: msg }] }))
    sendAiDirect(q, msg, history)
  }

  function switchSubject(sid: string) {
    setActiveSubject(sid); setYearFilter('all'); setShowResults(false); setExamStarted(false)
    const sub = subjects.find(s => s.id === sid)
    if (sub?.chapters.length) setActiveChapter(sub.chapters[0].id)
  }

  function switchChapter(cid: string) {
    setActiveChapter(cid); setYearFilter('all'); setExamStarted(false); setExamTimeLeft(null)
  }

  const currentSubject   = subjects.find(s => s.id === activeSubject)
  const currentChapter   = currentSubject?.chapters.find(c => c.id === activeChapter)
  const allQ             = currentChapter?.questions || []
  const currentQuestions = allQ.filter(q => yearFilter === 'all' || String(q.year) === yearFilter)
  const availableYears   = [...new Set(allQ.filter(q => q.year).map(q => String(q.year)))].sort((a,b) => parseInt(b) - parseInt(a))
  const chapterAnswered  = currentQuestions.filter(q => answers[q.id]).length
  const chapterCorrect   = currentQuestions.filter(q => answers[q.id]?.correct).length
  const progress         = currentQuestions.length ? Math.round(chapterAnswered / currentQuestions.length * 100) : 0

  function getLevel() {
    if (chapterAnswered < 3) return { label: 'جاري التقييم', color: '#64748b', icon: '📊' }
    const pct = chapterCorrect / chapterAnswered
    if (pct >= 0.9) return { label: 'ممتاز 🌟', color: '#16a34a', icon: '🏆' }
    if (pct >= 0.7) return { label: 'جيد جداً', color: '#1a4fa8', icon: '⭐' }
    if (pct >= 0.5) return { label: 'جيد', color: '#d97706', icon: '📈' }
    return { label: 'يحتاج مراجعة', color: '#dc2626', icon: '📚' }
  }
  const level = getLevel()

  const logoUrl      = siteSettings.LOGO_URL || DEFAULT_LOGO
  const platformName = siteSettings.PLATFORM_NAME || 'هارفست'

  async function handleSignOut() { await supabase.auth.signOut(); router.push('/login') }

  const isExam       = currentChapter?.chapter_type === 'exam'
  const hasTimer     = isExam && currentChapter?.timer_enabled
  const showQuestions = !hasTimer || examStarted

  return (
    <div className="h-screen bg-slate-100 flex flex-col overflow-hidden" dir="rtl">

      {/* HEADER */}
      <header className="flex-shrink-0 shadow-xl" style={{ background: 'linear-gradient(135deg, #071d4a, #0a2d6e, #1a4fa8)' }}>
        <div className="px-5 py-4 grid grid-cols-3 items-center border-b border-white/10">
          <div className="text-right">
            <p className="font-black text-white text-lg leading-tight">منصة هارفست</p>
            <p className="text-blue-200 text-xs">التعليمية</p>
          </div>
          <div className="flex justify-center">
            <img src={logoUrl} alt={platformName} className="h-14 object-contain drop-shadow-md"
                 onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          </div>
          <div className="flex items-center justify-end gap-2">
            {chapterAnswered >= 3 && (
              <span className="hidden md:flex items-center gap-1 bg-white/10 px-2.5 py-1.5 rounded-xl text-xs font-bold text-white">
                {level.icon} {level.label}
              </span>
            )}
            <button onClick={() => setShowResults(r => !r)}
                    className="bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-xl text-xs font-medium text-white transition-colors">
              📊 نتائجي
            </button>
            <button onClick={() => setContactOpen(true)}
                    className="bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-xl text-xs font-medium text-white transition-colors">
              💬 تواصل
            </button>
            <button onClick={handleSignOut}
                    className="bg-red-500/20 hover:bg-red-500/40 px-3 py-1.5 rounded-xl text-xs font-medium text-white transition-colors">
              خروج
            </button>
          </div>
        </div>
        {subjects.length > 0 && (
          <div className="flex gap-0.5 px-4 pt-2 overflow-x-auto">
            {subjects.map(s => (
              <button key={s.id} onClick={() => switchSubject(s.id)}
                      className={`px-5 py-2.5 text-sm font-bold rounded-t-xl whitespace-nowrap flex-shrink-0 transition-all ${
                        activeSubject === s.id ? 'bg-white text-blue-900 shadow-sm' : 'text-blue-200 hover:text-white hover:bg-white/10'
                      }`}>
                {s.icon} {s.name}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* MAIN */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <img src={logoUrl} alt="" className="h-16 mx-auto opacity-40" />
            <p className="text-slate-400">⏳ جاري التحميل...</p>
          </div>
        </div>
      ) : subjects.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
          <img src={logoUrl} alt="" className="h-20 mx-auto mb-6 opacity-50" />
          <p className="text-slate-500 font-semibold text-lg">لم يتم تسجيلك في أي مادة بعد</p>
          <button onClick={() => setContactOpen(true)}
                  className="mt-4 bg-blue-700 text-white px-6 py-2.5 rounded-xl font-bold text-sm">
            💬 تواصل مع الإدارة
          </button>
        </div>
      ) : (
        <div className="flex flex-1" style={{ minHeight: 0 }}>

          {/* SIDEBAR */}
          <aside className="w-52 bg-white border-l border-slate-200 flex flex-col flex-shrink-0 shadow-sm" style={{ overflowY: "auto" }}>
            <div className="px-3 py-2.5 bg-slate-50 border-b border-slate-100">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">الفصول</p>
            </div>
            {(currentSubject?.chapters || []).map(c => {
              const cQ  = c.questions.length
              const cA  = c.questions.filter(q => answers[q.id]).length
              const cC  = c.questions.filter(q => answers[q.id]?.correct).length
              const cP  = cQ ? Math.round(cA / cQ * 100) : 0
              const isA = activeChapter === c.id
              return (
                <button key={c.id} onClick={() => switchChapter(c.id)}
                        className={`w-full text-right px-3 py-3 border-b border-slate-50 transition-all ${
                          isA ? 'bg-blue-700 text-white' : 'text-slate-700 hover:bg-blue-50'
                        }`}>
                  <div className="font-semibold text-sm">{c.icon} {c.name}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {c.chapter_type === 'exam' && (
                      <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${isA ? 'bg-white/20 text-white' : 'bg-orange-100 text-orange-600'}`}>
                        📝 اختبار
                      </span>
                    )}
                    <span className={`text-xs ${isA ? 'text-blue-200' : 'text-slate-400'}`}>{cA}/{cQ} • {cP}%</span>
                  </div>
                  <div className={`h-1.5 rounded-full mt-1.5 overflow-hidden ${isA ? 'bg-white/20' : 'bg-slate-100'}`}>
                    <div className="h-full rounded-full transition-all duration-500"
                         style={{ width: `${cP}%`, background: isA ? 'white' : cP >= 70 ? '#16a34a' : '#1a4fa8' }} />
                  </div>
                </button>
              )
            })}
          </aside>

          {/* CONTENT */}
          <main className="flex-1 min-w-0" style={{ overflowY: "auto" }}>

            {/* Results */}
            {showResults && (
              <div className="bg-white border-b-2 border-blue-100 px-6 py-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold text-slate-800 text-lg">📊 نتائجك</h2>
                  <button onClick={() => setShowResults(false)} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
                </div>
                <div className="grid grid-cols-4 gap-4 mb-4">
                  {[
                    { label: 'أجبت',  value: chapterAnswered, icon: '📝', color: '#0a2d6e' },
                    { label: 'صحيح',  value: chapterCorrect,  icon: '✅', color: '#16a34a' },
                    { label: 'خطأ',   value: chapterAnswered - chapterCorrect, icon: '❌', color: '#dc2626' },
                    { label: 'النسبة', value: `${chapterAnswered ? Math.round(chapterCorrect / chapterAnswered * 100) : 0}%`, icon: '🎯', color: level.color },
                  ].map(s => (
                    <div key={s.label} className="text-center bg-slate-50 rounded-xl p-3">
                      <div className="text-2xl mb-1">{s.icon}</div>
                      <div className="text-xl font-black" style={{ color: s.color }}>{s.value}</div>
                      <div className="text-slate-400 text-xs">{s.label}</div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3 bg-blue-50 rounded-xl px-4 py-3">
                  <span className="text-2xl">{level.icon}</span>
                  <p className="font-bold text-slate-800">مستواك: <span style={{ color: level.color }}>{level.label}</span></p>
                </div>
              </div>
            )}

            {/* Progress bar */}
            <div className="bg-white border-b border-slate-200 px-4 py-2.5 sticky top-0 z-10 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700"
                       style={{ width: `${progress}%`, background: progress >= 70 ? '#16a34a' : 'linear-gradient(90deg, #0a2d6e, #1a4fa8)' }} />
                </div>
                <span className="text-xs font-bold text-slate-600 flex-shrink-0">
                  {chapterAnswered}/{currentQuestions.length}
                  {chapterAnswered > 0 && <span className="text-green-600 mr-1"> ({chapterCorrect}✅)</span>}
                </span>
              </div>
              {availableYears.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {(['all', ...availableYears]).map(y => (
                    <button key={y} onClick={() => setYearFilter(y)}
                            className={`px-3 py-0.5 rounded-full text-xs font-bold transition-colors ${
                              yearFilter === y ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-blue-100'
                            }`}>
                      {y === 'all' ? 'الكل' : y}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* EXAM: start screen */}
            {hasTimer && !examStarted && (
              <div className="bg-orange-50 border-b-2 border-orange-200 px-6 py-8 text-center">
                <div className="text-5xl mb-3">📝</div>
                <h3 className="font-black text-orange-800 text-xl mb-2">{currentChapter!.name}</h3>
                <p className="text-orange-600 text-sm mb-1">مدة الاختبار: <strong>{Math.round((currentChapter!.timer_duration || 1800) / 60)} دقيقة</strong></p>
                <p className="text-orange-600 text-sm mb-6">عدد الأسئلة: <strong>{currentQuestions.length}</strong></p>
                <button onClick={() => { setExamStarted(true); setExamTimeLeft(currentChapter!.timer_duration || 1800) }}
                        className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-10 py-3 rounded-xl text-base shadow-lg">
                  🚀 ابدأ الاختبار
                </button>
              </div>
            )}

            {/* EXAM: running timer */}
            {hasTimer && examStarted && examTimeLeft !== null && (
              <div className="bg-white border-b-2 border-orange-200 px-6 py-3 flex items-center justify-between sticky top-[52px] z-10 shadow-sm">
                <span className="font-bold text-slate-700 text-sm">📝 {currentChapter!.name}</span>
                <ExamTimer
                  key={activeChapter}
                  seconds={examTimeLeft}
                  onEnd={() => setExamStarted(false)}
                />
              </div>
            )}

            {/* QUESTIONS */}
            {showQuestions && (
              <div className="p-4 space-y-5">
                {currentQuestions.map(q => {
                  const userAnswer = answers[q.id]
                  const isAnswered = !!userAnswer
                  const exp        = q.explanations?.[0]
                  const needsImg   = q.image_url === '__NEEDS_IMAGE__'
                  const hint       = hints[q.id]
                  const chat       = aiChats[q.id] || []
                  const hasVideo   = !!exp?.video_url
                  if (q.num <= 3) console.log(`Q${q.num} exp:`, exp, 'hasVideo:', hasVideo)

                  return (
                    <div key={q.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                      <div style={{ display: 'flex', flexDirection: 'row' }}>

                        {/* QUESTION COLUMN */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="p-5">
                            <div className="flex items-center gap-2 mb-3 flex-wrap">
                              <span className="bg-blue-700 text-white text-xs font-bold px-2.5 py-1 rounded-lg">س {q.num}</span>
                              {q.year && <span className="bg-yellow-100 text-yellow-800 text-xs font-bold px-2 py-1 rounded-lg">{q.year}</span>}
                              {isAnswered && (
                                <span className={`text-xs font-bold px-2 py-1 rounded-lg ${userAnswer.correct ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                  {userAnswer.correct ? '✅ صحيح' : '❌ خطأ'}
                                </span>
                              )}
                            </div>

                            <p className="text-slate-800 font-medium mb-4 leading-relaxed">{q.text}</p>

                            {q.image_url && !needsImg && (
                              <img src={q.image_url} alt="" className="max-h-52 rounded-xl mb-4 object-contain border border-slate-100" />
                            )}
                            {needsImg && (
                              <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-4 mb-4 text-center text-slate-400 text-sm">
                                🖼️ صورة قيد الإضافة
                              </div>
                            )}

                            <div className="space-y-2 mb-4">
                              {q.options.sort((a, b) => a.order_num - b.order_num).map(opt => {
                                const isSel = userAnswer?.optionId === opt.id
                                let cls = 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-blue-50 hover:border-blue-300 cursor-pointer'
                                if (isAnswered) {
                                  if (opt.is_correct)  cls = 'bg-green-50 border-green-400 text-green-800 font-semibold'
                                  else if (isSel)       cls = 'bg-red-50 border-red-400 text-red-700'
                                  else                  cls = 'bg-slate-50 border-slate-100 text-slate-400 opacity-50'
                                }
                                return (
                                  <button key={opt.id} onClick={() => handleAnswer(q, opt)} disabled={isAnswered}
                                          className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl border-2 transition-all text-right disabled:cursor-default ${cls}`}>
                                    <span className="font-bold w-6 flex-shrink-0 text-sm">{opt.letter}</span>
                                    <span className="flex-1 text-sm">{opt.text}</span>
                                    {isAnswered && opt.is_correct && <span>✅</span>}
                                    {isAnswered && isSel && !opt.is_correct && <span>❌</span>}
                                  </button>
                                )
                              })}
                            </div>

                            <div className="flex gap-2 flex-wrap">
                              <button onClick={() => getHint(q)} disabled={hintLoading === q.id}
                                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 text-xs font-semibold hover:bg-amber-100 disabled:opacity-50 transition-colors">
                                {hintLoading === q.id ? '⏳' : '💡'} تلميح ذكي
                              </button>
                              <button onClick={() => setRevealedAns(a => ({ ...a, [q.id]: !a[q.id] }))}
                                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100 transition-colors">
                                🔍 {revealedAns[q.id] ? 'إخفاء' : 'عرض الإجابة'}
                              </button>
                              <button onClick={() => setAiOpen(aiOpen === q.id ? null : q.id)}
                                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors ${
                                        aiOpen === q.id ? 'border-purple-400 bg-purple-100 text-purple-800' : 'border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100'
                                      }`}>
                                🤖 المساعد الذكي
                              </button>
                            </div>
                          </div>

                          {/* Hint */}
                          {hint && (
                            <div className="border-t border-amber-100 bg-amber-50 px-5 py-3">
                              <p className="text-xs font-bold text-amber-700 mb-1">💡 تلميح ذكي:</p>
                              <p className="text-sm text-amber-800 leading-relaxed">{hint}</p>
                            </div>
                          )}

                          {/* Answer */}
                          {revealedAns[q.id] && (
                            <div className="border-t border-blue-100 bg-blue-50 px-5 py-3">
                              <p className="text-xs font-bold text-blue-700 mb-1.5">🔍 الإجابة الصحيحة:</p>
                              {q.options.filter(o => o.is_correct).map(o => (
                                <p key={o.id} className="text-sm font-bold text-blue-900">{o.letter} — {o.text}</p>
                              ))}
                              {q.ans_text && <p className="text-xs text-blue-600 mt-1.5">{q.ans_text}</p>}
                            </div>
                          )}

                          {/* AI */}
                          {aiOpen === q.id && (
                            <div className="border-t border-purple-100">
                              <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: 'linear-gradient(90deg, #7c3aed, #6d28d9)' }}>
                                <span>🤖</span>
                                <span className="text-xs font-bold text-white">المساعد الذكي</span>
                              </div>
                              <div className="bg-purple-50 p-3 space-y-2 max-h-52 overflow-y-auto">
                                {chat.length === 0 && (
                                  <p className="text-xs text-purple-400 text-center py-3">اختر إجابة وسيشرح لك تلقائياً، أو اسأل مباشرة...</p>
                                )}
                                {chat.map((m, i) => (
                                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-xs leading-relaxed ${
                                      m.role === 'user' ? 'bg-purple-600 text-white' : 'bg-white text-slate-700 shadow-sm border border-purple-100'
                                    }`}>
                                      {m.content}
                                    </div>
                                  </div>
                                ))}
                                {aiLoading && (
                                  <div className="flex justify-start">
                                    <div className="bg-white px-4 py-2 rounded-2xl text-xs text-slate-400 shadow-sm">⏳ يفكر...</div>
                                  </div>
                                )}
                                <div ref={aiEndRef} />
                              </div>
                              <div className="px-3 pb-3 pt-2 flex gap-2 bg-purple-50 border-t border-purple-100">
                                <input value={aiInput} onChange={e => setAiInput(e.target.value)}
                                       onKeyDown={e => e.key === 'Enter' && sendAiMessage(q)}
                                       className="flex-1 border border-purple-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-purple-400 bg-white"
                                       placeholder="اسأل عن السؤال..." />
                                <button onClick={() => sendAiMessage(q)} disabled={aiLoading || !aiInput.trim()}
                                        className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-40">
                                  ↑
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* VIDEO COLUMN */}
                        {hasVideo && (
                          <div style={{ width: '300px', flexShrink: 0, borderLeft: '1px solid #d1fae5', background: '#ecfdf5', display: 'flex', flexDirection: 'column' }}>
                            <div className="px-3 py-2.5 flex items-center gap-2" style={{ background: '#059669' }}>
                              <span className="text-white text-sm">🎬</span>
                              <span className="text-xs font-bold text-white">شرح المعلم</span>
                            </div>
                            {revealedVideos[q.id] ? (
                              <div className="flex-1 p-2">
                                <video src={exp!.video_url!} controls className="w-full rounded-lg bg-black" style={{ minHeight: '180px' }} />
                                {exp!.text_note && <p className="text-xs text-emerald-700 mt-2 px-1">✏️ {exp!.text_note}</p>}
                                <button onClick={() => setRevealedVideos(v => ({ ...v, [q.id]: false }))}
                                        className="mt-2 w-full text-xs text-emerald-600 hover:text-emerald-800 font-medium">
                                  ▲ إخفاء
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => setRevealedVideos(v => ({ ...v, [q.id]: true }))}
                                      className="flex-1 flex flex-col items-center justify-center gap-3 p-4 hover:bg-emerald-100 transition-colors">
                                <div className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg" style={{ background: '#059669' }}>
                                  <span className="text-white text-2xl">▶</span>
                                </div>
                                <p className="text-xs font-semibold text-emerald-700 text-center leading-relaxed">اضغط لمشاهدة<br />شرح المعلم</p>
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
          </main>
        </div>
      )}

      {/* CONTACT MODAL */}
      {contactOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, #0a2d6e, #1a4fa8)' }}>
              <div className="flex items-center gap-2">
                <img src={logoUrl} alt="" className="h-7 object-contain" />
                <h2 className="font-bold text-white">تواصل معنا</h2>
              </div>
              <button onClick={() => setContactOpen(false)} className="text-white/60 hover:text-white text-xl">×</button>
            </div>
            <div className="p-5 space-y-3">
              {[
                { icon: '📧', label: 'البريد الإلكتروني', value: siteSettings.CONTACT_EMAIL || 'info@harvste.com', action: () => window.open(`mailto:${siteSettings.CONTACT_EMAIL || 'info@harvste.com'}`) },
                { icon: '💬', label: 'واتساب', value: 'تواصل عبر واتساب', action: () => window.open(`https://wa.me/${siteSettings.CONTACT_WHATSAPP || '966500000000'}`) },
                { icon: '🌐', label: 'الموقع الرسمي', value: siteSettings.CONTACT_WEBSITE || 'harvste.com', action: () => window.open(siteSettings.CONTACT_WEBSITE || 'https://www.harvste.com') },
              ].map(item => (
                <button key={item.label} onClick={item.action}
                        className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-all text-right">
                  <span className="text-2xl">{item.icon}</span>
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">{item.label}</p>
                    <p className="text-slate-400 text-xs">{item.value}</p>
                  </div>
                  <span className="mr-auto text-slate-300">←</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
