-- RoastMyCV Schema
-- Run this in your Supabase SQL Editor

-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'lifetime')),
  roasts_today INT NOT NULL DEFAULT 0,
  last_roast_date DATE,
  total_roasts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Roasts table
CREATE TABLE IF NOT EXISTS roasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  resume_json JSONB NOT NULL,
  roast_json JSONB NOT NULL,
  is_watermarked BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_roasts_user_id ON roasts(user_id);
CREATE INDEX IF NOT EXISTS idx_roasts_created_at ON roasts(created_at DESC);

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_own" ON profiles
  FOR ALL USING (id = auth.uid());

CREATE POLICY "roasts_select_own" ON roasts
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "roasts_insert_own" ON roasts
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function: update user tier (called by webhooks)
CREATE OR REPLACE FUNCTION public.update_user_tier(user_id UUID, new_tier TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.profiles SET tier = new_tier WHERE id = user_id;
  IF NOT FOUND THEN
    INSERT INTO public.profiles (id, tier) VALUES (user_id, new_tier);
  END IF;
END;
$$;

-- Storage bucket for resumes
INSERT INTO storage.buckets (id, name, public) VALUES ('resumes', 'resumes', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS — without these, authenticated uploads 403
CREATE POLICY "resumes_insert_own" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'resumes' AND auth.role() = 'authenticated');

CREATE POLICY "resumes_select_own" ON storage.objects
  FOR SELECT USING (bucket_id = 'resumes' AND auth.role() = 'authenticated');
