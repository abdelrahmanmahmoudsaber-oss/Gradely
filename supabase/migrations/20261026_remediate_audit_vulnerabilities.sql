-- ==============================================================================
-- GRADELY SECURITY REMEDIATION MIGRATION (AUDIT 2025)
-- Date: 2026-10-26
-- Target Database: Supabase (bbdyexsaqnlremprfmph)
--
-- FIXES INCLUDED:
-- 1. [HIGH] ISSUE-1: Lockdown get_system_backup_data
--    - Rejects empty bodies {}, unauthenticated callers, and anon users.
--    - Requires valid Admin session token OR automated backup cron secret.
-- 2. [MEDIUM] ISSUE-6: Fix Account Lockout DoS in verify_legacy_login
--    - Keys failed attempt rate-limiting per (user_id + client_ip).
--    - Prevents malicious actors from locking out legitimate students.
-- 3. [MEDIUM] ISSUE-7: Fix Unauthenticated Session Planting in register_active_session
--    - Verifies that p_session_token belongs to p_user_id and is active.
--    - Rejects arbitrary token planting. Caps active sessions to 10 per user.
-- 4. [LOW] ISSUE-5: Restrict subjects column grants for anon
--    - Exposes only necessary public fields, shielding internal metadata.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. REMEDIATE ISSUE-1: LOCKDOWN get_system_backup_data
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_system_backup_data(text);
DROP FUNCTION IF EXISTS public.get_system_backup_data(text, text);
DROP FUNCTION IF EXISTS public.get_system_backup_data();

CREATE OR REPLACE FUNCTION public.get_system_backup_data(
  p_session_token text DEFAULT NULL,
  p_cron_secret   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_is_authorized boolean := false;
  v_secret_val    text;
  v_clean_token   text;
BEGIN
  -- Disallow GET requests
  IF current_setting('request.method', true) = 'GET' THEN
    RAISE EXCEPTION 'Method Not Allowed' USING errcode = '42501';
  END IF;

  v_clean_token := TRIM(COALESCE(p_session_token, ''));
  v_secret_val  := TRIM(COALESCE(p_cron_secret, ''));

  -- Path A: Supabase native Auth Admin or Service Role context
  IF (
    (auth.uid() IS NOT NULL AND public.is_admin())
    OR (COALESCE(auth.jwt() ->> 'role', '') = 'service_role')
    OR (current_user IN ('postgres', 'supabase_admin'))
  ) THEN
    v_is_authorized := true;

  -- Path B: Automated Backup Cron Secret (GitHub Actions / Cloud Cron)
  ELSIF (
    v_clean_token = 'gradely_backup_cron_sec_7f9a2b8e4c1d6e5a'
    OR v_secret_val = 'gradely_backup_cron_sec_7f9a2b8e4c1d6e5a'
  ) THEN
    v_is_authorized := true;

  -- Path C: Valid unexpired Admin Session Token
  ELSIF v_clean_token <> '' THEN
    -- Check student_sessions / admin sessions
    IF EXISTS (
      SELECT 1
      FROM public.student_sessions ss
      JOIN public.users u ON LOWER(u.user_id) = LOWER(ss.user_id)
      WHERE (ss.token = v_clean_token OR ss.session_token = v_clean_token)
        AND (ss.expires_at IS NULL OR ss.expires_at > now())
        AND u.role IN ('admin', 'super_admin')
    ) OR EXISTS (
      SELECT 1
      FROM public.active_sessions act
      JOIN public.users u ON LOWER(u.user_id) = LOWER(act.user_id)
      WHERE act.token = v_clean_token
        AND (act.expires_at IS NULL OR act.expires_at > now())
        AND u.role IN ('admin', 'super_admin')
    ) THEN
      v_is_authorized := true;
    END IF;
  END IF;

  -- Hard 42501 Unauthorized if not authorized (blocks empty body {} and unauthenticated anon)
  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Unauthorized: Administrator authentication or valid backup secret required' USING errcode = '42501';
  END IF;

  RETURN jsonb_build_object(
    'users', COALESCE((
      SELECT jsonb_agg(u)
      FROM (
        SELECT id, user_id, name, role, year_level, section, assigned_subjects
        FROM public.users
        ORDER BY section ASC, user_id ASC
      ) u
    ), '[]'::jsonb),
    'subjects', COALESCE((
      SELECT jsonb_agg(s)
      FROM (
        SELECT id, name, year_level, total_weeks, instructor_name, instructor_id, enrolled_students, excluded_students
        FROM public.subjects
        ORDER BY year_level ASC, name ASC
      ) s
    ), '[]'::jsonb),
    'attendance', COALESCE((
      SELECT jsonb_agg(a)
      FROM (
        SELECT student_id, subject_id, week_number, status
        FROM public.attendance
        ORDER BY subject_id ASC, week_number ASC
      ) a
    ), '[]'::jsonb),
    'grades', COALESCE((
      SELECT jsonb_agg(g)
      FROM (
        SELECT student_id, subject_id, quiz_1, quiz_2, project, attendance_score, final_grade
        FROM public.grades
        ORDER BY subject_id ASC
      ) g
    ), '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_system_backup_data(text, text) TO anon, authenticated;
ALTER FUNCTION public.get_system_backup_data(text, text) OWNER TO postgres;


-- ------------------------------------------------------------------------------
-- 2. REMEDIATE ISSUE-6: FIX ACCOUNT LOCKOUT DOS IN verify_legacy_login
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.login_attempts (
  user_id      text PRIMARY KEY,
  attempts     int DEFAULT 0,
  last_attempt timestamptz DEFAULT now(),
  locked_until timestamptz
);

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
  v_client_ip     text;
  v_attempt_key   text;
  v_pass_valid    boolean := false;
  v_session_token text;
  v_attempt_count int     := 0;
  v_is_locked     boolean := false;
  v_locked_until  timestamptz;
  v_last_attempt  timestamptz;
  v_max_attempts  int     := 8;
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

  -- Extract client IP from reverse proxy headers to scope rate-limiting per IP (prevents Account Lockout DoS)
  BEGIN
    v_client_ip := NULLIF(TRIM(split_part(COALESCE(
      current_setting('request.headers', true)::json->>'cf-connecting-ip',
      current_setting('request.headers', true)::json->>'x-forwarded-for',
      current_setting('request.headers', true)::json->>'x-real-ip',
      ''
    ), ',', 1)), '');
  EXCEPTION WHEN OTHERS THEN
    v_client_ip := NULL;
  END;

  -- Key attempts by user_id + client_ip if IP available, otherwise user_id
  IF v_client_ip IS NOT NULL AND v_client_ip <> '' THEN
    v_attempt_key := v_clean_id || '@ip:' || v_client_ip;
  ELSE
    v_attempt_key := v_clean_id;
  END IF;

  -- Transaction serialization
  PERFORM pg_advisory_xact_lock(hashtext('verify_legacy_login:' || v_attempt_key));

  -- Fetch attempt state for this client
  SELECT attempts, locked_until, last_attempt
  INTO v_attempt_count, v_locked_until, v_last_attempt
  FROM public.login_attempts
  WHERE user_id = v_attempt_key;

  v_attempt_count := COALESCE(v_attempt_count, 0);

  IF v_locked_until IS NOT NULL AND v_locked_until > now() THEN
    v_is_locked := true;
  ELSIF v_locked_until IS NOT NULL AND v_locked_until <= now() THEN
    v_attempt_count := 0;
    v_is_locked := false;
  ELSIF v_last_attempt IS NOT NULL AND v_last_attempt < now() - interval '10 minutes' THEN
    v_attempt_count := 0;
    v_is_locked := false;
  END IF;

  -- Fetch user record
  SELECT id, user_id, name, role, password,
         year_level, section, assigned_subjects, auth_id, last_sign_in_at
  INTO v_user
  FROM public.users
  WHERE LOWER(user_id) = v_clean_id
  LIMIT 1;

  -- Nonexistent user timing mitigation
  IF v_user IS NULL THEN
    PERFORM crypt(v_clean_pass, v_dummy_hash);
    PERFORM pg_sleep(0.010 + (random() * 0.020));

    IF v_is_locked THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'rate_limited',
        'message', 'تم قفل المحاولات مؤقتاً من هذا الجهاز لكثرة المحاولات الخاطئة. يرجى الانتظار بضع دقائق.'
      );
    END IF;

    BEGIN
      INSERT INTO public.login_attempts (user_id, attempts, last_attempt, locked_until)
      VALUES (v_attempt_key, 1, now(), NULL)
      ON CONFLICT (user_id) DO UPDATE
        SET attempts = CASE
              WHEN public.login_attempts.locked_until IS NOT NULL AND public.login_attempts.locked_until <= now() THEN 1
              WHEN public.login_attempts.last_attempt < now() - interval '10 minutes' THEN 1
              ELSE public.login_attempts.attempts + 1
            END,
            last_attempt = now(),
            locked_until = CASE
              WHEN (public.login_attempts.attempts + 1) >= v_max_attempts THEN now() + interval '10 minutes'
              ELSE NULL
            END;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    RETURN jsonb_build_object('success', false, 'error', 'invalid_credentials');
  END IF;

  -- If this specific client IP is currently locked out
  IF v_is_locked THEN
    PERFORM crypt(v_clean_pass, v_dummy_hash);
    RETURN jsonb_build_object(
      'success', false,
      'error', 'rate_limited',
      'message', 'تم قفل المحاولات مؤقتاً من هذا الجهاز لكثرة المحاولات الخاطئة. يرجى الانتظار 10 دقائق.'
    );
  END IF;

  -- Verify password
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

  -- Failed login: increment attempts for this caller
  IF NOT v_pass_valid THEN
    INSERT INTO public.login_attempts (user_id, attempts, last_attempt, locked_until)
    VALUES (v_attempt_key, 1, now(), NULL)
    ON CONFLICT (user_id) DO UPDATE
      SET attempts = CASE
            WHEN public.login_attempts.locked_until IS NOT NULL AND public.login_attempts.locked_until <= now() THEN 1
            WHEN public.login_attempts.last_attempt < now() - interval '10 minutes' THEN 1
            ELSE public.login_attempts.attempts + 1
          END,
          last_attempt = now(),
          locked_until = CASE
            WHEN (public.login_attempts.attempts + 1) >= v_max_attempts THEN now() + interval '10 minutes'
            ELSE NULL
          END;

    RETURN jsonb_build_object('success', false, 'error', 'invalid_credentials');
  END IF;

  -- Successful login: clear attempt counter for this user and IP
  DELETE FROM public.login_attempts WHERE user_id = v_attempt_key OR user_id = v_clean_id;

  v_session_token := encode(gen_random_bytes(32), 'hex');

  -- Store token in student_sessions with 30-day lifetime
  DELETE FROM public.student_sessions WHERE LOWER(user_id) = v_clean_id;

  INSERT INTO public.student_sessions (user_id, token, created_at, expires_at)
  VALUES (v_clean_id, v_session_token, now(), now() + interval '30 days');

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
-- 3. REMEDIATE ISSUE-7: FIX UNAUTHENTICATED SESSION PLANTING IN register_active_session
-- ------------------------------------------------------------------------------
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
DECLARE
  v_clean_user  text;
  v_clean_token text;
BEGIN
  IF current_setting('request.method', true) = 'GET' THEN
    RAISE EXCEPTION 'Method Not Allowed' USING errcode = '42501';
  END IF;

  v_clean_user  := LOWER(TRIM(COALESCE(p_user_id, '')));
  v_clean_token := TRIM(COALESCE(p_session_token, ''));

  IF v_clean_user = '' OR v_clean_token = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_params');
  END IF;

  -- Strict Verification: The token MUST belong to this user and be live in student_sessions or active_sessions
  IF NOT EXISTS (
    SELECT 1 
    FROM public.student_sessions 
    WHERE LOWER(user_id) = v_clean_user
      AND (token = v_clean_token OR session_token = v_clean_token)
      AND (expires_at IS NULL OR expires_at > now())
  ) AND NOT EXISTS (
    SELECT 1 
    FROM public.active_sessions 
    WHERE LOWER(user_id) = v_clean_user
      AND token = v_clean_token
      AND (expires_at IS NULL OR expires_at > now())
  ) THEN
    -- Reject session planting attempt
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized_session');
  END IF;

  -- Upsert verified active session
  INSERT INTO public.active_sessions (user_id, token, device_name, device_type, last_active, expires_at)
  VALUES (
    v_clean_user,
    v_clean_token,
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

  -- Cap sessions: Keep at most 10 active devices per user to prevent session table bloat
  DELETE FROM public.active_sessions
  WHERE user_id = v_clean_user
    AND token NOT IN (
      SELECT token FROM public.active_sessions
      WHERE user_id = v_clean_user
      ORDER BY last_active DESC
      LIMIT 10
    );

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_active_session(text, text, text, text) TO anon, authenticated;
ALTER FUNCTION public.register_active_session(text, text, text, text) OWNER TO postgres;


-- ------------------------------------------------------------------------------
-- 4. REMEDIATE ISSUE-5: RESTRICT subjects COLUMN GRANTS FOR anon
-- ------------------------------------------------------------------------------
-- Ensure only necessary application columns are readable by anon
REVOKE ALL ON public.subjects FROM anon;
GRANT SELECT (id, name, year_level, total_weeks, instructor_name, enrolled_students, excluded_students) 
ON public.subjects TO anon;
GRANT ALL ON public.subjects TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 5. VERIFICATION NOTICE
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE 'Gradely Audit 2025 Remediation successfully applied.';
END;
$$;
