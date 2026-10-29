-- ==============================================================================
-- GRADELY SECURITY & INTEGRITY REVALIDATION MIGRATION (OCTOBER 29, 2026)
-- File: supabase/migrations/20261029_live_revalidation_bulletproof_patch.sql
--
-- 1. CLEANUP PROBE NOTIFICATION (Computer Networks Technology)
--    - Removes reval-probe notification row from public.notifications.
--    - Cleans probe tag from subjects.excluded_students.
--    - Strictly preserves genuine staff announcements.
--
-- 2. CLOSE ISSUE-19: HARDEN save_attendance_record & save_bulk_attendance
--    - Strictly validates p_session_token against active instructor/TA/admin sessions.
--    - Rejects unauthenticated callers with 42501 Unauthorized.
--
-- 3. CLOSE ISSUE-22: HARDEN send_grade_notification
--    - Strictly validates p_session_token against active instructor/TA/admin sessions.
--    - Derives verified sender identity from session user (blocks spoofed senders).
--    - Rejects unauthenticated callers with 42501 Unauthorized.
--
-- 4. CLOSE ISSUE-21: SANITIZE get_my_subjects METADATA FOR ANONYMOUS CALLERS
--    - Nulls instructor_id and zeroes excluded_students for anonymous callers.
--    - Preserves all data for authenticated staff and students.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. CLEANUP PROBE NOTIFICATION
-- ------------------------------------------------------------------------------
DELETE FROM public.notifications 
WHERE id = '00966c9b-6f67-47c5-8c32-ce7bb312743c' 
   OR sender_name = 'reval-probe' 
   OR title LIKE '%SECURITY-REVAL-PROBE%';

UPDATE public.subjects
SET excluded_students = (
  SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
  FROM jsonb_array_elements(excluded_students) elem
  WHERE NOT (elem::text LIKE '%00966c9b-6f67-47c5-8c32-ce7bb312743c%' OR elem::text LIKE '%reval-probe%')
)
WHERE id = '3d986c7e-7653-459c-bc96-e75e62f51197';


-- ------------------------------------------------------------------------------
-- 2. CLOSE ISSUE-19: HARDEN save_attendance_record & save_bulk_attendance
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_attendance_record(
  p_student_id    text,
  p_subject_id    uuid,
  p_week_number   int,
  p_status        text,
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

  -- Strictly block any unauthenticated caller
  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Unauthorized: Valid instructor or administrator session required to record attendance'
      USING errcode = '42501';
  END IF;

  INSERT INTO public.attendance (student_id, subject_id, week_number, status)
  VALUES (
    p_student_id,
    p_subject_id,
    p_week_number,
    COALESCE(NULLIF(TRIM(p_status), ''), 'unrecorded')
  )
  ON CONFLICT (student_id, subject_id, week_number)
  DO UPDATE SET status = EXCLUDED.status;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_attendance_record(text, uuid, int, text, text) TO anon, authenticated;
ALTER FUNCTION public.save_attendance_record(text, uuid, int, text, text) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.save_bulk_attendance(
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
BEGIN
  IF (
    (auth.uid() IS NOT NULL AND public.is_admin())
    OR (session_user IN ('postgres', 'supabase_admin'))
    OR (COALESCE(auth.jwt() ->> 'role', '') = 'service_role')
  ) THEN
    v_is_authorized := true;
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
    RAISE EXCEPTION 'Unauthorized: Valid instructor or administrator session required to record attendance'
      USING errcode = '42501';
  END IF;

  FOR rec IN SELECT * FROM jsonb_array_elements(p_records) LOOP
    INSERT INTO public.attendance (student_id, subject_id, week_number, status)
    VALUES (
      rec->>'student_id',
      (rec->>'subject_id')::uuid,
      (rec->>'week_number')::int,
      COALESCE(NULLIF(TRIM(rec->>'status'), ''), 'unrecorded')
    )
    ON CONFLICT (student_id, subject_id, week_number)
    DO UPDATE SET status = EXCLUDED.status;
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_bulk_attendance(jsonb, text) TO anon, authenticated;
ALTER FUNCTION public.save_bulk_attendance(jsonb, text) OWNER TO postgres;


-- ------------------------------------------------------------------------------
-- 3. CLOSE ISSUE-22: HARDEN send_grade_notification
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_grade_notification(
  p_subject_id    uuid,
  p_subject_name  text,
  p_year_level    text,
  p_sender_name   text,
  p_title         text,
  p_message       text,
  p_session_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_clean_token      text := TRIM(COALESCE(p_session_token, ''));
  v_is_authorized    boolean := false;
  v_verified_sender  text;
  v_notif_id         uuid;
  v_tag              text;
  v_current_excluded jsonb;
  v_new_excluded     jsonb;
  v_elem             jsonb;
BEGIN
  -- 1. Check if caller is superuser, admin, or service role
  IF (
    (auth.uid() IS NOT NULL AND public.is_admin())
    OR (session_user IN ('postgres', 'supabase_admin'))
    OR (COALESCE(auth.jwt() ->> 'role', '') = 'service_role')
  ) THEN
    v_is_authorized := true;
    v_verified_sender := COALESCE(NULLIF(TRIM(p_sender_name), ''), 'إدارة النظام');
  -- 2. Validate session token belonging to instructor, TA, or admin
  ELSIF v_clean_token <> '' THEN
    SELECT COALESCE(u.name, u.user_id) INTO v_verified_sender
    FROM public.student_sessions ss
    JOIN public.users u ON LOWER(u.user_id) = LOWER(ss.user_id)
    WHERE ss.token = v_clean_token
      AND (ss.expires_at IS NULL OR ss.expires_at > now())
      AND u.role IN ('admin', 'super_admin', 'ta', 'instructor')
    LIMIT 1;

    IF v_verified_sender IS NULL THEN
      SELECT COALESCE(u.name, u.user_id) INTO v_verified_sender
      FROM public.active_sessions act
      JOIN public.users u ON LOWER(u.user_id) = LOWER(act.user_id)
      WHERE act.token = v_clean_token
        AND (act.expires_at IS NULL OR act.expires_at > now())
        AND u.role IN ('admin', 'super_admin', 'ta', 'instructor')
      LIMIT 1;
    END IF;

    IF v_verified_sender IS NOT NULL THEN
      v_is_authorized := true;
    END IF;
  END IF;

  -- Strictly fail closed: block any unauthorized caller
  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Unauthorized: Only authenticated instructors or administrators may broadcast notifications'
      USING errcode = '42501';
  END IF;

  -- Use verified sender name if resolved, otherwise fall back to cleaned parameter
  v_verified_sender := COALESCE(v_verified_sender, NULLIF(TRIM(p_sender_name), ''), 'أستاذ المادة');

  -- Insert into notifications table
  INSERT INTO public.notifications (subject_id, subject_name, year_level, sender_name, title, message)
  VALUES (p_subject_id, p_subject_name, p_year_level, v_verified_sender, p_title, p_message)
  RETURNING id INTO v_notif_id;

  -- Build JSON tag for subject metadata dual-caching
  v_tag := 'CONFIG_NOTIF:' || jsonb_build_object(
    'id', v_notif_id,
    'title', p_title,
    'message', p_message,
    'sender', v_verified_sender,
    'createdAt', now()
  )::text;

  SELECT excluded_students INTO v_current_excluded
  FROM public.subjects
  WHERE id = p_subject_id;

  IF v_current_excluded IS NULL OR jsonb_typeof(v_current_excluded) <> 'array' THEN
    v_new_excluded := jsonb_build_array(v_tag);
  ELSE
    v_new_excluded := '[]'::jsonb;
    FOR v_elem IN SELECT * FROM jsonb_array_elements(v_current_excluded)
    LOOP
      IF NOT (v_elem::text LIKE '"CONFIG_NOTIF:%') THEN
        v_new_excluded := v_new_excluded || jsonb_build_array(v_elem #>> '{}');
      END IF;
    END LOOP;
    v_new_excluded := v_new_excluded || jsonb_build_array(v_tag);
  END IF;

  UPDATE public.subjects
  SET excluded_students = v_new_excluded
  WHERE id = p_subject_id;

  RETURN jsonb_build_object(
    'success', true,
    'notification_id', v_notif_id,
    'message', 'تم إرسال الإشعار للطلبة بنجاح.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_grade_notification(uuid, text, text, text, text, text, text) TO anon, authenticated;
ALTER FUNCTION public.send_grade_notification(uuid, text, text, text, text, text, text) OWNER TO postgres;


-- ------------------------------------------------------------------------------
-- 4. CLOSE ISSUE-21: SANITIZE get_my_subjects METADATA FOR ANONYMOUS CALLERS
-- ------------------------------------------------------------------------------
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
    IF EXISTS (
      SELECT 1 FROM public.users u
      JOIN public.student_sessions ss ON LOWER(u.user_id) = LOWER(ss.user_id)
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
      v_is_staff := true;
    ELSE
      SELECT LOWER(ss.user_id) INTO v_student_id
      FROM public.student_sessions ss
      WHERE ss.token = v_clean_token
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
  -- Staff: full enrolled_students, full excluded_students, instructor_id
  -- Student: only their own enrollment status, own subject excluded_students
  -- Anonymous: zero student IDs, zero config strings, null instructor_id
  SELECT jsonb_agg(sub) INTO v_res
  FROM (
    SELECT 
      s.id,
      s.name,
      s.year_level,
      s.total_weeks,
      s.created_at,
      s.instructor_name,
      CASE 
        WHEN v_is_staff OR v_student_id IS NOT NULL THEN s.instructor_id
        ELSE NULL
      END AS instructor_id,
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
      CASE 
        WHEN v_is_staff OR v_student_id IS NOT NULL THEN s.excluded_students
        ELSE '[]'::jsonb
      END AS excluded_students
    FROM public.subjects s
    ORDER BY s.year_level ASC, s.name ASC
  ) sub;

  RETURN COALESCE(v_res, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_subjects(text) TO anon, authenticated;
ALTER FUNCTION public.get_my_subjects(text) OWNER TO postgres;
