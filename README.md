# roastmycv

AI-powered CV feedback. Upload a PDF, get an instant roast plus actionable recommendations on ATS-readiness, formatting, and impact.

## Features

- PDF upload and parsing
- AI-generated critique: tone (roast) + constructive analysis
- ATS-readiness scoring
- Sectioned feedback: formatting, content, impact
- Anonymous mock review flow
- Rate limiting via Upstash Redis
- Supabase auth (email-based sessions)
- Sentry error tracking (client, server, edge)
- Containerized for reproducible local dev

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js (app router) |
| Auth / DB | Supabase (`@supabase/auth-helpers-nextjs`, `@supabase/ssr`, `supabase-js`) |
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
