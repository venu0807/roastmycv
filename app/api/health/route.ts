// app/api/health/route.ts — Enhanced health checks with Redis, DB, Groq, Sentry
import { createClient } from '@supabase/supabase-js'
import { Redis } from '@upstash/redis'
import { NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function checkDatabase(): Promise<'ok' | 'error'> {
  try {
    const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey)
    const { error } = await supabase.from('profiles').select('count').limit(1)
    return error ? 'error' : 'ok'
  } catch {
    return 'error'
  }
}

async function checkRedis(): Promise<'ok' | 'error' | 'unconfigured'> {
  try {
    if (!env.upstashRedisUrl || !env.upstashRedisToken) return 'unconfigured'
    const redis = new Redis({ url: env.upstashRedisUrl, token: env.upstashRedisToken })
    await redis.ping()
    return 'ok'
  } catch {
    return 'error'
  }
}

async function checkGroq(): Promise<'ok' | 'error'> {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${env.groqApiKey}` },
      signal: AbortSignal.timeout(5000),
    })
    return res.ok ? 'ok' : 'error'
  } catch {
    return 'error'
  }
}

async function checkSentry(): Promise<'ok' | 'error'> {
  if (!env.sentryDsn || !env.sentryDsn.startsWith('https://')) return 'error'
  return 'ok'
}

export async function GET() {
  const start = Date.now()

  const checks = await Promise.allSettled([
    checkDatabase(),
    checkRedis(),
    checkGroq(),
    checkSentry(),
  ])

  const services = {
    database: checks[0].status === 'fulfilled' ? checks[0].value : 'error',
    redis: checks[1].status === 'fulfilled' ? checks[1].value : 'error',
    groq: checks[2].status === 'fulfilled' ? checks[2].value : 'error',
    sentry: checks[3].status === 'fulfilled' ? checks[3].value : 'error',
  }

  const healthy = Object.values(services).every(s => s === 'ok' || s === 'unconfigured')
  const latencyMs = Date.now() - start

  logger.info('Health check completed', { services, latencyMs, healthy })

  return NextResponse.json(
    { status: healthy ? 'healthy' : 'degraded', services, latencyMs },
    { status: healthy ? 200 : 503 }
  )
}