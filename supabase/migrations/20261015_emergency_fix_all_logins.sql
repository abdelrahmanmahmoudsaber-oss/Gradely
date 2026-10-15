-- ==============================================================================
-- EMERGENCY FIX: RESET ADMIN PASSWORD & APPLY STUDENT PASSWORDS & UNLOCK SYSTEM
-- Run this in Supabase Dashboard -> SQL Editor -> Run
-- ==============================================================================

-- 1. UNLOCK & RESET MAIN ADMIN ACCOUNT (Super Admin)
DO $$
DECLARE
  -- ضع كلمة المرور التي تريدها لحسابك الرئيسي هنا:
  v_admin_pw text := 'Gradely@2026';
  v_admin_hashed text;
  v_admin_auth_id uuid;
BEGIN
  v_admin_hashed := extensions.crypt(v_admin_pw, extensions.gen_salt('bf'));

  -- Find existing auth user for admin
  SELECT id INTO v_admin_auth_id 
  FROM auth.users 
  WHERE email IN (
    'amahmoudsaber20262027217__@gradely.app',
    '__amahmoudsaber20262027217@gradely.app',
    'amahmoudsaber20262027217@gradely.app',
    'admin@gradely.app'
  ) LIMIT 1;

  IF v_admin_auth_id IS NOT NULL THEN
    UPDATE auth.users
    SET encrypted_password = v_admin_hashed,
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = v_admin_auth_id;
  ELSE
    v_admin_auth_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_admin_auth_id,
      'authenticated',
      'authenticated',
      'amahmoudsaber20262027217__@gradely.app',
      v_admin_hashed,
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('user_id', 'Amahmoudsaber20262027217@@', 'role', 'super_admin'),
      now(),
      now()
    );
  END IF;

  -- Ensure public.users has this admin with super_admin role and linked auth_id
  UPDATE public.users
  SET role = 'super_admin',
      auth_id = v_admin_auth_id,
      password = v_admin_pw
  WHERE user_id ILIKE '%20262027217%' OR user_id = 'admin';

  -- Ensure TA Abdelrahman is strictly regular TA (role: admin)
  UPDATE public.users
  SET role = 'admin'
  WHERE user_id = 'amahmoudsaber2026';

END;
$$;


-- 2. CLEAR ALL LOGIN RATE LIMIT BLOCKS (فورا)
TRUNCATE TABLE public.login_attempts;


-- 3. ENSURE is_admin() FUNCTION RECOGNIZES SPECIAL CHARACTERS PROPERLY
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


-- 4. ENSURE RLS POLICY ALLOWS USERS TO READ THEIR PROFILES
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

DROP POLICY IF EXISTS "Admins can view and manage all users" ON public.users;
CREATE POLICY "Admins can view and manage all users"
  ON public.users
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
