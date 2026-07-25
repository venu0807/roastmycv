-- =============================================================================
-- roastmycv — Consolidated Supabase Database Schema
-- Single, complete, idempotent migration. Safe to run multiple times.
-- Merges: production_schema + pricing_tiers + consolidated_pricing + fix.sql
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- Profiles (merged: all columns from production_schema + pricing tiers + fix)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    stripe_customer_id TEXT,
    razorpay_customer_id TEXT,
    -- Primary tier column (used by all RPC functions)
    tier TEXT DEFAULT 'free',
    -- Legacy tier column (unused by code but kept for backward compat)
    subscription_tier TEXT DEFAULT 'free',
    subscription_status TEXT DEFAULT 'inactive',
    subscription_period_end TIMESTAMPTZ,
    -- Usage tracking (from pricing migrations)
    roast_count_monthly INT NOT NULL DEFAULT 0,
    tier_expires_at TIMESTAMPTZ,
    download_credits INT NOT NULL DEFAULT 0,
    last_monthly_reset TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Subscription tracking (from consolidated pricing)
    subscription_id TEXT,
    team_id UUID,
    -- Metadata
    email_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tier CHECK constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_tier_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_tier_check
  CHECK (tier IN ('free', 'starter', 'pro', 'power', 'lifetime', 'team'));

CREATE INDEX IF NOT EXISTS idx_profiles_tier ON profiles(tier);
CREATE INDEX IF NOT EXISTS idx_profiles_tier_expiry ON profiles(tier_expires_at);

-- =============================================================================
-- Teams (must be before credit_transactions which references teams)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    wallet_balance INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teams_created_at ON teams(created_at DESC);

-- =============================================================================
-- Team Members
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);

-- =============================================================================
-- Roasts (replaces roast_results — renamed to match code expectations)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.roasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    resume_json JSONB NOT NULL,
    roast_json JSONB NOT NULL,
    share_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
    is_watermarked BOOLEAN DEFAULT TRUE,
    user_tier_at_time TEXT DEFAULT 'free',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_roasts_user_id ON public.roasts(user_id);
CREATE INDEX IF NOT EXISTS idx_roasts_share_token ON public.roasts(share_token);
CREATE INDEX IF NOT EXISTS idx_roasts_created_at ON public.roasts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_roasts_user_created ON roasts(user_id, created_at DESC);

-- =============================================================================
-- Payment Records
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.payment_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
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

CREATE INDEX IF NOT EXISTS idx_payment_records_user_id ON public.payment_records(user_id);

-- =============================================================================
-- Credit Transactions (merged: original + team_id from consolidated pricing)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.credit_transactions (
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

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON public.credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_team_id ON public.credit_transactions(team_id);

-- =============================================================================
-- Downloads
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.downloads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    roast_id UUID REFERENCES roasts(id) ON DELETE SET NULL,
    tier_at_time TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_downloads_user_id ON downloads(user_id);
CREATE INDEX IF NOT EXISTS idx_downloads_created_at ON downloads(created_at DESC);

-- =============================================================================
-- LLM Response Cache
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.llm_cache (
    cache_key TEXT PRIMARY KEY,
    response JSONB NOT NULL,
    tokens_used INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days')
);

CREATE INDEX IF NOT EXISTS idx_llm_cache_expires_at ON public.llm_cache(expires_at);

-- =============================================================================
-- Rate Limit Counters
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.rate_limit_counters (
    identifier TEXT PRIMARY KEY,
    count INTEGER DEFAULT 0,
    window_start TIMESTAMPTZ DEFAULT NOW(),
    last_reset TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- RLS Policies — Tables
-- =============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.downloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llm_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- Roasts
CREATE POLICY "Users can view own roasts" ON public.roasts
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Anyone can view roast by token" ON public.roasts
    FOR SELECT USING (true);
CREATE POLICY "Service role can insert roasts" ON public.roasts
    FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role can update roasts" ON public.roasts
    FOR UPDATE USING (auth.role() = 'service_role');

-- Payments
CREATE POLICY "Users can view own payments" ON public.payment_records
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role manages payments" ON public.payment_records
    FOR ALL USING (auth.role() = 'service_role');

-- Credit Transactions
CREATE POLICY "Users view own transactions" ON public.credit_transactions
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role manages transactions" ON public.credit_transactions
    FOR ALL USING (auth.role() = 'service_role');

-- Teams
CREATE POLICY "teams_select_member" ON teams
  FOR SELECT USING (id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));
CREATE POLICY "teams_admin_update" ON teams
  FOR UPDATE USING (id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid() AND role = 'admin'));

-- Team Members
CREATE POLICY "team_members_select" ON team_members
  FOR SELECT USING (auth.uid() = user_id OR team_id IN (
    SELECT team_id FROM team_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "team_admins_insert" ON team_members
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM team_members WHERE team_id = team_members.team_id AND user_id = auth.uid() AND role = 'admin')
    OR NOT EXISTS (SELECT 1 FROM team_members WHERE team_id = team_members.team_id)
  );
CREATE POLICY "team_admins_delete" ON team_members
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM team_members WHERE team_id = team_members.team_id AND user_id = auth.uid() AND role = 'admin')
  );

-- Downloads
CREATE POLICY "downloads_select_own" ON downloads
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "downloads_insert_own" ON downloads
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- LLM Cache (service role only)
CREATE POLICY "Service role manages cache" ON public.llm_cache
    FOR ALL USING (auth.role() = 'service_role');

-- Rate Limits (service role only)
CREATE POLICY "Service role manages rate limits" ON public.rate_limit_counters
    FOR ALL USING (auth.role() = 'service_role');

-- =============================================================================
-- Storage Bucket RLS — Resumes bucket (from fix.sql)
-- =============================================================================
DROP POLICY IF EXISTS "resumes_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "resumes_select_own" ON storage.objects;
DROP POLICY IF EXISTS "resumes_delete_own" ON storage.objects;

CREATE POLICY "resumes_insert_own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'resumes'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = 'roasts'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "resumes_select_own" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'resumes'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = 'roasts'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "resumes_delete_own" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'resumes'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = 'roasts'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- =============================================================================
-- Triggers
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_updated ON profiles;
CREATE TRIGGER on_profile_updated
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Monthly-reset trigger
CREATE OR REPLACE FUNCTION public.maybe_reset_monthly()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.last_monthly_reset IS NULL
     OR date_trunc('month', OLD.last_monthly_reset) < date_trunc('month', NOW()) THEN
    NEW.roast_count_monthly := 0;
    NEW.last_monthly_reset := NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_maybe_reset_monthly ON profiles;
CREATE TRIGGER trg_maybe_reset_monthly
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  WHEN (OLD.roast_count_monthly IS DISTINCT FROM NEW.roast_count_monthly
        OR OLD.roast_count_monthly IS NOT DISTINCT FROM NEW.roast_count_monthly)
  EXECUTE FUNCTION public.maybe_reset_monthly();

-- =============================================================================
-- Auth Hook: Create profile on signup
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, avatar_url)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'avatar_url');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- Functions — Access Control
-- =============================================================================

-- Drop old function signatures that would conflict (from fix.sql / earlier migrations)
DROP FUNCTION IF EXISTS public.increment_roast_count(UUID, DATE);
DROP FUNCTION IF EXISTS public.decrement_roast_count(UUID, DATE);
DROP FUNCTION IF EXISTS public.consume_roast_credit(UUID, UUID);
DROP FUNCTION IF EXISTS public.add_roast_credits(UUID, INT, UUID);

-- Check roast access — returns can_roast, remaining, tier, download_credits
CREATE OR REPLACE FUNCTION public.check_roast_access(check_user_id UUID)
RETURNS TABLE(can_roast BOOLEAN, remaining INT, tier TEXT, download_credits INT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  user_tier TEXT;
  user_roast_count INT;
  user_last_reset TIMESTAMPTZ;
  user_download_credits INT;
  monthly_limit INT;
BEGIN
  -- Ensure profile exists
  INSERT INTO public.profiles (id) VALUES (check_user_id)
  ON CONFLICT (id) DO NOTHING;

  SELECT p.tier, p.roast_count_monthly, p.last_monthly_reset, p.download_credits
  INTO user_tier, user_roast_count, user_last_reset, user_download_credits
  FROM public.profiles p WHERE p.id = check_user_id;

  -- Reset monthly count if new month
  IF user_last_reset IS NULL OR date_trunc('month', user_last_reset) < date_trunc('month', NOW()) THEN
    UPDATE public.profiles
    SET roast_count_monthly = 0, last_monthly_reset = NOW()
    WHERE id = check_user_id;
    user_roast_count := 0;
  END IF;

  -- Check tier expiry for pro/power
  IF user_tier IN ('pro', 'power') THEN
    IF (SELECT tier_expires_at FROM profiles WHERE id = check_user_id) < NOW() THEN
      UPDATE public.profiles SET tier = 'free', tier_expires_at = NULL
      WHERE id = check_user_id;
      user_tier := 'free';
    END IF;
  END IF;

  -- Determine limit by tier
  monthly_limit := CASE user_tier
    WHEN 'free' THEN 5
    WHEN 'starter' THEN 5
    WHEN 'pro' THEN -1       -- unlimited
    WHEN 'power' THEN -1     -- unlimited
    WHEN 'lifetime' THEN -1  -- unlimited
    WHEN 'team' THEN -1      -- unlimited
    ELSE 5
  END;

  can_roast := monthly_limit = -1 OR user_roast_count < monthly_limit;
  remaining := CASE WHEN monthly_limit = -1 THEN -1 ELSE GREATEST(0, monthly_limit - user_roast_count) END;
  tier := user_tier;
  download_credits := user_download_credits;
  RETURN NEXT;
END;
$$;

-- Increment roast count (monthly)
CREATE OR REPLACE FUNCTION public.increment_roast_count(inc_user_id UUID)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  new_count INT;
  user_tier TEXT;
  monthly_limit INT;
  user_last_reset TIMESTAMPTZ;
BEGIN
  -- Ensure profile exists
  INSERT INTO public.profiles (id) VALUES (inc_user_id)
  ON CONFLICT (id) DO NOTHING;

  -- Get current state
  SELECT p.tier, p.roast_count_monthly, p.last_monthly_reset
  INTO user_tier, new_count, user_last_reset
  FROM public.profiles p WHERE p.id = inc_user_id;

  -- Reset if new month
  IF user_last_reset IS NULL OR date_trunc('month', user_last_reset) < date_trunc('month', NOW()) THEN
    new_count := 0;
    UPDATE public.profiles
    SET roast_count_monthly = 0, last_monthly_reset = NOW()
    WHERE id = inc_user_id;
  END IF;

  -- Determine limit
  monthly_limit := CASE user_tier
    WHEN 'free' THEN 5 WHEN 'starter' THEN 5
    WHEN 'pro' THEN -1 WHEN 'power' THEN -1
    WHEN 'lifetime' THEN -1 WHEN 'team' THEN -1
    ELSE 5
  END;

  -- If unlimited, just return -1
  IF monthly_limit = -1 THEN
    RETURN -1;
  END IF;

  -- Increment
  UPDATE public.profiles
  SET roast_count_monthly = roast_count_monthly + 1
  WHERE id = inc_user_id
  RETURNING roast_count_monthly INTO new_count;

  RETURN GREATEST(0, monthly_limit - new_count);
END;
$$;

-- =============================================================================
-- Functions — Credits
-- =============================================================================

-- Grant download credit
CREATE OR REPLACE FUNCTION public.grant_download_credit(grant_user_id UUID, credits INT DEFAULT 1)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (grant_user_id)
  ON CONFLICT (id) DO UPDATE SET download_credits = profiles.download_credits + credits;
END;
$$;

-- Consume download credit
CREATE OR REPLACE FUNCTION public.consume_download_credit(consume_user_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  current_credits INT;
  current_tier TEXT;
BEGIN
  SELECT p.tier, p.download_credits INTO current_tier, current_credits
  FROM public.profiles p WHERE p.id = consume_user_id;

  -- Pro/Power/Lifetime/Team don't need credits
  IF current_tier IN ('pro', 'power', 'lifetime', 'team') THEN
    RETURN TRUE;
  END IF;

  -- Check credits
  IF current_credits <= 0 THEN RETURN FALSE; END IF;

  UPDATE public.profiles
  SET download_credits = download_credits - 1
  WHERE id = consume_user_id;

  RETURN TRUE;
END;
$$;

-- =============================================================================
-- Functions — Tier Management
-- =============================================================================

-- Update user tier with standard expiry (30 days for pro/power)
CREATE OR REPLACE FUNCTION public.update_user_tier(user_id UUID, new_tier TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, tier) VALUES (user_id, new_tier)
  ON CONFLICT (id) DO UPDATE SET
    tier = new_tier,
    tier_expires_at = CASE
      WHEN new_tier = 'pro' THEN NOW() + INTERVAL '30 days'
      WHEN new_tier = 'power' THEN NOW() + INTERVAL '30 days'
      WHEN new_tier = 'lifetime' THEN NULL
      ELSE tier_expires_at
    END,
    updated_at = NOW();
END;
$$;

-- Update user tier with custom expiry (for annual)
CREATE OR REPLACE FUNCTION public.update_user_tier_with_expiry(user_id UUID, new_tier TEXT, expiry_days INT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, tier) VALUES (user_id, new_tier)
  ON CONFLICT (id) DO UPDATE SET
    tier = new_tier,
    tier_expires_at = NOW() + (expiry_days || ' days')::INTERVAL,
    updated_at = NOW();
END;
$$;

-- =============================================================================
-- Functions — Team Management
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_team(team_name TEXT, admin_user_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  new_team_id UUID;
BEGIN
  INSERT INTO teams (name) VALUES (team_name) RETURNING id INTO new_team_id;
  INSERT INTO team_members (team_id, user_id, role) VALUES (new_team_id, admin_user_id, 'admin');
  UPDATE public.profiles SET team_id = new_team_id, tier = 'team' WHERE id = admin_user_id;
  RETURN new_team_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_team_member(team_id UUID, member_user_id UUID, member_role TEXT DEFAULT 'member')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO team_members (team_id, user_id, role) VALUES (team_id, member_user_id, member_role)
  ON CONFLICT (team_id, user_id) DO NOTHING;
  UPDATE public.profiles SET team_id = team_id, tier = 'team' WHERE id = member_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_team_member(team_id UUID, member_user_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM team_members WHERE team_id = team_id AND user_id = member_user_id;
  UPDATE public.profiles SET team_id = NULL, tier = 'free' WHERE id = member_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_team_wallet(team_id UUID, amount INT, reference TEXT DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE teams SET wallet_balance = wallet_balance + amount, updated_at = NOW()
  WHERE id = team_id;
  INSERT INTO credit_transactions (user_id, team_id, amount, balance_after, type, reference_id, description)
  SELECT p.id, team_id, amount,
    (SELECT wallet_balance FROM teams WHERE id = team_id),
    'wallet_topup', reference, 'Team wallet top-up'
  FROM team_members p WHERE p.team_id = team_id AND p.role = 'admin'
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.deduct_team_wallet(team_id UUID, amount INT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  current_balance INT;
BEGIN
  SELECT wallet_balance INTO current_balance FROM teams WHERE id = team_id FOR UPDATE;
  IF current_balance < amount THEN RETURN FALSE; END IF;
  UPDATE teams SET wallet_balance = wallet_balance - amount, updated_at = NOW()
  WHERE id = team_id;
  RETURN TRUE;
END;
$$;

-- =============================================================================
-- Reset daily rate limits (pg_cron helper)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.reset_daily_rate_limits()
RETURNS VOID AS $$
BEGIN
    DELETE FROM public.rate_limit_counters WHERE last_reset < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- Grant function permissions
-- =============================================================================
GRANT EXECUTE ON FUNCTION public.check_roast_access(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_roast_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_download_credit(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_download_credit(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_tier(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_tier_with_expiry(UUID, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_team(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_team_member(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_team_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_team_wallet(UUID, INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_team_wallet(UUID, INT) TO authenticated;
