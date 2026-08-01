-- Production-ready Supabase schema fixes
-- Run this in Supabase SQL Editor after initial schema

-- 1. Additional indexes for query performance
CREATE INDEX IF NOT EXISTS idx_profiles_tier ON profiles(tier);
CREATE INDEX IF NOT EXISTS idx_roasts_user_created ON roasts(user_id, created_at DESC);

-- 2. Fix storage RLS policies - restrict users to their own folders
-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "resumes_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "resumes_select_own" ON storage.objects;

-- Users can only insert into their own folder: roasts/{user_id}/*
CREATE POLICY "resumes_insert_own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'resumes' 
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = 'roasts'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- Users can only select from their own folder
CREATE POLICY "resumes_select_own" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'resumes' 
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = 'roasts'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- Users can delete their own files
CREATE POLICY "resumes_delete_own" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'resumes' 
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = 'roasts'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- 3. Add updated_at trigger for profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_updated ON profiles;
CREATE TRIGGER on_profile_updated
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 4. Ensure update_user_tier handles all cases
CREATE OR REPLACE FUNCTION public.update_user_tier(user_id UUID, new_tier TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Validate tier
  IF new_tier NOT IN ('free', 'pro', 'lifetime') THEN
    RAISE EXCEPTION 'Invalid tier: %', new_tier;
  END IF;
  
  UPDATE public.profiles SET tier = new_tier, updated_at = NOW() WHERE id = user_id;
  IF NOT FOUND THEN
    INSERT INTO public.profiles (id, tier) VALUES (user_id, new_tier);
  END IF;
END;
$$;

-- 5. Add helper function for atomic rate limiting
CREATE OR REPLACE FUNCTION public.increment_roast_count(user_id UUID, today DATE)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  new_count INT;
BEGIN
  INSERT INTO public.profiles (id, roasts_today, last_roast_date, total_roasts)
  VALUES (user_id, 1, today, 1)
  ON CONFLICT (id) DO UPDATE SET
    roasts_today = CASE 
      WHEN profiles.last_roast_date = today THEN profiles.roasts_today + 1
      ELSE 1
    END,
    last_roast_date = today,
    total_roasts = profiles.total_roasts + 1,
    updated_at = NOW()
  RETURNING roasts_today INTO new_count;
  
  RETURN new_count;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.increment_roast_count(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_tier(UUID, TEXT) TO authenticated;

-- 6. Add decrement function for rollback on rate limit exceeded
CREATE OR REPLACE FUNCTION public.decrement_roast_count(user_id UUID, today DATE)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.profiles
  SET roasts_today = GREATEST(0, roasts_today - 1),
      total_roasts = GREATEST(0, total_roasts - 1),
      updated_at = NOW()
  WHERE id = user_id AND last_roast_date = today;
END;
$$;

GRANT EXECUTE ON FUNCTION public.decrement_roast_count(UUID, DATE) TO authenticated;
