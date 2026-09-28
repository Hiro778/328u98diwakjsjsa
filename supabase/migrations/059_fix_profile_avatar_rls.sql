-- 059_fix_profile_avatar_rls.sql
-- Root cause fix: storage RLS policies for 'avatars' bucket using the canonical
-- Supabase pattern confirmed by Context7 docs (/supabase/supabase):
--   auth.uid()::text = (storage.foldername(name))[1]
--
-- The previous migration (058) used compound OR conditions and separate INSERT/UPDATE
-- policies, which can fail when Supabase Storage uses upsert (which checks INSERT policy
-- regardless of whether the file already exists). This migration replaces those with
-- one clean, reliable policy per operation.
--
-- Also ensures profiles UPDATE RLS allows updating avatar_url column specifically.
-- This migration is safe to run multiple times (idempotent via DROP IF EXISTS).

-- ============================================================
-- 1. STORAGE POLICY FIX: avatars bucket
-- ============================================================

DROP POLICY IF EXISTS "avatars_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "avatars_update_own" ON storage.objects;
DROP POLICY IF EXISTS "avatars_delete_own" ON storage.objects;
DROP POLICY IF EXISTS "avatars_select_public" ON storage.objects;

-- INSERT: authenticated user can only upload to their own {user_id}/... folder
-- Canonical pattern from Supabase docs: (storage.foldername(name))[1] = auth.uid()::text
CREATE POLICY "avatars_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
  );

-- UPDATE: authenticated user can only update files in their own folder
CREATE POLICY "avatars_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
  );

-- DELETE: authenticated user can only delete files in their own folder
CREATE POLICY "avatars_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
  );

-- SELECT: public can read avatar images (bucket is public)
CREATE POLICY "avatars_select_public" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'avatars');

-- ============================================================
-- 2. VERIFY profiles RLS is correct
-- ============================================================
-- Ensure profiles UPDATE policy exists and is correct.
-- Drops and recreates only the update policy to be idempotent.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

-- Ensure profiles INSERT policy exists (for initial profile creation flow)
-- This was added in migration 002 but we guard with CREATE IF NOT EXISTS pattern
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Users can insert own profile'
  ) THEN
    CREATE POLICY "Users can insert own profile"
      ON public.profiles
      FOR INSERT TO authenticated
      WITH CHECK ((SELECT auth.uid()) = id);
  END IF;
END
$$;

-- ============================================================
-- 3. ENSURE avatars bucket configuration is correct
-- ============================================================
UPDATE storage.buckets
SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
WHERE id = 'avatars';
