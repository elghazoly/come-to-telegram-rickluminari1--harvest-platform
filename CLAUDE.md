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
  apps/admin/      port 3000 | PM2: harvest-admin
  apps/teacher/    port 3001 | PM2: harvest-teacher
  apps/student-v2/ port 3004 | PM2: harvest-student-v2

## Deploy Commands

Admin:
  cd /var/www/harvest && git pull origin main
  cd apps/admin && pnpm exec next build && pm2 restart harvest-admin

Teacher:
  cd /var/www/harvest && git pull origin main
  cd apps/teacher && pnpm exec next build && pm2 restart harvest-teacher

Student:
  cd /var/www/harvest && git pull origin main
  kill -9 $(lsof -t -i:3004)
  PORT=3004 node apps/student-v2/server.js &
## Database Schema
profiles         - id, full_name, role, phone, shopify_customer_id
subjects         - id, name, icon, description, order_num, published_at
chapters         - id, subject_id, name, icon, chapter_type, timer_enabled, timer_duration, order_num
questions        - id, chapter_id, text, num, image_url, order_num
options          - id, question_id, text, is_correct
explanations     - id, question_id, video_url, text_note, teacher_id
teacher_subjects - teacher_id, subject_id
enrollments      - id, student_id, subject_id, expires_at, shopify_order_id, created_at
student_answers  - student_id, question_id, option_id, is_correct
student_progress - student_id, chapter_id, total, correct
platform_settings - key, value
shopify_products - shopify_product_id, subject_id, duration_days (TO CREATE)

## Cloudflare R2 Worker
URL: https://dark-mountain-5567.elghazolyonline.workers.dev
Token: X-Auth-Token: harvest2025
Supports Range requests for video streaming

## Admin Pages
/dashboard                                    DONE inline styles
/subjects                                     DONE inline styles
/subjects/[id]/chapters                       DONE inline styles
/subjects/[id]/chapters/[chapterId]/questions TAILWIND CDN
/users                                        TAILWIND CDN
/assignments                                  DONE inline styles
/enrollments                                  DONE inline styles
/media                                        TAILWIND CDN
/settings                                     TAILWIND CDN
/shopify                                      TO BUILD

## Teacher Pages
/dashboard        DONE
/subjects         DONE
/students         DONE
/media            DONE
PDF Export API    DONE - POST /api/export-pdf

## Student App
Pure HTML/JS - port 3004
Login: email or phone
Features: subjects, lessons, exams, AI assistant, timer, progress tracking
## Credentials
Admin: elghazoly@gmail.com
CF Worker Token: harvest2025
ANTHROPIC_API_KEY: in .env.local
Supabase keys: in .env.local

## Current Task - Shopify Integration
Needed: Shopify Store Domain + Admin API Access Token

DB Migration:
  create table shopify_products (
    id uuid primary key default gen_random_uuid(),
    shopify_product_id text unique not null,
    subject_id uuid references subjects(id),
    duration_days integer,
    created_at timestamptz default now()
  );

Files to create:
  apps/admin/app/shopify/page.js
  apps/admin/app/api/shopify/products/route.js
  apps/admin/app/api/shopify/mapping/route.js
  apps/admin/app/api/shopify/webhook/route.js

Webhook logic on orders/paid:
  1. Verify Shopify HMAC signature
  2. Extract customer email + phone + line_items
  3. Lookup shopify_products to get subject_id + duration
  4. If student exists by email or phone - add enrollment only
  5. If new - create account + enrollment
  6. Password: email_prefix + last3_phone + _ + enrollment_sequence
  7. Update profiles.shopify_customer_id

Webhook to register:
  Topic: orders/paid
  URL: https://[admin-domain]/api/shopify/webhook


## Subdomains
- https://admin.harvste.com -> Admin (port 3000)
- https://teacher.harvste.com -> Teacher (port 3001)
- https://student.harvste.com -> Student (port 3004)
