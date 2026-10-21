-- =============================================================================
-- MIGRATION: 20261021_session_and_ratelimit_fixes.sql
-- PURPOSE:   Complete security hardening based on Pentest Reassessment:
--
--   1. (ISSUE-39): Create secure student RPC get_my_subjects(p_session_token)
--      and revoke excluded_students / instructor_name from anon on public.subjects.
--      Anonymous scrapers cannot read excluded student lists or internal metadata,
--      while logged-in students receive complete subject & section data.
--   2. (ISSUE-32): Eliminate login timing oracle in verify_legacy_login by running
--      a constant-time dummy bcrypt comparison when user does not exist.
--   3. (ISSUE-37): Enforce POST method in RPCs (get_my_attendance, get_my_subjects,
--      get_system_backup_data) to reject session tokens passed in GET query strings.
--   4. (ISSUE-38): Enforce POST method and rate limiting on get_system_backup_data.
--   5. (ISSUE-35 / 4.1): Invalidate student session upon password change.
--   6. (ISSUE-36 / 4.2): Add brute-force rate limit on student_change_password.
--   7. (ISSUE-34 / P3): Reject new password identical to current password.
--   8. (Role Escalation): Protect against NULL-role INSERT bypass in trigger.
--   9. (ISSUE-35): Drop dead verify_admin_promotion_pin RPC.
--
-- SAFE & IDEMPOTENT: Can be executed multiple times safely without data loss.
-- =============================================================================

-- ============================================================
-- 1. NULL-ROLE INSERT PROTECTION TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION public.protect_user_role_and_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (COALESCE(auth.jwt() ->> 'role', '') = 'service_role') THEN
    RETURN NEW;
  END IF;

  IF (TG_OP = 'INSERT') THEN
    IF NEW.role IS NULL OR TRIM(COALESCE(NEW.role, '')) = '' THEN
      NEW.role := 'student';
    END IF;

    IF NEW.role IN ('admin', 'super_admin') THEN
      IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only Super Admin can create administrator accounts'
          USING errcode = '42501';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  IF (TG_OP = 'UPDATE') THEN
    IF (NEW.role IS DISTINCT FROM OLD.role) THEN
      IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only Super Admin can modify user roles'
          USING errcode = '42501';
      END IF;
    END IF;

    IF (OLD.role IN ('admin', 'super_admin') OR NEW.role IN ('admin', 'super_admin')) THEN
      IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Non-administrators cannot modify administrative accounts'
          USING errcode = '42501';
      END IF;
    END IF;

    IF (NEW.auth_id IS DISTINCT FROM OLD.auth_id) THEN
      IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only Super Admin can assign or bind auth_id'
          USING errcode = '42501';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_user_role ON public.users;
CREATE TRIGGER trg_protect_user_role
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_user_role_and_permissions();


-- ============================================================
-- 2. SECURE STUDENT SUBJECTS RPC (Fixes ISSUE-39 & ISSUE-25)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_subjects(p_session_token text DEFAULT NULL)
RETURNS SETOF public.subjects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id text := NULL;
BEGIN
  -- Reject GET method to prevent tokens in query strings / proxy logs (ISSUE-37)
  IF current_setting('request.method', true) = 'GET' THEN
    RAISE EXCEPTION 'Method Not Allowed: Session token must be supplied via POST body' USING errcode = '42501';
  END IF;

  -- 1. Allow authenticated staff/admin
  IF auth.uid() IS NOT NULL AND public.is_admin() THEN
    RETURN QUERY SELECT * FROM public.subjects ORDER BY year_level ASC, name ASC;
    RETURN;
  END IF;

  -- 2. Validate student session token
  IF p_session_token IS NOT NULL AND TRIM(p_session_token) <> '' THEN
    SELECT user_id INTO v_student_id
    FROM public.student_sessions
    WHERE token = TRIM(p_session_token) AND expires_at > now();
  END IF;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Valid student session token required' USING errcode = '42501';
  END IF;

  -- 3. Return full subject metadata for authorized student
  RETURN QUERY
  SELECT * FROM public.subjects
  ORDER BY year_level ASC, name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_subjects(text) TO anon, authenticated;
ALTER FUNCTION public.get_my_subjects(text) OWNER TO postgres;

-- Tighten direct table permissions on subjects for anon
REVOKE ALL ON TABLE public.subjects FROM anon;
GRANT SELECT (id, name, year_level, total_weeks, created_at) ON TABLE public.subjects TO anon;
GRANT SELECT ON TABLE public.subjects TO authenticated;


-- ============================================================
-- 3. HARDEN get_my_attendance (Fixes ISSUE-37 / CWE-598)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_attendance(p_session_token text DEFAULT NULL)
RETURNS SETOF public.attendance
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id text := NULL;
BEGIN
  -- Reject GET method to prevent tokens in query strings / proxy logs (ISSUE-37)
  IF current_setting('request.method', true) = 'GET' THEN
    RAISE EXCEPTION 'Method Not Allowed: Session token must be supplied via POST body' USING errcode = '42501';
  END IF;

  -- 1. Check if caller is authenticated staff/admin
  IF auth.uid() IS NOT NULL THEN
    IF public.is_admin() THEN
      RETURN QUERY SELECT * FROM public.attendance ORDER BY week_number ASC;
      RETURN;
    END IF;

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
  SELECT * FROM public.attendance 
  WHERE TRIM(student_id) = TRIM(v_student_id)
  ORDER BY week_number ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_attendance(text) TO anon, authenticated;
ALTER FUNCTION public.get_my_attendance(text) OWNER TO postgres;


-- ============================================================
-- 4. HARDEN verify_legacy_login (Fixes ISSUE-32 Timing Oracle)
-- ============================================================
CREATE OR REPLACE FUNCTION public.verify_legacy_login(p_user_id text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user          RECORD;
  v_clean_id      text;
  v_clean_pass    text;
  v_pass_valid    boolean := false;
  v_session_token text;
  v_attempt_count int     := 0;
  v_is_locked     boolean := false;
  v_locked_until  timestamptz;
  v_last_attempt  timestamptz;
  v_max_attempts  int     := 5;
BEGIN
  v_clean_id   := TRIM(COALESCE(p_user_id, ''));
  v_clean_pass := TRIM(COALESCE(p_password, ''));

  IF v_clean_id = '' OR p_password IS NULL OR p_password = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_credentials');
  END IF;

  -- 1. TRANSACTION-LEVEL SERIALIZATION
  PERFORM pg_advisory_xact_lock(hashtext('verify_legacy_login:' || v_clean_id));

  -- 2. FETCH ATTEMPT & LOCKOUT STATE
  SELECT attempts, locked_until, last_attempt
  INTO v_attempt_count, v_locked_until, v_last_attempt
  FROM public.login_attempts
  WHERE user_id = v_clean_id;

  v_attempt_count := COALESCE(v_attempt_count, 0);

  IF v_locked_until IS NOT NULL AND v_locked_until > now() THEN
    v_is_locked := true;
  ELSIF v_locked_until IS NOT NULL AND v_locked_until <= now() THEN
    v_attempt_count := 0;
    v_is_locked := false;
  ELSIF v_last_attempt IS NOT NULL AND v_last_attempt < now() - interval '15 minutes' THEN
    v_attempt_count := 0;
    v_is_locked := false;
  END IF;

  -- 3. FETCH USER RECORD
  SELECT id, user_id, name, role, password,
         year_level, section, assigned_subjects, auth_id, last_sign_in_at
  INTO v_user
  FROM public.users
  WHERE user_id = v_clean_id
  LIMIT 1;

  -- 4. NONEXISTENT USER: Perform dummy bcrypt to eliminate timing oracle (ISSUE-32)
  IF v_user IS NULL THEN
    PERFORM crypt(v_clean_pass, '$2a$10$7lextLm1cEOuRlz4XMiV9uu012345678901234567890123456789');

    IF v_is_locked THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'rate_limited',
        'message', 'تم قفل الحساب مؤقتاً بسبب كثرة المحاولات. يرجى الانتظار 15 دقيقة ثم المحاولة مجدداً.'
      );
    END IF;

    BEGIN
      INSERT INTO public.login_attempts (user_id, attempts, last_attempt, locked_until)
      VALUES (v_clean_id, 1, now(), NULL)
      ON CONFLICT (user_id) DO UPDATE
        SET attempts = CASE
              WHEN public.login_attempts.locked_until IS NOT NULL AND public.login_attempts.locked_until <= now() THEN 1
              WHEN public.login_attempts.last_attempt < now() - interval '15 minutes' THEN 1
              ELSE public.login_attempts.attempts + 1
            END,
            last_attempt = now(),
            locked_until = CASE
              WHEN (CASE
                WHEN public.login_attempts.locked_until IS NOT NULL AND public.login_attempts.locked_until <= now() THEN 1
                WHEN public.login_attempts.last_attempt < now() - interval '15 minutes' THEN 1
                ELSE public.login_attempts.attempts + 1
              END) >= v_max_attempts THEN now() + interval '15 minutes'
              ELSE NULL
            END;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    RETURN jsonb_build_object('success', false, 'error', 'invalid_credentials');
  END IF;

  -- 5. CHECK LOCKOUT FOR EXISTING USER
  IF v_is_locked THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'rate_limited',
      'message', 'تم قفل الحساب مؤقتاً بسبب كثرة المحاولات. يرجى الانتظار 15 دقيقة ثم المحاولة مجدداً.'
    );
  END IF;

  -- 6. VERIFY PASSWORD
  IF v_user.password IS NOT NULL THEN
    IF v_user.password ~ '^[$]2[abxy][$][0-9]{2}[$]' AND LENGTH(v_user.password) = 60 THEN
      IF crypt(v_clean_pass, v_user.password) = v_user.password 
         OR crypt(p_password, v_user.password) = v_user.password THEN
        v_pass_valid := true;
      END IF;
    ELSE
      IF v_user.password = v_clean_pass OR v_user.password = p_password THEN
        v_pass_valid := true;
      END IF;
    END IF;
  END IF;

  -- 7. FAILED LOGIN
  IF NOT v_pass_valid THEN
    INSERT INTO public.login_attempts (user_id, attempts, last_attempt, locked_until)
    VALUES (v_clean_id, 1, now(), NULL)
    ON CONFLICT (user_id) DO UPDATE
      SET attempts = CASE
            WHEN public.login_attempts.locked_until IS NOT NULL AND public.login_attempts.locked_until <= now() THEN 1
            WHEN public.login_attempts.last_attempt < now() - interval '15 minutes' THEN 1
            ELSE public.login_attempts.attempts + 1
          END,
          last_attempt = now(),
          locked_until = CASE
            WHEN (CASE
              WHEN public.login_attempts.locked_until IS NOT NULL AND public.login_attempts.locked_until <= now() THEN 1
              WHEN public.login_attempts.last_attempt < now() - interval '15 minutes' THEN 1
              ELSE public.login_attempts.attempts + 1
            END) >= v_max_attempts THEN now() + interval '15 minutes'
            ELSE NULL
          END;

    RETURN jsonb_build_object('success', false, 'error', 'invalid_credentials');
  END IF;

  -- 8. SUCCESSFUL LOGIN: Clear counter and create cryptographically secure token
  DELETE FROM public.login_attempts WHERE user_id = v_clean_id;

  IF v_user.password IS NOT NULL AND NOT (v_user.password ~ '^[$]2[abxy][$][0-9]{2}[$]') THEN
    BEGIN
      UPDATE public.users
      SET password = crypt(v_clean_pass, gen_salt('bf', 10))
      WHERE user_id = v_clean_id;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  DELETE FROM public.student_sessions WHERE user_id = v_user.user_id;

  v_session_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.student_sessions (user_id, token, expires_at)
  VALUES (v_user.user_id, v_session_token, now() + interval '24 hours');

  BEGIN
    UPDATE public.users SET last_sign_in_at = now() WHERE user_id = v_clean_id;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'user', jsonb_build_object(
      'id',                v_user.id,
      'user_id',           v_user.user_id,
      'name',              v_user.name,
      'role',              v_user.role,
      'year_level',        v_user.year_level,
      'section',           v_user.section,
      'assigned_subjects', v_user.assigned_subjects,
      'auth_id',           v_user.auth_id,
      'session_token',     v_session_token
    ),
    'session_token', v_session_token
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_legacy_login(text, text) TO anon, authenticated;
ALTER FUNCTION public.verify_legacy_login(text, text) OWNER TO postgres;


-- ============================================================
-- 5. HARDEN student_change_password (Fixes 4.1, 4.2 & P3)
-- ============================================================
CREATE OR REPLACE FUNCTION public.student_change_password(
  p_session_token    text,
  p_current_password text,
  p_new_password     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_student_id   text;
  v_stored_hash  text;
  v_clean_cur    text;
  v_clean_new    text;
  v_is_correct   boolean := false;
  v_attempts     int;
  v_locked_until timestamptz;
BEGIN
  -- Reject GET method (ISSUE-37)
  IF current_setting('request.method', true) = 'GET' THEN
    RAISE EXCEPTION 'Method Not Allowed: Session token must be supplied via POST body' USING errcode = '42501';
  END IF;

  IF p_session_token IS NULL OR TRIM(p_session_token) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized', 'message', 'الجلسة غير صالحة.');
  END IF;

  SELECT user_id INTO v_student_id
  FROM public.student_sessions
  WHERE token = TRIM(p_session_token) AND expires_at > now();

  IF v_student_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized', 'message', 'الجلسة منتهية أو غير صالحة.');
  END IF;

  -- Rate limit check
  SELECT attempts, locked_until
  INTO v_attempts, v_locked_until
  FROM public.login_attempts
  WHERE user_id = v_student_id;

  IF v_locked_until IS NOT NULL AND v_locked_until > now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'rate_limited', 'message', 'حسابك مؤقتاً محظور بسبب كثرة المحاولات، يرجى المحاولة بعد قليل.');
  END IF;

  v_clean_cur := TRIM(COALESCE(p_current_password, ''));
  v_clean_new := TRIM(COALESCE(p_new_password, ''));

  IF LENGTH(v_clean_new) < 6 THEN
    RETURN jsonb_build_object('success', false, 'error', 'password_too_short', 'message', 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل.');
  END IF;

  SELECT password INTO v_stored_hash
  FROM public.users
  WHERE user_id = v_student_id;

  IF v_stored_hash IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found', 'message', 'لم يتم العثور على المستخدم.');
  END IF;

  IF v_stored_hash ~ '^[$]2[abxy][$][0-9]{2}[$]' AND LENGTH(v_stored_hash) = 60 THEN
    IF crypt(v_clean_cur, v_stored_hash) = v_stored_hash OR crypt(p_current_password, v_stored_hash) = v_stored_hash THEN
      v_is_correct := true;
    END IF;
  ELSE
    IF v_stored_hash = v_clean_cur OR v_stored_hash = p_current_password THEN
      v_is_correct := true;
    END IF;
  END IF;

  IF NOT v_is_correct THEN
    INSERT INTO public.login_attempts (user_id, attempts, last_attempt)
      VALUES (v_student_id, 1, now())
      ON CONFLICT (user_id) DO UPDATE
        SET attempts    = CASE
                            WHEN login_attempts.locked_until IS NOT NULL AND login_attempts.locked_until <= now() THEN 1
                            WHEN login_attempts.last_attempt < now() - interval '15 minutes' THEN 1
                            ELSE login_attempts.attempts + 1
                          END,
            last_attempt = now(),
            locked_until = CASE
                             WHEN (CASE
                                     WHEN login_attempts.locked_until IS NOT NULL AND login_attempts.locked_until <= now() THEN 1
                                     WHEN login_attempts.last_attempt < now() - interval '15 minutes' THEN 1
                                     ELSE login_attempts.attempts + 1
                                   END) >= 5
                             THEN now() + interval '15 minutes'
                             ELSE NULL
                           END;

    RETURN jsonb_build_object('success', false, 'error', 'wrong_current_password', 'message', 'كلمة المرور الحالية غير صحيحة.');
  END IF;

  -- Reject new == current password
  DECLARE
    v_same boolean := false;
  BEGIN
    IF v_stored_hash ~ '^[$]2[abxy][$][0-9]{2}[$]' AND LENGTH(v_stored_hash) = 60 THEN
      IF crypt(v_clean_new, v_stored_hash) = v_stored_hash THEN v_same := true; END IF;
    ELSE
      IF v_stored_hash = v_clean_new THEN v_same := true; END IF;
    END IF;

    IF v_same THEN
      RETURN jsonb_build_object('success', false, 'error', 'same_password', 'message', 'كلمة المرور الجديدة يجب أن تختلف عن الحالية.');
    END IF;
  END;

  UPDATE public.users
  SET password = crypt(v_clean_new, gen_salt('bf', 10))
  WHERE user_id = v_student_id;

  DELETE FROM public.login_attempts WHERE user_id = v_student_id;

  -- Invalidate all sessions including current
  DELETE FROM public.student_sessions WHERE user_id = v_student_id;

  RETURN jsonb_build_object('success', true, 'message', 'تم تغيير كلمة المرور بنجاح. يرجى تسجيل الدخول مرة أخرى.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.student_change_password(text, text, text) TO anon, authenticated;
ALTER FUNCTION public.student_change_password(text, text, text) OWNER TO postgres;


-- ============================================================
-- 6. HARDEN get_system_backup_data (Fixes ISSUE-38 & ISSUE-37)
-- ============================================================
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
  -- Reject GET method to prevent secret in query strings / logs
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
        SELECT student_id, subject_id, quiz_1, quiz_2, project, attendance_score, total_score
        FROM public.grades
      ) g
    )
  ) INTO v_res;

  RETURN v_res;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_system_backup_data(text) TO anon, authenticated, service_role;
ALTER FUNCTION public.get_system_backup_data(text) OWNER TO postgres;


-- ============================================================
-- 7. DROP DEAD PROMOTION RPC (Fixes ISSUE-35)
-- ============================================================
DROP FUNCTION IF EXISTS public.verify_admin_promotion_pin(text, text);
DROP FUNCTION IF EXISTS public.verify_admin_promotion_pin(text);
