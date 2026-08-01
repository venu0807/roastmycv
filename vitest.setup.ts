// vitest.setup.ts — Global test setup
import { vi } from 'vitest'

// Mock Next.js modules
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  }),
}))

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
  redirect: vi.fn(),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: null } })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
    })),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(() => Promise.resolve({ data: null, error: null })),
        remove: vi.fn(() => Promise.resolve({ error: null })),
        createSignedUrl: vi.fn(() => Promise.resolve({ data: { signedUrl: '' }, error: null })),
      })),
    },
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
  })),
}))

vi.mock('@upstash/redis', () => ({
  Redis: {
    fromEnv: vi.fn(() => ({
      get: vi.fn(() => Promise.resolve(null)),
      set: vi.fn(() => Promise.resolve('OK')),
      ping: vi.fn(() => Promise.resolve('PONG')),
    })),
  },
}))

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: vi.fn(() => ({
    limit: vi.fn(() => Promise.resolve({ success: true, remaining: 10 })),
  })),
}))

vi.mock('@/lib/env', () => ({
  env: {
    supabaseUrl: 'https://test.supabase.co',
    supabaseAnonKey: 'test-anon-key',
    supabaseServiceRoleKey: 'test-service-key',
    upstashRedisUrl: 'https://test.upstash.io',
    upstashRedisToken: 'test-token',
    stripeSecretKey: 'sk_test_123',
    stripeWebhookSecret: 'whsec_test',
    razorpayKeySecret: 'rzp_test_123',
    razorpayWebhookSecret: 'test_secret',
    sentryDsn: 'https://test@sentry.io/123',
    groqApiKey: 'gsk_test_123',
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    apiRequest: vi.fn(),
    apiResponse: vi.fn(),
    apiError: vi.fn(),
  },
}))