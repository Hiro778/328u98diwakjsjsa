-- 058_avatar_storage_and_profile.sql
-- Storage policies and profile enhancements for user avatars

-- 1. Ensure avatars bucket exists and is public
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

-- 2. Storage RLS policies for 'avatars'
DROP POLICY IF EXISTS "avatars_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "avatars_update_own" ON storage.objects;
DROP POLICY IF EXISTS "avatars_delete_own" ON storage.objects;
DROP POLICY IF EXISTS "avatars_select_public" ON storage.objects;

-- INSERT: Only authenticated user can upload to their own folder: {user_id}/... or avatars/{user_id}/...
CREATE POLICY "avatars_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR ((storage.foldername(name))[1] = 'avatars' AND (storage.foldername(name))[2] = (SELECT auth.uid())::text)
    )
  );

-- UPDATE: Only authenticated user can update their own avatar
CREATE POLICY "avatars_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR ((storage.foldername(name))[1] = 'avatars' AND (storage.foldername(name))[2] = (SELECT auth.uid())::text)
    )
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR ((storage.foldername(name))[1] = 'avatars' AND (storage.foldername(name))[2] = (SELECT auth.uid())::text)
    )
  );

-- DELETE: Only authenticated user can delete their own avatar
CREATE POLICY "avatars_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR ((storage.foldername(name))[1] = 'avatars' AND (storage.foldername(name))[2] = (SELECT auth.uid())::text)
    )
  );

-- SELECT: Public can view avatar images
CREATE POLICY "avatars_select_public" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'avatars');
