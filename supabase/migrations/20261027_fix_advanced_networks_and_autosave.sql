-- ==============================================================================
-- GRADELY CORRECTION & AUTO-SAVE HARDENING
-- Date: 2026-10-27
-- Target Database: Supabase (Project: bbdyexsaqnlremprfmph)
--
-- 1. CORRECTION: Align Advanced Computer Networks Week 104 (Lecture 4) with official PDF.
--    Sets exactly 28 attending students to 'present' and 58 non-attending to 'absent'.
-- 2. AUTO-SAVE PERMISSIONS: Grant INSERT, UPDATE, SELECT on public.attendance to anon/authenticated.
-- 3. AUTO-SAVE RPCs: Add atomic SECURITY DEFINER save_attendance_record and save_bulk_attendance.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. PERMISSIONS & AUTO-SAVE RPCS
-- ------------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON public.attendance TO anon, authenticated;

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
BEGIN
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
  rec jsonb;
BEGIN
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
-- 2. CORRECT ADVANCED COMPUTER NETWORKS (WEEK 104 - LECTURE 4)
-- ------------------------------------------------------------------------------
-- A. Delete existing conflicting/inverted records for Week 104 in this subject
DELETE FROM public.attendance
WHERE subject_id = 'caa1505f-592b-4e9b-a958-94a57bff5caa'
  AND week_number = 104;

-- B. Insert 28 PRESENT students matching the official lecture PDF exactly
INSERT INTO public.attendance (subject_id, week_number, student_id, status) VALUES
  ('caa1505f-592b-4e9b-a958-94a57bff5caa', 104, '2303068', 'present'),
  ('caa1505f-592b-4e9b-a958-94a57bff5caa', 104, '2301120', 'present'),
  ('caa1505f-592b-4e9b-a958-94a57bff5caa', 104, '2302968', 'present'),
  ('caa1505f-592b-4e9b-a958-94a57bff5caa', 104, '2303051', 'present'),
  ('caa1505f-592b-4e9b-a958-94a57bff5caa', 104, '2303052', 'present'),
  ('caa1505f-592b-4e9b-a958-94a57bff5caa', 104, '2303053', 'present'),
  ('caa1505f-592b-4e9b-a958-94a57bff5caa', 104, '2303074', 'present'),
  ('caa1505f-592b-4e9b-a958-94a57bff5caa', 104, '2400241', 'present'),
  ('caa1505f-592b-4e9b-a958-94a57bff5caa', 104, '2400243', 'present'),
  ('caa1505f-592b-4e9b-a958-94a57bff5caa', 104, '2401360', 'present'),
  ('caa1505f-592b-4e9b-a958-94a57bff5caa', 104, '2401667', 'present'),
  ('caa1505f-592b-4e9b-a958-94a57bff5caa', 104, '2401998', 'present'),
  ('caa1505f-592b-4e9b-a958-94a57bff5caa', 104, '2402313', 'present'),
  ('caa1505f-592b-4e9b-a958-94a57bff5caa', 104, '2402315', 'present'),
  ('caa1505f-592b-4e9b-a958-94a57bff5caa', 104, '2402841', 'present'),
  ('caa1505f-592b-4e9b-a958-94a57bff5caa', 104, '2402874', 'present'),
  ('caa1505f-592b-4e9b-a958-94a57bff5caa', 104, '2402875', 'present'),
  ('caa1505f-592b-4e9b-a958-94a57bff5caa', 104, '2402922', 'present'),
  ('caa1505f-592b-4e9b-a958-94a57bff5caa', 104, '2403245', 'present'),
  ('caa1505f-592b-4e9b-a958-94a57bff5caa', 104, '2403352', 'present'),
  ('caa1505f-592b-4e9b-a958-94a57bff5caa', 104, '2403356', 'present'),
  ('caa1505f-592b-4e9b-a958-94a57bff5caa', 104, '2403860', 'present'),
  ('caa1505f-592b-4e9b-a958-94a57bff5caa', 104, '2303050', 'present'),
  ('caa1505f-592b-4e9b-a958-94a57bff5caa', 104, '2303202', 'present'),
  ('caa1505f-592b-4e9b-a958-94a57bff5caa', 104, '2402658', 'present'),
  ('caa1505f-592b-4e9b-a958-94a57bff5caa', 104, '2402751', 'present'),
  ('caa1505f-592b-4e9b-a958-94a57bff5caa', 104, '2403254', 'present'),
  ('caa1505f-592b-4e9b-a958-94a57bff5caa', 104, '2403469', 'present');

-- C. Insert remaining 58 non-attending students as ABSENT
INSERT INTO public.attendance (subject_id, week_number, student_id, status)
SELECT 
  'caa1505f-592b-4e9b-a958-94a57bff5caa'::uuid,
  104,
  u.user_id,
  'absent'
FROM public.users u
JOIN public.subjects s ON s.id = 'caa1505f-592b-4e9b-a958-94a57bff5caa'
WHERE u.role = 'student'
  AND (
    (s.enrolled_students ? u.user_id)
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(u.assigned_subjects) elem
      WHERE elem LIKE 'caa1505f-592b-4e9b-a958-94a57bff5caa:%'
    )
  )
  AND u.user_id NOT IN (
    '2303068', '2301120', '2302968', '2303051', '2303052', '2303053', '2303074',
    '2400241', '2400243', '2401360', '2401667', '2401998', '2402313', '2402315',
    '2402841', '2402874', '2402875', '2402922', '2403245', '2403352', '2403356',
    '2403860', '2303050', '2303202', '2402658', '2402751', '2403254', '2403469'
  )
ON CONFLICT (student_id, subject_id, week_number)
DO UPDATE SET status = 'absent';
