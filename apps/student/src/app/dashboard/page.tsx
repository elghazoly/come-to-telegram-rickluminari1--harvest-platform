'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'

type Option      = { id: string; letter: string; text: string; is_correct: boolean; order_num: number }
type Explanation = { id: string; video_url: string | null; text_note: string | null }
type Question    = { id: string; num: number; text: string; year: number | null; image_url: string | null; ans_text: string | null; order_num: number; options: Option[]; explanations: Explanation[] }
type Chapter     = { id: string; name: string; icon: string | null; order_num: number; questions: Question[] }
type Subject     = { id: string; name: string; icon: string | null; chapters: Chapter[] }
type ChatMsg     = { role: 'user' | 'assistant'; content: string }

const LOGO_URL = 'https://www.harvste.com/cdn/shop/files/Logoss.webp?v=1756381661'

export default function StudentDashboard() {
  const router = useRouter()
  const [subjects,       setSubjects]       = useState<Subject[]>([])
  const [profile,        setProfile]        = useState<{ full_name: string; id: string } | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [activeSubject,  setActiveSubject]  = useState('')
  const [activeChapter,  setActiveChapter]  = useState('')
  const [yearFilter,     setYearFilter]     = useState('all')
  const [answers,        setAnswers]        = useState<Record<string, { optionId: string; correct: boolean }>>({})
  const [revealedVideos, setRevealedVideos] = useState<Record<string, boolean>>({})
  const [revealedAns,    setRevealedAns]    = useState<Record<string, boolean>>({})
  const [revealedHint,   setRevealedHint]   = useState<Record<string, boolean>>({})
  const [aiOpen,         setAiOpen]         = useState<string | null>(null)
  const [aiChats,        setAiChats]        = useState<Record<string, ChatMsg[]>>({})
  const [aiInput,        setAiInput]        = useState('')
  const [aiLoading,      setAiLoading]      = useState(false)
  const [contactOpen,    setContactOpen]    = useState(false)
  const aiEndRef = useRef<HTMLDivElement>(null)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
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
        const { data: sub }  = await supabase.from('subjects').select('*').eq('id', sid).single()
        if (!sub) continue
        const { data: chs }  = await supabase.from('chapters').select('*').eq('subject_id', sid).order('order_num')
        const chapFull: Chapter[] = []
        for (const ch of chs || []) {
          const { data: qs } = await supabase.from('questions')
            .select('*, options(*), explanations(*)').eq('chapter_id', ch.id).order('order_num')
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
      .filter(([qid]) => chapter?.questions.some(q => q.id === qid))
      .filter(([, v]) => v.correct).length
    await supabase.from('student_progress').upsert({
      student_id: user.id, chapter_id: activeChapter,
      total_q: totalQ, correct_q: correctQ, last_activity: new Date().toISOString(),
    })
  }

  async function sendAiMessage(q: Question) {
    if (!aiInput.trim() || aiLoading) return
    const msg = aiInput.trim(); setAiInput('')
    const history = aiChats[q.id] || []
    const newHistory: ChatMsg[] = [...history, { role: 'user', content: msg }]
    setAiChats(prev => ({ ...prev, [q.id]: newHistory }))
    setAiLoading(true)
    const r = await fetch('/api/ai-assistant', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: q.text, options: q.options, ans_text: q.ans_text,
        user_message: msg,
        history: history.map(m => ({ role: m.role, content: m.content }))
      })
    })
    const d = await r.json()
    setAiChats(prev => ({ ...prev, [q.id]: [...newHistory, { role: 'assistant', content: d.reply }] }))
    setAiLoading(false)
  }

  function switchSubject(sid: string) {
    setActiveSubject(sid); setYearFilter('all')
    const sub = subjects.find(s => s.id === sid)
    if (sub?.chapters.length) setActiveChapter(sub.chapters[0].id)
  }

  const currentSubject   = subjects.find(s => s.id === activeSubject)
  const currentChapter   = currentSubject?.chapters.find(c => c.id === activeChapter)
  const availableYears   = [...new Set((currentChapter?.questions || []).filter(q => q.year).map(q => String(q.year)))].sort((a,b) => parseInt(b)-parseInt(a))
  const currentQuestions = (currentChapter?.questions || []).filter(q => yearFilter === 'all' || String(q.year) === yearFilter)
  const chapterAnswered  = currentQuestions.filter(q => answers[q.id]).length
  const chapterCorrect   = currentQuestions.filter(q => answers[q.id]?.correct).length
  const progress         = currentQuestions.length ? Math.round(chapterAnswered / currentQuestions.length * 100) : 0

  async function handleSignOut() { await supabase.auth.signOut(); router.push('/login') }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col" dir="rtl">

      {/* ══════════ HEADER ══════════ */}
      <header className="text-white shadow-xl flex-shrink-0" style={{ background: 'linear-gradient(135deg, #0a2d6e 0%, #1a4fa8 100%)' }}>
        <div className="px-5 py-3 flex items-center justify-between border-b border-white/10">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <img src={LOGO_URL} alt="هارفست" className="h-9 object-contain" onError={e => { (e.target as HTMLImageElement).style.display='none' }}/>
            <div className="border-r border-white/20 pr-3">
              <p className="text-blue-200 text-xs leading-none">مرحباً،</p>
              <p className="font-bold text-sm">{profile?.full_name || '...'}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button onClick={() => setContactOpen(true)}
                    className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors">
              💬 تواصل معنا
            </button>
            <button onClick={handleSignOut}
                    className="flex items-center gap-1.5 bg-red-500/20 hover:bg-red-500/30 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors">
              خروج
            </button>
          </div>
        </div>

        {/* Subject tabs */}
        {subjects.length > 0 && (
          <div className="flex gap-1 px-4 pt-2 overflow-x-auto">
            {subjects.map(s => (
              <button key={s.id} onClick={() => switchSubject(s.id)}
                      className={`px-4 py-2 text-sm font-bold rounded-t-xl whitespace-nowrap flex-shrink-0 transition-all ${
                        activeSubject === s.id
                          ? 'bg-white text-blue-800 shadow-sm'
                          : 'text-blue-200 hover:text-white hover:bg-white/10'
                      }`}>
                {s.icon} {s.name}
              </button>
            ))}
          </div>
        )}
      </header>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <img src={LOGO_URL} alt="" className="h-16 mx-auto mb-4 opacity-50"/>
            <p className="text-slate-400">⏳ جاري التحميل...</p>
          </div>
        </div>
      ) : subjects.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
          <img src={LOGO_URL} alt="" className="h-20 mx-auto mb-6 opacity-60"/>
          <p className="text-slate-500 font-medium text-lg">لم يتم تسجيلك في أي مادة بعد</p>
          <p className="text-slate-400 text-sm mt-2">تواصل مع الإدارة للتسجيل</p>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">

          {/* ══════ Chapter sidebar ══════ */}
          <aside className="w-52 bg-white border-l border-slate-200 flex flex-col flex-shrink-0 overflow-y-auto shadow-sm">
            <div className="px-3 py-2.5 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50">
              📂 الفصول
            </div>
            {(currentSubject?.chapters || []).map(c => {
              const cQ  = c.questions.length
              const cA  = c.questions.filter(q => answers[q.id]).length
              const cP  = cQ ? Math.round(cA / cQ * 100) : 0
              const isA = activeChapter === c.id
              return (
                <button key={c.id} onClick={() => { setActiveChapter(c.id); setYearFilter('all') }}
                        className={`w-full text-right px-3 py-3 border-b border-slate-50 transition-all ${
                          isA ? 'bg-blue-700 text-white' : 'text-slate-700 hover:bg-blue-50'
                        }`}>
                  <div className="font-semibold text-sm">{c.icon} {c.name}</div>
                  <div className={`text-xs mt-1 ${isA ? 'text-blue-200' : 'text-slate-400'}`}>
                    {cA}/{cQ} سؤال • {cP}%
                  </div>
                  <div className={`h-1.5 rounded-full mt-1.5 ${isA ? 'bg-white/20' : 'bg-slate-100'}`}>
                    <div className="h-full rounded-full transition-all duration-500"
                         style={{ width: `${cP}%`, background: isA ? 'white' : '#1a4fa8' }}/>
                  </div>
                </button>
              )
            })}
          </aside>

          {/* ══════ Main content ══════ */}
          <main className="flex-1 overflow-y-auto">
            {/* Sticky bar */}
            <div className="bg-white border-b border-slate-200 px-4 py-2.5 sticky top-0 z-10 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700"
                       style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #0a2d6e, #1a4fa8)' }}/>
                </div>
                <span className="text-xs font-bold text-slate-600 flex-shrink-0">
                  {chapterAnswered}/{currentQuestions.length}
                  {chapterAnswered > 0 && <span className="text-green-600 mr-1">({chapterCorrect} ✅)</span>}
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

            {/* Questions */}
            <div className="p-4 space-y-5">
              {currentQuestions.map(q => {
                const userAnswer  = answers[q.id]
                const isAnswered  = !!userAnswer
                const exp         = q.explanations?.[0]
                const needsImg    = q.image_url === '__NEEDS_IMAGE__'
                const chat        = aiChats[q.id] || []

                return (
                  <div key={q.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">

                    {/* ── Question ── */}
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

                      <p className="text-slate-800 font-medium mb-4 leading-relaxed text-[15px]">{q.text}</p>

                      {q.image_url && !needsImg && (
                        <img src={q.image_url} alt="" className="max-h-52 rounded-xl mb-4 object-contain border border-slate-100"/>
                      )}
                      {needsImg && (
                        <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-4 mb-4 text-center text-slate-400 text-sm">
                          🖼️ صورة قيد الإضافة
                        </div>
                      )}

                      {/* Options */}
                      <div className="space-y-2">
                        {q.options.sort((a,b) => a.order_num-b.order_num).map(opt => {
                          const isSel = userAnswer?.optionId === opt.id
                          let cls = 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-blue-50 hover:border-blue-300 cursor-pointer'
                          if (isAnswered) {
                            if (opt.is_correct)  cls = 'bg-green-50 border-green-400 text-green-800 font-semibold'
                            else if (isSel)       cls = 'bg-red-50 border-red-400 text-red-700'
                            else                  cls = 'bg-slate-50 border-slate-200 text-slate-400 opacity-60'
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

                      {/* ── Action buttons ── */}
                      <div className="flex gap-2 mt-4 flex-wrap">
                        {/* Hint */}
                        <button onClick={() => setRevealedHint(h => ({ ...h, [q.id]: !h[q.id] }))}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 text-xs font-semibold hover:bg-amber-100 transition-colors">
                          💡 {revealedHint[q.id] ? 'إخفاء التلميح' : 'تلميح'}
                        </button>
                        {/* Show answer */}
                        <button onClick={() => setRevealedAns(a => ({ ...a, [q.id]: !a[q.id] }))}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100 transition-colors">
                          🔍 {revealedAns[q.id] ? 'إخفاء الإجابة' : 'عرض الإجابة'}
                        </button>
                        {/* AI assistant */}
                        <button onClick={() => setAiOpen(aiOpen === q.id ? null : q.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-purple-200 bg-purple-50 text-purple-700 text-xs font-semibold hover:bg-purple-100 transition-colors">
                          🤖 {aiOpen === q.id ? 'إغلاق المساعد' : 'المساعد الذكي'}
                        </button>
                        {/* Video */}
                        {exp?.video_url && (
                          <button onClick={() => setRevealedVideos(v => ({ ...v, [q.id]: !v[q.id] }))}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-green-200 bg-green-50 text-green-700 text-xs font-semibold hover:bg-green-100 transition-colors">
                            🎬 {revealedVideos[q.id] ? 'إخفاء الفيديو' : 'فيديو الشرح'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* ── Hint panel ── */}
                    {revealedHint[q.id] && (
                      <div className="border-t border-amber-100 bg-amber-50 px-5 py-3">
                        <p className="text-xs font-bold text-amber-700 mb-1">💡 تلميح:</p>
                        <p className="text-sm text-amber-800">
                          {q.options.filter(o => o.is_correct).map(o =>
                            `فكر في الخيار الذي يتعلق بـ "${o.text.substring(0, 20)}..."`
                          )}
                        </p>
                      </div>
                    )}

                    {/* ── Answer panel ── */}
                    {revealedAns[q.id] && (
                      <div className="border-t border-blue-100 bg-blue-50 px-5 py-3">
                        <p className="text-xs font-bold text-blue-700 mb-1">🔍 الإجابة الصحيحة:</p>
                        {q.options.filter(o => o.is_correct).map(o => (
                          <p key={o.id} className="text-sm font-semibold text-blue-800">{o.letter} — {o.text}</p>
                        ))}
                        {q.ans_text && <p className="text-xs text-blue-600 mt-1">💡 {q.ans_text}</p>}
                      </div>
                    )}

                    {/* ── AI Assistant panel ── */}
                    {aiOpen === q.id && (
                      <div className="border-t border-purple-100 bg-purple-50">
                        <div className="px-4 py-2 bg-purple-100 flex items-center gap-2 border-b border-purple-200">
                          <span className="text-lg">🤖</span>
                          <span className="text-xs font-bold text-purple-800">المساعد الذكي — اسألني عن هذا السؤال</span>
                        </div>
                        <div className="p-3 space-y-2 max-h-52 overflow-y-auto">
                          {chat.length === 0 && (
                            <p className="text-xs text-purple-500 text-center py-2">ابدأ بسؤال... مثل: "اشرح لي الخيارات" أو "أعطني تلميحاً"</p>
                          )}
                          {chat.map((m, i) => (
                            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-[80%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
                                m.role === 'user'
                                  ? 'bg-purple-600 text-white rounded-br-sm'
                                  : 'bg-white text-slate-700 shadow-sm rounded-bl-sm'
                              }`}>
                                {m.content}
                              </div>
                            </div>
                          ))}
                          {aiLoading && (
                            <div className="flex justify-start">
                              <div className="bg-white px-3 py-2 rounded-xl text-xs text-slate-400 shadow-sm">⏳ يفكر...</div>
                            </div>
                          )}
                          <div ref={aiEndRef}/>
                        </div>
                        <div className="px-3 pb-3 flex gap-2">
                          <input value={aiInput} onChange={e => setAiInput(e.target.value)}
                                 onKeyDown={e => e.key === 'Enter' && sendAiMessage(q)}
                                 className="flex-1 border border-purple-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-purple-400 bg-white"
                                 placeholder="اسأل عن السؤال..."/>
                          <button onClick={() => sendAiMessage(q)} disabled={aiLoading || !aiInput.trim()}
                                  className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-50">
                            إرسال
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ── Video panel ── */}
                    {exp?.video_url && revealedVideos[q.id] && (
                      <div className="border-t border-green-100 p-3 bg-green-50">
                        <p className="text-xs font-bold text-green-700 mb-2">🎬 فيديو شرح المعلم:</p>
                        <video src={exp.video_url} controls className="w-full rounded-xl bg-black max-h-64"/>
                        {exp.text_note && (
                          <p className="text-xs text-green-700 mt-2">✏️ {exp.text_note}</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </main>
        </div>
      )}

      {/* ══════ Contact Modal ══════ */}
      {contactOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">💬 تواصل معنا</h2>
              <button onClick={() => setContactOpen(false)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-slate-500 text-sm text-center mb-4">اختر طريقة التواصل المناسبة</p>
              {[
                { icon: '📧', label: 'البريد الإلكتروني', value: 'info@harvste.com', action: () => window.open('mailto:info@harvste.com') },
                { icon: '💬', label: 'واتساب',            value: 'تواصل عبر واتساب',  action: () => window.open('https://wa.me/966500000000') },
                { icon: '🌐', label: 'الموقع الرسمي',     value: 'harvste.com',        action: () => window.open('https://www.harvste.com') },
              ].map(item => (
                <button key={item.label} onClick={item.action}
                        className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-all text-right">
                  <span className="text-2xl">{item.icon}</span>
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">{item.label}</p>
                    <p className="text-slate-400 text-xs">{item.value}</p>
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
