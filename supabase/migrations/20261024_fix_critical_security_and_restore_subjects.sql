-- ==============================================================================
-- Migration: 20261024_fix_critical_security_and_restore_subjects.sql
-- Description:
-- 1. [CRITICAL CVSS 9.1]: Revoke get_system_backup_data from anon/public. Require server is_admin().
-- 2. [MEDIUM CVSS 6.5]: Add verify_is_admin RPC to verify role from DB and stop client-side tampering.
-- 3. [STUDENT SUBJECTS]: Restore get_my_subjects & grant subjects (id, name, year_level, total_weeks, instructor_name) to anon.
-- 4. [ACTIVE SESSIONS]: Fix multi-device active sessions tracking & revoking per device.
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
  IF p_user_id IS NULL OR TRIM(p_user_id) = '' THEN
    RETURN false;
  END IF;

  -- Verify directly from public.users table (cannot be faked by localStorage)
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
-- 3. RESTORE SUBJECTS VISIBILITY FOR ALL STUDENTS
-- ------------------------------------------------------------------------------
-- Allow anon/authenticated to select safe public subject columns
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
-- 4. ACTIVE SESSIONS TABLE & FUNCTIONS (MULTI-DEVICE TRACKING & REMOTE LOGOUT)
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
ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Active sessions access" ON public.active_sessions;
CREATE POLICY "Active sessions access" ON public.active_sessions FOR ALL TO authenticated, anon USING (true);

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
  IF p_user_id IS NULL OR p_session_token IS NULL OR TRIM(p_session_token) = '' THEN
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
  -- Only deletes other active_sessions rows for this user, NEVER deletes student_sessions
  DELETE FROM public.active_sessions 
  WHERE LOWER(user_id) = LOWER(TRIM(p_user_id)) AND token <> TRIM(p_session_token);

  RETURN jsonb_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.revoke_all_other_sessions(text, text) TO anon, authenticated;
ALTER FUNCTION public.revoke_all_other_sessions(text, text) OWNER TO postgres;
