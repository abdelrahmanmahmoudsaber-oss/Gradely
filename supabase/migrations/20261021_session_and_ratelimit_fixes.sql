-- =============================================================================
-- MIGRATION: 20261021_session_and_ratelimit_fixes.sql
-- PURPOSE:   Close pentest P1 & P2 findings (Iteration-1 Revalidation + New)
--
--   Fix 1 (P1 – CWE-613): student_change_password must invalidate ALL sessions
--          including the caller's own token after a successful password change.
--   Fix 2 (P1 – CWE-307): Add brute-force rate-limit to student_change_password
--          using the same login_attempts table/logic as verify_legacy_login.
--   Fix 3 (P1 – null-role INSERT gap): protect_user_role_and_permissions trigger
--          must default role to 'student' on INSERT when role IS NULL, to prevent
--          a null-role account being later promoted via a subsequent UPDATE.
--   Fix 4 (P2 – CWE-200): Revoke instructor_name from anon SELECT grant on
--          subjects table; anon readers have no need for instructor info.
--   Fix 5 (P3 – password policy): Reject new password == current password inside
--          student_change_password (same-password rotation is meaningless and
--          allows session-token recycling attacks).
--
-- SAFE TO RUN MULTIPLE TIMES (all statements are idempotent / CREATE OR REPLACE).
-- =============================================================================

-- ============================================================
-- FIX 3: NULL-ROLE INSERT GAP IN protect_user_role_and_permissions
-- ============================================================
-- The previous trigger only blocked INSERTs where role = 'admin'|'super_admin'.
-- A null-role INSERT slipped through. We now default NULL → 'student' on INSERT
-- so that any attempt to self-promote later is caught by the UPDATE protection.

CREATE OR REPLACE FUNCTION public.protect_user_role_and_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow direct SQL from service_role (Supabase SQL Editor / migrations)
  IF (COALESCE(auth.jwt() ->> 'role', '') = 'service_role') THEN
    RETURN NEW;
  END IF;

  -- ----------------------------------------------------------------
  -- INSERT PROTECTION
  -- ----------------------------------------------------------------
  IF (TG_OP = 'INSERT') THEN
    -- FIX 3: Null-role accounts could be exploited later for promotion.
    -- Silently coerce NULL/empty role to 'student' on INSERT.
    IF NEW.role IS NULL OR TRIM(COALESCE(NEW.role, '')) = '' THEN
      NEW.role := 'student';
    END IF;

    -- Only Super Admin may create admin / super_admin accounts
    IF NEW.role IN ('admin', 'super_admin') THEN
      IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only Super Admin can create administrator accounts'
          USING errcode = '42501';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  -- ----------------------------------------------------------------
  -- UPDATE PROTECTION
  -- ----------------------------------------------------------------
  IF (TG_OP = 'UPDATE') THEN
    -- Role change requires Super Admin
    IF (NEW.role IS DISTINCT FROM OLD.role) THEN
      IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only Super Admin can modify user roles'
          USING errcode = '42501';
      END IF;
    END IF;

    -- Any write to an admin/super_admin row requires Super Admin
    IF (OLD.role IN ('admin', 'super_admin') OR NEW.role IN ('admin', 'super_admin')) THEN
      IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Non-administrators cannot modify administrative accounts'
          USING errcode = '42501';
      END IF;
    END IF;

    -- auth_id binding is Super Admin-only
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

-- Recreate trigger (DROP + CREATE is idempotent)
DROP TRIGGER IF EXISTS trg_protect_user_role ON public.users;
CREATE TRIGGER trg_protect_user_role
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_user_role_and_permissions();


-- ============================================================
-- FIX 4: REVOKE instructor_name FROM ANON ON subjects TABLE
-- ============================================================
-- The anon role must not see who teaches a subject before login.
-- We rebuild the grant without instructor_name.

REVOKE ALL ON TABLE public.subjects FROM anon;

GRANT SELECT (id, name, year_level, total_weeks, created_at)
  ON TABLE public.subjects TO anon;

-- authenticated users (logged-in admins/students) keep full read access
GRANT SELECT ON TABLE public.subjects TO authenticated;


-- ============================================================
-- FIX 1 + 2 + 5: REPLACE student_change_password WITH HARDENED VERSION
-- ============================================================
-- Changes vs. previous version:
--   • Rate-limit on p_current_password verification (5 attempts / 15-min window)
--   • Rejects new == current password (Fix 5)
--   • Deletes ALL sessions including caller's own (Fix 1 – CWE-613)
--   • Same lock/unlock behaviour as verify_legacy_login

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
  -- ----------------------------------------------------------------
  -- 1. Validate session token
  -- ----------------------------------------------------------------
  IF p_session_token IS NULL OR TRIM(p_session_token) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'unauthorized',
      'message', 'الجلسة غير صالحة.'
    );
  END IF;

  SELECT user_id INTO v_student_id
  FROM public.student_sessions
  WHERE token = TRIM(p_session_token)
    AND expires_at > now();

  IF v_student_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'unauthorized',
      'message', 'الجلسة منتهية أو غير صالحة.'
    );
  END IF;

  -- ----------------------------------------------------------------
  -- 2. Rate-limit check (Fix 2 – CWE-307)
  --    Re-use login_attempts table keyed on v_student_id.
  --    Policy: 5 failures within 15 minutes → 15-minute lock.
  -- ----------------------------------------------------------------
  SELECT attempts, locked_until
  INTO v_attempts, v_locked_until
  FROM public.login_attempts
  WHERE user_id = v_student_id;

  IF v_locked_until IS NOT NULL AND v_locked_until > now() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'rate_limited',
      'message', 'حسابك مؤقتاً محظور بسبب كثرة المحاولات، يرجى المحاولة بعد قليل.'
    );
  END IF;

  -- ----------------------------------------------------------------
  -- 3. Sanitise inputs
  -- ----------------------------------------------------------------
  v_clean_cur := TRIM(COALESCE(p_current_password, ''));
  v_clean_new := TRIM(COALESCE(p_new_password, ''));

  IF LENGTH(v_clean_new) < 6 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'password_too_short',
      'message', 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل.'
    );
  END IF;

  -- ----------------------------------------------------------------
  -- 4. Fetch current password hash
  -- ----------------------------------------------------------------
  SELECT password INTO v_stored_hash
  FROM public.users
  WHERE user_id = v_student_id;

  IF v_stored_hash IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'user_not_found',
      'message', 'لم يتم العثور على المستخدم.'
    );
  END IF;

  -- ----------------------------------------------------------------
  -- 5. Verify current password (bcrypt or plain fallback)
  -- ----------------------------------------------------------------
  IF v_stored_hash ~ '^[$]2[abxy][$][0-9]{2}[$]' AND LENGTH(v_stored_hash) = 60 THEN
    IF crypt(v_clean_cur, v_stored_hash) = v_stored_hash
       OR crypt(p_current_password, v_stored_hash) = v_stored_hash THEN
      v_is_correct := true;
    END IF;
  ELSE
    IF v_stored_hash = v_clean_cur OR v_stored_hash = p_current_password THEN
      v_is_correct := true;
    END IF;
  END IF;

  IF NOT v_is_correct THEN
    -- Increment rate-limit counter
    INSERT INTO public.login_attempts (user_id, attempts, last_attempt)
      VALUES (v_student_id, 1, now())
      ON CONFLICT (user_id) DO UPDATE
        SET attempts    = CASE
                            WHEN login_attempts.locked_until IS NOT NULL
                                 AND login_attempts.locked_until <= now()     THEN 1
                            WHEN login_attempts.last_attempt < now() - interval '15 minutes' THEN 1
                            ELSE login_attempts.attempts + 1
                          END,
            last_attempt = now(),
            locked_until = CASE
                             WHEN (CASE
                                     WHEN login_attempts.locked_until IS NOT NULL
                                          AND login_attempts.locked_until <= now()     THEN 1
                                     WHEN login_attempts.last_attempt < now() - interval '15 minutes' THEN 1
                                     ELSE login_attempts.attempts + 1
                                   END) >= 5
                             THEN now() + interval '15 minutes'
                             ELSE NULL
                           END;

    RETURN jsonb_build_object(
      'success', false,
      'error',   'wrong_current_password',
      'message', 'كلمة المرور الحالية غير صحيحة.'
    );
  END IF;

  -- ----------------------------------------------------------------
  -- 6. Fix 5 – Reject new == current password
  -- ----------------------------------------------------------------
  DECLARE
    v_same boolean := false;
  BEGIN
    IF v_stored_hash ~ '^[$]2[abxy][$][0-9]{2}[$]' AND LENGTH(v_stored_hash) = 60 THEN
      IF crypt(v_clean_new, v_stored_hash) = v_stored_hash THEN
        v_same := true;
      END IF;
    ELSE
      IF v_stored_hash = v_clean_new THEN
        v_same := true;
      END IF;
    END IF;

    IF v_same THEN
      RETURN jsonb_build_object(
        'success', false,
        'error',   'same_password',
        'message', 'كلمة المرور الجديدة يجب أن تختلف عن الحالية.'
      );
    END IF;
  END;

  -- ----------------------------------------------------------------
  -- 7. Success: update password
  -- ----------------------------------------------------------------
  UPDATE public.users
  SET password = crypt(v_clean_new, gen_salt('bf', 10))
  WHERE user_id = v_student_id;

  -- Clear rate-limit counter on successful change
  DELETE FROM public.login_attempts WHERE user_id = v_student_id;

  -- ----------------------------------------------------------------
  -- Fix 1 (CWE-613): Invalidate ALL sessions including the caller's.
  -- The client will be forced to log in again with the new password.
  -- ----------------------------------------------------------------
  DELETE FROM public.student_sessions WHERE user_id = v_student_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'تم تغيير كلمة المرور بنجاح. يرجى تسجيل الدخول مرة أخرى.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.student_change_password(text, text, text) TO anon, authenticated;
ALTER FUNCTION public.student_change_password(text, text, text) OWNER TO postgres;


-- ============================================================
-- FIX 6: DROP DEAD ORPHANED RPC verify_admin_promotion_pin (P4 - ISSUE-35)
-- ============================================================
-- The PIN system was removed in 20261016. Dropping this dead function
-- prevents table-name disclosure (42P01 error) on arbitrary invocations.
DROP FUNCTION IF EXISTS public.verify_admin_promotion_pin(text, text);
DROP FUNCTION IF EXISTS public.verify_admin_promotion_pin(text);


-- ============================================================
-- VERIFICATION QUERIES (commented out – run manually to confirm)
-- ============================================================
-- Check that anon cannot see instructor_name:
--   SELECT column_name FROM information_schema.role_column_grants
--   WHERE table_name = 'subjects' AND grantee = 'anon';
--
-- Confirm trigger exists:
--   SELECT tgname FROM pg_trigger WHERE tgname = 'trg_protect_user_role';
--
-- Confirm null-role coercion: (run as anon/student JWT, not service_role)
--   INSERT INTO public.users (user_id, name) VALUES ('TEST999', 'TestNull');
--   SELECT role FROM public.users WHERE user_id = 'TEST999';  -- should be 'student'
--   DELETE FROM public.users WHERE user_id = 'TEST999';       -- cleanup
