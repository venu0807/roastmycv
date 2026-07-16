-- =============================================================================
-- roastmycv — Supabase Production Database Schema
-- Run in Supabase SQL Editor
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- Profiles
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    roast_credits INTEGER DEFAULT 1,
    lifetime_credits INTEGER DEFAULT 1,
    stripe_customer_id TEXT,
    razorpay_customer_id TEXT,
    subscription_tier TEXT DEFAULT 'free',
    subscription_status TEXT DEFAULT 'inactive',
    subscription_period_end TIMESTAMPTZ,
    email_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- Roast Results
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.roast_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    anonymous_id TEXT, -- Cookie-based ID for anonymous users
    token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    resume_text TEXT NOT NULL,
    roast_text TEXT NOT NULL,
    parsing_data JSONB, -- Structured resume data
    roast_type TEXT DEFAULT 'standard', -- standard, roast, motivational, technical
    model_used TEXT DEFAULT 'llama-3.3-70b',
    tokens_used INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days')
);

CREATE INDEX IF NOT EXISTS idx_roast_results_user_id ON public.roast_results(user_id);
CREATE INDEX IF NOT EXISTS idx_roast_results_anonymous_id ON public.roast_results(anonymous_id);
CREATE INDEX IF NOT EXISTS idx_roast_results_created_at ON public.roast_results(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_roast_results_token ON public.roast_results(token);

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
-- Credit Transactions
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    type TEXT NOT NULL,
    reference_id UUID,
    reference_type TEXT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON public.credit_transactions(user_id);

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
-- RLS Policies
-- =============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roast_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llm_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- Roast Results
CREATE POLICY "Users can view own roasts" ON public.roast_results
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Anyone can view roast by token" ON public.roast_results
    FOR SELECT USING (true);
CREATE POLICY "Service role can insert roasts" ON public.roast_results
    FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role can update roasts" ON public.roast_results
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

-- LLM Cache (service role only)
CREATE POLICY "Service role manages cache" ON public.llm_cache
    FOR ALL USING (auth.role() = 'service_role');

-- Rate Limits (service role only)
CREATE POLICY "Service role manages rate limits" ON public.rate_limit_counters
    FOR ALL USING (auth.role() = 'service_role');

-- =============================================================================
-- Triggers
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =============================================================================
-- Auth Hook: Create profile on signup
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, avatar_url, roast_credits, lifetime_credits)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'avatar_url', 1, 1);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- Function: Consume roast credit
-- =============================================================================
CREATE OR REPLACE FUNCTION public.consume_roast_credit(p_user_id UUID, p_reference_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_balance INTEGER;
BEGIN
    SELECT roast_credits INTO v_balance FROM public.profiles WHERE id = p_user_id FOR UPDATE;
    IF v_balance <= 0 THEN RETURN FALSE; END IF;

    UPDATE public.profiles SET roast_credits = roast_credits - 1 WHERE id = p_user_id;

    INSERT INTO public.credit_transactions (user_id, amount, balance_after, type, reference_id, reference_type, description)
    VALUES (p_user_id, -1, v_balance - 1, 'usage', p_reference_id, 'roast', 'Resume roast analysis');

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- Function: Add roast credits
-- =============================================================================
CREATE OR REPLACE FUNCTION public.add_roast_credits(p_user_id UUID, p_amount INTEGER, p_payment_id UUID)
RETURNS VOID AS $$
DECLARE
    v_balance INTEGER;
BEGIN
    SELECT roast_credits INTO v_balance FROM public.profiles WHERE id = p_user_id FOR UPDATE;
    UPDATE public.profiles SET roast_credits = roast_credits + p_amount, lifetime_credits = lifetime_credits + p_amount WHERE id = p_user_id;
    INSERT INTO public.credit_transactions (user_id, amount, balance_after, type, reference_id, reference_type, description)
    VALUES (p_user_id, p_amount, v_balance + p_amount, 'purchase', p_payment_id, 'payment', 'Credit purchase');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- Function: Reset daily rate limits (pg_cron)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.reset_daily_rate_limits()
RETURNS VOID AS $$
BEGIN
    DELETE FROM public.rate_limit_counters WHERE last_reset < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;