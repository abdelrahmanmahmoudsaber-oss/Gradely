-- ==============================================================================
-- GRADELY FINAL BULLETPROOF SECURITY & FUNCTIONAL HARDENING MIGRATION
-- File: supabase/migrations/20261028_final_bulletproof_security_remediation.sql
-- Date: 2026-10-28
--
-- 1. FIX CRITICAL LEAK IN get_system_backup_data (NEW-01 / CWE-250)
--    - Drops all vulnerable overloads.
--    - Eliminates the fatal `current_user IN ('postgres', 'supabase_admin')` bypass.
--    - Validates caller via session_user, cron secret, or active TA/Admin/Instructor session token.
--    - Includes last_sign_in_at and custom_grades to preserve full TA dashboard functionality.
--
-- 2. SECURE get_my_subjects & SANITIZE STUDENT ROSTER (NEW-02 / CWE-200)
--    - Drops all overloads.
--    - Staff/Admin/TAs receive full enrolled_students roster.
--    - Logged-in students receive ONLY their own enrollment status (no peer IDs).
--    - Anonymous callers receive empty enrolled_students ('[]'::jsonb).
--
-- 3. FIX register_active_session RUNTIME CRASH (NEW-03 / 42703)
--    - Inserts into column `token` (matching active_sessions schema).
--    - Handles device heartbeat updates without runtime errors.
--
-- 4. HARDEN notifications TABLE POLICIES (NEW-04)
--    - Revokes direct INSERT from anon to eliminate spamming.
--    - All notifications must go through send_grade_notification RPC.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. HARDEN get_system_backup_data: DROP OVERLOADS & ENFORCE AUTHENTICATION
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT p.proname, oidvectortypes(p.proargtypes) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'get_system_backup_data'
  ) LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS public.' || quote_ident(r.proname) || '(' || r.args || ') CASCADE;';
  END LOOP;
END $$;

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
  -- Disallow GET requests to prevent parameter exposure in logs
  IF current_setting('request.method', true) = 'GET' THEN
    RAISE EXCEPTION 'Method Not Allowed' USING errcode = '42501';
  END IF;

  v_clean_token := TRIM(COALESCE(p_session_token, ''));
  v_secret_val  := TRIM(COALESCE(p_cron_secret, ''));

  -- Path A: Direct DB Superuser, Supabase Service Role, or Auth Admin context
  -- (Uses session_user to inspect connection role, NOT current_user which switches under SECURITY DEFINER)
  IF (
    (auth.uid() IS NOT NULL AND public.is_admin())
    OR (COALESCE(auth.jwt() ->> 'role', '') = 'service_role')
    OR (session_user IN ('postgres', 'supabase_admin'))
  ) THEN
    v_is_authorized := true;

  -- Path B: Automated Backup Cron Secret (GitHub Actions / Cloud Cron)
  ELSIF (
    v_clean_token = 'gradely_backup_cron_sec_7f9a2b8e4c1d6e5a'
    OR v_secret_val = 'gradely_backup_cron_sec_7f9a2b8e4c1d6e5a'
  ) THEN
    v_is_authorized := true;

  -- Path C: Valid unexpired Admin / TA / Instructor Session Token
  ELSIF v_clean_token <> '' THEN
    IF EXISTS (
      SELECT 1
      FROM public.student_sessions ss
      JOIN public.users u ON LOWER(u.user_id) = LOWER(ss.user_id)
      WHERE (ss.token = v_clean_token OR ss.session_token = v_clean_token)
        AND (ss.expires_at IS NULL OR ss.expires_at > now())
        AND u.role IN ('admin', 'super_admin', 'ta', 'instructor')
    ) OR EXISTS (
      SELECT 1
      FROM public.active_sessions act
      JOIN public.users u ON LOWER(u.user_id) = LOWER(act.user_id)
      WHERE act.token = v_clean_token
        AND (act.expires_at IS NULL OR act.expires_at > now())
        AND u.role IN ('admin', 'super_admin', 'ta', 'instructor')
    ) THEN
      v_is_authorized := true;
    END IF;
  END IF;

  -- Fail closed: Block any unauthorized or anonymous request
  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Unauthorized: Administrator authentication or valid backup secret required' USING errcode = '42501';
  END IF;

  RETURN jsonb_build_object(
    'users', COALESCE((
      SELECT jsonb_agg(u)
      FROM (
        SELECT id, user_id, name, role, year_level, section, assigned_subjects, last_sign_in_at
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
        SELECT student_id, subject_id, quiz_1, quiz_2, project, attendance_score, final_grade, custom_grades
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
-- 2. SECURE get_my_subjects & SANITIZE ENROLLED STUDENTS
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT p.proname, oidvectortypes(p.proargtypes) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'get_my_subjects'
  ) LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS public.' || quote_ident(r.proname) || '(' || r.args || ') CASCADE;';
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_my_subjects(p_session_token text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_res jsonb;
  v_student_id text := NULL;
  v_is_staff boolean := false;
  v_clean_token text := TRIM(COALESCE(p_session_token, ''));
BEGIN
  IF current_setting('request.method', true) = 'GET' THEN
    RAISE EXCEPTION 'Method Not Allowed' USING errcode = '42501';
  END IF;

  -- 1. Check if caller is staff via Supabase auth, direct superuser, or token
  IF (
    (auth.uid() IS NOT NULL AND public.is_admin())
    OR (session_user IN ('postgres', 'supabase_admin'))
    OR (COALESCE(auth.jwt() ->> 'role', '') = 'service_role')
  ) THEN
    v_is_staff := true;
  ELSIF v_clean_token <> '' THEN
    -- Check if token belongs to admin/TA/instructor
    IF EXISTS (
      SELECT 1 FROM public.users u
      JOIN public.student_sessions ss ON LOWER(u.user_id) = LOWER(ss.user_id)
      WHERE (ss.token = v_clean_token OR ss.session_token = v_clean_token)
        AND (ss.expires_at IS NULL OR ss.expires_at > now())
        AND u.role IN ('admin', 'super_admin', 'ta', 'instructor')
    ) OR EXISTS (
      SELECT 1 FROM public.users u
      JOIN public.active_sessions act ON LOWER(u.user_id) = LOWER(act.user_id)
      WHERE act.token = v_clean_token
        AND (act.expires_at IS NULL OR act.expires_at > now())
        AND u.role IN ('admin', 'super_admin', 'ta', 'instructor')
    ) THEN
      v_is_staff := true;
    ELSE
      -- Check if token belongs to a student
      SELECT LOWER(ss.user_id) INTO v_student_id
      FROM public.student_sessions ss
      WHERE (ss.token = v_clean_token OR ss.session_token = v_clean_token)
        AND (ss.expires_at IS NULL OR ss.expires_at > now())
      LIMIT 1;

      IF v_student_id IS NULL THEN
        SELECT LOWER(act.user_id) INTO v_student_id
        FROM public.active_sessions act
        WHERE act.token = v_clean_token
          AND (act.expires_at IS NULL OR act.expires_at > now())
        LIMIT 1;
      END IF;
    END IF;
  END IF;

  -- 2. Build subjects array:
  -- Staff: full enrolled_students roster
  -- Student: only include student themselves if enrolled (zero peer leak)
  -- Anonymous: empty enrolled_students ('[]'::jsonb)
  SELECT jsonb_agg(sub) INTO v_res
  FROM (
    SELECT 
      s.id,
      s.name,
      s.year_level,
      s.total_weeks,
      s.created_at,
      s.instructor_name,
      s.instructor_id,
      CASE 
        WHEN v_is_staff THEN COALESCE(s.enrolled_students, '[]'::jsonb)
        WHEN v_student_id IS NOT NULL THEN (
          CASE 
            WHEN s.enrolled_students ? v_student_id 
              OR s.enrolled_students ? UPPER(v_student_id) 
            THEN jsonb_build_array(v_student_id)
            ELSE '[]'::jsonb
          END
        )
        ELSE '[]'::jsonb
      END AS enrolled_students,
      s.excluded_students
    FROM public.subjects s
    ORDER BY s.year_level ASC, s.name ASC
  ) sub;

  RETURN COALESCE(v_res, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_subjects(text) TO anon, authenticated;
ALTER FUNCTION public.get_my_subjects(text) OWNER TO postgres;


-- ------------------------------------------------------------------------------
-- 3. FIX register_active_session RUNTIME CRASH (42703)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT p.proname, oidvectortypes(p.proargtypes) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'register_active_session'
  ) LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS public.' || quote_ident(r.proname) || '(' || r.args || ') CASCADE;';
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.register_active_session(
  p_user_id       text,
  p_session_token text DEFAULT NULL,
  p_device_name   text DEFAULT 'متصفح ويب',
  p_device_type   text DEFAULT 'desktop'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_clean_user  text := LOWER(TRIM(COALESCE(p_user_id, '')));
  v_clean_token text := TRIM(COALESCE(p_session_token, ''));
BEGIN
  IF v_clean_user = '' OR v_clean_token = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_params');
  END IF;

  INSERT INTO public.active_sessions (user_id, token, device_name, device_type, last_active, created_at, expires_at)
  VALUES (
    v_clean_user,
    v_clean_token,
    COALESCE(NULLIF(TRIM(p_device_name), ''), 'متصفح ويب'),
    COALESCE(NULLIF(TRIM(p_device_type), ''), 'desktop'),
    now(),
    now(),
    now() + interval '30 days'
  )
  ON CONFLICT (token) DO UPDATE
    SET last_active = now(),
        device_name = COALESCE(NULLIF(TRIM(EXCLUDED.device_name), ''), active_sessions.device_name),
        device_type = COALESCE(NULLIF(TRIM(EXCLUDED.device_type), ''), active_sessions.device_type),
        expires_at  = now() + interval '30 days';

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_active_session(text, text, text, text) TO anon, authenticated;
ALTER FUNCTION public.register_active_session(text, text, text, text) OWNER TO postgres;


-- ------------------------------------------------------------------------------
-- 4. HARDEN notifications TABLE POLICIES (NEW-04)
-- ------------------------------------------------------------------------------
REVOKE INSERT ON TABLE public.notifications FROM anon;
DROP POLICY IF EXISTS "Public notifications insert access" ON public.notifications;

-- Only authenticated users, service_role, or postgres superuser can directly insert;
-- all regular announcements go through send_grade_notification RPC
CREATE POLICY "Strict notifications insert policy" ON public.notifications
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL OR session_user IN ('postgres', 'supabase_admin')
  );
