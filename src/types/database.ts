export type Role = 'admin' | 'teacher' | 'student'

export interface Profile {
  id: string; full_name: string | null; role: Role
  phone: string | null; avatar_url: string | null
  shopify_customer_id: string | null
  created_at: string; updated_at: string
}
export interface Subject {
  id: string; name: string; icon: string | null
  description: string | null; order_num: number
  published_at: string | null; created_at: string; updated_at: string
}
export interface Chapter {
  id: string; subject_id: string; name: string; icon: string | null
  order_num: number; published_at: string | null; created_at: string; updated_at: string
}
export interface Question {
  id: string; chapter_id: string; num: number; text: string
  year: number | null; image_url: string | null; ans_text: string | null
  order_num: number; published_at: string | null; created_at: string; updated_at: string
}
export interface Option {
  id: string; question_id: string; letter: string
  text: string; is_correct: boolean; order_num: number
}
export interface Explanation {
  id: string; question_id: string; video_url: string | null
  video_cf_key: string | null; video_uploaded_at: string | null
  text_note: string | null; teacher_id: string | null; updated_at: string
}
export interface Enrollment {
  id: string; student_id: string; subject_id: string
  expires_at: string | null; shopify_order_id: string | null; created_at: string
}
export interface StudentAnswer {
  id: string; student_id: string; question_id: string
  option_id: string | null; is_correct: boolean | null; answered_at: string
}
export interface StudentProgress {
  id: string; student_id: string; chapter_id: string
  total_q: number; correct_q: number; last_activity: string
}
export interface QuestionWithOptions extends Question {
  options: Option[]; explanation?: Explanation | null
}
export interface ChapterWithQuestions extends Chapter {
  questions: QuestionWithOptions[]; subject?: Subject
}
export interface SubjectWithChapters extends Subject {
  chapters: Chapter[]
}
