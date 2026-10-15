import json

with open('extracted_pdf_creds.json', 'r', encoding='utf-8') as f:
    pdf_data = json.load(f)

# Read excel sheet tuples
excel_map = {}
with open('frontend/student_tuples.sql', 'r', encoding='utf-8') as f:
    for line in f:
        line = line.strip().rstrip(';,')
        if line.startswith('('):
            parts = line[1:-1].split(',')
            if len(parts) == 2:
                u = parts[0].strip().replace("'", "")
                p = parts[1].strip().replace("'", "")
                excel_map[u] = p

vault_rows = []
for e in pdf_data:
    uid = e['user_id']
    pdf_pw = e['password'].replace("'", "''")
    excel_pw = excel_map.get(uid, '').replace("'", "''")
    vault_rows.append(f"  ('{uid}', '{pdf_pw}', '{excel_pw}')")

vault_values_sql = ",\n".join(vault_rows)

sql_content = f"""-- ==============================================================================
-- GRADELY BULLETPROOF CREDENTIALS SYNC FROM PRINTED PDF CARDS (335 STUDENTS)
-- Date: 2026-10-15
-- Features:
--   1. Direct import of the 335 passwords printed on the students' physical cards
--   2. Dual-support: accepts BOTH the printed PDF password AND the Excel password
--   3. Special support for student 2302968 (s97u*eDR and b7Y3T!j*)
--   4. Special support for student 2402313 (54qr#Vzx and 2&QmGr#Y)
--   5. Recreates verify_legacy_login (bulletproof, zero rate-limiting conflicts)
--   6. Auto-records last_sign_in_at on successful login
--   7. Zero modifications to Super Admin or TA Abdelrahman credentials!
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ADD last_sign_in_at COLUMN TO users
-- ------------------------------------------------------------------------------
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_sign_in_at timestamptz;


-- ------------------------------------------------------------------------------
-- 2. REBUILD login_attempts TABLE CLEANLY
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS public.login_attempts CASCADE;

CREATE TABLE public.login_attempts (
  user_id text PRIMARY KEY,
  attempts int DEFAULT 1,
  last_attempt timestamptz DEFAULT now(),
  locked_until timestamptz
);

GRANT ALL ON public.login_attempts TO postgres, service_role;
GRANT ALL ON public.login_attempts TO authenticated, anon;


-- ------------------------------------------------------------------------------
-- 3. STORE AND APPLY PRINTED PDF & EXCEL PASSWORDS IN CREDENTIALS VAULT
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_credentials_vault (
  user_id text PRIMARY KEY,
  pdf_password text NOT NULL,
  excel_password text,
  updated_at timestamptz DEFAULT now()
);

GRANT ALL ON public.student_credentials_vault TO postgres, service_role;
GRANT SELECT ON public.student_credentials_vault TO authenticated, anon;

INSERT INTO public.student_credentials_vault (user_id, pdf_password, excel_password)
VALUES
{vault_values_sql}
ON CONFLICT (user_id) DO UPDATE 
SET pdf_password = EXCLUDED.pdf_password,
    excel_password = EXCLUDED.excel_password,
    updated_at = now();

-- Update public.users with the exact printed PDF card passwords (strictly excluding admins)
UPDATE public.users u
SET password = v.pdf_password
FROM public.student_credentials_vault v
WHERE u.user_id = v.user_id 
  AND u.role NOT IN ('admin', 'super_admin');

-- Also ensure any student from the distributed cards that might be missing is inserted
INSERT INTO public.users (user_id, name, password, role)
SELECT v.user_id, 'طالب', v.pdf_password, 'student'
FROM public.student_credentials_vault v
WHERE v.user_id NOT IN (SELECT user_id FROM public.users)
ON CONFLICT (user_id) DO NOTHING;


-- ------------------------------------------------------------------------------
-- 4. CLEAN CORRUPTED AUTH ROWS (Fixes: 500 error on sign-in)
-- ------------------------------------------------------------------------------
DELETE FROM auth.identities 
WHERE user_id IN (
  SELECT id FROM auth.users 
  WHERE email LIKE '%@gradely.app'
    AND email NOT LIKE '%amahmoud%' 
    AND email NOT LIKE '%admin%'
);

DELETE FROM auth.users 
WHERE email LIKE '%@gradely.app'
  AND email NOT LIKE '%amahmoud%' 
  AND email NOT LIKE '%admin%' 
  AND id NOT IN (SELECT auth_id FROM public.users WHERE role IN ('admin', 'super_admin'));


-- ------------------------------------------------------------------------------
-- 5. RECREATE verify_legacy_login (BULLETPROOF WITH DUAL PASSWORD SUPPORT)
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.verify_legacy_login(text, text);

CREATE OR REPLACE FUNCTION public.verify_legacy_login(p_user_id text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user RECORD;
  v_clean_id text;
  v_clean_pass text;
  v_pass_valid boolean := false;
BEGIN
  v_clean_id := TRIM(COALESCE(p_user_id, ''));
  v_clean_pass := TRIM(COALESCE(p_password, ''));

  IF v_clean_id = '' OR v_clean_pass = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_credentials');
  END IF;

  -- 1. Rate limiting check
  IF EXISTS (
    SELECT 1 FROM public.login_attempts
    WHERE user_id = v_clean_id 
      AND locked_until IS NOT NULL 
      AND locked_until > now()
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'rate_limited',
      'message', 'تم تجاوز عدد محاولات الدخول الخاطئة المسموحة. يرجى الانتظار 15 دقيقة.'
    );
  END IF;

  -- 2. Fetch user record
  SELECT id, user_id, name, role, password, encrypted_password, year_level, section, assigned_subjects, auth_id, last_sign_in_at
  INTO v_user
  FROM public.users
  WHERE user_id = v_clean_id 
     OR (
       v_clean_id ILIKE '%20262027217%' AND user_id ILIKE '%20262027217%'
     )
  LIMIT 1;

  IF v_user IS NULL THEN
    BEGIN
      INSERT INTO public.login_attempts (user_id, attempts, last_attempt)
      VALUES (v_clean_id, 1, now())
      ON CONFLICT (user_id) DO UPDATE 
      SET attempts = public.login_attempts.attempts + 1,
          last_attempt = now(),
          locked_until = CASE WHEN public.login_attempts.attempts + 1 >= 10 THEN now() + interval '15 minutes' ELSE NULL END;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    RETURN jsonb_build_object('success', false, 'error', 'invalid_credentials');
  END IF;

  -- 3. Password matching:
  -- A. Match against users.password (which is now the printed PDF card password!)
  IF v_user.password IS NOT NULL AND (
     v_user.password = p_password 
     OR v_user.password = v_clean_pass
     OR TRIM(v_user.password) = v_clean_pass
  ) THEN
    v_pass_valid := true;
  END IF;

  -- B. Match against student_credentials_vault (covers both printed PDF and Excel passwords)
  IF NOT v_pass_valid THEN
    IF EXISTS (
      SELECT 1 FROM public.student_credentials_vault
      WHERE user_id = v_clean_id AND (
        pdf_password IN (p_password, v_clean_pass)
        OR excel_password IN (p_password, v_clean_pass)
      )
    ) THEN
      v_pass_valid := true;
    END IF;
  END IF;

  -- C. Special support for student 2302968 (s97u*eDR or b7Y3T!j*)
  IF NOT v_pass_valid AND v_user.user_id = '2302968' AND (
     p_password IN ('s97u*eDR', 'b7Y3T!j*') 
     OR v_clean_pass IN ('s97u*eDR', 'b7Y3T!j*')
  ) THEN
    v_pass_valid := true;
  END IF;

  -- D. Special support for student 2402313 (54qr#Vzx or 2&QmGr#Y)
  IF NOT v_pass_valid AND v_user.user_id = '2402313' AND (
     p_password IN ('54qr#Vzx', '2&QmGr#Y') 
     OR v_clean_pass IN ('54qr#Vzx', '2&QmGr#Y')
  ) THEN
    v_pass_valid := true;
  END IF;

  -- E. Match encrypted bcrypt hash if present (in case student changed password)
  IF NOT v_pass_valid AND v_user.encrypted_password IS NOT NULL THEN
    BEGIN
      IF extensions.crypt(p_password, v_user.encrypted_password) = v_user.encrypted_password
         OR extensions.crypt(v_clean_pass, v_user.encrypted_password) = v_user.encrypted_password THEN
        v_pass_valid := true;
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  -- 4. Result evaluation
  IF v_pass_valid THEN
    -- Clear failed attempts
    BEGIN
      DELETE FROM public.login_attempts WHERE user_id = v_clean_id;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- Record last sign in timestamp
    BEGIN
      UPDATE public.users 
      SET last_sign_in_at = now() 
      WHERE id = v_user.id;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    RETURN jsonb_build_object(
      'success', true,
      'user_id', v_user.user_id,
      'name', v_user.name,
      'role', v_user.role,
      'year_level', v_user.year_level,
      'section', v_user.section,
      'assigned_subjects', v_user.assigned_subjects,
      'auth_id', v_user.auth_id,
      'last_sign_in_at', now()
    );
  ELSE
    BEGIN
      INSERT INTO public.login_attempts (user_id, attempts, last_attempt)
      VALUES (v_clean_id, 1, now())
      ON CONFLICT (user_id) DO UPDATE 
      SET attempts = public.login_attempts.attempts + 1,
          last_attempt = now(),
          locked_until = CASE WHEN public.login_attempts.attempts + 1 >= 10 THEN now() + interval '15 minutes' ELSE NULL END;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    RETURN jsonb_build_object('success', false, 'error', 'invalid_credentials');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_legacy_login(text, text) TO anon, authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 6. GRANT FULL PERMISSIONS FOR STUDENT DASHBOARD
-- ------------------------------------------------------------------------------
GRANT SELECT ON public.subjects TO anon, authenticated;
GRANT SELECT ON public.attendance TO anon, authenticated;
GRANT SELECT ON public.grades TO anon, authenticated;
GRANT SELECT (id, user_id, name, role, year_level, section, assigned_subjects, last_sign_in_at, auth_id, created_at) ON public.users TO anon, authenticated;

DROP POLICY IF EXISTS "Allow anon read subjects" ON public.subjects;
CREATE POLICY "Allow anon read subjects" ON public.subjects FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Allow anon read attendance" ON public.attendance;
CREATE POLICY "Allow anon read attendance" ON public.attendance FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Allow anon read grades" ON public.grades;
CREATE POLICY "Allow anon read grades" ON public.grades FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Allow anon read admin directory" ON public.users;
CREATE POLICY "Allow anon read admin directory" ON public.users FOR SELECT TO anon USING (role IN ('admin', 'super_admin'));


-- ------------------------------------------------------------------------------
-- 7. AUDIT LOGS PERMANENT SANITIZATION (ZERO PASSWORD LEAKAGE)
-- ------------------------------------------------------------------------------
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO postgres, service_role;

UPDATE public.audit_logs
SET old_data = old_data - 'password' - 'encrypted_password' - 'raw_user_meta_data' - 'token',
    new_data = new_data - 'password' - 'encrypted_password' - 'raw_user_meta_data' - 'token'
WHERE old_data ? 'password' OR new_data ? 'password' 
   OR old_data ? 'encrypted_password' OR new_data ? 'encrypted_password';

CREATE OR REPLACE FUNCTION public.process_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_auth_id uuid;
  v_actor_user_id text;
  v_rec_id text;
  v_old_data jsonb;
  v_new_data jsonb;
BEGIN
  v_actor_auth_id := auth.uid();
  
  IF v_actor_auth_id IS NOT NULL THEN
    SELECT user_id INTO v_actor_user_id FROM public.users WHERE auth_id = v_actor_auth_id LIMIT 1;
  END IF;

  IF (TG_TABLE_NAME = 'users') THEN
    IF (TG_OP IN ('UPDATE', 'DELETE')) THEN
      v_old_data := to_jsonb(OLD) - 'password' - 'encrypted_password' - 'raw_user_meta_data' - 'token';
    END IF;
    IF (TG_OP IN ('UPDATE', 'INSERT')) THEN
      v_new_data := to_jsonb(NEW) - 'password' - 'encrypted_password' - 'raw_user_meta_data' - 'token';
    END IF;
  ELSE
    IF (TG_OP IN ('UPDATE', 'DELETE')) THEN
      v_old_data := to_jsonb(OLD);
    END IF;
    IF (TG_OP IN ('UPDATE', 'INSERT')) THEN
      v_new_data := to_jsonb(NEW);
    END IF;
  END IF;

  IF (TG_OP = 'DELETE') THEN
    v_rec_id := COALESCE(OLD.id::text, '');
    INSERT INTO public.audit_logs (actor_auth_id, actor_user_id, action, table_name, record_id, old_data)
    VALUES (v_actor_auth_id, v_actor_user_id, 'DELETE', TG_TABLE_NAME, v_rec_id, v_old_data);
    RETURN OLD;
  ELSIF (TG_OP = 'UPDATE') THEN
    v_rec_id := COALESCE(NEW.id::text, '');
    INSERT INTO public.audit_logs (actor_auth_id, actor_user_id, action, table_name, record_id, old_data, new_data)
    VALUES (v_actor_auth_id, v_actor_user_id, 'UPDATE', TG_TABLE_NAME, v_rec_id, v_old_data, v_new_data);
    RETURN NEW;
  ELSIF (TG_OP = 'INSERT') THEN
    v_rec_id := COALESCE(NEW.id::text, '');
    INSERT INTO public.audit_logs (actor_auth_id, actor_user_id, action, table_name, record_id, new_data)
    VALUES (v_actor_auth_id, v_actor_user_id, 'INSERT', TG_TABLE_NAME, v_rec_id, v_new_data);
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;


-- ------------------------------------------------------------------------------
-- 8. SECURITY SETTINGS & 2FA BACKEND (GOOGLE AUTHENTICATOR / BACKUP PIN)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.security_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.security_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.security_settings FROM anon, authenticated, public;
GRANT ALL ON public.security_settings TO postgres, service_role;

INSERT INTO public.security_settings (key, value)
VALUES 
  ('admin_totp_secret', 'JBSWY3DPEHPK3PXP'),
  ('admin_promotion_pin', '2026217')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.verify_super_admin_2fa(p_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stored_pin text;
BEGIN
  IF p_code IS NULL OR TRIM(p_code) = '' THEN
    RETURN false;
  END IF;

  SELECT value INTO v_stored_pin FROM public.security_settings WHERE key = 'admin_promotion_pin';
  IF v_stored_pin IS NOT NULL AND v_stored_pin = TRIM(p_code) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_super_admin_2fa(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_super_admin_2fa_config()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
  v_pin text;
BEGIN
  SELECT value INTO v_secret FROM public.security_settings WHERE key = 'admin_totp_secret';
  SELECT value INTO v_pin FROM public.security_settings WHERE key = 'admin_promotion_pin';

  RETURN jsonb_build_object(
    'totp_secret', COALESCE(v_secret, 'JBSWY3DPEHPK3PXP'),
    'backup_pin', COALESCE(v_pin, '2026217')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_super_admin_2fa_config() TO authenticated;

CREATE OR REPLACE FUNCTION public.update_super_admin_2fa_config(p_secret text, p_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_secret IS NOT NULL AND TRIM(p_secret) <> '' THEN
    INSERT INTO public.security_settings (key, value, updated_at)
    VALUES ('admin_totp_secret', TRIM(p_secret), now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  END IF;

  IF p_pin IS NOT NULL AND TRIM(p_pin) <> '' THEN
    INSERT INTO public.security_settings (key, value, updated_at)
    VALUES ('admin_promotion_pin', TRIM(p_pin), now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_super_admin_2fa_config(text, text) TO authenticated;
"""

with open('supabase/migrations/20261015_apply_pdf_printed_passwords.sql', 'w', encoding='utf-8') as f:
    f.write(sql_content)

print('Successfully generated supabase/migrations/20261015_apply_pdf_printed_passwords.sql')
