-- ==============================================================================
-- Migration: 20261024_sync_ashraf_auth_account.sql
-- Synchronize TA Ashraf Hussein (ahamdy2004) with Supabase Auth (auth.users & auth.identities)
-- Ensures 100% identical native Supabase Auth status to Abdelrahman and Mostafa Tag.
-- ==============================================================================

DO $$
DECLARE
  v_user RECORD;
  v_auth_id uuid;
  v_email text := 'ahamdy2004@gradely.app';
  v_encrypted_pw text;
BEGIN
  -- 1. Fetch user profile from public.users
  SELECT * INTO v_user 
  FROM public.users 
  WHERE LOWER(user_id) = 'ahamdy2004'
  LIMIT 1;

  IF v_user IS NULL THEN
    -- Try finding by name in case user_id is slightly different
    SELECT * INTO v_user 
    FROM public.users 
    WHERE name LIKE '%أشرف%' OR name LIKE '%اشرف%'
    LIMIT 1;
  END IF;

  IF v_user IS NULL THEN
    RAISE NOTICE 'User ahamdy2004 / Ashraf not found in public.users. Creating account...';
    INSERT INTO public.users (user_id, name, role, assigned_subjects)
    VALUES (
      'ahamdy2004',
      'أشرف حسين',
      'admin',
      ARRAY[
        'YEAR1_MATH0:all',
        'YEAR2_CNT:all',
        'YEAR2_OOP:all',
        'YEAR4_ACN:all',
        'YEAR4_CG:all'
      ]
    )
    RETURNING * INTO v_user;
  END IF;

  -- Ensure role is admin
  UPDATE public.users 
  SET role = 'admin' 
  WHERE id = v_user.id;

  -- 2. Determine password hash
  IF v_user.password IS NOT NULL AND v_user.password ~ '^\$2[aby]\$' THEN
    v_encrypted_pw := v_user.password;
  ELSE
    -- If plain text or NULL, encrypt it with bcrypt
    v_encrypted_pw := extensions.crypt(COALESCE(v_user.password, 'Gradely@2026'), extensions.gen_salt('bf'));
    UPDATE public.users SET password = v_encrypted_pw WHERE id = v_user.id;
  END IF;

  -- 3. Check for existing auth account by email or old username
  SELECT id INTO v_auth_id 
  FROM auth.users 
  WHERE LOWER(email) = v_email 
     OR LOWER(email) = 'mostafaabubakr@gradely.app'
  ORDER BY created_at DESC 
  LIMIT 1;

  IF v_auth_id IS NOT NULL THEN
    -- Update existing auth.users record
    UPDATE auth.users
    SET email = v_email,
        encrypted_password = v_encrypted_pw,
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
        raw_user_meta_data = jsonb_build_object(
          'user_id', v_user.user_id,
          'name', v_user.name,
          'role', 'admin'
        ),
        updated_at = now()
    WHERE id = v_auth_id;

    -- Update or insert auth.identities
    DELETE FROM auth.identities WHERE user_id = v_auth_id;
    INSERT INTO auth.identities (
      id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      v_auth_id::text,
      v_auth_id,
      jsonb_build_object('sub', v_auth_id::text, 'email', v_email),
      'email',
      now(),
      now(),
      now()
    );
  ELSE
    -- Create brand new auth.users record
    v_auth_id := gen_random_uuid();
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
      v_auth_id,
      'authenticated',
      'authenticated',
      v_email,
      v_encrypted_pw,
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object(
        'user_id', v_user.user_id,
        'name', v_user.name,
        'role', 'admin'
      ),
      now(),
      now()
    );

    INSERT INTO auth.identities (
      id,
      provider_id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      v_auth_id::text,
      v_auth_id,
      jsonb_build_object('sub', v_auth_id::text, 'email', v_email),
      'email',
      now(),
      now(),
      now()
    );
  END IF;

  -- 4. Clean up any leftover duplicate/stale records for mostafaabubakr
  DELETE FROM auth.identities WHERE user_id IN (
    SELECT id FROM auth.users WHERE LOWER(email) = 'mostafaabubakr@gradely.app' AND id <> v_auth_id
  );
  DELETE FROM auth.users WHERE LOWER(email) = 'mostafaabubakr@gradely.app' AND id <> v_auth_id;

  -- 5. Link auth_id into public.users and ensure all 5 subjects are assigned
  UPDATE public.users
  SET auth_id = v_auth_id,
      role = 'admin',
      assigned_subjects = ARRAY[
        'YEAR1_MATH0:all',
        'YEAR2_CNT:all',
        'YEAR2_OOP:all',
        'YEAR4_ACN:all',
        'YEAR4_CG:all'
      ]
  WHERE id = v_user.id;

  -- 6. Ensure subjects have instructor_id = ahamdy2004
  UPDATE public.subjects
  SET instructor_id = 'ahamdy2004',
      instructor_name = v_user.name
  WHERE id IN ('YEAR1_MATH0', 'YEAR2_CNT', 'YEAR2_OOP', 'YEAR4_ACN', 'YEAR4_CG')
     OR instructor_id = 'mostafaabubakr';

  -- 7. Clear any lockout on ahamdy2004
  DELETE FROM public.login_attempts WHERE LOWER(user_id) IN ('ahamdy2004', 'mostafaabubakr', v_email);

  RAISE NOTICE 'Successfully synced Ashraf Hussein (ahamdy2004) with auth_id %', v_auth_id;
END $$;
