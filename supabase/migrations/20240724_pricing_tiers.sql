-- RoastMyCV Pricing Tiers Migration
-- Adds new tier support: starter, power, annual subscriptions
-- Adds usage tracking for monthly roast limits

-- 1. Update tier CHECK constraint to include new tiers
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_tier_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_tier_check
  CHECK (tier IN ('free', 'starter', 'pro', 'power', 'lifetime'));

-- 2. Add usage tracking columns
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS roast_count_monthly INT NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tier_expires_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS download_credits INT NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_monthly_reset TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3. Function: check if user can roast (returns remaining count or -1 for unlimited)
CREATE OR REPLACE FUNCTION public.check_roast_access(check_user_id UUID)
RETURNS TABLE(can_roast BOOLEAN, remaining INT, tier TEXT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  user_tier TEXT;
  user_roast_count INT;
  user_last_reset TIMESTAMPTZ;
  monthly_limit INT;
BEGIN
  -- Get or create profile
  INSERT INTO public.profiles (id) VALUES (check_user_id)
  ON CONFLICT (id) DO NOTHING;

  SELECT p.tier, p.roast_count_monthly, p.last_monthly_reset
  INTO user_tier, user_roast_count, user_last_reset
  FROM public.profiles p WHERE p.id = check_user_id;

  -- Reset monthly count if new month
  IF user_last_reset IS NULL OR date_trunc('month', user_last_reset) < date_trunc('month', NOW()) THEN
    UPDATE public.profiles
    SET roast_count_monthly = 0, last_monthly_reset = NOW()
    WHERE id = check_user_id;
    user_roast_count := 0;
  END IF;

  -- Determine limit by tier
  monthly_limit := CASE user_tier
    WHEN 'free' THEN 5
    WHEN 'starter' THEN 5  -- starter doesn't increase monthly limit, just grants downloads
    WHEN 'pro' THEN 30
    WHEN 'power' THEN 100
    WHEN 'lifetime' THEN -1  -- unlimited
    ELSE 5
  END;

  -- Check expiry
  IF user_tier IN ('pro', 'power') THEN
    IF (SELECT tier_expires_at FROM profiles WHERE id = check_user_id) < NOW() THEN
      UPDATE public.profiles SET tier = 'free', tier_expires_at = NULL WHERE id = check_user_id;
      user_tier := 'free';
      monthly_limit := 5;
    END IF;
  END IF;

  can_roast := monthly_limit = -1 OR user_roast_count < monthly_limit;
  remaining := CASE WHEN monthly_limit = -1 THEN -1 ELSE GREATEST(0, monthly_limit - user_roast_count) END;
  tier := user_tier;
  RETURN NEXT;
END;
$$;

-- 4. Function: increment roast count
CREATE OR REPLACE FUNCTION public.increment_roast_count(inc_user_id UUID)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  new_count INT;
  user_tier TEXT;
  monthly_limit INT;
BEGIN
  -- Ensure profile exists
  INSERT INTO public.profiles (id) VALUES (inc_user_id)
  ON CONFLICT (id) DO NOTHING;

  -- Reset if new month
  UPDATE public.profiles
  SET roast_count_monthly = 0, last_monthly_reset = NOW()
  WHERE id = inc_user_id
    AND (last_monthly_reset IS NULL OR date_trunc('month', last_monthly_reset) < date_trunc('month', NOW()));

  -- Increment
  UPDATE public.profiles
  SET roast_count_monthly = roast_count_monthly + 1
  WHERE id = inc_user_id
  RETURNING roast_count_monthly INTO new_count;

  SELECT tier INTO user_tier FROM public.profiles WHERE id = inc_user_id;
  monthly_limit := CASE user_tier
    WHEN 'free' THEN 5 WHEN 'starter' THEN 5
    WHEN 'pro' THEN 30 WHEN 'power' THEN 100
    WHEN 'lifetime' THEN -1 ELSE 5
  END;

  RETURN CASE WHEN monthly_limit = -1 THEN -1 ELSE GREATEST(0, monthly_limit - new_count) END;
END;
$$;

-- 5. Function: grant download credit (called for starter tier)
CREATE OR REPLACE FUNCTION public.grant_download_credit(grant_user_id UUID, credits INT DEFAULT 1)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (grant_user_id)
  ON CONFLICT (id) DO UPDATE SET download_credits = profiles.download_credits + credits;
END;
$$;

-- 6. Update update_user_tier to set expiry for pro/power
CREATE OR REPLACE FUNCTION public.update_user_tier(user_id UUID, new_tier TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, tier) VALUES (user_id, new_tier)
  ON CONFLICT (id) DO UPDATE SET tier = new_tier,
    tier_expires_at = CASE
      WHEN new_tier IN ('pro', 'power') THEN NOW() + INTERVAL '30 days'
      WHEN new_tier = 'lifetime' THEN NULL
      ELSE tier_expires_at
    END;
END;
$$;
