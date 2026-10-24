-- ==============================================================================
-- Migration: 20261024_fix_ashraf_account_and_backup_rpc.sql
-- 1. Update Ashraf Hussein's name to English ('Ashraf Hussein') across users, subjects & auth.
-- 2. Ensure all 5 TA subjects are assigned to ahamdy2004 with instructor_name = 'Ashraf Hussein'.
-- 3. Update get_system_backup_data(p_session_token) RPC to authorize both:
--    a) Native Supabase Auth admins (Abdelrahman, Mostafa Tag)
--    b) Session-token authorized admins/TAs (Ashraf Hussein / ahamdy2004)
--    while strictly rejecting unauthenticated requests & ordinary students (42501).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. UPDATE ASHRAF'S NAME & ASSIGNED SUBJECTS IN public.users
-- ------------------------------------------------------------------------------
UPDATE public.users
SET name = 'Ashraf Hussein',
    role = 'admin',
    assigned_subjects = '["YEAR1_MATH0:all", "YEAR2_CNT:all", "YEAR2_OOP:all", "YEAR4_ACN:all", "YEAR4_CG:all"]'::jsonb
WHERE LOWER(user_id) = 'ahamdy2004';

-- Update auth.users metadata if an auth record exists
UPDATE auth.users
SET raw_user_meta_data = jsonb_build_object(
      'user_id', 'ahamdy2004',
      'name', 'Ashraf Hussein',
      'role', 'admin'
    )
WHERE LOWER(email) = 'ahamdy2004@gradely.app'
   OR id IN (SELECT auth_id FROM public.users WHERE LOWER(user_id) = 'ahamdy2004' AND auth_id IS NOT NULL);

-- ------------------------------------------------------------------------------
-- 2. UPDATE SUBJECTS ASSIGNMENT & INSTRUCTOR NAME
-- ------------------------------------------------------------------------------
UPDATE public.subjects
SET instructor_id = 'ahamdy2004',
    instructor_name = 'Ashraf Hussein'
WHERE id IN ('YEAR1_MATH0', 'YEAR2_CNT', 'YEAR2_OOP', 'YEAR4_ACN', 'YEAR4_CG')
   OR instructor_id = 'ahamdy2004'
   OR instructor_id = 'mostafaabubakr'
   OR instructor_name IN ('أشرف حسين', 'Mostafa Abubakr', 'مصطفى أبو بكر');

-- Replace any old Arabic or old name strings in excluded_students jsonb
UPDATE public.subjects
SET excluded_students = (
  replace(
    replace(
      replace(COALESCE(excluded_students::text, '[]'), 'أشرف حسين', 'Ashraf Hussein'),
      'Mostafa Abubakr', 'Ashraf Hussein'
    ),
    'مصطفى أبو بكر', 'Ashraf Hussein'
  )::jsonb
)
WHERE excluded_students IS NOT NULL 
  AND (
    excluded_students::text LIKE '%أشرف حسين%' 
    OR excluded_students::text LIKE '%Mostafa Abubakr%'
    OR excluded_students::text LIKE '%مصطفى أبو بكر%'
  );

-- Clear any stale login lockouts
DELETE FROM public.login_attempts 
WHERE LOWER(user_id) IN ('ahamdy2004', 'mostafaabubakr', 'ahamdy2004@gradely.app');

-- ------------------------------------------------------------------------------
-- 3. UPDATE get_system_backup_data TO SECURELY SUPPORT SESSION TOKEN AUTH
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_system_backup_data(text);
DROP FUNCTION IF EXISTS public.get_system_backup_data();

CREATE OR REPLACE FUNCTION public.get_system_backup_data(p_session_token text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_is_authorized boolean := false;
  v_res jsonb;
BEGIN
  -- Strict HTTP Method restriction: prevent GET token leakage in proxy logs
  IF current_setting('request.method', true) = 'GET' THEN
    RAISE EXCEPTION 'Method Not Allowed' USING errcode = '42501';
  END IF;

  -- 1. Check native Supabase Auth JWT / Service Role / Postgres internal
  IF (
    (auth.uid() IS NOT NULL AND public.is_admin())
    OR (COALESCE(auth.jwt() ->> 'role', '') = 'service_role')
    OR (current_user IN ('postgres', 'supabase_admin'))
  ) THEN
    v_is_authorized := true;

  -- 2. Check session token from student_sessions for verified admin/super_admin
  ELSIF p_session_token IS NOT NULL AND p_session_token <> '' THEN
    IF EXISTS (
      SELECT 1
      FROM public.student_sessions ss
      JOIN public.users u ON LOWER(u.user_id) = LOWER(ss.user_id)
      WHERE ss.session_token = p_session_token
        AND ss.expires_at > now()
        AND u.role IN ('admin', 'super_admin')
    ) THEN
      v_is_authorized := true;
    END IF;
  END IF;

  -- Reject if not authorized
  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Unauthorized: Administrator authentication required' USING errcode = '42501';
  END IF;

  -- Return complete dataset for authenticated admin dashboard
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
        SELECT *
        FROM public.subjects
        ORDER BY year_level ASC, name ASC
      ) s
    ),
    'grades', (
      SELECT jsonb_agg(g)
      FROM (
        SELECT *
        FROM public.grades
      ) g
    ),
    'attendance', (
      SELECT jsonb_agg(a)
      FROM (
        SELECT *
        FROM public.attendance
      ) a
    )
  ) INTO v_res;

  RETURN v_res;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_system_backup_data(text) TO anon, authenticated;
ALTER FUNCTION public.get_system_backup_data(text) OWNER TO postgres;
