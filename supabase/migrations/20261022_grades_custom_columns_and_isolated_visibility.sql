-- =============================================================================
-- MIGRATION: 20261022_grades_custom_columns_and_isolated_visibility.sql
-- PURPOSE:
--   1. Add custom_grades JSONB column to public.grades for dynamic custom columns.
--   2. Update get_my_grades RPC to return custom_grades so students see custom scores.
--   3. Update get_system_visibility to strictly isolate subject visibility:
--      Each subject only affects its own scope, preventing other subjects from
--      overwriting visibility on page refresh.
-- =============================================================================

-- 1. ADD custom_grades COLUMN TO public.grades TABLE
ALTER TABLE public.grades 
  ADD COLUMN IF NOT EXISTS custom_grades jsonb DEFAULT '{}'::jsonb;

-- 2. UPDATE get_my_grades RPC TO RETURN custom_grades
CREATE OR REPLACE FUNCTION public.get_my_grades(p_session_token text DEFAULT NULL)
RETURNS SETOF public.grades
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id text := NULL;
BEGIN
  -- Reject GET method (CWE-598 / ISSUE-37)
  IF current_setting('request.method', true) = 'GET' THEN
    RAISE EXCEPTION 'Method Not Allowed: Session token must be supplied via POST body' USING errcode = '42501';
  END IF;

  -- 1. Check if caller is authenticated staff/admin
  IF auth.uid() IS NOT NULL THEN
    IF public.is_admin() THEN
      RETURN QUERY SELECT * FROM public.grades;
      RETURN;
    END IF;

    -- Check if authenticated student
    SELECT user_id INTO v_student_id FROM public.users WHERE auth_id = auth.uid();
    IF v_student_id IS NULL AND auth.jwt() ->> 'email' IS NOT NULL THEN
      SELECT user_id INTO v_student_id FROM public.users 
      WHERE LOWER(user_id || '@gradely.app') = LOWER(auth.jwt() ->> 'email')
         OR (regexp_replace(LOWER(user_id), '[^a-z0-9_.-]', '_', 'g') || '@gradely.app') = LOWER(auth.jwt() ->> 'email');
    END IF;
  END IF;

  -- 2. Check student session token
  IF v_student_id IS NULL AND p_session_token IS NOT NULL AND TRIM(p_session_token) <> '' THEN
    SELECT user_id INTO v_student_id 
    FROM public.student_sessions 
    WHERE token = TRIM(p_session_token) AND expires_at > now();
  END IF;

  -- 3. Fail closed if not authenticated or invalid token
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Valid student session token or authentication required' USING errcode = '42501';
  END IF;

  RETURN QUERY 
  SELECT * FROM public.grades 
  WHERE TRIM(student_id) = TRIM(v_student_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_grades(text) TO anon, authenticated;
ALTER FUNCTION public.get_my_grades(text) OWNER TO postgres;

-- 3. UPDATE get_system_visibility FOR 100% STRICT SUBJECT ISOLATION
CREATE OR REPLACE FUNCTION public.get_system_visibility()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res jsonb := '{}'::jsonb;
  r RECORD;
  item text;
BEGIN
  FOR r IN SELECT id, excluded_students FROM public.subjects WHERE excluded_students IS NOT NULL LOOP
    IF jsonb_typeof(to_jsonb(r.excluded_students)) = 'array' THEN
      FOR item IN SELECT jsonb_array_elements_text(to_jsonb(r.excluded_students)) LOOP
        -- Global configuration
        IF item LIKE 'CONFIG:%' THEN
          BEGIN
            v_res := v_res || jsonb_build_object('global', (replace(item, 'CONFIG:', ''))::jsonb);
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
        -- Isolated Subject-Specific Configuration (Takes highest priority for r.id)
        ELSIF item LIKE 'CONFIG_VIS_SUB:%' THEN
          BEGIN
            DECLARE
              v_sub_obj jsonb := (replace(item, 'CONFIG_VIS_SUB:', ''))::jsonb;
            BEGIN
              IF v_sub_obj ? (r.id::text) THEN
                v_res := v_res || jsonb_build_object(r.id::text, v_sub_obj -> (r.id::text));
              ELSE
                v_res := v_res || jsonb_build_object(r.id::text, v_sub_obj);
              END IF;
            END;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
        -- Legacy support: ONLY extract this subject's own key from legacy CONFIG_SUB
        ELSIF item LIKE 'CONFIG_SUB:%' THEN
          BEGIN
            DECLARE
              v_parsed jsonb := (replace(item, 'CONFIG_SUB:', ''))::jsonb;
            BEGIN
              IF v_parsed ? (r.id::text) THEN
                -- Only assign to r.id if not already set by CONFIG_VIS_SUB
                IF NOT (v_res ? (r.id::text)) THEN
                  v_res := v_res || jsonb_build_object(r.id::text, v_parsed -> (r.id::text));
                END IF;
              END IF;
              IF (v_parsed ? 'global') AND NOT (v_res ? 'global') THEN
                v_res := v_res || jsonb_build_object('global', v_parsed -> 'global');
              END IF;
            END;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
  RETURN v_res;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_system_visibility() TO anon, authenticated;
ALTER FUNCTION public.get_system_visibility() OWNER TO postgres;
