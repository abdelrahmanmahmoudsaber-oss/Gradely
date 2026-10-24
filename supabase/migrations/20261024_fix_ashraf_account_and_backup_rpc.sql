-- ==============================================================================
-- Migration: 20261024_fix_ashraf_account_and_backup_rpc.sql
-- 1. Configure Ashraf Hussein with his exact 6 subjects and 20 sections / 20 hours:
--    - Mathematics - 0: S1, S2, S3 (3 sections)
--    - Computer Networks Technology: S1, S2, S3, S4 (4 sections)
--    - Object Oriented Programming: S1, S2, S3, S4 (4 sections)
--    - Advanced Computer Networks: S1, S2, S3, S4 (4 sections)
--    - Computer Graphics: S1, S2, S3 (3 sections)
--    - Mathematics 3: S1, S4 (2 sections) [Abdelrahman has S2, S3]
--    Total = 20 sections (20 hours) across 6 subjects.
-- 2. Update subjects table metadata and section TA tags.
-- 3. Update get_system_backup_data RPC to securely authorize session-token TAs.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. UPDATE ASHRAF HUSSEIN (ahamdy2004) IN public.users
-- ------------------------------------------------------------------------------
UPDATE public.users
SET name = 'Ashraf Hussein',
    role = 'admin',
    assigned_subjects = '[
      "54028b6f-d152-4c69-97a5-1cdadefc047e:S1",
      "54028b6f-d152-4c69-97a5-1cdadefc047e:S2",
      "54028b6f-d152-4c69-97a5-1cdadefc047e:S3",
      "3d986c7e-7653-459c-bc96-e75e62f51197:S1",
      "3d986c7e-7653-459c-bc96-e75e62f51197:S2",
      "3d986c7e-7653-459c-bc96-e75e62f51197:S3",
      "3d986c7e-7653-459c-bc96-e75e62f51197:S4",
      "d0c29368-cddb-44e4-89f4-951d0249782c:S1",
      "d0c29368-cddb-44e4-89f4-951d0249782c:S2",
      "d0c29368-cddb-44e4-89f4-951d0249782c:S3",
      "d0c29368-cddb-44e4-89f4-951d0249782c:S4",
      "caa1505f-592b-4e9b-a958-94a57bff5caa:S1",
      "caa1505f-592b-4e9b-a958-94a57bff5caa:S2",
      "caa1505f-592b-4e9b-a958-94a57bff5caa:S3",
      "caa1505f-592b-4e9b-a958-94a57bff5caa:S4",
      "4f1ec16d-476c-471a-b36b-f6881ee5011e:S1",
      "4f1ec16d-476c-471a-b36b-f6881ee5011e:S2",
      "4f1ec16d-476c-471a-b36b-f6881ee5011e:S3",
      "a96b19a2-d1f4-4a9c-800d-edaedd75449b:S1",
      "a96b19a2-d1f4-4a9c-800d-edaedd75449b:S4"
    ]'::jsonb
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
-- 2. UPDATE ABDELRAHMAN MAHMOUD (amahmoudsaber2026) ASSIGNED SUBJECTS FOR MATH 3
-- ------------------------------------------------------------------------------
UPDATE public.users
SET assigned_subjects = (
  -- Remove any old Math 3 S1 or S4 assignments, keep S2 and S3
  (
    SELECT jsonb_agg(elem)
    FROM jsonb_array_elements(assigned_subjects) elem
    WHERE elem::text NOT LIKE '%a96b19a2-d1f4-4a9c-800d-edaedd75449b:S1%'
      AND elem::text NOT LIKE '%a96b19a2-d1f4-4a9c-800d-edaedd75449b:S4%'
  ) || '["a96b19a2-d1f4-4a9c-800d-edaedd75449b:S2", "a96b19a2-d1f4-4a9c-800d-edaedd75449b:S3"]'::jsonb
)
WHERE LOWER(user_id) = 'amahmoudsaber2026'
  AND assigned_subjects IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 3. UPDATE SUBJECTS INSTRUCTOR AND SECTION TA METADATA
-- ------------------------------------------------------------------------------
-- 3a. Update 5 primary subjects of Ashraf
UPDATE public.subjects
SET instructor_id = 'ahamdy2004',
    instructor_name = 'Ashraf Hussein'
WHERE id IN (
  '54028b6f-d152-4c69-97a5-1cdadefc047e'::uuid, -- Math 0
  '3d986c7e-7653-459c-bc96-e75e62f51197'::uuid, -- CNT
  'd0c29368-cddb-44e4-89f4-951d0249782c'::uuid, -- OOP
  'caa1505f-592b-4e9b-a958-94a57bff5caa'::uuid, -- ACN
  '4f1ec16d-476c-471a-b36b-f6881ee5011e'::uuid  -- CG
);

-- 3b. Update Mathematics 3 section TA tags in excluded_students:
-- S1: Ashraf Hussein, S2: Abdelrahman Mahmoud, S3: Abdelrahman Mahmoud, S4: Ashraf Hussein
UPDATE public.subjects
SET excluded_students = (
  -- Filter out existing TA tags for Math 3, then append clean updated ones
  (
    SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
    FROM jsonb_array_elements(COALESCE(excluded_students, '[]'::jsonb)) elem
    WHERE elem::text NOT LIKE '%CONFIG_SECTION_TAS%'
      AND elem::text NOT LIKE '%TA_S%'
  ) || '[
    "CONFIG_SECTION_TAS:{\"S1\":\"Ashraf Hussein\",\"S2\":\"Abdelrahman Mahmoud\",\"S3\":\"Abdelrahman Mahmoud\",\"S4\":\"Ashraf Hussein\"}",
    "TA_S1:Ashraf Hussein",
    "TA_S2:Abdelrahman Mahmoud",
    "TA_S3:Abdelrahman Mahmoud",
    "TA_S4:Ashraf Hussein"
  ]'::jsonb
)
WHERE id = 'a96b19a2-d1f4-4a9c-800d-edaedd75449b'::uuid;

-- Replace any old Arabic names across all subjects excluded_students
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

-- Clear any login lockout records
DELETE FROM public.login_attempts 
WHERE LOWER(user_id) IN ('ahamdy2004', 'mostafaabubakr', 'ahamdy2004@gradely.app');

-- ------------------------------------------------------------------------------
-- 4. UPDATE get_system_backup_data RPC TO SECURELY SUPPORT SESSION TOKEN AUTH
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
