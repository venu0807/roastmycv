// lib/env.ts — Environment validation (skipped during build/static generation)
const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build' || process.env.CI === 'true';

const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GROQ_API_KEY',
] as const;

const optional = [
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'SENTRY_DSN',
] as const;

if (!isBuildTime) {
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required env var: ${key}`);
    }
  }
  for (const key of optional) {
    if (!process.env[key] || process.env[key]?.startsWith('placeholder')) {
      if (typeof process.env.NEXT_PUBLIC_APP_URL !== 'undefined') {
        console.warn(`Optional env var ${key} not set — related features will be unavailable`);
      }
    }
  }
}

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  upstashRedisUrl: process.env.UPSTASH_REDIS_REST_URL ?? undefined,
  upstashRedisToken: process.env.UPSTASH_REDIS_REST_TOKEN ?? undefined,
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? undefined,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? undefined,
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET ?? undefined,
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? undefined,
  sentryDsn: process.env.SENTRY_DSN ?? undefined,
  groqApiKey: process.env.GROQ_API_KEY!,
} as const;
