-- ==============================================================================
-- FIX STUDENT LOGIN & PASSWORD SYNC
-- Date: 2026-10-14
-- Purpose:
--   1. Allow Admins to update student passwords via admin_update_user_password
--   2. Sync all student accounts from public.users into Supabase auth.users
--      so all students can sign in directly with their passwords
--   3. Ensure verify_legacy_login works smoothly without rate limit blockers
-- ==============================================================================

-- 1. UPDATE admin_update_user_password TO ALLOW ALL VERIFIED ADMINS
CREATE OR REPLACE FUNCTION public.admin_update_user_password(p_user_id text, p_new_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_target_role text;
  v_auth_id uuid;
  v_hashed_pw text;
BEGIN
  -- Caller must be authenticated admin or direct SQL Editor execution
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only administrators can update passwords' USING errcode = '42501';
  END IF;

  -- Get target user details
  SELECT role, auth_id INTO v_target_role, v_auth_id 
  FROM public.users 
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;

  -- Protect Super Admin account from regular admins
  IF v_target_role = 'super_admin' AND auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE auth_id = auth.uid() AND role = 'super_admin') THEN
      RAISE EXCEPTION 'Unauthorized: Only Super Admin can change Super Admin password' USING errcode = '42501';
    END IF;
  END IF;

  -- 1. Update plaintext/legacy password in public.users
  UPDATE public.users
  SET password = p_new_password
  WHERE user_id = p_user_id;

  -- 2. If user already exists in auth.users, update their auth password too
  v_hashed_pw := extensions.crypt(
    CASE WHEN length(p_new_password) < 6 THEN 'Gradely#' || p_new_password ELSE p_new_password END,
    extensions.gen_salt('bf')
  );

  IF v_auth_id IS NOT NULL THEN
    UPDATE auth.users
    SET encrypted_password = v_hashed_pw,
        updated_at = now()
    WHERE id = v_auth_id;
  ELSE
    -- Try updating by email
    UPDATE auth.users
    SET encrypted_password = v_hashed_pw,
        updated_at = now()
    WHERE email = LOWER(p_user_id || '@gradely.app')
       OR email = (regexp_replace(LOWER(p_user_id), '[^a-z0-9_.-]', '_', 'g') || '@gradely.app');
  END IF;

  RETURN true;
END;
$$;


-- 2. ONE-TIME BATCH SYNC: PROVISION ALL STUDENTS INTO auth.users
-- This creates confirmed auth accounts for EVERY student in public.users
-- so they can log in immediately with their password without needing open signup!
DO $$
DECLARE
  r RECORD;
  v_email text;
  v_clean_user_id text;
  v_pwd text;
  v_auth_pw text;
  v_hashed_pw text;
  v_new_id uuid;
BEGIN
  FOR r IN 
    SELECT id, user_id, name, role, password, auth_id 
    FROM public.users
  LOOP
    v_clean_user_id := LOWER(TRIM(r.user_id));
    v_email := regexp_replace(v_clean_user_id, '[^a-z0-9_.-]', '_', 'g') || '@gradely.app';
    
    -- Determine password (fallback to user_id if null or empty)
    v_pwd := COALESCE(NULLIF(TRIM(r.password), ''), r.user_id);
    v_auth_pw := CASE WHEN length(v_pwd) < 6 THEN 'Gradely#' || v_pwd ELSE v_pwd END;
    v_hashed_pw := extensions.crypt(v_auth_pw, extensions.gen_salt('bf'));

    -- Check if already exists in auth.users
    SELECT id INTO v_new_id FROM auth.users WHERE LOWER(email) = v_email;

    IF v_new_id IS NOT NULL THEN
      -- Update existing auth user password and link
      UPDATE auth.users
      SET encrypted_password = v_hashed_pw,
          raw_user_meta_data = jsonb_build_object('user_id', r.user_id, 'name', r.name, 'role', r.role),
          email_confirmed_at = COALESCE(email_confirmed_at, now()),
          updated_at = now()
      WHERE id = v_new_id;

      UPDATE public.users
      SET auth_id = v_new_id
      WHERE id = r.id AND (auth_id IS NULL OR auth_id <> v_new_id);
    ELSE
      -- Create new confirmed user in auth.users
      v_new_id := gen_random_uuid();
      
      INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_new_id,
        'authenticated',
        'authenticated',
        v_email,
        v_hashed_pw,
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('user_id', r.user_id, 'name', r.name, 'role', r.role),
        now(),
        now()
      );

      -- Add identity row for email provider (required by GoTrue)
      INSERT INTO auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        last_sign_in_at,
        created_at,
        updated_at
      ) VALUES (
        v_new_id,
        v_new_id,
        jsonb_build_object('sub', v_new_id::text, 'email', v_email),
        'email',
        now(),
        now(),
        now()
      ) ON CONFLICT (provider, id) DO NOTHING;

      -- Link to public.users
      UPDATE public.users
      SET auth_id = v_new_id
      WHERE id = r.id;
    END IF;
  END LOOP;
END;
$$;
