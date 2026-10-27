-- ==============================================================================
-- GRADELY FINAL SECURITY REMEDIATION & INTEGRITY SCRIPT (AUDIT 2026)
-- Target Database: Supabase (Project: bbdyexsaqnlremprfmph)
-- Date: 2026-10-27
--
-- FIXES APPLIED:
-- 1. [CRITICAL - CVSS 9.1] Drop ALL unauthenticated overloads of get_system_backup_data.
--    Enforces strict administrator / cron secret verification on all calls.
-- 2. [CRITICAL - CVSS 7.5] Revoke enrolled_students column grant on subjects from anon.
--    Prevents unauthenticated dumping of enrolled student ID rosters.
-- 3. [MEDIUM - CVSS 5.3] Secure register_active_session against unauthenticated token planting.
-- 4. [FUNCTIONALITY FIX] Fix get_my_subjects return type (JSONB) to eliminate 42804 error.
-- 5. [FUNCTIONALITY FIX] Grant UPDATE (excluded_students) on subjects to anon, authenticated
--    and provide save_subject_grade_config RPC so grade configs/dates never fail.
-- 6. [DATA RESTORATION] Restore custom column 'u' on 'Selected Labs in Software Engineering'.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. CRITICAL: PURGE ALL OLD OVERLOADS OF get_system_backup_data & SECURE IT
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
  p_cron_secret   text DEFAULT NULL,
  p_user_id       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_clean_token  text := TRIM(COALESCE(p_session_token, ''));
  v_clean_secret text := TRIM(COALESCE(p_cron_secret, ''));
  v_authorized   boolean := false;
BEGIN
  -- Disallow GET requests
  IF current_setting('request.method', true) = 'GET' THEN
    RAISE EXCEPTION 'Method Not Allowed' USING errcode = '42501';
  END IF;

  -- 1. Verify GitHub Actions / Cloud Cron secret
  IF (
    v_clean_secret = 'gradely_backup_cron_sec_7f9a2b8e4c1d6e5a'
    OR v_clean_token = 'gradely_backup_cron_sec_7f9a2b8e4c1d6e5a'
  ) THEN
    v_authorized := true;

  -- 2. Verify Supabase Service Role or Postgres Superuser
  ELSIF (
    (auth.uid() IS NOT NULL AND public.is_admin())
    OR (COALESCE(auth.jwt() ->> 'role', '') = 'service_role')
    OR (current_user IN ('postgres', 'supabase_admin'))
  ) THEN
    v_authorized := true;

  -- 3. Verify Active Administrator Session Token
  ELSIF v_clean_token <> '' THEN
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
      v_authorized := true;
    END IF;
  END IF;

  -- STRICT ENFORCEMENT: Block any unauthenticated request immediately
  IF NOT v_authorized THEN
    RAISE EXCEPTION 'Unauthorized: Valid administrator session token or backup cron secret required' USING errcode = '42501';
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

GRANT EXECUTE ON FUNCTION public.get_system_backup_data(text, text, text) TO anon, authenticated;
ALTER FUNCTION public.get_system_backup_data(text, text, text) OWNER TO postgres;


-- ------------------------------------------------------------------------------
-- 2. CRITICAL: SECURE public.subjects COLUMN GRANTS (CLOSE ISSUE-2)
-- ------------------------------------------------------------------------------
-- Revoke broad access, hide enrolled_students from unauthenticated scrapers
REVOKE ALL ON public.subjects FROM anon;
GRANT SELECT (id, name, year_level, total_weeks, instructor_name, instructor_id, excluded_students) 
ON public.subjects TO anon;
GRANT UPDATE (excluded_students) 
ON public.subjects TO anon, authenticated;
GRANT ALL ON public.subjects TO authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 3. FUNCTIONALITY FIX: ROBUST get_my_subjects RPC (ELIMINATES 42804)
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
BEGIN
  IF current_setting('request.method', true) = 'GET' THEN
    RAISE EXCEPTION 'Method Not Allowed' USING errcode = '42501';
  END IF;

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
      '[]'::jsonb AS enrolled_students,
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
-- 4. MEDIUM: SECURE register_active_session (CLOSE ISSUE-4)
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
  p_device_name   text DEFAULT 'جهاز غير معروف',
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

  -- Validate that session belongs to the user and is still active
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
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized_session');
  END IF;

  INSERT INTO public.active_sessions (user_id, token, device_name, device_type, last_active, expires_at)
  VALUES (
    v_clean_user,
    v_clean_token,
    COALESCE(NULLIF(TRIM(p_device_name), ''), 'جهاز غير معروف'),
    COALESCE(NULLIF(TRIM(p_device_type), ''), 'desktop'),
    now(),
    now() + interval '30 days'
  )
  ON CONFLICT (token) DO UPDATE
    SET last_active = now(),
        device_name = EXCLUDED.device_name,
        device_type = EXCLUDED.device_type,
        expires_at = now() + interval '30 days';

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
-- 5. FUNCTIONALITY: save_subject_grade_config RPC
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_subject_grade_config(
  p_subject_id        uuid,
  p_excluded_students jsonb,
  p_session_token     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_clean_token text := TRIM(COALESCE(p_session_token, ''));
  v_is_admin boolean := false;
BEGIN
  IF (
    (auth.uid() IS NOT NULL AND public.is_admin())
    OR (COALESCE(auth.jwt() ->> 'role', '') = 'service_role')
    OR (current_user IN ('postgres', 'supabase_admin'))
  ) THEN
    v_is_admin := true;
  ELSIF v_clean_token <> '' THEN
    IF EXISTS (
      SELECT 1 FROM public.student_sessions ss
      JOIN public.users u ON LOWER(u.user_id) = LOWER(ss.user_id)
      WHERE (ss.token = v_clean_token OR ss.session_token = v_clean_token)
        AND (ss.expires_at IS NULL OR ss.expires_at > now())
        AND u.role IN ('admin', 'super_admin')
    ) OR EXISTS (
      SELECT 1 FROM public.active_sessions act
      JOIN public.users u ON LOWER(u.user_id) = LOWER(act.user_id)
      WHERE act.token = v_clean_token
        AND (act.expires_at IS NULL OR act.expires_at > now())
        AND u.role IN ('admin', 'super_admin')
    ) THEN
      v_is_admin := true;
    END IF;
  END IF;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Unauthorized: Administrator authentication required' USING errcode = '42501';
  END IF;

  UPDATE public.subjects
  SET excluded_students = p_excluded_students
  WHERE id = p_subject_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_subject_grade_config(uuid, jsonb, text) TO anon, authenticated;
ALTER FUNCTION public.save_subject_grade_config(uuid, jsonb, text) OWNER TO postgres;


-- ------------------------------------------------------------------------------
-- 6. DATA RESTORATION: RESTORE CUSTOM COLUMN 'u' FOR 'Selected Labs in Software Engineering'
-- ------------------------------------------------------------------------------
UPDATE public.subjects
SET excluded_students = (
  SELECT jsonb_agg(
    CASE 
      WHEN elem::text LIKE '"CONFIG_CUSTOM_COLS:%' THEN 
        to_jsonb('CONFIG_CUSTOM_COLS:[{"id":"custom_1793099623441","label":"u","scope":"4e202555-5d2a-468c-b07d-a62e85a6a243"}]'::text)
      ELSE elem
    END
  )
  FROM jsonb_array_elements(excluded_students) AS elem
)
WHERE id = '4e202555-5d2a-468c-b07d-a62e85a6a243';
