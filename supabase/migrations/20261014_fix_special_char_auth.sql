-- ==============================================================================
-- FIX AUTH & RLS FOR USERNAMES WITH SPECIAL CHARACTERS (e.g. @@)
-- Purpose:
--   Allow users with special characters (like @@) where auth email converts
--   them to '_' (e.g. @@Amahmoudsaber -> __amahmoudsaber) to be recognized
--   and authenticated properly in RLS and is_admin().
-- ==============================================================================

-- 1. UPDATE is_admin() TO RECOGNIZE SPECIAL CHARACTER EMAILS
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.users u
    WHERE (
      u.auth_id = auth.uid() 
      OR (
        auth.jwt() ->> 'email' IS NOT NULL 
        AND (
          LOWER(auth.jwt() ->> 'email') = LOWER(u.user_id || '@gradely.app')
          OR LOWER(auth.jwt() ->> 'email') = (regexp_replace(LOWER(u.user_id), '[^a-z0-9_.-]', '_', 'g') || '@gradely.app')
        )
      )
    )
    AND u.role IN ('admin', 'super_admin')
  );
END;
$$;

-- 2. LINK auth_id FOR ALL SPECIAL CHAR USERS (@@ -> __)
UPDATE public.users u
SET auth_id = au.id
FROM auth.users au
WHERE LOWER(au.email) = LOWER(u.user_id || '@gradely.app')
   OR LOWER(au.email) = (regexp_replace(LOWER(u.user_id), '[^a-z0-9_.-]', '_', 'g') || '@gradely.app');

-- 3. ENSURE MAIN ADMIN IS SUPER_ADMIN AND TA ABDELRAHMAN IS REGULAR ADMIN
UPDATE public.users
SET role = 'super_admin'
WHERE user_id ILIKE '%20262027217%' OR user_id = 'admin';

UPDATE public.users
SET role = 'admin'
WHERE user_id = 'amahmoudsaber2026';

-- 4. UPDATE USERS SELECT POLICY TO SUPPORT SANITIZED EMAILS
DROP POLICY IF EXISTS "Users can view their own profile" ON public.users;
CREATE POLICY "Users can view their own profile"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = auth_id 
    OR LOWER(COALESCE(auth.jwt() ->> 'email', '')) = LOWER(user_id || '@gradely.app')
    OR LOWER(COALESCE(auth.jwt() ->> 'email', '')) = (regexp_replace(LOWER(user_id), '[^a-z0-9_.-]', '_', 'g') || '@gradely.app')
    OR public.is_admin()
  );

-- 5. UPDATE link_my_auth_id TO SUPPORT SANITIZED EMAILS
CREATE OR REPLACE FUNCTION public.link_my_auth_id(p_user_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_user_id text;
  jwt_email text;
  caller_matches boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  jwt_user_id := COALESCE(auth.jwt() -> 'user_metadata' ->> 'user_id', '');
  jwt_email   := LOWER(COALESCE(auth.jwt() ->> 'email', ''));

  caller_matches := (
    (jwt_user_id <> '' AND jwt_user_id = p_user_id) OR
    (jwt_email <> '' AND (
      jwt_email = LOWER(p_user_id || '@gradely.app') OR
      jwt_email = (regexp_replace(LOWER(p_user_id), '[^a-z0-9_.-]', '_', 'g') || '@gradely.app')
    ))
  );

  IF NOT caller_matches AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Session credentials do not match target user_id' USING errcode = '42501';
  END IF;

  UPDATE public.users 
  SET auth_id = auth.uid()
  WHERE (user_id = p_user_id OR LOWER(user_id) = LOWER(p_user_id))
    AND (auth_id IS NULL OR auth_id = auth.uid());

  RETURN FOUND;
END;
$$;
