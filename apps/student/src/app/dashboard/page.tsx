'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'

type Option    = { id: string; letter: string; text: string; is_correct: boolean; order_num: number }
type Explanation = { id: string; video_url: string | null; text_note: string | null }
type Question  = { id: string; num: number; text: string; year: number | null; image_url: string | null; ans_text: string | null; order_num: number; options: Option[]; explanations: Explanation[] }
type Chapter   = { id: string; name: string; icon: string | null; order_num: number; questions: Question[] }
type Subject   = { id: string; name: string; icon: string | null; chapters: Chapter[] }

export default function StudentDashboard() {
  const router = useRouter()
  const [subjects,       setSubjects]       = useState<Subject[]>([])
  const [profile,        setProfile]        = useState<{ full_name: string; id: string } | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [activeSubject,  setActiveSubject]  = useState('')
  const [activeChapter,  setActiveChapter]  = useState('')
  const [yearFilter,     setYearFilter]     = useState('all')
  const [answers,        setAnswers]        = useState<Record<string, { optionId: string; correct: boolean }>>({})
  const [revealed,       setRevealed]       = useState<Record<string, boolean>>({})

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

      // Get enrolled subjects
      let subjectIds: string[] = []
      if (prof?.role === 'admin' || prof?.role === 'teacher') {
        const { data } = await supabase.from('subjects').select('id').order('order_num')
        subjectIds = data?.map((s: any) => s.id) || []
      } else {
        const { data } = await supabase.from('enrollments').select('subject_id').eq('student_id', user.id)
        subjectIds = data?.map((e: any) => e.subject_id) || []
      }

      if (!subjectIds.length) { setLoading(false); return }

      // Load existing answers
      const { data: existingAnswers } = await supabase
        .from('student_answers')
        .select('question_id, option_id, is_correct')
        .eq('student_id', user.id)

      const answersMap: Record<string, { optionId: string; correct: boolean }> = {}
      existingAnswers?.forEach((a: any) => {
        answersMap[a.question_id] = { optionId: a.option_id, correct: a.is_correct }
      })
      setAnswers(answersMap)

      // Load subjects with full data
      const built: Subject[] = []
      for (const sid of subjectIds) {
        const { data: sub } = await supabase.from('subjects').select('*').eq('id', sid).single()
        if (!sub) continue
        const { data: chs } = await supabase.from('chapters').select('*').eq('subject_id', sid).order('order_num')
        const chapFull: Chapter[] = []
        for (const ch of chs || []) {
          const { data: qs } = await supabase
            .from('questions')
            .select('*, options(*), explanations(*)')
            .eq('chapter_id', ch.id)
            .order('order_num')
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

  async function handleAnswer(q: Question, option: Option) {
    if (answers[q.id]) return // already answered
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const newAnswers = { ...answers, [q.id]: { optionId: option.id, correct: option.is_correct } }
    setAnswers(newAnswers)

    // Save to DB
    await supabase.from('student_answers').upsert({
      student_id:  user.id,
      question_id: q.id,
      option_id:   option.id,
      is_correct:  option.is_correct,
      answered_at: new Date().toISOString(),
    })

    // Update progress
    const chapter   = currentSubject?.chapters.find(c => c.id === activeChapter)
    const totalQ    = chapter?.questions.length || 0
    const correctQ  = Object.entries(newAnswers)
      .filter(([qid]) => chapter?.questions.some(q => q.id === qid))
      .filter(([, v]) => v.correct).length

    await supabase.from('student_progress').upsert({
      student_id:    user.id,
      chapter_id:    activeChapter,
      total_q:       totalQ,
      correct_q:     correctQ,
      last_activity: new Date().toISOString(),
    })
  }

  function switchSubject(sid: string) {
    setActiveSubject(sid)
    setYearFilter('all')
    const sub = subjects.find(s => s.id === sid)
    if (sub?.chapters.length) setActiveChapter(sub.chapters[0].id)
  }

  const currentSubject  = subjects.find(s => s.id === activeSubject)
  const currentChapter  = currentSubject?.chapters.find(c => c.id === activeChapter)
  const availableYears  = [...new Set((currentChapter?.questions || []).filter(q => q.year).map(q => String(q.year)))].sort((a,b) => parseInt(b)-parseInt(a))
  const currentQuestions = (currentChapter?.questions || []).filter(q =>
    yearFilter === 'all' || String(q.year) === yearFilter
  )

  // Stats for current chapter
  const chapterAnswered = currentQuestions.filter(q => answers[q.id]).length
  const chapterCorrect  = currentQuestions.filter(q => answers[q.id]?.correct).length
  const progress        = currentQuestions.length ? Math.round(chapterAnswered / currentQuestions.length * 100) : 0

  async function handleSignOut() {
    await supabase.auth.signOut(); router.push('/login')
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col" dir="rtl">
      {/* Header */}
      <header style={{ background: 'linear-gradient(90deg, #0a2d6e, #1a4fa8)' }} className="text-white shadow-lg flex-shrink-0">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎓</span>
            <div>
              <h1 className="font-bold text-sm leading-none">منصة الطالب — هارفست</h1>
              <p className="text-blue-200 text-xs">{profile?.full_name}</p>
            </div>
          </div>
          <button onClick={handleSignOut} className="bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg text-xs font-medium">
            خروج
          </button>
        </div>
        {/* Subject tabs */}
        {subjects.length > 0 && (
          <div className="flex gap-1 px-4 pb-0 overflow-x-auto">
            {subjects.map(s => (
              <button key={s.id} onClick={() => switchSubject(s.id)}
                      className={`px-4 py-2 text-sm font-bold rounded-t-lg whitespace-nowrap flex-shrink-0 transition-colors ${
                        activeSubject === s.id ? 'bg-white text-blue-800' : 'text-blue-200 hover:text-white hover:bg-white/10'
                      }`}>
                {s.icon} {s.name}
              </button>
            ))}
          </div>
        )}
      </header>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-slate-400">⏳ جاري التحميل...</div>
      ) : subjects.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
          <div className="text-6xl mb-4">📚</div>
          <p className="text-slate-500 font-medium">لم يتم تسجيلك في أي مادة بعد</p>
          <p className="text-slate-400 text-sm mt-1">تواصل مع الأدمن للتسجيل</p>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Chapter sidebar */}
          <aside className="w-48 bg-white border-l border-slate-200 flex flex-col flex-shrink-0 overflow-y-auto">
            <div className="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
              الفصول
            </div>
            {(currentSubject?.chapters || []).map(c => {
              const cQuestions = c.questions.length
              const cAnswered  = c.questions.filter(q => answers[q.id]).length
              const cProg      = cQuestions ? Math.round(cAnswered / cQuestions * 100) : 0
              return (
                <button key={c.id} onClick={() => { setActiveChapter(c.id); setYearFilter('all') }}
                        className={`w-full text-right px-3 py-3 text-sm border-b border-slate-50 transition-colors ${
                          activeChapter === c.id ? 'bg-blue-700 text-white' : 'text-slate-700 hover:bg-slate-50'
                        }`}>
                  <div className="font-medium">{c.icon} {c.name}</div>
                  <div className={`text-xs mt-1 ${activeChapter === c.id ? 'text-blue-200' : 'text-slate-400'}`}>
                    {cAnswered}/{cQuestions} • {cProg}%
                  </div>
                  <div className="h-1 rounded-full bg-white/20 mt-1 overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                         style={{ width: `${cProg}%`, background: activeChapter === c.id ? 'white' : '#1a4fa8' }}/>
                  </div>
                </button>
              )
            })}
          </aside>

          {/* Main */}
          <main className="flex-1 overflow-y-auto">
            {/* Progress bar + year filter */}
            <div className="bg-white border-b border-slate-200 px-4 py-2 sticky top-0 z-10">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex-1 bg-slate-100 rounded-full h-2">
                  <div className="h-2 rounded-full transition-all duration-500"
                       style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #0a2d6e, #1a4fa8)' }}/>
                </div>
                <span className="text-xs font-bold text-slate-600 flex-shrink-0">
                  {chapterAnswered}/{currentQuestions.length} ({chapterCorrect} ✅)
                </span>
              </div>
              {availableYears.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {(['all', ...availableYears]).map(y => (
                    <button key={y} onClick={() => setYearFilter(y)}
                            className={`px-2.5 py-0.5 rounded-full text-xs font-bold transition-colors ${
                              yearFilter === y ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-blue-100'
                            }`}>
                      {y === 'all' ? 'الكل' : y}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Questions */}
            <div className="p-4 space-y-4">
              {currentQuestions.map(q => {
                const userAnswer = answers[q.id]
                const isAnswered = !!userAnswer
                const isRevealed = revealed[q.id]
                const exp        = q.explanations?.[0]
                const needsImg   = q.image_url === '__NEEDS_IMAGE__'

                return (
                  <div key={q.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden animate-fade-in">
                    {/* Question */}
                    <div className="p-4">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="bg-blue-700 text-white text-xs font-bold px-2 py-1 rounded-lg">س {q.num}</span>
                        {q.year && <span className="bg-yellow-100 text-yellow-800 text-xs font-bold px-2 py-1 rounded-lg">{q.year}</span>}
                        {isAnswered && (
                          <span className={`text-xs font-bold px-2 py-1 rounded-lg ${userAnswer.correct ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {userAnswer.correct ? '✅ صحيح' : '❌ خطأ'}
                          </span>
                        )}
                      </div>

                      <p className="text-slate-800 font-medium mb-3 leading-relaxed">{q.text}</p>

                      {/* Image */}
                      {q.image_url && !needsImg && (
                        <img src={q.image_url} alt="" className="max-h-48 rounded-xl mb-3 object-contain border border-slate-100"/>
                      )}
                      {needsImg && (
                        <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-4 mb-3 text-center text-slate-400 text-sm">
                          🖼️ صورة قيد الإضافة
                        </div>
                      )}

                      {/* Options */}
                      <div className="grid grid-cols-1 gap-2">
                        {q.options.sort((a,b) => a.order_num-b.order_num).map(opt => {
                          const isSelected = userAnswer?.optionId === opt.id
                          let style = 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-blue-50 hover:border-blue-300 cursor-pointer'
                          if (isAnswered) {
                            if (opt.is_correct)       style = 'bg-green-50 border-green-400 text-green-800 font-semibold'
                            else if (isSelected)      style = 'bg-red-50 border-red-400 text-red-700'
                            else                      style = 'bg-slate-50 border-slate-200 text-slate-400'
                          }
                          return (
                            <button key={opt.id}
                                    onClick={() => handleAnswer(q, opt)}
                                    disabled={isAnswered}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-right disabled:cursor-default ${style}`}>
                              <span className="font-bold w-6 flex-shrink-0 text-sm">{opt.letter}</span>
                              <span className="flex-1 text-sm">{opt.text}</span>
                              {isAnswered && opt.is_correct && <span className="flex-shrink-0">✅</span>}
                              {isAnswered && isSelected && !opt.is_correct && <span className="flex-shrink-0">❌</span>}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Explanation — shown after answering */}
                    {isAnswered && (
                      <div className="border-t border-slate-100 bg-slate-50">
                        {/* Answer explanation text */}
                        {q.ans_text && (
                          <div className="px-4 py-3 text-sm text-blue-800 bg-blue-50 border-b border-blue-100">
                            💡 {q.ans_text}
                          </div>
                        )}

                        {/* Teacher note */}
                        {exp?.text_note && (
                          <div className="px-4 py-3 text-sm text-slate-600 border-b border-slate-100">
                            ✏️ <span className="font-semibold">ملاحظة المعلم:</span> {exp.text_note}
                          </div>
                        )}

                        {/* Video explanation */}
                        {exp?.video_url && (
                          <div className="p-3">
                            {isRevealed ? (
                              <video src={exp.video_url} controls autoPlay
                                     className="w-full rounded-xl bg-black max-h-60"/>
                            ) : (
                              <button onClick={() => setRevealed(r => ({ ...r, [q.id]: true }))}
                                      className="w-full py-3 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2"
                                      style={{ background: 'linear-gradient(90deg, #6d28d9, #7c3aed)' }}>
                                <span>▶️</span> عرض فيديو الشرح
                              </button>
                            )}
                          </div>
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
    </div>
  )
}
