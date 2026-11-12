-- ==============================================================================
-- GRADELY MIGRATION: 20261111_add_save_bulk_grades_and_subject_grades_rpc.sql
-- Description:
-- 1. Adds SECURITY DEFINER RPC `save_bulk_grades(p_records jsonb, p_session_token text)`
--    to allow authorized Instructors, TAs (like Ashraf Hussein), and Admins
--    authenticated via `verify_legacy_login` (session_token) or GoTrue to safely upsert grades.
-- 2. Adds SECURITY DEFINER RPC `get_subject_grades(p_subject_id uuid, p_session_token text)`
--    to allow authorized staff to read grades for a subject without being blocked by RLS.
-- ==============================================================================

-- 1. SAVE BULK GRADES RPC
CREATE OR REPLACE FUNCTION public.save_bulk_grades(
  p_records       jsonb,
  p_session_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_clean_token text := TRIM(COALESCE(p_session_token, ''));
  v_is_authorized boolean := false;
  rec jsonb;
  v_count integer := 0;
BEGIN
  -- 1. Check if caller is superuser, Supabase admin, or service role
  IF (
    (auth.uid() IS NOT NULL AND public.is_admin())
    OR (session_user IN ('postgres', 'supabase_admin'))
    OR (COALESCE(auth.jwt() ->> 'role', '') = 'service_role')
  ) THEN
    v_is_authorized := true;
  -- 2. Validate session token belonging to instructor, TA, or admin
  ELSIF v_clean_token <> '' THEN
    IF EXISTS (
      SELECT 1 FROM public.student_sessions ss
      JOIN public.users u ON LOWER(u.user_id) = LOWER(ss.user_id)
      WHERE ss.token = v_clean_token
        AND (ss.expires_at IS NULL OR ss.expires_at > now())
        AND u.role IN ('admin', 'super_admin', 'ta', 'instructor')
    ) OR EXISTS (
      SELECT 1 FROM public.users u
      JOIN public.active_sessions act ON LOWER(u.user_id) = LOWER(act.user_id)
      WHERE act.token = v_clean_token
        AND (act.expires_at IS NULL OR act.expires_at > now())
        AND u.role IN ('admin', 'super_admin', 'ta', 'instructor')
    ) THEN
      v_is_authorized := true;
    END IF;
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Unauthorized: Valid instructor or administrator session required to record grades'
      USING errcode = '42501';
  END IF;

  -- 3. Upsert records into public.grades (with strict NULLIF string sanitation)
  IF p_records IS NOT NULL THEN
    IF jsonb_typeof(p_records) = 'array' THEN
      FOR rec IN SELECT * FROM jsonb_array_elements(p_records)
      LOOP
        IF NULLIF(TRIM(COALESCE(rec ->> 'student_id', '')), '') IS NOT NULL 
           AND NULLIF(TRIM(COALESCE(rec ->> 'subject_id', '')), '') IS NOT NULL THEN
          INSERT INTO public.grades (
            student_id,
            subject_id,
            quiz_1,
            quiz_2,
            project,
            attendance_score,
            custom_grades,
            final_grade,
            updated_at
          ) VALUES (
            TRIM(rec ->> 'student_id'),
            (TRIM(rec ->> 'subject_id'))::uuid,
            COALESCE(NULLIF(TRIM(COALESCE(rec ->> 'quiz_1', '')), '')::numeric, 0),
            COALESCE(NULLIF(TRIM(COALESCE(rec ->> 'quiz_2', '')), '')::numeric, 0),
            COALESCE(NULLIF(TRIM(COALESCE(rec ->> 'project', '')), '')::numeric, 0),
            COALESCE(NULLIF(TRIM(COALESCE(rec ->> 'attendance_score', '')), '')::numeric, 0),
            CASE WHEN jsonb_typeof(rec -> 'custom_grades') = 'object' THEN rec -> 'custom_grades' ELSE '{}'::jsonb END,
            COALESCE(NULLIF(TRIM(COALESCE(rec ->> 'final_grade', '')), '')::numeric, 0),
            now()
          )
          ON CONFLICT (student_id, subject_id)
          DO UPDATE SET
            quiz_1           = EXCLUDED.quiz_1,
            quiz_2           = EXCLUDED.quiz_2,
            project          = EXCLUDED.project,
            attendance_score = EXCLUDED.attendance_score,
            custom_grades    = EXCLUDED.custom_grades,
            final_grade      = EXCLUDED.final_grade,
            updated_at       = now();
          v_count := v_count + 1;
        END IF;
      END LOOP;
    ELSIF jsonb_typeof(p_records) = 'object' THEN
      IF NULLIF(TRIM(COALESCE(p_records ->> 'student_id', '')), '') IS NOT NULL 
         AND NULLIF(TRIM(COALESCE(p_records ->> 'subject_id', '')), '') IS NOT NULL THEN
        INSERT INTO public.grades (
          student_id,
          subject_id,
          quiz_1,
          quiz_2,
          project,
          attendance_score,
          custom_grades,
          final_grade,
          updated_at
        ) VALUES (
          TRIM(p_records ->> 'student_id'),
          (TRIM(p_records ->> 'subject_id'))::uuid,
          COALESCE(NULLIF(TRIM(COALESCE(p_records ->> 'quiz_1', '')), '')::numeric, 0),
          COALESCE(NULLIF(TRIM(COALESCE(p_records ->> 'quiz_2', '')), '')::numeric, 0),
          COALESCE(NULLIF(TRIM(COALESCE(p_records ->> 'project', '')), '')::numeric, 0),
          COALESCE(NULLIF(TRIM(COALESCE(p_records ->> 'attendance_score', '')), '')::numeric, 0),
          CASE WHEN jsonb_typeof(p_records -> 'custom_grades') = 'object' THEN p_records -> 'custom_grades' ELSE '{}'::jsonb END,
          COALESCE(NULLIF(TRIM(COALESCE(p_records ->> 'final_grade', '')), '')::numeric, 0),
          now()
        )
        ON CONFLICT (student_id, subject_id)
        DO UPDATE SET
          quiz_1           = EXCLUDED.quiz_1,
          quiz_2           = EXCLUDED.quiz_2,
          project          = EXCLUDED.project,
          attendance_score = EXCLUDED.attendance_score,
          custom_grades    = EXCLUDED.custom_grades,
          final_grade      = EXCLUDED.final_grade,
          updated_at       = now();
        v_count := 1;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'count', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_bulk_grades(jsonb, text) TO anon, authenticated;
ALTER FUNCTION public.save_bulk_grades(jsonb, text) OWNER TO postgres;


-- 2. GET SUBJECT GRADES RPC
CREATE OR REPLACE FUNCTION public.get_subject_grades(
  p_subject_id    uuid,
  p_session_token text DEFAULT NULL
)
RETURNS TABLE (
  student_id       text,
  quiz_1           numeric,
  quiz_2           numeric,
  project          numeric,
  attendance_score numeric,
  final_grade      numeric,
  custom_grades    jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_clean_token text := TRIM(COALESCE(p_session_token, ''));
  v_is_authorized boolean := false;
BEGIN
  -- 1. Check if caller is superuser, Supabase admin, or service role
  IF (
    (auth.uid() IS NOT NULL AND public.is_admin())
    OR (session_user IN ('postgres', 'supabase_admin'))
    OR (COALESCE(auth.jwt() ->> 'role', '') = 'service_role')
  ) THEN
    v_is_authorized := true;
  -- 2. Validate session token belonging to instructor, TA, or admin
  ELSIF v_clean_token <> '' THEN
    IF EXISTS (
      SELECT 1 FROM public.student_sessions ss
      JOIN public.users u ON LOWER(u.user_id) = LOWER(ss.user_id)
      WHERE ss.token = v_clean_token
        AND (ss.expires_at IS NULL OR ss.expires_at > now())
        AND u.role IN ('admin', 'super_admin', 'ta', 'instructor')
    ) OR EXISTS (
      SELECT 1 FROM public.users u
      JOIN public.active_sessions act ON LOWER(u.user_id) = LOWER(act.user_id)
      WHERE act.token = v_clean_token
        AND (act.expires_at IS NULL OR act.expires_at > now())
        AND u.role IN ('admin', 'super_admin', 'ta', 'instructor')
    ) THEN
      v_is_authorized := true;
    END IF;
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Unauthorized: Valid instructor or administrator session required to view subject grades'
      USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT 
    g.student_id,
    g.quiz_1,
    g.quiz_2,
    g.project,
    g.attendance_score,
    g.final_grade,
    g.custom_grades
  FROM public.grades g
  WHERE g.subject_id = p_subject_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_subject_grades(uuid, text) TO anon, authenticated;
ALTER FUNCTION public.get_subject_grades(uuid, text) OWNER TO postgres;
