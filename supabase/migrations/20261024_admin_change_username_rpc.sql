-- ==============================================================================
-- Migration: 20261024_admin_change_username_rpc.sql
-- Function to safely change a user's username / user_id (Admin / TA or Student)
-- Cascades changes across users, subjects, auth.users, and tracking tables.
-- Only Super Admin can execute this function.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.admin_change_username(p_old_user_id text, p_new_user_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_old_id text;
  v_new_id text;
  v_user_role text;
  v_user_name text;
  v_existing_id text;
BEGIN
  -- 1. Authorization check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING errcode = '42501';
  END IF;

  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only Super Admin can change usernames' USING errcode = '42501';
  END IF;

  v_old_id := TRIM(COALESCE(p_old_user_id, ''));
  v_new_id := TRIM(COALESCE(p_new_user_id, ''));

  -- 2. Validation
  IF v_old_id = '' OR v_new_id = '' THEN
    RAISE EXCEPTION 'Both old and new usernames are required' USING errcode = '22023';
  END IF;

  IF v_old_id = v_new_id THEN
    RETURN jsonb_build_object('success', true, 'message', 'Username unchanged');
  END IF;

  IF LOWER(v_old_id) = 'admin' THEN
    RAISE EXCEPTION 'Cannot change the primary root administrator username' USING errcode = '42501';
  END IF;

  -- 3. Check old user exists
  SELECT role, name INTO v_user_role, v_user_name
  FROM public.users
  WHERE user_id = v_old_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found', v_old_id USING errcode = 'P0001';
  END IF;

  -- 4. Check new username is not already taken
  SELECT user_id INTO v_existing_id
  FROM public.users
  WHERE user_id = v_new_id;

  IF FOUND THEN
    RAISE EXCEPTION 'Username % is already taken by another account', v_new_id USING errcode = '23505';
  END IF;

  -- 5. Update public.users
  UPDATE public.users
  SET user_id = v_new_id,
      auth_id = NULL -- reset auth_id to trigger clean re-link on next login
  WHERE user_id = v_old_id;

  -- 6. Update auth.users email & metadata if exists
  BEGIN
    UPDATE auth.users
    SET email = LOWER(v_new_id || '@gradely.app'),
        raw_user_meta_data = jsonb_set(COALESCE(raw_user_meta_data, '{}'::jsonb), '{user_id}', to_jsonb(v_new_id)),
        updated_at = now()
    WHERE LOWER(email) = LOWER(v_old_id || '@gradely.app');
  EXCEPTION WHEN OTHERS THEN
    -- Continue if auth.users schema cannot be directly touched
    NULL;
  END;

  -- 7. Cascade to subjects (instructor assignment)
  UPDATE public.subjects
  SET instructor_id = v_new_id
  WHERE instructor_id = v_old_id;

  -- 8. Cascade to subjects array for students
  IF v_user_role = 'student' THEN
    -- Cascade attendance
    UPDATE public.attendance
    SET student_id = v_new_id
    WHERE student_id = v_old_id;

    -- Cascade grades
    UPDATE public.grades
    SET student_id = v_new_id
    WHERE student_id = v_old_id;

    -- Cascade enrolled_students in subjects
    UPDATE public.subjects
    SET enrolled_students = array_replace(enrolled_students, v_old_id, v_new_id),
        included_students = array_replace(included_students, v_old_id, v_new_id)
    WHERE v_old_id = ANY(enrolled_students) OR v_old_id = ANY(included_students);
  END IF;

  -- 9. Clean up sessions & login attempts
  DELETE FROM public.login_attempts WHERE user_id = v_old_id;
  DELETE FROM public.student_sessions WHERE user_id = v_old_id;

  -- 10. Log in audit_logs
  BEGIN
    INSERT INTO public.audit_logs (actor_auth_id, actor_user_id, action, table_name, record_id, old_data, new_data)
    VALUES (
      auth.uid(),
      'super_admin',
      'CHANGE_USERNAME',
      'users',
      v_new_id,
      jsonb_build_object('user_id', v_old_id, 'name', v_user_name, 'role', v_user_role),
      jsonb_build_object('user_id', v_new_id, 'name', v_user_name, 'role', v_user_role)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'old_user_id', v_old_id,
    'new_user_id', v_new_id,
    'name', v_user_name,
    'role', v_user_role
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_change_username(text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_change_username(text, text) TO authenticated;
ALTER FUNCTION public.admin_change_username(text, text) OWNER TO postgres;

COMMENT ON FUNCTION public.admin_change_username(text, text)
  IS 'Super Admin only: safely renames a username across users, subjects, auth, attendance, and grades.';
