-- RoastMyCV Schema
-- Quick-reference copy of the full migration at supabase/migrations/20240101_production_schema.sql
-- For a fresh project, run that migration file instead.

-- Profiles table (merged: production_schema + pricing tiers + fix.sql)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  stripe_customer_id TEXT,
  razorpay_customer_id TEXT,
  tier TEXT DEFAULT 'free',
  subscription_tier TEXT DEFAULT 'free',
  subscription_status TEXT DEFAULT 'inactive',
  subscription_period_end TIMESTAMPTZ,
  roast_count_monthly INT NOT NULL DEFAULT 0,
  tier_expires_at TIMESTAMPTZ,
  download_credits INT NOT NULL DEFAULT 0,
  last_monthly_reset TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  subscription_id TEXT,
  team_id UUID,
  email_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_tier_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_tier_check
  CHECK (tier IN ('free', 'starter', 'pro', 'power', 'lifetime', 'team'));

CREATE INDEX IF NOT EXISTS idx_profiles_tier ON profiles(tier);
CREATE INDEX IF NOT EXISTS idx_profiles_tier_expiry ON profiles(tier_expires_at);

-- Roasts table
CREATE TABLE IF NOT EXISTS roasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  resume_json JSONB NOT NULL,
  roast_json JSONB NOT NULL,
  share_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  is_watermarked BOOLEAN DEFAULT TRUE,
  user_tier_at_time TEXT DEFAULT 'free',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_roasts_user_id ON roasts(user_id);
CREATE INDEX IF NOT EXISTS idx_roasts_share_token ON roasts(share_token);
CREATE INDEX IF NOT EXISTS idx_roasts_created_at ON roasts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_roasts_user_created ON roasts(user_id, created_at DESC);

-- Teams, members, credit_transactions, downloads
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  wallet_balance INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);

CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  amount INT NOT NULL,
  balance_after INT NOT NULL DEFAULT 0,
  type TEXT NOT NULL,
  reference_id TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  roast_id UUID REFERENCES roasts(id) ON DELETE SET NULL,
  tier_at_time TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  provider_payment_id TEXT NOT NULL,
  provider_session_id TEXT,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  credits_purchased INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(provider, provider_payment_id)
);

CREATE TABLE IF NOT EXISTS llm_cache (
  cache_key TEXT PRIMARY KEY,
  response JSONB NOT NULL,
  tokens_used INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days')
);

CREATE TABLE IF NOT EXISTS rate_limit_counters (
  identifier TEXT PRIMARY KEY,
  count INTEGER DEFAULT 0,
  window_start TIMESTAMPTZ DEFAULT NOW(),
  last_reset TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE downloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_counters ENABLE ROW LEVEL SECURITY;

-- See supabase/migrations/20240101_production_schema.sql for all RLS policies,
-- triggers, functions, and grants.
-- Run that file in the Supabase SQL Editor after creating the tables above.
