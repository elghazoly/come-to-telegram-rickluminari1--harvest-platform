# Harvest Platform — Claude Context

## Stack
- Frontend: Next.js 14, pnpm workspaces (Monorepo)
- Database: Supabase (https://rgshwrfcymgzekhdxzrw.supabase.co)
- Storage: Cloudflare R2 Worker (https://dark-mountain-5567.elghazolyonline.workers.dev, token: harvest2025)
- Server: DigitalOcean 161.35.196.144 (Ubuntu 24.04)
- Process Manager: PM2
- GitHub: https://github.com/elghazoly/harvest-platform

## Server Structure
/var/www/harvest/
  apps/admin/      port 3000 | PM2: harvest-admin      | https://admin.harvste.com
  apps/teacher/    port 3001 | PM2: harvest-teacher     | https://teacher.harvste.com
  apps/student-v2/ port 3004 | PM2: harvest-student-v2  | https://student.harvste.com

## Deploy Commands
Admin:
  cd /var/www/harvest && git pull origin main
  cd apps/admin && pnpm exec next build && pm2 restart harvest-admin

Student:
  pm2 restart harvest-student-v2

## Environment Variables
/var/www/harvest/apps/admin/.env.local:
  SHOPIFY_ACCESS_TOKEN=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
  SHOPIFY_STORE=w4yqiq-n0.myshopify.com
  RESEND_API_KEY=re_5Av9k1Nc_3MfrtH2veFkbFpW7Zv7FqMY4

/var/www/harvest/apps/student-v2/ecosystem.config.js:
  ANTHROPIC_API_KEY (for AI assistant)

## Database Schema (Supabase)
Tables:
  profiles: id, full_name, role, phone, device_id, device_pending, device_approved_at, theme, font_size
  subjects: id, name, icon, description, order_num, published_at
  chapters: id, subject_id, name, icon, order_num, chapter_type (lesson|exam), timer_enabled, timer_duration
  questions: id, chapter_id, num, text, year, image_url, order_num
  options: id, question_id, letter, text, is_correct
  explanations: id, question_id, video_url, video_cf_key
  enrollments: id, student_id, subject_id, enrolled_at
  student_answers: id, student_id, question_id, option_id, is_correct, answered_at
  shopify_products: id, product_id, title, subject_id
  teacher_subjects: teacher_id, subject_id

RLS disabled on: shopify_products, profiles, enrollments

## Student Platform (SPA)
File: /var/www/harvest/apps/student-v2/index.html
Server: /var/www/harvest/apps/student-v2/server.js (port 3004)

Features implemented:
- Login with Supabase Auth
- Subject picker → Section picker (lessons/exams) → Chapter grid → Questions
- Chapter type filtering: lesson vs exam
- Exam mode: setup screen (timer + show answers setting) → single question per page → results → review wrong
- Progress tracking with colored dots sidebar in exam
- Dark mode + font size + font family settings (saved to localStorage + Supabase)
- Device lock system
- Hash-based URL routing (/student, /student/subjects, /student/section, /student/lessons, /student/exams)
- AI assistant
- Previous attempts banner with retry option
- Chapters grid view on section open

## Admin Platform (Next.js)
Features:
- Subjects CRUD with teacher assignment
- Chapters: add with AI (PDF/MD upload) + chapter_type selection (lesson|exam)
- Questions review and edit
- Media upload (videos/images to Cloudflare R2)
- Users management with device approval
- Enrollments management
- Shopify integration (webhook: orders/paid → auto create student account)
- Responsive mobile: bottom icon nav bar

## Shopify Integration
Store: w4yqiq-n0.myshopify.com
Webhook: https://admin.harvste.com/api/shopify/webhook (orders/paid)
Flow: purchase → create profile → enroll in subject → send welcome email (Resend)
Password format: {email_prefix}{last3_phone}_{sequence}

## PM2 Services
- harvest-admin (port 3000) — Next.js
- harvest-teacher (port 3001) — Next.js  
- harvest-student-v2 (port 3004) — Node.js SPA server

## Known Issues / Pending
- Resend domain verification (SPF pending for harvste.com)
- Welcome email ready but domain not verified yet
- Admin inner pages (enrollments, assignments) not fully responsive yet
