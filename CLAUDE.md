# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Start dev server on port 3001
- `npm run build` — Production build
- `npm run typecheck` — TypeScript type checking
- `npm test` — Run vitest tests
- `npm run test:watch` — Watch mode
- `npm run lint` — ESLint

## Architecture

### Stack
- **Framework:** Next.js 16 (App Router, Turbopack)
- **Runtime:** Node.js (all routes use `runtime = 'nodejs'`)
- **AI:** Groq SDK (`llama-3.3-70b-versatile`) with JSON response format
- **Auth:** Supabase (Google OAuth via SSR cookies)
- **Database:** Supabase PostgreSQL with RPC functions
- **Cache:** Upstash Redis with in-memory fallback
- **Payments:** Razorpay (India, subscriptions + orders) + Stripe (Global, checkout sessions)
- **Deployment:** Vercel (standalone output)
- **CSS:** Tailwind CSS v4

### Route Structure (`app/`)

| Route | Type | Auth | Description |
|-------|------|------|-------------|
| `/` | Page | No | Landing |
| `/roast` | Page | Optional | Upload + LLM roast |
| `/roast/result/[token]` | Page (RSC) | No | Shared roast card |
| `/optimize` | Page | Required | ATS optimize + cover letter + roadmap |
| `/history` | Page | Required | Past roasts + optimizations |
| `/pricing` | Page | No | Plan comparison + checkout |
| `/team` | Page | Required | Team wallet management |
| `/api/health` | GET | No | DB/Redis/Groq/Sentry status |
| `/api/roast` | POST | Optional | Resume → LLM → roast result |
| `/api/optimize` | POST | Required | Resume + JD → keyword gaps + rewrite |
| `/api/cover-letter` | POST | Required | Resume + JD → cover letter |
| `/api/skill-roadmap` | POST | Required | Skills → learning roadmap |
| `/api/history` | GET | Required | Past items by tier window |
| `/api/download` | POST | Required | Roast report or optimized resume HTML |
| `/api/checkout` | POST | Required | Stripe/Razorpay payment intent |
| `/api/stripe-webhook` | POST | No | Stripe event handler |
| `/api/razorpay-webhook` | POST | No | Razorpay event handler |
| `/api/team/*` | POST | Required | Team CRUD + wallet |

### Key Libraries (`lib/`)

| File | Purpose |
|------|---------|
| `llm.ts` | Groq LLM calls: roast, optimize (single-pass combined), cover letter, skill roadmap |
| `parse-resume.ts` | PDF/DOCX text extraction with multiple fallbacks |
| `cache.ts` | Upstash Redis + in-memory fallback for LLM responses and rate limiting |
| `env.ts` | Runtime env var validation (required: SUPABASE vars, GROQ_API_KEY) |
| `logger.ts` | Structured console logging with request/response helpers |
| `supabase/server.ts` | SSR client factory (cookie-based auth) |
| `supabase/client.ts` | Browser client factory |
| `razorpay.ts` | Razorpay SDK singleton |
| `stripe.ts` | Stripe SDK singleton |

### Database (`supabase/migrations/`)

- `profiles` table: tier, usage counters, subscription metadata
- `roasts`, `optimizations`: user content with JSONB result storage
- `teams`, `team_members`, `credit_transactions`: team features
- RPC functions for access control: `check_*_access`, `increment_*_count`
- Profile auto-created on first RPC call via `INSERT ... ON CONFLICT DO NOTHING`

### Types (`types/`)

- `ResumeData`, `RoastResult`, `OptimizeResult`
- `KeywordGap`, `ImprovedBullet`, `CoverLetterResult`, `SkillRoadmapResult`
- `OptimizationHistoryItem`

### Payment Flow

1. User selects plan → `POST /api/checkout`
2. Returns Razorpay order/subscription ID or Stripe checkout URL
3. Frontend opens Razorpay checkout or redirects to Stripe
4. Webhook (`stripe-webhook`, `razorpay-webhook`) handles success → updates profile tier via RPC

### Important Patterns

- **Auth:** Always use `createServerClient` from `@supabase/ssr` with cookie handling. Never hardcode the service role key client-side.
- **Rate limiting:** Upstash Redis with in-memory fallback. All API routes call `checkRateLimit()`.
- **LLM resilience:** Zod validation with fallback. If LLM returns bad JSON, build best-effort result instead of crashing.
- **File handling:** PDF/DOCX uploads validated client-side AND server-side (type + size checks). Parse via `parseResume()` with multiple fallback strategies.
- **Error response format:** `{ error: string, upgrade?: boolean, remaining?: number }`
- **Pricing plans:** Free (2 optimizations, 5 roasts/mo), Starter (₹99 one-time, 1 download), Pro (₹199/mo, 20 optimizations), Power (₹399/mo, 80 optimizations)

### Security Headers (next.config.ts)

CSP, HSTS, X-Frame-Options all set. Razorpay checkout script whitelisted in script-src. Supabase and Groq API domains whitelisted in connect-src.
