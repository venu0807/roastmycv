// lib/env.ts — Environment validation (skipped during build/static generation)
const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build' || process.env.CI === 'true';

const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'SENTRY_DSN',
  'GROQ_API_KEY',
] as const;

if (!isBuildTime) {
  for (const key of required) {
    if (!process.env[key] || process.env[key]?.startsWith('placeholder')) {
      throw new Error(`Missing required env var: ${key}`);
    }
  }
}

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  upstashRedisUrl: process.env.UPSTASH_REDIS_REST_URL!,
  upstashRedisToken: process.env.UPSTASH_REDIS_REST_TOKEN!,
  stripeSecretKey: process.env.STRIPE_SECRET_KEY!,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET!,
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET!,
  sentryDsn: process.env.SENTRY_DSN!,
  groqApiKey: process.env.GROQ_API_KEY!,
} as const;