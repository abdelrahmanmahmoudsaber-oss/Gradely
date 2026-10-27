-- ==============================================================================
-- Gradely Fix: Repair get_system_backup_data column mapping
-- Resolves: column "total" does not exist (code 42703) in GitHub Actions backup
-- ==============================================================================

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
