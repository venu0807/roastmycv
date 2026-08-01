// lib/cache.ts — LLM response cache + distributed rate limiting via Upstash Redis
// Falls back to in-memory when Redis unavailable. Upgrade to persistent Redis for multi-instance.

import { Redis } from '@upstash/redis'
import { Ratelimit } from '@upstash/ratelimit'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'

// Upstash clients (lazy init)
let redis: Redis | null = null
let ratelimit: Ratelimit | null = null

function getRedis() {
  if (!redis && env.upstashRedisUrl && env.upstashRedisToken) {
    redis = new Redis({ url: env.upstashRedisUrl, token: env.upstashRedisToken })
  }
  return redis
}

function getRatelimit() {
  if (!ratelimit && env.upstashRedisUrl && env.upstashRedisToken) {
    const r = getRedis()
    if (r) {
      ratelimit = new Ratelimit({
        redis: r,
        limiter: Ratelimit.slidingWindow(30, '1 m'), // max 30/min for auth users
        analytics: true,
      })
    }
  }
  return ratelimit
}

// --- LLM Response Cache ---
const memoryCache = new Map<string, { data: any; expiry: number }>()
const MAX_MEMORY_CACHE = 100
const DEFAULT_TTL_MS = 60 * 60 * 1000 // 1 hour

export async function getCached(key: string): Promise<any | null> {
  // Try Redis first
  const r = getRedis()
  if (r) {
    try {
      const data = await r.get(key)
      if (data) {
        logger.debug('Cache hit (Redis)', { key })
        return data
      }
    } catch (e) {
      logger.warn('Redis cache get failed', { key, error: e instanceof Error ? e.message : 'Unknown' })
    }
  }

  // Memory fallback
  const entry = memoryCache.get(key)
  if (!entry) {
    logger.debug('Cache miss', { key })
    return null
  }
  if (Date.now() > entry.expiry) {
    memoryCache.delete(key)
    logger.debug('Cache expired', { key })
    return null
  }
  logger.debug('Cache hit (memory)', { key })
  return entry.data
}

export async function setCache(key: string, data: any, ttlMs = DEFAULT_TTL_MS): Promise<void> {
  // Try Redis first
  const r = getRedis()
  if (r) {
    try {
      await r.set(key, data, { ex: Math.ceil(ttlMs / 1000) })
      logger.debug('Cache set (Redis)', { key, ttlMs })
      return
    } catch (e) {
      logger.warn('Redis cache set failed', { key, error: e instanceof Error ? e.message : 'Unknown' })
    }
  }

  // Memory fallback
  if (memoryCache.size >= MAX_MEMORY_CACHE) {
    const firstKey = memoryCache.keys().next().value
    if (firstKey) memoryCache.delete(firstKey)
  }
  memoryCache.set(key, { data, expiry: Date.now() + ttlMs })
  logger.debug('Cache set (memory)', { key, ttlMs })
}

export function cacheKey(content: string): string {
  // Normalize content for cache key - cache by first 200 chars of cleaned text
  return `roast:${content.trim().toLowerCase().slice(0, 200)}`
}

// --- Distributed Rate Limiting ---
const memoryRateStore = new Map<string, { count: number; resetAt: number }>()

export async function getRateLimitKey(userId?: string | null, ip?: string): Promise<string> {
  if (userId) return `auth:${userId}`
  return `anon:${ip || 'unknown'}`
}

export async function checkRateLimit(key: string, max: number): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  // Try Upstash Redis first
  const rl = getRatelimit()
  if (rl) {
    try {
      const result = await rl.limit(key)
      logger.debug('Rate limit check (Redis)', { key, allowed: result.success, remaining: result.remaining })
      return {
        allowed: result.success,
        remaining: result.remaining,
        resetAt: Date.now() + 60_000,
      }
    } catch (e) {
      logger.warn('Redis rate limit failed, falling back to memory', { key, error: e instanceof Error ? e.message : 'Unknown' })
    }
  }

  // In-memory fallback
  const now = Date.now()
  const entry = memoryRateStore.get(key)

  if (!entry || now > entry.resetAt) {
    memoryRateStore.set(key, { count: 1, resetAt: now + 60_000 })
    return { allowed: true, remaining: max - 1, resetAt: now + 60_000 }
  }

  entry.count++
  const allowed = entry.count <= max
  logger.debug('Rate limit check (memory)', { key, allowed, remaining: Math.max(0, max - entry.count) })
  return { allowed, remaining: Math.max(0, max - entry.count), resetAt: entry.resetAt }
}

// Clean old memory entries periodically
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [k, v] of memoryRateStore) {
      if (now > v.resetAt) memoryRateStore.delete(k)
    }
    for (const [k, v] of memoryCache) {
      if (now > v.expiry) memoryCache.delete(k)
    }
  }, 300_000) // every 5 min
}