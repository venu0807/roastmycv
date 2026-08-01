-- =============================================================================
-- roastmycv — HireRaft-Style Features Migration
-- Adds: optimizations table, new profile columns, new RPC functions
-- =============================================================================

-- =============================================================================
-- New Table: optimizations
-- Tracks the ATS optimize flow (distinct from roasts for the fun mode)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.optimizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    job_description TEXT NOT NULL,
    original_resume_json JSONB NOT NULL,
    optimized_resume_json JSONB,
    keyword_gaps JSONB,
    scores_before INT,
    scores_after INT,
    changes_summary JSONB,
    cover_letter TEXT,
    skill_roadmap JSONB,
    job_title TEXT,
    company TEXT,
    share_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_optimizations_user_id ON public.optimizations(user_id);
CREATE INDEX IF NOT EXISTS idx_optimizations_share_token ON public.optimizations(share_token);
CREATE INDEX IF NOT EXISTS idx_optimizations_created_at ON public.optimizations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_optimizations_user_created ON optimizations(user_id, created_at DESC);

-- =============================================================================
-- New Profile Columns for usage tracking
-- =============================================================================
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS optimizations_used_monthly INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS covers_used_monthly INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS roadmaps_used_monthly INT NOT NULL DEFAULT 0;

-- =============================================================================
-- Updated Tier CHECK constraint (remove lifetime)
-- =============================================================================
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_tier_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_tier_check
    CHECK (tier IN ('free', 'starter', 'pro', 'power', 'team'));

-- =============================================================================
-- RLS Policies for optimizations
-- =============================================================================
ALTER TABLE public.optimizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own optimizations" ON public.optimizations
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Anyone can view optimization by token" ON public.optimizations
    FOR SELECT USING (share_token IS NOT NULL);
CREATE POLICY "Service role can insert optimizations" ON public.optimizations
    FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role can update optimizations" ON public.optimizations
    FOR UPDATE USING (auth.role() = 'service_role');

-- =============================================================================
-- Monthly reset trigger update (include new columns)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.maybe_reset_monthly()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF OLD.last_monthly_reset IS NULL
       OR date_trunc('month', OLD.last_monthly_reset) < date_trunc('month', NOW()) THEN
        NEW.roast_count_monthly := 0;
        NEW.optimizations_used_monthly := 0;
        NEW.covers_used_monthly := 0;
        NEW.roadmaps_used_monthly := 0;
        NEW.last_monthly_reset := NOW();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_maybe_reset_monthly ON profiles;
CREATE TRIGGER trg_maybe_reset_monthly
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.maybe_reset_monthly();

-- =============================================================================
-- New RPC: check_optimize_access
-- =============================================================================
CREATE OR REPLACE FUNCTION public.check_optimize_access(check_user_id UUID)
RETURNS TABLE(can_optimize BOOLEAN, remaining INT, tier TEXT, can_download BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    user_tier TEXT;
    user_count INT;
    user_last_reset TIMESTAMPTZ;
    monthly_limit INT;
    user_download_credits INT;
BEGIN
    INSERT INTO public.profiles (id) VALUES (check_user_id)
    ON CONFLICT (id) DO NOTHING;

    SELECT p.tier, p.optimizations_used_monthly, p.last_monthly_reset, p.download_credits
    INTO user_tier, user_count, user_last_reset, user_download_credits
    FROM public.profiles p WHERE p.id = check_user_id;

    IF user_last_reset IS NULL OR date_trunc('month', user_last_reset) < date_trunc('month', NOW()) THEN
        UPDATE public.profiles
        SET optimizations_used_monthly = 0, covers_used_monthly = 0, roadmaps_used_monthly = 0, last_monthly_reset = NOW()
        WHERE id = check_user_id;
        user_count := 0;
    END IF;

    IF user_tier IN ('pro', 'power') THEN
        IF (SELECT tier_expires_at FROM profiles WHERE id = check_user_id) < NOW() THEN
            UPDATE public.profiles SET tier = 'free', tier_expires_at = NULL
            WHERE id = check_user_id;
            user_tier := 'free';
        END IF;
    END IF;

    monthly_limit := CASE user_tier
        WHEN 'free' THEN 2
        WHEN 'starter' THEN 0
        WHEN 'pro' THEN 20
        WHEN 'power' THEN 80
        WHEN 'team' THEN -1
        ELSE 2
    END;

    can_optimize := monthly_limit = -1 OR user_count < monthly_limit;
    remaining := CASE WHEN monthly_limit = -1 THEN -1 ELSE GREATEST(0, monthly_limit - user_count) END;
    tier := user_tier;
    can_download := user_tier IN ('pro', 'power', 'team') OR user_download_credits > 0;
    RETURN NEXT;
END;
$$;

-- =============================================================================
-- New RPC: increment_optimization_count
-- =============================================================================
CREATE OR REPLACE FUNCTION public.increment_optimization_count(inc_user_id UUID)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE new_count INT; user_tier TEXT; monthly_limit INT; user_last_reset TIMESTAMPTZ;
BEGIN
    INSERT INTO public.profiles (id) VALUES (inc_user_id) ON CONFLICT (id) DO NOTHING;

    SELECT p.tier, p.optimizations_used_monthly, p.last_monthly_reset
    INTO user_tier, new_count, user_last_reset FROM public.profiles p WHERE p.id = inc_user_id;

    IF user_last_reset IS NULL OR date_trunc('month', user_last_reset) < date_trunc('month', NOW()) THEN
        new_count := 0;
        UPDATE public.profiles SET optimizations_used_monthly = 0, last_monthly_reset = NOW() WHERE id = inc_user_id;
    END IF;

    monthly_limit := CASE user_tier
        WHEN 'free' THEN 2 WHEN 'starter' THEN 0 WHEN 'pro' THEN 20 WHEN 'power' THEN 80 WHEN 'team' THEN -1 ELSE 2
    END;

    IF monthly_limit = -1 THEN RETURN -1; END IF;

    UPDATE public.profiles SET optimizations_used_monthly = optimizations_used_monthly + 1
    WHERE id = inc_user_id RETURNING optimizations_used_monthly INTO new_count;

    RETURN GREATEST(0, monthly_limit - new_count);
END;
$$;

-- =============================================================================
-- New RPC: check_cover_letter_access
-- =============================================================================
CREATE OR REPLACE FUNCTION public.check_cover_letter_access(check_user_id UUID)
RETURNS TABLE(can_generate BOOLEAN, remaining INT, tier TEXT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE user_tier TEXT; user_count INT; user_last_reset TIMESTAMPTZ; monthly_limit INT;
BEGIN
    INSERT INTO public.profiles (id) VALUES (check_user_id) ON CONFLICT (id) DO NOTHING;
    SELECT p.tier, p.covers_used_monthly, p.last_monthly_reset
    INTO user_tier, user_count, user_last_reset FROM public.profiles p WHERE p.id = check_user_id;

    IF user_last_reset IS NULL OR date_trunc('month', user_last_reset) < date_trunc('month', NOW()) THEN
        UPDATE public.profiles SET covers_used_monthly = 0, last_monthly_reset = NOW() WHERE id = check_user_id;
        user_count := 0;
    END IF;

    IF user_tier IN ('pro', 'power') AND (SELECT tier_expires_at FROM profiles WHERE id = check_user_id) < NOW() THEN
        UPDATE public.profiles SET tier = 'free' WHERE id = check_user_id; user_tier := 'free';
    END IF;

    monthly_limit := CASE WHEN user_tier IN ('pro', 'power', 'team') THEN -1 ELSE 0 END;
    can_generate := monthly_limit = -1 OR user_count < monthly_limit;
    remaining := CASE WHEN monthly_limit = -1 THEN -1 ELSE GREATEST(0, monthly_limit - user_count) END;
    tier := user_tier;
    RETURN NEXT;
END;
$$;

-- =============================================================================
-- New RPC: increment_cover_letter_count
-- =============================================================================
CREATE OR REPLACE FUNCTION public.increment_cover_letter_count(inc_user_id UUID)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.profiles SET covers_used_monthly = covers_used_monthly + 1 WHERE id = inc_user_id;
    RETURN 0;
END;
$$;

-- =============================================================================
-- New RPC: check_skill_roadmap_access
-- =============================================================================
CREATE OR REPLACE FUNCTION public.check_skill_roadmap_access(check_user_id UUID)
RETURNS TABLE(can_access BOOLEAN, remaining INT, tier TEXT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE user_tier TEXT; user_count INT; user_last_reset TIMESTAMPTZ; monthly_limit INT;
BEGIN
    INSERT INTO public.profiles (id) VALUES (check_user_id) ON CONFLICT (id) DO NOTHING;
    SELECT p.tier, p.roadmaps_used_monthly, p.last_monthly_reset
    INTO user_tier, user_count, user_last_reset FROM public.profiles p WHERE p.id = check_user_id;

    IF user_last_reset IS NULL OR date_trunc('month', user_last_reset) < date_trunc('month', NOW()) THEN
        UPDATE public.profiles SET roadmaps_used_monthly = 0, last_monthly_reset = NOW() WHERE id = check_user_id;
        user_count := 0;
    END IF;

    IF user_tier IN ('pro', 'power') AND (SELECT tier_expires_at FROM profiles WHERE id = check_user_id) < NOW() THEN
        UPDATE public.profiles SET tier = 'free' WHERE id = check_user_id; user_tier := 'free';
    END IF;

    monthly_limit := CASE user_tier WHEN 'pro' THEN 15 WHEN 'power' THEN 60 WHEN 'team' THEN -1 ELSE 0 END;
    can_access := monthly_limit = -1 OR user_count < monthly_limit;
    remaining := CASE WHEN monthly_limit = -1 THEN -1 ELSE GREATEST(0, monthly_limit - user_count) END;
    tier := user_tier;
    RETURN NEXT;
END;
$$;

-- =============================================================================
-- New RPC: increment_skill_roadmap_count
-- =============================================================================
CREATE OR REPLACE FUNCTION public.increment_skill_roadmap_count(inc_user_id UUID)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.profiles SET roadmaps_used_monthly = roadmaps_used_monthly + 1 WHERE id = inc_user_id;
    RETURN 0;
END;
$$;

-- =============================================================================
-- Update update_user_tier: remove lifetime
-- =============================================================================
CREATE OR REPLACE FUNCTION public.update_user_tier(user_id UUID, new_tier TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.profiles (id, tier) VALUES (user_id, new_tier)
    ON CONFLICT (id) DO UPDATE SET
        tier = new_tier,
        tier_expires_at = CASE
            WHEN new_tier = 'pro' THEN NOW() + INTERVAL '30 days'
            WHEN new_tier = 'power' THEN NOW() + INTERVAL '30 days'
            WHEN new_tier IN ('free', 'starter') THEN NULL
            ELSE tier_expires_at
        END,
        updated_at = NOW();
END;
$$;

-- =============================================================================
-- Grant function permissions
-- =============================================================================
GRANT EXECUTE ON FUNCTION public.check_optimize_access(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_optimization_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_cover_letter_access(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_cover_letter_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_skill_roadmap_access(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_skill_roadmap_count(UUID) TO authenticated;
