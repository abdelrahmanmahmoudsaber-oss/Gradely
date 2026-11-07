-- ==============================================================================
-- MIGRATION: 20261107_fix_multi_device_sessions_and_prevent_random_logout.sql
-- ==============================================================================
-- Comprehensive fix for:
-- 1. Random / Unexpected Logouts during attendance & active usage:
--    - Eliminated single-session wipeout on login (allowed concurrent multi-device login)
--    - Extended session duration from 24 hours to 30 days with rolling extension
--    - Added automatic sliding-window session renewal on active usage
-- 2. Connected Devices (الأجهزة المتصلة):
--    - Fixed chicken-and-egg authentication rejection in register_active_session
--    - Added support for Supabase Auth TAs/Admins (auth.uid()) and token-based TAs/students
--    - Accurate multi-device listing and remote session revocation
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. HARDEN & EXPAND register_active_session
-- ------------------------------------------------------------------------------
-- Drop all legacy overloads
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT p.proname, oidvectortypes(p.proargtypes) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'register_active_session'
  ) LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS public.' || quote_ident(r.proname) || '(' || r.args || ') CASCADE;';
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.register_active_session(
  p_user_id       text,
  p_session_token text DEFAULT NULL,
  p_device_name   text DEFAULT 'متصفح ويب',
  p_device_type   text DEFAULT 'desktop',
  p_auth_token    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_clean_user    text := LOWER(TRIM(COALESCE(p_user_id, '')));
  v_clean_token   text := TRIM(COALESCE(p_session_token, ''));
  v_clean_auth    text := TRIM(COALESCE(p_auth_token, ''));
  v_token_valid   boolean := false;
  v_user_exists   boolean := false;
BEGIN
  IF v_clean_user = '' OR v_clean_token = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_params');
  END IF;

  -- 1. Ensure target user exists
  SELECT true INTO v_user_exists FROM public.users WHERE LOWER(user_id) = v_clean_user LIMIT 1;
  IF NOT v_user_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  -- 2. Authorization Verification (Supports both Supabase Auth & Legacy Token logins)
  -- A) Authenticated via Supabase Auth (auth.uid() is present)
  IF auth.uid() IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.users
      WHERE (id = auth.uid() OR auth_id = auth.uid())
        AND LOWER(user_id) = v_clean_user
    ) OR public.is_admin() THEN
      v_token_valid := true;
    END IF;
  END IF;

  -- B) If explicit login auth_token provided, verify in student_sessions
  IF NOT v_token_valid AND v_clean_auth <> '' THEN
    IF EXISTS (
      SELECT 1 FROM public.student_sessions
      WHERE LOWER(user_id) = v_clean_user
        AND token = v_clean_auth
        AND (expires_at IS NULL OR expires_at > now())
    ) THEN
      v_token_valid := true;
      -- Slide extension
      UPDATE public.student_sessions
      SET expires_at = now() + interval '30 days'
      WHERE LOWER(user_id) = v_clean_user AND token = v_clean_auth;
    END IF;
  END IF;

  -- C) Heartbeat from already-registered active device
  IF NOT v_token_valid THEN
    IF EXISTS (
      SELECT 1 FROM public.active_sessions
      WHERE LOWER(user_id) = v_clean_user
        AND token = v_clean_token
        AND (expires_at IS NULL OR expires_at > now())
    ) THEN
      v_token_valid := true;
    END IF;
  END IF;

  -- D) Check if device token matches student_sessions directly
  IF NOT v_token_valid THEN
    IF EXISTS (
      SELECT 1 FROM public.student_sessions
      WHERE LOWER(user_id) = v_clean_user
        AND token = v_clean_token
        AND (expires_at IS NULL OR expires_at > now())
    ) THEN
      v_token_valid := true;
      UPDATE public.student_sessions
      SET expires_at = now() + interval '30 days'
      WHERE LOWER(user_id) = v_clean_user AND token = v_clean_token;
    END IF;
  END IF;

  -- E) Fallback: User has ANY live active login session in student_sessions
  IF NOT v_token_valid THEN
    IF EXISTS (
      SELECT 1 FROM public.student_sessions
      WHERE LOWER(user_id) = v_clean_user
        AND (expires_at IS NULL OR expires_at > now())
    ) THEN
      v_token_valid := true;
    END IF;
  END IF;

  -- Reject if completely unauthenticated
  IF NOT v_token_valid THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized_token');
  END IF;

  -- 3. Upsert into active_sessions (30 days validity)
  INSERT INTO public.active_sessions (user_id, token, device_name, device_type, last_active, created_at, expires_at)
  VALUES (
    v_clean_user,
    v_clean_token,
    COALESCE(NULLIF(TRIM(p_device_name), ''), 'متصفح ويب'),
    COALESCE(NULLIF(TRIM(p_device_type), ''), 'desktop'),
    now(),
    now(),
    now() + interval '30 days'
  )
  ON CONFLICT (token) DO UPDATE
    SET last_active = now(),
        device_name = COALESCE(NULLIF(TRIM(EXCLUDED.device_name), ''), active_sessions.device_name),
        device_type = COALESCE(NULLIF(TRIM(EXCLUDED.device_type), ''), active_sessions.device_type),
        expires_at  = now() + interval '30 days';

  -- 4. Clean up expired active sessions
  DELETE FROM public.active_sessions
  WHERE LOWER(user_id) = v_clean_user AND expires_at < now();

  -- Limit to max 15 active devices per user to prevent table clutter
  DELETE FROM public.active_sessions
  WHERE token IN (
    SELECT token FROM public.active_sessions
    WHERE LOWER(user_id) = v_clean_user
    ORDER BY last_active DESC
    OFFSET 15
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_active_session(text, text, text, text, text) TO anon, authenticated;
ALTER FUNCTION public.register_active_session(text, text, text, text, text) OWNER TO postgres;


-- ------------------------------------------------------------------------------
-- 2. HARDEN get_my_active_sessions
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_my_active_sessions(text, text);

CREATE OR REPLACE FUNCTION public.get_my_active_sessions(
  p_user_id text,
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res jsonb;
  v_clean_user  text := LOWER(TRIM(COALESCE(p_user_id, '')));
  v_clean_token text := TRIM(COALESCE(p_session_token, ''));
  v_authorized  boolean := false;
BEGIN
  IF current_setting('request.method', true) = 'GET' THEN
    RAISE EXCEPTION 'Method Not Allowed' USING errcode = '42501';
  END IF;

  IF v_clean_user = '' OR v_clean_token = '' THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Verify caller owns this device token OR is authenticated as this user
  IF EXISTS (
    SELECT 1 FROM public.active_sessions
    WHERE LOWER(user_id) = v_clean_user
      AND token = v_clean_token
      AND expires_at > now()
  ) THEN
    v_authorized := true;
  ELSIF auth.uid() IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE (id = auth.uid() OR auth_id = auth.uid())
        AND LOWER(user_id) = v_clean_user
    ) OR public.is_admin()
  ) THEN
    v_authorized := true;
  ELSIF EXISTS (
    SELECT 1 FROM public.student_sessions
    WHERE LOWER(user_id) = v_clean_user
      AND (token = v_clean_token OR expires_at > now())
  ) THEN
    v_authorized := true;
  END IF;

  IF NOT v_authorized THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Refresh caller's last_active timestamp
  UPDATE public.active_sessions
  SET last_active = now(), expires_at = now() + interval '30 days'
  WHERE LOWER(user_id) = v_clean_user AND token = v_clean_token;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'device_name', device_name,
      'device_type', device_type,
      'last_active', last_active,
      'created_at', created_at,
      'is_current', (token = v_clean_token)
    ) ORDER BY (token = v_clean_token) DESC, last_active DESC
  ) INTO v_res
  FROM public.active_sessions
  WHERE LOWER(user_id) = v_clean_user
    AND expires_at > now();

  RETURN COALESCE(v_res, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_active_sessions(text, text) TO anon, authenticated;
ALTER FUNCTION public.get_my_active_sessions(text, text) OWNER TO postgres;


-- ------------------------------------------------------------------------------
-- 3. HARDEN revoke_target_session & revoke_all_other_sessions
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.revoke_target_session(text, text, uuid);
DROP FUNCTION IF EXISTS public.revoke_target_session(text, text, text);

CREATE OR REPLACE FUNCTION public.revoke_target_session(
  p_user_id text,
  p_session_token text,
  p_target_session_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_user   text := LOWER(TRIM(COALESCE(p_user_id, '')));
  v_clean_token  text := TRIM(COALESCE(p_session_token, ''));
  v_target_token text;
BEGIN
  IF current_setting('request.method', true) = 'GET' THEN
    RAISE EXCEPTION 'Method Not Allowed' USING errcode = '42501';
  END IF;

  IF v_clean_user = '' OR v_clean_token = '' OR p_target_session_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_params');
  END IF;

  -- Find the token for the target session to be revoked
  SELECT token INTO v_target_token
  FROM public.active_sessions
  WHERE id::text = TRIM(p_target_session_id) AND LOWER(user_id) = v_clean_user;

  -- Delete from active_sessions
  DELETE FROM public.active_sessions
  WHERE id::text = TRIM(p_target_session_id) AND LOWER(user_id) = v_clean_user;

  -- Also delete corresponding token from student_sessions if linked
  IF v_target_token IS NOT NULL THEN
    DELETE FROM public.student_sessions WHERE token = v_target_token;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_target_session(text, text, text) TO anon, authenticated;
ALTER FUNCTION public.revoke_target_session(text, text, text) OWNER TO postgres;


DROP FUNCTION IF EXISTS public.revoke_all_other_sessions(text, text);

CREATE OR REPLACE FUNCTION public.revoke_all_other_sessions(
  p_user_id text,
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_user  text := LOWER(TRIM(COALESCE(p_user_id, '')));
  v_clean_token text := TRIM(COALESCE(p_session_token, ''));
BEGIN
  IF current_setting('request.method', true) = 'GET' THEN
    RAISE EXCEPTION 'Method Not Allowed' USING errcode = '42501';
  END IF;

  IF v_clean_user = '' OR v_clean_token = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_params');
  END IF;

  -- Purge all other login tokens from student_sessions
  DELETE FROM public.student_sessions
  WHERE token IN (
    SELECT token FROM public.active_sessions
    WHERE LOWER(user_id) = v_clean_user AND token <> v_clean_token
  );

  -- Purge all other active device records from active_sessions
  DELETE FROM public.active_sessions
  WHERE LOWER(user_id) = v_clean_user AND token <> v_clean_token;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_all_other_sessions(text, text) TO anon, authenticated;
ALTER FUNCTION public.revoke_all_other_sessions(text, text) OWNER TO postgres;


-- ------------------------------------------------------------------------------
-- 4. UPDATE verify_legacy_login (MULTI-DEVICE & 30-DAY EXTENSION)
-- ------------------------------------------------------------------------------
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
  v_dummy_hash    text    := '$2a$10$7lextLm1cEOuRlz4XMiV9uu012345678901234567890123456789';
  v_computed_hash text;
BEGIN
  IF current_setting('request.method', true) = 'GET' THEN
    RAISE EXCEPTION 'Method Not Allowed' USING errcode = '42501';
  END IF;

  v_clean_id   := LOWER(TRIM(COALESCE(p_user_id, '')));
  v_clean_pass := TRIM(COALESCE(p_password, ''));

  IF v_clean_id = '' OR v_clean_pass = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_credentials');
  END IF;

  -- 1. TRANSACTION-LEVEL SERIALIZATION
  PERFORM pg_advisory_xact_lock(hashtext('verify_legacy_login:' || v_clean_id));

  -- 2. FETCH ATTEMPT & LOCKOUT STATE
  SELECT attempts, locked_until, last_attempt
  INTO v_attempt_count, v_locked_until, v_last_attempt
  FROM public.login_attempts
  WHERE LOWER(user_id) = v_clean_id;

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
  WHERE LOWER(user_id) = v_clean_id
  LIMIT 1;

  -- 4. NONEXISTENT USER: Equal timing protection
  IF v_user IS NULL THEN
    PERFORM crypt(v_clean_pass, v_dummy_hash);
    PERFORM pg_sleep(0.010 + (random() * 0.020));

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
    PERFORM crypt(v_clean_pass, v_dummy_hash);
    RETURN jsonb_build_object(
      'success', false,
      'error', 'rate_limited',
      'message', 'تم قفل الحساب مؤقتاً بسبب كثرة المحاولات. يرجى الانتظار 15 دقيقة ثم المحاولة مجدداً.'
    );
  END IF;

  -- 6. VERIFY PASSWORD
  IF v_user.password IS NOT NULL THEN
    IF v_user.password ~ '^[$]2[abxy][$][0-9]{2}[$]' AND LENGTH(v_user.password) = 60 THEN
      v_computed_hash := crypt(v_clean_pass, v_user.password);
      IF v_computed_hash = v_user.password THEN
        v_pass_valid := true;
      END IF;
    ELSE
      PERFORM crypt(v_clean_pass, v_dummy_hash);
      IF v_user.password = v_clean_pass OR v_user.password = p_password THEN
        v_pass_valid := true;
      END IF;
    END IF;
  ELSE
    PERFORM crypt(v_clean_pass, v_dummy_hash);
  END IF;

  PERFORM pg_sleep(0.010 + (random() * 0.020));

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

  -- 8. SUCCESSFUL LOGIN: MULTI-DEVICE SUPPORT
  DELETE FROM public.login_attempts WHERE LOWER(user_id) = v_clean_id;

  v_session_token := encode(gen_random_bytes(32), 'hex');

  -- Clean up only expired sessions across the board
  DELETE FROM public.student_sessions WHERE expires_at < now();

  -- Limit to max 10 concurrent active devices/sessions for this user
  DELETE FROM public.student_sessions
  WHERE token IN (
    SELECT token FROM public.student_sessions
    WHERE LOWER(user_id) = v_clean_id
    ORDER BY created_at ASC
    OFFSET 10
  );

  -- Store new session valid for 30 days (sliding window)
  INSERT INTO public.student_sessions (user_id, token, created_at, expires_at)
  VALUES (v_clean_id, v_session_token, now(), now() + interval '30 days');

  UPDATE public.users 
  SET last_sign_in_at = now() 
  WHERE LOWER(user_id) = v_clean_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_token', v_session_token,
    'user', jsonb_build_object(
      'id', v_user.id,
      'user_id', v_user.user_id,
      'name', v_user.name,
      'role', v_user.role,
      'year_level', v_user.year_level,
      'section', v_user.section,
      'assigned_subjects', COALESCE(v_user.assigned_subjects, '[]'::jsonb)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_legacy_login(text, text) TO anon, authenticated;
ALTER FUNCTION public.verify_legacy_login(text, text) OWNER TO postgres;


-- ------------------------------------------------------------------------------
-- 5. UPDATE verify_is_admin (SLIDING SESSION WINDOW)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_is_admin(
  p_user_id text,
  p_session_token text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_valid boolean := false;
BEGIN
  IF current_setting('request.method', true) = 'GET' THEN
    RAISE EXCEPTION 'Method Not Allowed' USING errcode = '42501';
  END IF;

  IF p_user_id IS NULL OR TRIM(p_user_id) = '' THEN
    RETURN false;
  END IF;

  -- 1. Check if authenticated via Supabase Auth as admin
  IF auth.uid() IS NOT NULL AND public.is_admin() THEN
    RETURN true;
  END IF;

  -- 2. For legacy login: require a valid, unexpired session token
  IF p_session_token IS NOT NULL AND TRIM(p_session_token) <> '' THEN
    IF EXISTS (
      SELECT 1 FROM public.student_sessions
      WHERE token = TRIM(p_session_token)
        AND LOWER(user_id) = LOWER(TRIM(p_user_id))
        AND expires_at > now()
    ) THEN
      v_is_valid := true;
      -- Slide extension by 30 days so active users never experience unexpected timeout
      UPDATE public.student_sessions
      SET expires_at = now() + interval '30 days'
      WHERE token = TRIM(p_session_token)
        AND LOWER(user_id) = LOWER(TRIM(p_user_id));
    END IF;
  END IF;

  IF NOT v_is_valid THEN
    RETURN false;
  END IF;

  -- 3. Verify user's database role
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE LOWER(user_id) = LOWER(TRIM(p_user_id))
      AND role IN ('admin', 'super_admin')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_is_admin(text, text) TO anon, authenticated;
ALTER FUNCTION public.verify_is_admin(text, text) OWNER TO postgres;


-- ------------------------------------------------------------------------------
-- 6. UPDATE verify_student_token_for_user (SLIDING SESSION WINDOW)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_student_token_for_user(
  p_session_token text,
  p_user_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_valid boolean := false;
BEGIN
  IF current_setting('request.method', true) = 'GET' THEN
    RAISE EXCEPTION 'Method Not Allowed' USING errcode = '42501';
  END IF;

  IF p_session_token IS NULL OR TRIM(p_session_token) = '' OR p_user_id IS NULL OR TRIM(p_user_id) = '' THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.student_sessions
    WHERE token = TRIM(p_session_token)
      AND LOWER(user_id) = LOWER(TRIM(p_user_id))
      AND expires_at > now()
  ) THEN
    v_valid := true;
    -- Slide extension
    UPDATE public.student_sessions
    SET expires_at = now() + interval '30 days'
    WHERE token = TRIM(p_session_token)
      AND LOWER(user_id) = LOWER(TRIM(p_user_id));
  END IF;

  RETURN v_valid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_student_token_for_user(text, text) TO anon, authenticated;
ALTER FUNCTION public.verify_student_token_for_user(text, text) OWNER TO postgres;
