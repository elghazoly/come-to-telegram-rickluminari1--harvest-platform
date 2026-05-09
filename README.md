# 🌾 Harvest Platform

منصة تعليمية متكاملة — Next.js + Supabase + Cloudflare R2

## Apps

| App     | Port | Description        |
|---------|------|--------------------|
| admin   | 3000 | لوحة الإدارة       |
| teacher | 3001 | منصة المعلم        |
| student | 3002 | منصة الطالب        |

## Setup

```bash
# Install dependencies
pnpm install

# Copy env files
cp apps/admin/.env.local.example apps/admin/.env.local
# Edit with your Supabase credentials

# Dev
pnpm dev:admin
```

## Deploy

```bash
bash deploy.sh
```
