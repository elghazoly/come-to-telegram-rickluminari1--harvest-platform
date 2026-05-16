# منصة هارفست التعليمية — ملخص المشروع

## Stack
- **Frontend:** Next.js 14 (Monorepo — pnpm workspaces)
- **Database:** Supabase (`https://rgshwrfcymgzekhdxzrw.supabase.co`)
- **Storage:** Cloudflare R2 Worker (`https://dark-mountain-5567.elghazolyonline.workers.dev`, token: `harvest2025`)
- **Server:** DigitalOcean `161.35.196.144` (Ubuntu 24.04)
- **Process Manager:** PM2
- **GitHub:** `https://github.com/elghazoly/harvest-platform`

## Server Structure
```
/var/www/harvest/
├── apps/admin/    (port 3000) PM2: harvest-admin
├── apps/teacher/  (port 3001) PM2: harvest-teacher
└── apps/student-v2/ (port 3004) PM2: harvest-student-v2
```

## Deploy Commands
```bash
# Admin
cd /var/www/harvest && git pull origin main
cd apps/admin && pnpm exec next build && pm2 restart harvest-admin

# Teacher
cd /var/www/harvest && git pull origin main
cd apps/teacher && pnpm exec next build && pm2 restart harvest-teacher

# Student
cd /var/www/harvest
kill -9 $(lsof -t -i:3004)
PORT=3004 node apps/student-v2/server.js &
```

## Database Schema (Supabase)
```
profiles          — id, full_name, role (admin/teacher/student), phone, shopify_customer_id
subjects          — id, name, icon, description, order_num, published_at
chapters          — id, subject_id, name, icon, chapter_type (lesson/exam), timer_enabled, timer_duration, order_num
questions         — id, chapter_id, text, num, image_url, order_num
options           — id, question_id, text, is_correct
explanations      — id, question_id, video_url, text_note, teacher_id
teacher_subjects  — teacher_id, subject_id (junction table)
enrollments       — id, student_id, subject_id, expires_at, shopify_order_id, created_at
student_answers   — student_id, question_id, option_id, is_correct
student_progress  — student_id, chapter_id, total, correct
platform_settings — key, value
```

## Key Relationships
- profiles.role = admin/teacher/student (one table for all users)
- teacher_subjects: many-to-many (teacher ↔ subject)
- enrollments: student → subject (with optional expiry)
- chapters belong to subjects, questions belong to chapters

## Cloudflare R2 Worker
- URL: `https://dark-mountain-5567.elghazolyonline.workers.dev`
- Token header: `X-Auth-Token: harvest2025`
- Supports Range requests for video streaming
- Images stored here: question images, media uploads

## Admin App — Pages Status
- `/dashboard`    ✅ inline styles
- `/subjects`     ✅ inline styles — shows teachers per subject, assign teachers in modal
- `/subjects/[id]/chapters` ✅ inline styles — add/edit/delete chapters
- `/subjects/[id]/chapters/[chapterId]/questions` ⚠️ Tailwind (CDN fallback added)
- `/users`        ⚠️ Tailwind (CDN fallback) — default filter: teacher, has add button
- `/assignments`  ✅ inline styles — view by subject or by teacher
- `/enrollments`  ✅ inline styles — add/extend/delete enrollments, stats
- `/media`        ⚠️ Tailwind (CDN fallback)
- `/settings`     ⚠️ Tailwind (CDN fallback)

## Teacher App — Pages Status
- `/dashboard`    ✅ fast load (subjects only, no questions)
- `/subjects`     ✅ fast load (2 parallel queries)
- `/subjects/[subjectId]/chapters` ✅
- `/students`     ✅
- `/media`        ✅
- PDF Export API  ✅ POST endpoint, base64 images, cover page with logo/teacher/agenda

## PDF Export Feature
- Endpoint: POST `/api/export-pdf` (teacher app)
- Body: { subject_id, mode, orientation, chapter_id?, cover?, logo?, teacher_name? }
- Cover page: logo + platform name + subject + teacher name + chapters agenda
- Question images: converted to base64 server-side
- Page margins: 10% all sides

## Student App (student-v2)
- Pure HTML/JS — port 3004
- Login: email or phone
- Features: subjects, lessons, exams, AI assistant, timer, progress tracking
- PDF download from teacher API

## Tailwind Issue
- Tailwind CDN added to admin layout as fallback
- Pages being gradually converted to inline styles
- globals.css: @tailwind directives now at top

## Next Task — Shopify Integration
- Need: Shopify Store Domain + Admin API Access Token
- Plan:
  1. Build admin page: `/shopify` — list all Shopify products, map to subjects
  2. Create DB table: `shopify_products (shopify_product_id, subject_id, duration_days)`
  3. Build webhook endpoint: `/api/shopify/webhook`
  4. On paid order: create student account + enrollment
  5. Default password formula: `{email_prefix}{last3_phone}_{enrollment_sequence}`
     Example: elghazoly290_1

## Credentials (on server)
- Admin user: `elghazoly@gmail.com` (role: admin)
- CF Worker Token: `harvest2025`
- ANTHROPIC_API_KEY: in `.env.local` files
- Supabase Anon Key: in `.env.local` files
