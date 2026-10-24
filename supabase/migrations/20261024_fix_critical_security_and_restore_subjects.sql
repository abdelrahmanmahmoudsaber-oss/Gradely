-- ==============================================================================
-- Migration: 20261024_fix_critical_security_and_restore_subjects.sql
-- Description:
-- 1. [CRITICAL CVSS 9.1]: Revoke get_system_backup_data from anon/public. Require server is_admin().
-- 2. [MEDIUM CVSS 6.5]: Add verify_is_admin RPC verifying token + role on server.
-- 3. [T1-F1 TIMING ORACLE]: Harden verify_legacy_login with single crypt pass & jitter.
-- 4. [T1-F2 GET QUERY LEAK]: Enforce POST method on all sensitive token RPCs.
-- 5. [T2-F1 STUDENT ROSTER LEAK]: get_my_subjects returns 0 foreign student IDs.
-- 6. [T2-F2 CONFIG LEAK]: Revoke get_system_visibility from anon.
-- 7. [ACTIVE SESSIONS HARDENING]: Revoke direct table access to active_sessions & enforce ownership checks.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. FIX CRITICAL (CVSS 9.1): LOCK DOWN get_system_backup_data
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_system_backup_data(text);
DROP FUNCTION IF EXISTS public.get_system_backup_data();

CREATE OR REPLACE FUNCTION public.get_system_backup_data(p_backup_secret text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_res jsonb;
BEGIN
  IF current_setting('request.method', true) = 'GET' THEN
    RAISE EXCEPTION 'Method Not Allowed' USING errcode = '42501';
  END IF;

  -- Strict server-side authorization: caller MUST be authenticated admin, super_admin, or service_role
  IF NOT (
    (auth.uid() IS NOT NULL AND public.is_admin())
    OR (COALESCE(auth.jwt() ->> 'role', '') = 'service_role')
    OR (current_user IN ('postgres', 'supabase_admin'))
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Administrator authentication required' USING errcode = '42501';
  END IF;

  SELECT jsonb_build_object(
    'users', (
      SELECT jsonb_agg(u)
      FROM (
        SELECT id, user_id, name, role, year_level, section, assigned_subjects
        FROM public.users
        ORDER BY section ASC, user_id ASC
      ) u
    ),
    'subjects', (
      SELECT jsonb_agg(s)
      FROM (
        SELECT id, name, year_level, total_weeks, instructor_name, instructor_id, enrolled_students, excluded_students
        FROM public.subjects
        ORDER BY year_level ASC, name ASC
      ) s
    ),
    'attendance', (
      SELECT jsonb_agg(a)
      FROM (
        SELECT student_id, subject_id, week_number, status
        FROM public.attendance
      ) a
    ),
    'grades', (
      SELECT jsonb_agg(g)
      FROM (
        SELECT student_id, subject_id, quiz_1, quiz_2, project, attendance_score, final_grade, custom_grades
        FROM public.grades
      ) g
    )
  ) INTO v_res;

  RETURN v_res;
END;
$$;

REVOKE ALL ON FUNCTION public.get_system_backup_data(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_system_backup_data(text) TO authenticated, service_role;
ALTER FUNCTION public.get_system_backup_data(text) OWNER TO postgres;


-- ------------------------------------------------------------------------------
-- 2. FIX MEDIUM: SERVER-SIDE ROLE VERIFICATION (PREVENTS FORGED ADMIN SESSIONS)
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.verify_is_admin(text, text);
DROP FUNCTION IF EXISTS public.verify_is_admin(text);

CREATE OR REPLACE FUNCTION public.verify_is_admin(
  p_user_id text,
  p_session_token text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('request.method', true) = 'GET' THEN
    RAISE EXCEPTION 'Method Not Allowed' USING errcode = '42501';
  END IF;

  IF p_user_id IS NULL OR TRIM(p_user_id) = '' THEN
    RETURN false;
  END IF;

  -- 1. Check if authenticated via Supabase Auth as admin
  IF auth.uid() IS NOT NULL AND public.is_admin() THEN
    RETURN true;
  END IF;

  -- 2. For legacy login: require a valid, unexpired session token
  IF p_session_token IS NOT NULL AND TRIM(p_session_token) <> '' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.student_sessions
      WHERE token = TRIM(p_session_token)
        AND LOWER(user_id) = LOWER(TRIM(p_user_id))
        AND expires_at > now()
    ) THEN
      RETURN false;
    END IF;
  ELSE
    RETURN false;
  END IF;

  -- 3. Verify user's database role
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE LOWER(user_id) = LOWER(TRIM(p_user_id))
      AND role IN ('admin', 'super_admin')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_is_admin(text, text) TO anon, authenticated;
ALTER FUNCTION public.verify_is_admin(text, text) OWNER TO postgres;


-- ------------------------------------------------------------------------------
-- 3. CLOSE T1-F1: TIMING ORACLE REMEDIATION IN verify_legacy_login
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_legacy_login(p_user_id text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user          RECORD;
  v_clean_id      text;
  v_clean_pass    text;
  v_pass_valid    boolean := false;
  v_session_token text;
  v_attempt_count int     := 0;
  v_is_locked     boolean := false;
  v_locked_until  timestamptz;
  v_last_attempt  timestamptz;
  v_max_attempts  int     := 5;
  v_dummy_hash    text    := '$2a$10$7lextLm1cEOuRlz4XMiV9uu012345678901234567890123456789';
  v_computed_hash text;
BEGIN
  IF current_setting('request.method', true) = 'GET' THEN
    RAISE EXCEPTION 'Method Not Allowed' USING errcode = '42501';
  END IF;

  v_clean_id   := LOWER(TRIM(COALESCE(p_user_id, '')));
  v_clean_pass := TRIM(COALESCE(p_password, ''));

  IF v_clean_id = '' OR v_clean_pass = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_credentials');
  END IF;

  -- 1. TRANSACTION-LEVEL SERIALIZATION
  PERFORM pg_advisory_xact_lock(hashtext('verify_legacy_login:' || v_clean_id));

  -- 2. FETCH ATTEMPT & LOCKOUT STATE
  SELECT attempts, locked_until, last_attempt
  INTO v_attempt_count, v_locked_until, v_last_attempt
  FROM public.login_attempts
  WHERE LOWER(user_id) = v_clean_id;

  v_attempt_count := COALESCE(v_attempt_count, 0);

  IF v_locked_until IS NOT NULL AND v_locked_until > now() THEN
    v_is_locked := true;
  ELSIF v_locked_until IS NOT NULL AND v_locked_until <= now() THEN
    v_attempt_count := 0;
    v_is_locked := false;
  ELSIF v_last_attempt IS NOT NULL AND v_last_attempt < now() - interval '15 minutes' THEN
    v_attempt_count := 0;
    v_is_locked := false;
  END IF;

  -- 3. FETCH USER RECORD
  SELECT id, user_id, name, role, password,
         year_level, section, assigned_subjects, auth_id, last_sign_in_at
  INTO v_user
  FROM public.users
  WHERE LOWER(user_id) = v_clean_id
  LIMIT 1;

  -- 4. NONEXISTENT USER: Single crypt pass + random jitter (Finding T1-F1)
  IF v_user IS NULL THEN
    PERFORM crypt(v_clean_pass, v_dummy_hash);
    PERFORM pg_sleep(0.010 + (random() * 0.020));

    IF v_is_locked THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'rate_limited',
        'message', 'تم قفل الحساب مؤقتاً بسبب كثرة المحاولات. يرجى الانتظار 15 دقيقة ثم المحاولة مجدداً.'
      );
    END IF;

    BEGIN
      INSERT INTO public.login_attempts (user_id, attempts, last_attempt, locked_until)
      VALUES (v_clean_id, 1, now(), NULL)
      ON CONFLICT (user_id) DO UPDATE
        SET attempts = CASE
              WHEN public.login_attempts.locked_until IS NOT NULL AND public.login_attempts.locked_until <= now() THEN 1
              WHEN public.login_attempts.last_attempt < now() - interval '15 minutes' THEN 1
              ELSE public.login_attempts.attempts + 1
            END,
            last_attempt = now(),
            locked_until = CASE
              WHEN (CASE
                WHEN public.login_attempts.locked_until IS NOT NULL AND public.login_attempts.locked_until <= now() THEN 1
                WHEN public.login_attempts.last_attempt < now() - interval '15 minutes' THEN 1
                ELSE public.login_attempts.attempts + 1
              END) >= v_max_attempts THEN now() + interval '15 minutes'
              ELSE NULL
            END;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    RETURN jsonb_build_object('success', false, 'error', 'invalid_credentials');
  END IF;

  -- 5. CHECK LOCKOUT FOR EXISTING USER
  IF v_is_locked THEN
    PERFORM crypt(v_clean_pass, v_dummy_hash);
    RETURN jsonb_build_object(
      'success', false,
      'error', 'rate_limited',
      'message', 'تم قفل الحساب مؤقتاً بسبب كثرة المحاولات. يرجى الانتظار 15 دقيقة ثم المحاولة مجدداً.'
    );
  END IF;

  -- 6. VERIFY PASSWORD: Strictly ONE crypt evaluation for equal timing
  IF v_user.password IS NOT NULL THEN
    IF v_user.password ~ '^[$]2[abxy][$][0-9]{2}[$]' AND LENGTH(v_user.password) = 60 THEN
      v_computed_hash := crypt(v_clean_pass, v_user.password);
      IF v_computed_hash = v_user.password THEN
        v_pass_valid := true;
      END IF;
    ELSE
      PERFORM crypt(v_clean_pass, v_dummy_hash);
      IF v_user.password = v_clean_pass OR v_user.password = p_password THEN
        v_pass_valid := true;
      END IF;
    END IF;
  ELSE
    PERFORM crypt(v_clean_pass, v_dummy_hash);
  END IF;

  PERFORM pg_sleep(0.010 + (random() * 0.020));

  -- 7. FAILED LOGIN
  IF NOT v_pass_valid THEN
    INSERT INTO public.login_attempts (user_id, attempts, last_attempt, locked_until)
    VALUES (v_clean_id, 1, now(), NULL)
    ON CONFLICT (user_id) DO UPDATE
      SET attempts = CASE
            WHEN public.login_attempts.locked_until IS NOT NULL AND public.login_attempts.locked_until <= now() THEN 1
            WHEN public.login_attempts.last_attempt < now() - interval '15 minutes' THEN 1
            ELSE public.login_attempts.attempts + 1
          END,
          last_attempt = now(),
          locked_until = CASE
            WHEN (CASE
              WHEN public.login_attempts.locked_until IS NOT NULL AND public.login_attempts.locked_until <= now() THEN 1
              WHEN public.login_attempts.last_attempt < now() - interval '15 minutes' THEN 1
              ELSE public.login_attempts.attempts + 1
            END) >= v_max_attempts THEN now() + interval '15 minutes'
            ELSE NULL
          END;

    RETURN jsonb_build_object('success', false, 'error', 'invalid_credentials');
  END IF;

  -- 8. SUCCESSFUL LOGIN
  DELETE FROM public.login_attempts WHERE LOWER(user_id) = v_clean_id;

  v_session_token := encode(gen_random_bytes(32), 'hex');

  DELETE FROM public.student_sessions WHERE LOWER(user_id) = v_clean_id;

  INSERT INTO public.student_sessions (user_id, token, created_at, expires_at)
  VALUES (v_clean_id, v_session_token, now(), now() + interval '24 hours');

  UPDATE public.users 
  SET last_sign_in_at = now() 
  WHERE LOWER(user_id) = v_clean_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_token', v_session_token,
    'user', jsonb_build_object(
      'id', v_user.id,
      'user_id', v_user.user_id,
      'name', v_user.name,
      'role', v_user.role,
      'year_level', v_user.year_level,
      'section', v_user.section,
      'assigned_subjects', COALESCE(v_user.assigned_subjects, '[]'::jsonb)
    )
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.verify_legacy_login(text, text) TO anon, authenticated;
ALTER FUNCTION public.verify_legacy_login(text, text) OWNER TO postgres;


-- ------------------------------------------------------------------------------
-- 4. CLOSE T1-F2: ENFORCE POST ON verify_student_token_for_user
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
      AND LOWER(user_id) = LOWER(TRIM(p_user_id))
      AND expires_at > now()
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.verify_student_token_for_user(text, text) TO anon, authenticated;
ALTER FUNCTION public.verify_student_token_for_user(text, text) OWNER TO postgres;


-- ------------------------------------------------------------------------------
-- 5. CLOSE T2-F2: REVOKE get_system_visibility FROM ANON
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_system_visibility() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_system_visibility() TO authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 6. RESTORE SUBJECTS VISIBILITY FOR ALL STUDENTS (CLOSE T2-F1)
-- ------------------------------------------------------------------------------
REVOKE ALL ON TABLE public.subjects FROM anon;
GRANT SELECT (id, name, year_level, total_weeks, instructor_name, created_at) 
ON TABLE public.subjects TO anon, authenticated;

DROP FUNCTION IF EXISTS public.get_my_subjects(text, text);
DROP FUNCTION IF EXISTS public.get_my_subjects(text);
DROP FUNCTION IF EXISTS public.get_my_subjects();

CREATE OR REPLACE FUNCTION public.get_my_subjects(p_session_token text DEFAULT NULL)
RETURNS SETOF public.subjects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('request.method', true) = 'GET' THEN
    RAISE EXCEPTION 'Method Not Allowed' USING errcode = '42501';
  END IF;

  -- Return all subjects with instructor names, but EMPTY enrolled_students so NO foreign student IDs leak (T2-F1)
  RETURN QUERY
  SELECT 
    s.id,
    s.name,
    s.year_level,
    s.total_weeks,
    s.created_at,
    s.instructor_name,
    s.instructor_id,
    '[]'::jsonb AS enrolled_students,
    '[]'::jsonb AS excluded_students
  FROM public.subjects s
  ORDER BY s.year_level ASC, s.name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_subjects(text) TO anon, authenticated;
ALTER FUNCTION public.get_my_subjects(text) OWNER TO postgres;


-- ------------------------------------------------------------------------------
-- 7. HARDEN ACTIVE SESSIONS: TABLE RLS & RPC SECURITY
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

-- STRICT LOCKDOWN: Prevent direct table SELECT/INSERT/DELETE by anon or public
REVOKE ALL ON TABLE public.active_sessions FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.active_sessions TO authenticated, service_role;
ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Active sessions access" ON public.active_sessions;

DROP FUNCTION IF EXISTS public.register_active_session(text, text, text, text);
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
  IF current_setting('request.method', true) = 'GET' THEN
    RAISE EXCEPTION 'Method Not Allowed' USING errcode = '42501';
  END IF;

  IF p_user_id IS NULL OR p_session_token IS NULL OR TRIM(p_session_token) = '' THEN
    RETURN jsonb_build_object('success', false);
  END IF;

  -- Ensure target user exists
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE LOWER(user_id) = LOWER(TRIM(p_user_id))) THEN
    RETURN jsonb_build_object('success', false);
  END IF;

  INSERT INTO public.active_sessions (user_id, token, device_name, device_type, last_active, expires_at)
  VALUES (
    LOWER(TRIM(p_user_id)),
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
ALTER FUNCTION public.register_active_session(text, text, text, text) OWNER TO postgres;

DROP FUNCTION IF EXISTS public.get_my_active_sessions(text, text);
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
  IF current_setting('request.method', true) = 'GET' THEN
    RAISE EXCEPTION 'Method Not Allowed' USING errcode = '42501';
  END IF;

  IF p_user_id IS NULL OR p_session_token IS NULL OR TRIM(p_session_token) = '' THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Authorization check: Caller MUST own this session token
  IF NOT EXISTS (
    SELECT 1 FROM public.active_sessions
    WHERE LOWER(user_id) = LOWER(TRIM(p_user_id))
      AND token = TRIM(p_session_token)
      AND expires_at > now()
  ) THEN
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
  WHERE LOWER(user_id) = LOWER(TRIM(p_user_id))
    AND expires_at > now();

  RETURN COALESCE(v_res, '[]'::jsonb);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_active_sessions(text, text) TO anon, authenticated;
ALTER FUNCTION public.get_my_active_sessions(text, text) OWNER TO postgres;

DROP FUNCTION IF EXISTS public.revoke_target_session(text, text, uuid);
DROP FUNCTION IF EXISTS public.revoke_target_session(text, text, text);
CREATE OR REPLACE FUNCTION public.revoke_target_session(
  p_user_id text,
  p_session_token text,
  p_target_session_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('request.method', true) = 'GET' THEN
    RAISE EXCEPTION 'Method Not Allowed' USING errcode = '42501';
  END IF;

  IF p_user_id IS NULL OR p_session_token IS NULL OR p_target_session_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_params');
  END IF;

  -- Authorization check: Caller MUST have a valid registered session
  IF NOT EXISTS (
    SELECT 1 FROM public.active_sessions
    WHERE LOWER(user_id) = LOWER(TRIM(p_user_id))
      AND token = TRIM(p_session_token)
      AND expires_at > now()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  DELETE FROM public.active_sessions
  WHERE id::text = TRIM(p_target_session_id) AND LOWER(user_id) = LOWER(TRIM(p_user_id));

  RETURN jsonb_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.revoke_target_session(text, text, text) TO anon, authenticated;
ALTER FUNCTION public.revoke_target_session(text, text, text) OWNER TO postgres;

DROP FUNCTION IF EXISTS public.revoke_all_other_sessions(text, text);
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
  IF current_setting('request.method', true) = 'GET' THEN
    RAISE EXCEPTION 'Method Not Allowed' USING errcode = '42501';
  END IF;

  IF p_user_id IS NULL OR p_session_token IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_params');
  END IF;

  -- Authorization check: Caller MUST have a valid registered session
  IF NOT EXISTS (
    SELECT 1 FROM public.active_sessions
    WHERE LOWER(user_id) = LOWER(TRIM(p_user_id))
      AND token = TRIM(p_session_token)
      AND expires_at > now()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  DELETE FROM public.active_sessions 
  WHERE LOWER(user_id) = LOWER(TRIM(p_user_id)) AND token <> TRIM(p_session_token);

  RETURN jsonb_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.revoke_all_other_sessions(text, text) TO anon, authenticated;
ALTER FUNCTION public.revoke_all_other_sessions(text, text) OWNER TO postgres;
