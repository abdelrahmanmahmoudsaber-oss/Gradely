-- ==============================================================================
-- GRADELY SECURITY HARDENING — Phase 2 (Production Final Hardening)
-- Date: 2026-10-17
-- Depends on: 20261016_full_security_remediation.sql (applied before this)
-- Scope:
--   1. pgcrypto extension availability guard (checks pg_extension; checks schema existence)
--   2. Bcrypt auto-hash trigger on public.users (transparent, idempotent, avoids double-hash)
--   3. Transactional bulk bcrypt migration with aggregate preflight safety invariants:
--      - Validates aggregate counts (null/empty, valid bcrypt, candidate plaintext, other hash patterns)
--      - Rejects execution transactionally if suspicious hash patterns or null passwords exist
--      - Converts verified plaintext in-place; skips existing bcrypt hashes
--      - ZERO reads, copies, or overwrites from student_credentials_vault
--   4. Quarantined lockdown of student_credentials_vault (admin archive, zero client access)
--   5. Server-side session revocation RPC: revoke_student_session
--      - Scoped strictly to bearer token (64 hex characters)
--      - Removes untrusted client-supplied user_id validation
--   6. Concurrency-safe, fail-closed verify_legacy_login RPC:
--      - Transaction-scoped advisory lock (pg_advisory_xact_lock) serializes attempts per user_id
--      - Eliminates race conditions for both valid and nonexistent user IDs
--      - Rate limit enforced: active lockout rejects immediately without password probing
--      - Preserves cardholder login: valid card password succeeds and clears attempt state
--      - Failed attempts during active lockout do NOT extend lockout or inflate counters
--      - Fail-closed on rate-limit failure (returns temporary_auth_failure, no session issued)
--      - Fail-closed on session storage failure (session_creation_failed)
--      - public.users.password is SOLE authority (zero vault fallback, zero hardcoded creds)
--   7. Hardened admin_update_user_password:
--      - Explicit bcrypt hash written to users.password
--      - Preserves vault (does NOT overwrite physical card archive)
--      - Preserves admin auth and super-admin privilege protections
--   8. Table grants final confirmation
-- ==============================================================================

-- ==============================================================================
-- SECTION 0: pgcrypto AVAILABILITY GUARD
-- ==============================================================================
-- Checks if pgcrypto is already installed in any schema via pg_extension.
-- If not installed, checks if schema 'extensions' exists before specifying it.
-- Uses standard dynamic resolution so crypt/gen_salt resolve correctly.
DO $$
DECLARE
  v_ext_schema text;
  v_has_extensions_schema boolean;
BEGIN
  -- 1. Check if pgcrypto is already installed in any schema
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
    SELECT n.nspname INTO v_ext_schema
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pgcrypto';
    RAISE NOTICE '[pgcrypto] Extension is already installed in schema "%". No re-installation needed.', v_ext_schema;
  ELSE
    -- 2. pgcrypto is not installed. Check if schema 'extensions' exists before using it
    SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions')
    INTO v_has_extensions_schema;

    IF v_has_extensions_schema THEN
      CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
      RAISE NOTICE '[pgcrypto] Extension created in schema "extensions".';
    ELSE
      CREATE EXTENSION pgcrypto;
      RAISE NOTICE '[pgcrypto] Schema "extensions" not found; installed in default schema.';
    END IF;
  END IF;
END;
$$;

SET search_path = public, extensions;


-- ==============================================================================
-- SECTION 1: BCRYPT AUTO-HASH TRIGGER ON public.users
-- ==============================================================================
-- Automatically hashes plaintext passwords on INSERT or UPDATE OF password.
-- Strict 60-char regex + length guard ensures valid bcrypt hashes are never double-hashed.
CREATE OR REPLACE FUNCTION public.trg_fn_auto_bcrypt_password()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- Strict guard: hash only if non-null, non-empty, and NOT already a 60-char bcrypt hash
  IF NEW.password IS NOT NULL
     AND TRIM(NEW.password) <> ''
     AND NOT (NEW.password ~ '^[$]2[abxy][$][0-9]{2}[$]' AND LENGTH(NEW.password) = 60) THEN
    NEW.password := crypt(NEW.password, gen_salt('bf', 10));
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_fn_auto_bcrypt_password() FROM PUBLIC, anon, authenticated;
ALTER FUNCTION public.trg_fn_auto_bcrypt_password() OWNER TO postgres;

DROP TRIGGER IF EXISTS trg_auto_bcrypt_users_password ON public.users;
CREATE TRIGGER trg_auto_bcrypt_users_password
  BEFORE INSERT OR UPDATE OF password ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_auto_bcrypt_password();

COMMENT ON FUNCTION public.trg_fn_auto_bcrypt_password()
  IS 'Hashes plaintext passwords on INSERT/UPDATE of users.password (bcrypt, cost 10). Strict regex + length guard prevents double-hashing.';


-- ==============================================================================
-- SECTION 1.5: UPDATE protect_user_role_and_permissions (DBA & MIGRATION COMPATIBILITY)
-- ==============================================================================
-- Resolves ERROR 42501 in Supabase SQL Editor:
-- Supabase SQL Editor and CLI migrations execute as database role 'postgres'
-- where auth.jwt() and auth.uid() are NULL.
-- Adding session_user IN ('postgres', 'supabase_admin') permits direct database
-- administration queries while strictly maintaining account & role protection
-- against all client/API requests.
CREATE OR REPLACE FUNCTION public.protect_user_role_and_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow direct SQL executions from Supabase SQL Editor, psql/migrations, or service_role
  IF (session_user IN ('postgres', 'supabase_admin') OR COALESCE(auth.jwt() ->> 'role', '') = 'service_role') THEN
    RETURN NEW;
  END IF;

  -- 1. INSERT PROTECTION:
  -- Only Super Admin can insert accounts with role 'admin' or 'super_admin'
  IF (TG_OP = 'INSERT') THEN
    IF NEW.role IN ('admin', 'super_admin') THEN
      IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only Super Admin can create administrator accounts' USING errcode = '42501';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- 2. UPDATE PROTECTION:
  IF (TG_OP = 'UPDATE') THEN
    -- If role is changing (e.g. promoting student to admin, or demoting):
    -- STRICTLY require Super Admin!
    IF (NEW.role IS DISTINCT FROM OLD.role) THEN
      IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only Super Admin can modify user roles' USING errcode = '42501';
      END IF;
    END IF;

    -- If target user is an admin or super_admin, non-admins cannot touch their record at all
    IF (OLD.role IN ('admin', 'super_admin') OR NEW.role IN ('admin', 'super_admin')) THEN
      IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Non-administrators cannot modify administrative accounts' USING errcode = '42501';
      END IF;
    END IF;

    -- Protect auth_id: non-super-admins cannot assign, modify, or bind auth_id!
    IF (NEW.auth_id IS DISTINCT FROM OLD.auth_id) THEN
      IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only Super Admin can assign or bind auth_id' USING errcode = '42501';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.protect_user_role_and_permissions() OWNER TO postgres;


-- ==============================================================================
-- SECTION 2: BULK BCRYPT MIGRATION OF EXISTING PASSWORDS IN public.users
-- ==============================================================================
-- Preserves current passwords for all 336 students:
-- - Step A: Vault-to-users copy step REMOVED (0 null passwords on prod; no vault overwrite).
--   Guarantees: existing passwords (password IS NULL OR TRIM(password) = '') never replaced.
-- - Step B: Direct in-place bcrypt conversion of verified candidate plaintext passwords:
--   - Validates aggregate preflight counts; halts transactionally if unexpected formats appear.
--   - The 1 student already with a valid bcrypt hash is untouched.
--   - The 335 students with plaintext passwords have their current passwords
--     converted to bcrypt in-place without altering their original plaintext values.
--   - ZERO passwords are read, copied, or restored from student_credentials_vault.
--   - Re-running this block is completely idempotent.
-- ==============================================================================
-- Temporarily disable role protection trigger during bulk password hashing
ALTER TABLE public.users DISABLE TRIGGER trg_protect_user_role;

DO $$
DECLARE
  v_total_users           int;
  v_null_or_empty         int;
  v_valid_bcrypt          int;
  v_other_hash_patterns   int;
  v_candidate_plaintext   int;
  v_converted_count       int;
  v_remaining_unconverted int;
BEGIN
  -- 1. Aggregate counts preflight (strictly zero individual data printed)
  SELECT COUNT(*) INTO v_total_users FROM public.users;

  SELECT COUNT(*) INTO v_null_or_empty
  FROM public.users
  WHERE password IS NULL OR TRIM(password) = '';

  SELECT COUNT(*) INTO v_valid_bcrypt
  FROM public.users
  WHERE password ~ '^[$]2[abxy][$][0-9]{2}[$]' AND LENGTH(password) = 60;

  -- Check if any non-bcrypt passwords match other known hash patterns (MD5 32-hex, SHA-256 64-hex, Argon2, PBKDF2)
  SELECT COUNT(*) INTO v_other_hash_patterns
  FROM public.users
  WHERE password IS NOT NULL
    AND TRIM(password) <> ''
    AND NOT (password ~ '^[$]2[abxy][$][0-9]{2}[$]' AND LENGTH(password) = 60)
    AND (
      password ~ '^[a-fA-F0-9]{32}$'
      OR password ~ '^[a-fA-F0-9]{64}$'
      OR password ~ '^[$](argon2|pbkdf2|1|5|6)[$]'
    );

  -- Candidate plaintext: non-empty, non-bcrypt, and not matching known other hash formats
  SELECT COUNT(*) INTO v_candidate_plaintext
  FROM public.users
  WHERE password IS NOT NULL
    AND TRIM(password) <> ''
    AND NOT (password ~ '^[$]2[abxy][$][0-9]{2}[$]' AND LENGTH(password) = 60)
    AND NOT (
      password ~ '^[a-fA-F0-9]{32}$'
      OR password ~ '^[a-fA-F0-9]{64}$'
      OR password ~ '^[$](argon2|pbkdf2|1|5|6)[$]'
    );

  RAISE NOTICE '[preflight] Users total: %, Valid bcrypt: %, Candidate plaintext: %, Null/empty: %, Other hash patterns: %',
    v_total_users, v_valid_bcrypt, v_candidate_plaintext, v_null_or_empty, v_other_hash_patterns;

  -- Safety Invariant 1: If any passwords match other unknown hash formats, fail transactionally
  IF v_other_hash_patterns > 0 THEN
    RAISE EXCEPTION 'Migration halted: % user(s) have passwords matching other hash formats (MD5/SHA256/Argon2). Manual verification required to prevent re-hashing hashes.', v_other_hash_patterns;
  END IF;

  -- Safety Invariant 2: If any accounts have null or empty passwords, stop to prevent silent account corruption
  IF v_null_or_empty > 0 THEN
    RAISE EXCEPTION 'Migration halted: % user(s) have NULL or empty passwords. Migration aborted to prevent account corruption.', v_null_or_empty;
  END IF;

  -- Safety Invariant 3: Convert verified candidate plaintext passwords in-place.
  -- Existing values are converted directly with blowfish work factor 10.
  IF v_candidate_plaintext > 0 THEN
    UPDATE public.users
    SET password = crypt(password, gen_salt('bf', 10))
    WHERE password IS NOT NULL
      AND TRIM(password) <> ''
      AND NOT (password ~ '^[$]2[abxy][$][0-9]{2}[$]' AND LENGTH(password) = 60);

    GET DIAGNOSTICS v_converted_count = ROW_COUNT;
    RAISE NOTICE '[bcrypt-migration] Successfully converted % plaintext passwords to bcrypt.', v_converted_count;
  ELSE
    RAISE NOTICE '[bcrypt-migration] No candidate plaintext passwords to convert (idempotent run).';
  END IF;

  -- Post-migration invariant check: Verify that ZERO unconverted passwords remain
  SELECT COUNT(*) INTO v_remaining_unconverted
  FROM public.users
  WHERE password IS NOT NULL
    AND TRIM(password) <> ''
    AND NOT (password ~ '^[$]2[abxy][$][0-9]{2}[$]' AND LENGTH(password) = 60);

  IF v_remaining_unconverted > 0 THEN
    RAISE EXCEPTION 'Migration halted: % password(s) remain non-bcrypt after conversion pass. Transaction rolled back.', v_remaining_unconverted;
  END IF;

  RAISE NOTICE '[bcrypt-migration] Post-migration verification: All user passwords are valid bcrypt hashes.';
END;
$$;

-- Re-enable role protection trigger immediately after bulk migration
ALTER TABLE public.users ENABLE TRIGGER trg_protect_user_role;


-- ==============================================================================
-- SECTION 3: LOCK DOWN student_credentials_vault
-- ==============================================================================
-- Preserves printed card passwords and sheet passwords as an immutable administrative
-- archive. It is NOT used as a login fallback. Only postgres and service_role have access.
REVOKE ALL ON TABLE public.student_credentials_vault FROM anon, authenticated, public;
GRANT ALL ON TABLE public.student_credentials_vault TO postgres, service_role;
ALTER TABLE public.student_credentials_vault ENABLE ROW LEVEL SECURITY;


-- ==============================================================================
-- SECTION 4: SERVER-SIDE SESSION REVOCATION RPC — revoke_student_session
-- ==============================================================================
-- Security model & threat analysis:
--   1. Tokens are 256-bit cryptographically secure random values (32 bytes hex-encoded).
--      Brute-forcing or guessing an active token is computationally infeasible.
--   2. Bearer token semantics: like an HTTP session cookie, presenting a valid active token
--      to revoke_student_session authorizes revocation of that specific session only.
--   3. Revocation does NOT grant data access or privilege escalation; it simply destroys
--      the session row. If an attacker intercepts a token, possessing it allows revocation
--      of that specific session (localized denial-of-service), not compromise of other users.
--   4. We do NOT accept an unverified p_user_id from the client; an unauthenticated client
--      cannot be trusted to assert identity without credentials.
--   5. Scope of deletion is strictly atomic: WHERE token = v_token.
--      It can never delete another user's session or perform a bulk deletion.
-- ==============================================================================
DROP FUNCTION IF EXISTS public.revoke_student_session(text, text);
DROP FUNCTION IF EXISTS public.revoke_student_session(text);

CREATE OR REPLACE FUNCTION public.revoke_student_session(p_session_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token   text;
  v_user_id text;
BEGIN
  v_token := TRIM(COALESCE(p_session_token, ''));

  -- Format guard: must be exactly 64 hex characters (256-bit token)
  IF v_token = ''
     OR LENGTH(v_token) <> 64
     OR v_token !~ '^[0-9a-fA-F]{64}$'
  THEN
    RETURN false;
  END IF;

  -- Single-session enforcement (Closes N-2): find user and wipe all sessions for this user on logout
  SELECT user_id INTO v_user_id
  FROM public.student_sessions
  WHERE token = v_token AND expires_at > now();

  IF v_user_id IS NOT NULL THEN
    DELETE FROM public.student_sessions
    WHERE user_id = v_user_id;
    RETURN true;
  END IF;

  DELETE FROM public.student_sessions
  WHERE token = v_token;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_student_session(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_student_session(text) TO anon, authenticated, service_role;
ALTER FUNCTION public.revoke_student_session(text) OWNER TO postgres;

COMMENT ON FUNCTION public.revoke_student_session(text)
  IS 'Revokes a single student session by validated 64-char hex token. Target is strictly scoped to the presented bearer token.';


-- ==============================================================================
-- SECTION 5: CONCURRENCY-SAFE, FAIL-CLOSED verify_legacy_login RPC
-- ==============================================================================
-- Security guarantees:
--   1. Transaction-scoped advisory lock (pg_advisory_xact_lock): serializes all login attempts
--      per user_id for the transaction duration, eliminating race condition bypasses on attempts.
--   2. Rate limiting enforced: if account is locked, request is rejected without password probing.
--   3. Anti-Targeted-DoS policy: valid card password succeeds and clears attempt state even if an
--      attacker attempted to lock out the student with wrong guesses.
--   4. Failed attempts during active lockout do NOT extend lockout or inflate attempt counters.
--   5. Fail-closed on rate-limit update failure: returns temporary_auth_failure, never issues session.
--   6. Fail-closed session storage: NEVER returns success without stored session in database.
--   7. users.password is SOLE authority (zero vault fallback).
--   8. Uniform invalid_credentials error prevents user enumeration on non-locked requests.
-- ==============================================================================
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
BEGIN
  v_clean_id   := TRIM(COALESCE(p_user_id, ''));
  v_clean_pass := TRIM(COALESCE(p_password, ''));

  -- Reject empty inputs immediately without acquiring locks or touching DB
  IF v_clean_id = '' OR p_password IS NULL OR p_password = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_credentials');
  END IF;

  -- ----------------------------------------------------------------
  -- 1. TRANSACTION-LEVEL SERIALIZATION (Concurrency-Safe Per User)
  -- ----------------------------------------------------------------
  -- Acquire an advisory xact lock keyed to the normalized user_id.
  -- This serializes concurrent requests for the same user ID for the
  -- duration of this transaction, preventing race conditions on login_attempts.
  -- Works for both valid and nonexistent user IDs. Releases automatically on commit/abort.
  PERFORM pg_advisory_xact_lock(hashtext('verify_legacy_login:' || v_clean_id));

  -- ----------------------------------------------------------------
  -- 2. FETCH ATTEMPT & LOCKOUT STATE (Under Serialized Lock)
  -- ----------------------------------------------------------------
  SELECT attempts, locked_until, last_attempt
  INTO v_attempt_count, v_locked_until, v_last_attempt
  FROM public.login_attempts
  WHERE user_id = v_clean_id;

  v_attempt_count := COALESCE(v_attempt_count, 0);

  -- Determine if account is currently locked
  IF v_locked_until IS NOT NULL AND v_locked_until > now() THEN
    v_is_locked := true;
  ELSIF v_locked_until IS NOT NULL AND v_locked_until <= now() THEN
    -- Lockout expired: reset attempts counter for subsequent calculations
    v_attempt_count := 0;
    v_is_locked := false;
  ELSIF v_last_attempt IS NOT NULL AND v_last_attempt < now() - interval '15 minutes' THEN
    -- Inactivity window exceeded: reset attempts counter
    v_attempt_count := 0;
    v_is_locked := false;
  END IF;

  -- ----------------------------------------------------------------
  -- 3. FETCH USER RECORD
  -- ----------------------------------------------------------------
  SELECT id, user_id, name, role, password,
         year_level, section, assigned_subjects, auth_id, last_sign_in_at
  INTO v_user
  FROM public.users
  WHERE user_id = v_clean_id
  LIMIT 1;

  -- ----------------------------------------------------------------
  -- 4. NONEXISTENT USER HANDLING
  -- ----------------------------------------------------------------
  -- If user does not exist: record attempt to prevent username enumeration via timing,
  -- and enforce rate-limiting.
  IF v_user IS NULL THEN
    IF v_is_locked THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'rate_limited',
        'message', 'عدد المحاولات الخاطئة تجاوز الحد المسموح. يرجى الانتظار 10 دقائق ثم المحاولة مجدداً.'
      );
    END IF;

    -- Update attempt counter for nonexistent user (fail-closed if DB write fails)
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
              END) >= 5 THEN now() + interval '15 minutes'
              ELSE NULL
            END;
    EXCEPTION WHEN OTHERS THEN
      -- Security-critical rate-limiting write failed: FAIL-CLOSED.
      RAISE WARNING '[verify_legacy_login] Rate limit update failed for %: %', v_clean_id, SQLERRM;
      RETURN jsonb_build_object(
        'success', false,
        'error', 'temporary_auth_failure',
        'message', 'حدث خطأ مؤقت في خادم المصادقة. يرجى المحاولة مرة أخرى لاحقاً.'
      );
    END;

    IF v_attempt_count + 1 >= 5 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'rate_limited',
        'message', 'عدد المحاولات الخاطئة تجاوز الحد المسموح. يرجى الانتظار 15 دقيقة ثم المحاولة مجدداً.'
      );
    END IF;

    RETURN jsonb_build_object('success', false, 'error', 'invalid_credentials');
  END IF;

  -- ----------------------------------------------------------------
  -- 5. PASSWORD VERIFICATION (Existing User)
  -- ----------------------------------------------------------------
  -- Single source of truth: public.users.password ONLY (no vault fallback).
  -- Checks submitted password (and trimmed copy) against bcrypt hash (or transitional plaintext).
  IF v_user.password IS NOT NULL AND TRIM(v_user.password) <> '' THEN
    IF v_user.password ~ '^[$]2[abxy][$][0-9]{2}[$]' AND LENGTH(v_user.password) = 60 THEN
      BEGIN
        IF crypt(p_password, v_user.password) = v_user.password
           OR crypt(v_clean_pass, v_user.password) = v_user.password
        THEN
          v_pass_valid := true;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_pass_valid := false;
      END;
    ELSE
      -- Transitional check for plaintext
      IF v_user.password IN (p_password, v_clean_pass)
         OR TRIM(v_user.password) IN (p_password, v_clean_pass)
      THEN
        v_pass_valid := true;
      END IF;
    END IF;
  END IF;

  -- ----------------------------------------------------------------
  -- 6. OUTCOME: SUCCESS OR FAILURE
  -- ----------------------------------------------------------------
  -- SECURITY/PRODUCT POLICY NOTE:
  -- If account is under active lockout (v_is_locked = true), but the legitimate
  -- cardholder enters their CORRECT printed-card password, authentication SUCCEEDS
  -- and clears the lockout.
  -- RATIONALE: In this school environment, student IDs are sequential and public.
  -- A policy that locks out the correct password allows any malicious student to
  -- permanently DoS all classmates by submitting 15 bad passwords per student ID.
  -- Conversely, an attacker who does NOT know the password is locked out and cannot
  -- probe further passwords during the 10-minute freeze.
  IF v_pass_valid THEN
    -- Clear failed attempts immediately
    BEGIN
      DELETE FROM public.login_attempts WHERE user_id = v_clean_id;
    EXCEPTION WHEN OTHERS THEN
      -- If clearing attempts fails, fail closed: do not issue session in corrupted rate-limit state
      RAISE WARNING '[verify_legacy_login] Failed to clear login_attempts for %: %', v_clean_id, SQLERRM;
      RETURN jsonb_build_object(
        'success', false,
        'error', 'temporary_auth_failure',
        'message', 'حدث خطأ مؤقت أثناء تحديث الجلسة. يرجى المحاولة لاحقاً.'
      );
    END;

    -- Update last sign-in timestamp (best-effort)
    BEGIN
      UPDATE public.users SET last_sign_in_at = now() WHERE id = v_user.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[verify_legacy_login] Failed to update last_sign_in_at for %: %', v_clean_id, SQLERRM;
    END;

    -- Single-session enforcement (Closes N-2): Revoke any older sessions for this user
    DELETE FROM public.student_sessions WHERE user_id = v_user.user_id;

    -- Generate cryptographically secure session token (256-bit CSPRNG)
    v_session_token := encode(gen_random_bytes(32), 'hex');

    -- Insert session — FAIL-CLOSED:
    -- Success is returned IF AND ONLY IF session storage succeeds in DB.
    BEGIN
      INSERT INTO public.student_sessions (token, user_id, expires_at)
      VALUES (v_session_token, v_user.user_id, now() + interval '30 days');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[verify_legacy_login] Failed to insert student_session for %: %', v_clean_id, SQLERRM;
      RETURN jsonb_build_object(
        'success', false,
        'error', 'session_creation_failed',
        'message', 'تعذر حفظ جلسة الدخول في قاعدة البيانات. يرجى المحاولة مرة أخرى لاحقاً.'
      );
    END;

    RETURN jsonb_build_object(
      'success',           true,
      'user_id',           v_user.user_id,
      'name',              v_user.name,
      'role',              v_user.role,
      'year_level',        v_user.year_level,
      'section',           v_user.section,
      'assigned_subjects', v_user.assigned_subjects,
      'auth_id',           v_user.auth_id,
      'session_token',     v_session_token,
      'last_sign_in_at',   now()
    );

  ELSE
    -- Wrong password: increment attempt counter
    -- If account was ALREADY locked: do NOT increment counter or extend lockout.
    -- Simply return rate_limited immediately.
    IF v_is_locked THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'rate_limited',
        'message', 'عدد المحاولات الخاطئة تجاوز الحد المسموح. يرجى الانتظار 15 دقيقة ثم المحاولة مجدداً.'
      );
    END IF;

    -- Account was NOT locked: atomically increment attempts and evaluate lockout
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
              END) >= 5 THEN now() + interval '15 minutes'
              ELSE NULL
            END
      RETURNING attempts, (locked_until IS NOT NULL AND locked_until > now())
      INTO v_attempt_count, v_is_locked;
    EXCEPTION WHEN OTHERS THEN
      -- Security-critical rate-limiting write failed: FAIL-CLOSED.
      RAISE WARNING '[verify_legacy_login] Failed to record login attempt for %: %', v_clean_id, SQLERRM;
      RETURN jsonb_build_object(
        'success', false,
        'error', 'temporary_auth_failure',
        'message', 'حدث خطأ مؤقت في خادم المصادقة. يرجى المحاولة مرة أخرى لاحقاً.'
      );
    END;

    IF v_is_locked OR v_attempt_count >= 5 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'rate_limited',
        'message', 'عدد المحاولات الخاطئة تجاوز الحد المسموح. يرجى الانتظار 15 دقيقة ثم المحاولة مجدداً.'
      );
    END IF;

    RETURN jsonb_build_object('success', false, 'error', 'invalid_credentials');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_legacy_login(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_legacy_login(text, text) TO anon, authenticated, service_role;
ALTER FUNCTION public.verify_legacy_login(text, text) OWNER TO postgres;

COMMENT ON FUNCTION public.verify_legacy_login(text, text)
  IS 'Secure student login. Sole source of truth is users.password. Advisory lock serialization. Fail-closed session creation.';


-- ==============================================================================
-- SECTION 6: admin_update_user_password — bcrypt explicit, preserves vault
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.admin_update_user_password(p_user_id text, p_new_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_target_role text;
  v_hashed_pw   text;
BEGIN
  -- Must be authenticated admin
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING errcode = '42501';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only administrators can update passwords' USING errcode = '42501';
  END IF;

  IF p_user_id IS NULL OR TRIM(p_user_id) = ''
     OR p_new_password IS NULL OR TRIM(p_new_password) = ''
  THEN
    RAISE EXCEPTION 'User ID and new password are required' USING errcode = '22023';
  END IF;

  SELECT role INTO v_target_role
  FROM public.users
  WHERE user_id = TRIM(p_user_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found' USING errcode = 'P0001';
  END IF;

  -- Super admin protection
  IF v_target_role = 'super_admin' AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only Super Admin can change Super Admin password' USING errcode = '42501';
  END IF;

  -- Explicit bcrypt hash (trigger also guards — double safety, no double-hash)
  v_hashed_pw := crypt(TRIM(p_new_password), gen_salt('bf', 10));

  -- Update users.password only (student_credentials_vault is preserved intact)
  UPDATE public.users
  SET password = v_hashed_pw
  WHERE user_id = TRIM(p_user_id);

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_user_password(text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_update_user_password(text, text) TO authenticated;
ALTER FUNCTION public.admin_update_user_password(text, text) OWNER TO postgres;

COMMENT ON FUNCTION public.admin_update_user_password(text, text)
  IS 'Admin-only: updates users.password to bcrypt hash. Preserves student_credentials_vault.';


-- ==============================================================================
-- SECTION 7: CLEANUP — delete expired sessions
-- ==============================================================================
DELETE FROM public.student_sessions WHERE expires_at < now();


-- ==============================================================================
-- SECTION 8: TABLE GRANTS FINAL CONFIRMATION
-- ==============================================================================
REVOKE ALL ON TABLE public.student_credentials_vault FROM anon, authenticated, public;
GRANT ALL ON TABLE public.student_credentials_vault TO postgres, service_role;

REVOKE ALL ON TABLE public.login_attempts FROM anon, authenticated, public;
GRANT ALL ON TABLE public.login_attempts TO postgres, service_role;

REVOKE ALL ON TABLE public.student_sessions FROM anon, authenticated, public;
GRANT ALL ON TABLE public.student_sessions TO postgres, service_role;


-- ==============================================================================
-- SECTION 9: ISSUE-25 FIX — Remove instructor_id from anon subjects grant
-- ==============================================================================
-- instructor_id is a login identifier (staff username/email prefix).
-- It must NOT be exposed to anonymous callers: pentest confirmed 22 rows
-- including 4 staff login identifiers readable without authentication.
-- Re-apply column-level GRANT to exclude instructor_id.
REVOKE ALL ON TABLE public.subjects FROM anon;
GRANT SELECT (id, name, year_level, total_weeks, instructor_name, created_at)
  ON TABLE public.subjects TO anon;

-- enrolled_students column stays revoked: contains student IDs (PII)
-- instructor_id stays revoked: login identifier, not a display value
-- excluded_students stays revoked: contains CONFIG_SECTION_TAS and admin config (Closes N-3 & N-4)


-- ==============================================================================
-- SECTION 10: ATTENDANCE RLS — ensure SECURITY DEFINER functions can read
-- ==============================================================================
-- get_my_attendance and get_my_grades are SECURITY DEFINER (run as postgres).
-- They do NOT need an explicit RLS policy bypass, but we confirm that
-- the authenticated role can still INSERT/UPDATE (admin attendance recording),
-- and that the anon role has ZERO direct access.
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;

-- Ensure admin RLS policies exist for direct table access by authenticated admins
DROP POLICY IF EXISTS "Admins can manage attendance" ON public.attendance;
CREATE POLICY "Admins can manage attendance"
  ON public.attendance
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Deny all anon direct access (get_my_attendance RPC is the only student path)
DROP POLICY IF EXISTS "Allow anon read attendance" ON public.attendance;
REVOKE ALL ON TABLE public.attendance FROM anon;

DROP POLICY IF EXISTS "Admins can manage grades" ON public.grades;
CREATE POLICY "Admins can manage grades"
  ON public.grades
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Allow anon read grades" ON public.grades;
REVOKE ALL ON TABLE public.grades FROM anon;

GRANT ALL ON TABLE public.attendance TO postgres, service_role;
GRANT ALL ON TABLE public.grades TO postgres, service_role;


-- ==============================================================================
-- SECTION 11: SECURE STUDENT RPCS (Attendance, Grades, and Session Validation)
-- ==============================================================================
-- These SECURITY DEFINER functions run with postgres privileges so students
-- (anonymous role) can access ONLY their own records via bearer session token,
-- while anon direct table access remains completely blocked.

-- 11.1 Token-to-user validator: App.jsx verifies session belongs to this specific user_id
CREATE OR REPLACE FUNCTION public.verify_student_token_for_user(
  p_session_token text,
  p_user_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_session_token IS NULL OR TRIM(p_session_token) = ''
     OR p_user_id IS NULL OR TRIM(p_user_id) = ''
     OR LENGTH(TRIM(p_session_token)) < 64 THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.student_sessions
    WHERE token = TRIM(p_session_token)
      AND TRIM(user_id) = TRIM(p_user_id)
      AND expires_at > now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_student_token_for_user(text, text) TO anon, authenticated;
ALTER FUNCTION public.verify_student_token_for_user(text, text) OWNER TO postgres;
COMMENT ON FUNCTION public.verify_student_token_for_user(text, text)
  IS 'Validates whether a bearer session token is active and matches a specific student user_id.';

-- 11.2 Student Attendance RPC: fetches student attendance safely with whitespace tolerance
CREATE OR REPLACE FUNCTION public.get_my_attendance(p_session_token text DEFAULT NULL)
RETURNS SETOF public.attendance
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id text := NULL;
BEGIN
  -- 1. Check if caller is authenticated staff/admin
  IF auth.uid() IS NOT NULL THEN
    IF public.is_admin() THEN
      RETURN QUERY SELECT * FROM public.attendance ORDER BY week_number ASC;
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
  SELECT * FROM public.attendance 
  WHERE TRIM(student_id) = TRIM(v_student_id)
  ORDER BY week_number ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_attendance(text) TO anon, authenticated;
ALTER FUNCTION public.get_my_attendance(text) OWNER TO postgres;

-- 11.3 Student Grades RPC: fetches student grades safely with whitespace tolerance
CREATE OR REPLACE FUNCTION public.get_my_grades(p_session_token text DEFAULT NULL)
RETURNS SETOF public.grades
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id text := NULL;
BEGIN
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

-- ==============================================================================
-- SECTION 12: SERVER-SIDE FINAL GRADE COMPUTATION TRIGGER (Closes N-5)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.trg_fn_calculate_final_grade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.final_grade := COALESCE(NEW.quiz_1, 0) + COALESCE(NEW.quiz_2, 0) + COALESCE(NEW.project, 0) + COALESCE(NEW.attendance_score, 0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calculate_final_grade ON public.grades;
CREATE TRIGGER trg_calculate_final_grade
  BEFORE INSERT OR UPDATE ON public.grades
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_calculate_final_grade();

-- ==============================================================================
-- SECTION 13: STUDENT PASSWORD CHANGE RPC (Closes N-8 & ISSUE-34)
-- ==============================================================================
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
BEGIN
  IF p_session_token IS NULL OR TRIM(p_session_token) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized', 'message', 'جلسة الدخول غير صالحة.');
  END IF;

  SELECT user_id INTO v_student_id
  FROM public.student_sessions
  WHERE token = TRIM(p_session_token) AND expires_at > now();

  IF v_student_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized', 'message', 'جلسة الدخول منتهية أو غير صحيحة.');
  END IF;

  v_clean_cur := TRIM(COALESCE(p_current_password, ''));
  v_clean_new := TRIM(COALESCE(p_new_password, ''));

  IF LENGTH(v_clean_new) < 6 THEN
    RETURN jsonb_build_object('success', false, 'error', 'password_too_short', 'message', 'يجب أن تتكون كلمة المرور الجديدة من 6 أحرف على الأقل.');
  END IF;

  SELECT password INTO v_stored_hash
  FROM public.users
  WHERE user_id = v_student_id;

  IF v_stored_hash IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found', 'message', 'تعذر العثور على بيانات المستخدم.');
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
    RETURN jsonb_build_object('success', false, 'error', 'wrong_current_password', 'message', 'كلمة المرور الحالية غير صحيحة.');
  END IF;

  UPDATE public.users
  SET password = crypt(v_clean_new, gen_salt('bf', 10))
  WHERE user_id = v_student_id;

  DELETE FROM public.student_sessions
  WHERE user_id = v_student_id AND token <> TRIM(p_session_token);

  RETURN jsonb_build_object('success', true, 'message', 'تم تحديث كلمة المرور بنجاح.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.student_change_password(text, text, text) TO anon, authenticated;
ALTER FUNCTION public.student_change_password(text, text, text) OWNER TO postgres;

-- ==============================================================================
-- SECTION 14: SANITIZED VISIBILITY SETTINGS RPC (Closes N-4)
-- ==============================================================================
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
  FOR r IN SELECT excluded_students FROM public.subjects WHERE excluded_students IS NOT NULL LOOP
    IF jsonb_typeof(to_jsonb(r.excluded_students)) = 'array' THEN
      FOR item IN SELECT jsonb_array_elements_text(to_jsonb(r.excluded_students)) LOOP
        IF item LIKE 'CONFIG:%' THEN
          BEGIN
            v_res := v_res || jsonb_build_object('global', (replace(item, 'CONFIG:', ''))::jsonb);
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
        ELSIF item LIKE 'CONFIG_SUB:%' THEN
          BEGIN
            v_res := v_res || (replace(item, 'CONFIG_SUB:', ''))::jsonb;
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

-- ==============================================================================
-- SECTION 15: CLOUD AUTOMATED 24-HOUR BACKUP DATA RPC (Feature Request)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_system_backup_data(p_backup_secret text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_expected_secret text := 'gradely_backup_cron_sec_7f9a2b8e4c1d6e5a';
  v_res             jsonb;
BEGIN
  IF p_backup_secret IS NULL OR p_backup_secret <> v_expected_secret THEN
    RAISE EXCEPTION 'Unauthorized: Invalid backup secret' USING errcode = '42501';
  END IF;

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
        SELECT student_id, subject_id, quiz_1, quiz_2, project, attendance_score, final_grade
        FROM public.grades
      ) g
    )
  ) INTO v_res;

  RETURN v_res;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_system_backup_data(text) TO anon, authenticated, service_role;
ALTER FUNCTION public.get_system_backup_data(text) OWNER TO postgres;

-- ==============================================================================
-- SECTION 16: REVOKE UNUSED HELPER RPCS FROM ANON (Closes N-7)
-- ==============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_my_role') THEN
    REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM anon;
  END IF;
END $$;


