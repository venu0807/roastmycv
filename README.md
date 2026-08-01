# RoastMyCV

**AI-powered resume roasting — brutal honesty on what's wrong with your CV, what recruiters really think, and exactly how to fix it in 30 seconds.** Upload a PDF, get an instant roast plus actionable recommendations on ATS-readiness, formatting, and impact.

## Features

- 🔥 **Brutal honesty** — No sugar-coating. AI tells you exactly what recruiters think
- 📋 **Action plan** — Step-by-step fix plan, priority-ordered from critical to nice-to-have
- ⚡ **30 seconds** — Upload PDF/DOCX, get roasted instantly
- 🤖 **Sectioned feedback** — Formatting, content, impact, and ATS-readiness scoring
- 💰 **Free tier** — 1 roast/day. Pro: ₹299/mo unlimited
- 🔒 **Anonymous mock review flow**

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router) |
| AI | Groq (Llama 3) for fast inference |
| Auth / DB | Supabase PostgreSQL (Google OAuth + Email) |
| PDF | `canvas` |
| Rate limit | Upstash Redis (`@upstash/ratelimit`) |
| Error tracking | Sentry |
| Tests | vitest |
| Container | Docker / docker-compose |

## Quick Start

```bash
docker compose up --build
# or
npm install
cp .env.local.example .env.local
npm run dev
```

App boots at `http://localhost:3000`. Migration: paste `SUPABASE_SCHEMA.sql` into the Supabase SQL editor before first run.

## Project Structure

```
.
├── app/                   # Next.js app router (routes, layouts, server actions)
├── components/            # UI components
├── lib/                   # AI prompts, scoring, parsers, helpers
├── supabase/              # Migrations / seed
├── mocks/                 # Test fixtures
├── scripts/               # One-off maintenance scripts
├── public/                # Static assets
├── middleware.ts          # Auth gate + edge runtime
├── instrumentation.ts     # Sentry init (client/server/edge)
├── sentry.client.config.ts
├── sentry.server.config.ts
├── sentry.edge.config.ts
├── Dockerfile
├── docker-compose.yml
└── SUPABASE_SCHEMA.sql
```

## Configuration

Server-side unless noted.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `OPENAI_API_KEY`
- `SENTRY_DSN`
- `NEXT_PUBLIC_SENTRY_DSN` (optional, client-side DSN)
- `SENTRY_AUTH_TOKEN` (build-time only, for source maps)

## Deployment

Build target: standalone Node server via Dockerfile. Set the env vars above; Sentry source maps upload on build. Edge middleware is rate-limit-aware.

## License

MIT
