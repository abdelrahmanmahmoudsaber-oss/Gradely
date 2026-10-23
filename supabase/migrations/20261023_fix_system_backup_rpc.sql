-- =============================================================================
-- MIGRATION: 20261023_fix_system_backup_rpc.sql
-- PURPOSE:
--   Fix get_system_backup_data RPC to select 'final_grade' (and 'custom_grades')
--   instead of non-existent 'total_score'.
--   This allows GitHub Actions automated cron backup to run zero-click without
--   requiring the admin to open the browser.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_system_backup_data(p_backup_secret text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_expected_secret text := 'gradely_backup_cron_sec_7f9a2b8e4c1d6e5a';
  v_res             jsonb;
  v_attempts        int;
  v_locked_until    timestamptz;
BEGIN
  -- Reject GET method to prevent secret in query strings / logs (CWE-598)
  IF current_setting('request.method', true) = 'GET' THEN
    RAISE EXCEPTION 'Method Not Allowed: Backup secret must be supplied via POST body' USING errcode = '42501';
  END IF;

  -- Rate limit check against brute force on backup secret
  SELECT attempts, locked_until INTO v_attempts, v_locked_until
  FROM public.login_attempts
  WHERE user_id = '__system_backup_rpc__';

  IF v_locked_until IS NOT NULL AND v_locked_until > now() THEN
    RAISE EXCEPTION 'Too many failed backup attempts. Locked temporarily.' USING errcode = '42501';
  END IF;

  IF p_backup_secret IS NULL OR p_backup_secret <> v_expected_secret THEN
    INSERT INTO public.login_attempts (user_id, attempts, last_attempt)
    VALUES ('__system_backup_rpc__', 1, now())
    ON CONFLICT (user_id) DO UPDATE
      SET attempts = login_attempts.attempts + 1,
          last_attempt = now(),
          locked_until = CASE WHEN login_attempts.attempts + 1 >= 5 THEN now() + interval '1 hour' ELSE NULL END;

    RAISE EXCEPTION 'Unauthorized: Invalid backup secret' USING errcode = '42501';
  END IF;

  -- Reset failed attempt counter on success
  DELETE FROM public.login_attempts WHERE user_id = '__system_backup_rpc__';

  SELECT jsonb_build_object(
    'users', (
      SELECT jsonb_agg(u)
      FROM (
        SELECT id, user_id, name, role, year_level, section, assigned_subjects
        FROM public.users
        WHERE role = 'student'
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

GRANT EXECUTE ON FUNCTION public.get_system_backup_data(text) TO anon, authenticated, service_role;
ALTER FUNCTION public.get_system_backup_data(text) OWNER TO postgres;

-- Clear any existing lock on __system_backup_rpc__ from previous failed attempts
DELETE FROM public.login_attempts WHERE user_id = '__system_backup_rpc__';

