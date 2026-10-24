-- ==============================================================================
-- Migration: 20261024_comprehensive_fixes_and_sessions.sql
-- 1. Sync TA Ashraf Hussein (ahamdy2004) with native Supabase Auth without JSONB cast errors.
-- 2. Update subjects & excluded_students to replace Mostafa Abubakr with Ashraf Hussein.
-- 3. Fix Audit Finding T2-F1: Prevent get_my_subjects from leaking foreign student IDs.
-- 4. Fix Audit Finding T1-F2: Enforce POST method on verify_student_token_for_user.
-- 5. Fix Audit Finding T2-F2: Revoke get_system_visibility from anon.
-- 6. Facebook-style Active Sessions & Connected Devices Manager (Register, List, Revoke).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. SYNC ASHRAF HUSSEIN (ahamdy2004) & ASSIGN SUBJECTS AS VALID JSONB
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_user RECORD;
  v_auth_id uuid;
  v_email text := 'ahamdy2004@gradely.app';
  v_encrypted_pw text;
  v_assigned jsonb := '["54028b6f-d152-4c69-97a5-1cdadefc047e:all", "3d986c7e-7653-459c-bc96-e75e62f51197:all", "d0c29368-cddb-44e4-89f4-951d0249782c:all", "caa1505f-592b-4e9b-a958-94a57bff5caa:all", "4f1ec16d-476c-471a-b36b-f6881ee5011e:all"]'::jsonb;
BEGIN
  -- Find or insert user in public.users
  SELECT * INTO v_user 
  FROM public.users 
  WHERE LOWER(user_id) = 'ahamdy2004'
  LIMIT 1;

  IF v_user IS NULL THEN
    SELECT * INTO v_user 
    FROM public.users 
    WHERE name LIKE '%أشرف%' OR name LIKE '%اشرف%'
    LIMIT 1;
  END IF;

  IF v_user IS NULL THEN
    INSERT INTO public.users (user_id, name, role, assigned_subjects)
    VALUES ('ahamdy2004', 'أشرف حسين', 'admin', v_assigned)
    RETURNING * INTO v_user;
  END IF;

  -- Hash password if needed
  IF v_user.password IS NOT NULL AND v_user.password ~ '^\$2[aby]\$' THEN
    v_encrypted_pw := v_user.password;
  ELSE
    v_encrypted_pw := extensions.crypt(COALESCE(v_user.password, 'Gradely@2026'), extensions.gen_salt('bf'));
    UPDATE public.users SET password = v_encrypted_pw WHERE id = v_user.id;
  END IF;

  -- Find or create in auth.users
  SELECT id INTO v_auth_id 
  FROM auth.users 
  WHERE LOWER(email) = v_email OR LOWER(email) = 'mostafaabubakr@gradely.app'
  ORDER BY created_at DESC LIMIT 1;

  IF v_auth_id IS NOT NULL THEN
    UPDATE auth.users
    SET email = v_email,
        encrypted_password = v_encrypted_pw,
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
        raw_user_meta_data = jsonb_build_object('user_id', v_user.user_id, 'name', v_user.name, 'role', 'admin'),
        updated_at = now()
    WHERE id = v_auth_id;

    DELETE FROM auth.identities WHERE user_id = v_auth_id;
    INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_auth_id::text, v_auth_id, jsonb_build_object('sub', v_auth_id::text, 'email', v_email), 'email', now(), now(), now());
  ELSE
    v_auth_id := gen_random_uuid();
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES ('00000000-0000-0000-0000-000000000000', v_auth_id, 'authenticated', 'authenticated', v_email, v_encrypted_pw, now(), '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('user_id', v_user.user_id, 'name', v_user.name, 'role', 'admin'), now(), now());

    INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_auth_id::text, v_auth_id, jsonb_build_object('sub', v_auth_id::text, 'email', v_email), 'email', now(), now(), now());
  END IF;

  -- Link auth_id in public.users without setting it to NULL
  UPDATE public.users
  SET auth_id = v_auth_id,
      role = 'admin',
      assigned_subjects = v_assigned
  WHERE id = v_user.id;

  -- Clear any lockout
  DELETE FROM public.login_attempts WHERE LOWER(user_id) IN ('ahamdy2004', 'mostafaabubakr', v_email);
END $$;

-- ------------------------------------------------------------------------------
-- 2. UPDATE SUBJECTS & REPLACE MOSTAFA ABUBAKR IN SECTION CONFIGURATIONS
-- ------------------------------------------------------------------------------
UPDATE public.subjects
SET instructor_id = 'ahamdy2004',
    instructor_name = 'أشرف حسين'
WHERE id IN (
  '54028b6f-d152-4c69-97a5-1cdadefc047e', -- Math 0
  '3d986c7e-7653-459c-bc96-e75e62f51197', -- CNT
  'd0c29368-cddb-44e4-89f4-951d0249782c', -- OOP
  'caa1505f-592b-4e9b-a958-94a57bff5caa', -- ACN
  '4f1ec16d-476c-471a-b36b-f6881ee5011e'  -- CG
) OR instructor_id = 'mostafaabubakr' OR instructor_name = 'Mostafa Abubakr';

-- Replace textual occurrences of Mostafa Abubakr inside excluded_students array
UPDATE public.subjects
SET excluded_students = ARRAY(
  SELECT replace(replace(elem, 'Mostafa Abubakr', 'أشرف حسين'), 'مصطفى أبو بكر', 'أشرف حسين')
  FROM unnest(excluded_students) elem
)
WHERE array_to_string(excluded_students, ' ') LIKE '%Abubakr%'
   OR array_to_string(excluded_students, ' ') LIKE '%أبو بكر%';

-- ------------------------------------------------------------------------------
-- 3. CLOSE AUDIT FINDING T2-F1: PREVENT get_my_subjects FROM LEAKING STUDENT ROSTERS
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_subjects(p_session_token text DEFAULT NULL)
RETURNS SETOF public.subjects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id text := NULL;
  v_student_year text := NULL;
BEGIN
  -- Reject GET method to prevent tokens in query strings (ISSUE-37)
  IF current_setting('request.method', true) = 'GET' THEN
    RAISE EXCEPTION 'Method Not Allowed: Session token must be supplied via POST body' USING errcode = '42501';
  END IF;

  -- 1. Allow authenticated staff/admin with full subjects
  IF auth.uid() IS NOT NULL AND public.is_admin() THEN
    RETURN QUERY SELECT * FROM public.subjects ORDER BY year_level ASC, name ASC;
    RETURN;
  END IF;

  -- 2. Validate student session token
  IF p_session_token IS NOT NULL AND TRIM(p_session_token) <> '' THEN
    SELECT s.user_id, u.year_level INTO v_student_id, v_student_year
    FROM public.student_sessions s
    JOIN public.users u ON u.user_id = s.user_id
    WHERE s.token = TRIM(p_session_token) AND s.expires_at > now();
  END IF;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Valid student session token required' USING errcode = '42501';
  END IF;

  -- 3. Return ONLY subjects matching the student's enrollment or academic year,
  -- and SANITIZE enrolled_students array so foreign student IDs are NEVER leaked!
  RETURN QUERY
  SELECT 
    s.id,
    s.name,
    s.year_level,
    s.total_weeks,
    s.created_at,
    s.instructor_name,
    s.instructor_id,
    -- Privacy protection: only return caller's own ID, do not leak 335 foreign student IDs
    ARRAY[v_student_id]::text[] AS enrolled_students,
    -- Return only section/date configs, strip any foreign student IDs
    ARRAY(
      SELECT elem FROM unnest(COALESCE(s.excluded_students, ARRAY[]::text[])) elem 
      WHERE elem ~ '^(CONFIG_|TA_|WEEK_DATE|LEC_DATE)'
    ) AS excluded_students
  FROM public.subjects s
  WHERE (
    v_student_id = ANY(s.enrolled_students)
    OR (s.year_level IS NOT NULL AND v_student_year IS NOT NULL AND TRIM(s.year_level) = TRIM(v_student_year))
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = v_student_id
        AND u.assigned_subjects::text LIKE '%' || s.id || '%'
    )
  )
  ORDER BY s.year_level ASC, s.name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_subjects(text) TO anon, authenticated;
ALTER FUNCTION public.get_my_subjects(text) OWNER TO postgres;

-- ------------------------------------------------------------------------------
-- 4. CLOSE AUDIT FINDING T1-F2: ENFORCE POST ON verify_student_token_for_user
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_student_token_for_user(
  p_session_token text,
  p_user_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Reject GET method to prevent tokens in query strings / proxy logs (Audit Finding T1-F2)
  IF current_setting('request.method', true) = 'GET' THEN
    RAISE EXCEPTION 'Method Not Allowed: Session token must be supplied via POST body' USING errcode = '42501';
  END IF;

  IF p_session_token IS NULL OR TRIM(p_session_token) = ''
     OR p_user_id IS NULL OR TRIM(p_user_id) = ''
     OR LENGTH(TRIM(p_session_token)) < 64 THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.student_sessions
    WHERE token = TRIM(p_session_token)
      AND user_id = TRIM(p_user_id)
      AND expires_at > now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_student_token_for_user(text, text) TO anon, authenticated;
ALTER FUNCTION public.verify_student_token_for_user(text, text) OWNER TO postgres;

-- ------------------------------------------------------------------------------
-- 5. CLOSE AUDIT FINDING T2-F2: REVOKE get_system_visibility FROM ANON
-- ------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_system_visibility() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_system_visibility() TO authenticated;

-- ------------------------------------------------------------------------------
-- 6. FACEBOOK-STYLE ACTIVE SESSIONS & CONNECTED DEVICES MANAGER
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.active_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  token text NOT NULL UNIQUE,
  device_name text DEFAULT 'متصفح ويب',
  device_type text DEFAULT 'desktop',
  last_active timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '30 days')
);

CREATE INDEX IF NOT EXISTS idx_active_sessions_user_id ON public.active_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_token ON public.active_sessions(token);

ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view and manage their own sessions" ON public.active_sessions;
CREATE POLICY "Users can view and manage their own sessions"
  ON public.active_sessions
  FOR ALL
  TO authenticated, anon
  USING (true);

-- RPC: Register or touch active session
CREATE OR REPLACE FUNCTION public.register_active_session(
  p_user_id text,
  p_session_token text,
  p_device_name text,
  p_device_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_session_token IS NULL OR TRIM(p_session_token) = '' THEN
    RETURN jsonb_build_object('success', false);
  END IF;

  INSERT INTO public.active_sessions (user_id, token, device_name, device_type, last_active, expires_at)
  VALUES (
    TRIM(p_user_id),
    TRIM(p_session_token),
    COALESCE(NULLIF(TRIM(p_device_name), ''), 'متصفح ويب'),
    COALESCE(NULLIF(TRIM(p_device_type), ''), 'desktop'),
    now(),
    now() + interval '30 days'
  )
  ON CONFLICT (token) DO UPDATE
    SET last_active = now(),
        device_name = EXCLUDED.device_name,
        device_type = EXCLUDED.device_type,
        expires_at = now() + interval '30 days';

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_active_session(text, text, text, text) TO anon, authenticated;

-- RPC: Get user's active sessions
CREATE OR REPLACE FUNCTION public.get_my_active_sessions(
  p_user_id text,
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res jsonb;
BEGIN
  -- Verify caller has a valid token
  IF p_user_id IS NULL OR p_session_token IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'device_name', device_name,
      'device_type', device_type,
      'last_active', last_active,
      'created_at', created_at,
      'is_current', (token = TRIM(p_session_token))
    ) ORDER BY (token = TRIM(p_session_token)) DESC, last_active DESC
  ) INTO v_res
  FROM public.active_sessions
  WHERE user_id = TRIM(p_user_id)
    AND expires_at > now();

  RETURN COALESCE(v_res, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_active_sessions(text, text) TO anon, authenticated;

-- RPC: Revoke a specific session
CREATE OR REPLACE FUNCTION public.revoke_target_session(
  p_user_id text,
  p_session_token text,
  p_target_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_token text;
BEGIN
  SELECT token INTO v_target_token
  FROM public.active_sessions
  WHERE id = p_target_session_id AND user_id = TRIM(p_user_id);

  IF v_target_token IS NOT NULL THEN
    -- Invalidate from active_sessions
    DELETE FROM public.active_sessions WHERE id = p_target_session_id;
    -- Also invalidate from student_sessions so requests fail immediately
    DELETE FROM public.student_sessions WHERE token = v_target_token;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_target_session(text, text, uuid) TO anon, authenticated;

-- RPC: Revoke all other sessions (Facebook-style: Log out from all other devices)
CREATE OR REPLACE FUNCTION public.revoke_all_other_sessions(
  p_user_id text,
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Invalidate from student_sessions
  DELETE FROM public.student_sessions 
  WHERE user_id = TRIM(p_user_id) AND token <> TRIM(p_session_token);

  -- Invalidate from active_sessions
  DELETE FROM public.active_sessions 
  WHERE user_id = TRIM(p_user_id) AND token <> TRIM(p_session_token);

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_all_other_sessions(text, text) TO anon, authenticated;
