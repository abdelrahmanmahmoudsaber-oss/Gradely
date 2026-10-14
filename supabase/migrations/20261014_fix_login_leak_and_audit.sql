-- ==============================================================================
-- GRADELY SECURITY & AUDIT REMEDIATION SCRIPT
-- Date: 2026-10-14
-- Purpose:
--   1. Clean leaked backup credentials from subjects.excluded_students
--   2. Fix student login (allow auth by email match user_id@gradely.app)
--   3. Fix link_my_auth_id to recognize auth email prefix
--   4. Implement Immutable Audit Logging (Append-Only) for grades, attendance & users
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. PURGE LEAKED BACKUP CONFIG FROM subjects.excluded_students
-- ------------------------------------------------------------------------------
UPDATE public.subjects
SET excluded_students = (
  SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
  FROM jsonb_array_elements(COALESCE(excluded_students, '[]'::jsonb)) elem
  WHERE elem::text NOT LIKE '%CONFIG_BACKUP_SETTINGS%'
)
WHERE excluded_students::text LIKE '%CONFIG_BACKUP_SETTINGS%';


-- ------------------------------------------------------------------------------
-- 2. FIX USERS SELECT POLICY (Fixes Student Login Issue for User 99 & others)
-- ------------------------------------------------------------------------------
-- Allow students to read their own profile if auth_id matches OR if their auth email
-- is <user_id>@gradely.app (necessary during first login before auth_id is linked).
DROP POLICY IF EXISTS "Users can view their own profile" ON public.users;

CREATE POLICY "Users can view their own profile"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = auth_id 
    OR LOWER(COALESCE(auth.jwt() ->> 'email', '')) = LOWER(user_id || '@gradely.app')
    OR public.is_admin()
  );


-- ------------------------------------------------------------------------------
-- 3. FIX link_my_auth_id (Supports email matching, strictly defends admin accounts)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.link_my_auth_id(p_user_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_user_id text;
  jwt_email text;
  target_role text;
  is_caller_admin boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  jwt_user_id := COALESCE(auth.jwt() -> 'user_metadata' ->> 'user_id', '');
  jwt_email   := LOWER(COALESCE(auth.jwt() ->> 'email', ''));

  -- Check if caller is already an admin
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_id = auth.uid() AND u.role IN ('admin', 'super_admin')
  ) INTO is_caller_admin;

  -- Check the role of the target user
  SELECT role INTO target_role FROM public.users WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- If target is an admin, non-admins CAN NEVER link it
  IF target_role IN ('admin', 'super_admin') AND NOT is_caller_admin THEN
    RAISE EXCEPTION 'Unauthorized: Admin accounts cannot be self-linked via client RPC' USING errcode = '42501';
  END IF;

  -- Non-admins can only link their own verified account (user_metadata.user_id OR auth email prefix)
  IF NOT is_caller_admin AND NOT (
    (jwt_user_id <> '' AND jwt_user_id = p_user_id) OR
    (jwt_email <> '' AND jwt_email = LOWER(p_user_id || '@gradely.app'))
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Session credentials do not match target user_id' USING errcode = '42501';
  END IF;

  -- Apply the update safely
  UPDATE public.users 
  SET auth_id = auth.uid()
  WHERE user_id = p_user_id AND (auth_id IS NULL OR auth_id = auth.uid());

  RETURN FOUND;
END;
$$;


-- ------------------------------------------------------------------------------
-- 4. IMMUTABLE AUDIT LOGGING SYSTEM (Answer to: "مفيش logs ولو فيه بقدر امسحه")
-- ------------------------------------------------------------------------------

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_auth_id uuid,
  actor_user_id text,
  action text NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
  table_name text NOT NULL,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS on audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Admins can read audit logs, regular students cannot read them
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit logs"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- STRICT SECURITY: NO ONE can UPDATE or DELETE audit logs via API (Append-Only!)
REVOKE UPDATE, DELETE ON public.audit_logs FROM authenticated, anon, public;

-- Audit Trigger Function
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
BEGIN
  v_actor_auth_id := auth.uid();
  
  -- Resolve actor user_id from users table if possible
  IF v_actor_auth_id IS NOT NULL THEN
    SELECT user_id INTO v_actor_user_id FROM public.users WHERE auth_id = v_actor_auth_id LIMIT 1;
  END IF;

  -- Determine record ID
  IF (TG_OP = 'DELETE') THEN
    v_rec_id := COALESCE(OLD.id::text, '');
    INSERT INTO public.audit_logs (actor_auth_id, actor_user_id, action, table_name, record_id, old_data)
    VALUES (v_actor_auth_id, v_actor_user_id, 'DELETE', TG_TABLE_NAME, v_rec_id, to_jsonb(OLD));
    RETURN OLD;
  ELSIF (TG_OP = 'UPDATE') THEN
    v_rec_id := COALESCE(NEW.id::text, '');
    INSERT INTO public.audit_logs (actor_auth_id, actor_user_id, action, table_name, record_id, old_data, new_data)
    VALUES (v_actor_auth_id, v_actor_user_id, 'UPDATE', TG_TABLE_NAME, v_rec_id, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF (TG_OP = 'INSERT') THEN
    v_rec_id := COALESCE(NEW.id::text, '');
    INSERT INTO public.audit_logs (actor_auth_id, actor_user_id, action, table_name, record_id, new_data)
    VALUES (v_actor_auth_id, v_actor_user_id, 'INSERT', TG_TABLE_NAME, v_rec_id, to_jsonb(NEW));
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

-- Attach Audit Triggers to Grades, Attendance, and Users tables
DROP TRIGGER IF EXISTS trg_audit_grades ON public.grades;
CREATE TRIGGER trg_audit_grades
  AFTER INSERT OR UPDATE OR DELETE ON public.grades
  FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

DROP TRIGGER IF EXISTS trg_audit_attendance ON public.attendance;
CREATE TRIGGER trg_audit_attendance
  AFTER INSERT OR UPDATE OR DELETE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

DROP TRIGGER IF EXISTS trg_audit_users ON public.users;
CREATE TRIGGER trg_audit_users
  AFTER INSERT OR UPDATE OR DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();


-- ------------------------------------------------------------------------------
-- 5. ENSURE SUPER ADMIN USER HAS SUPER_ADMIN ROLE IN DATABASE
-- ------------------------------------------------------------------------------
UPDATE public.users 
SET role = 'super_admin' 
WHERE LOWER(user_id) = 'admin' 
   OR LOWER(user_id) LIKE '%amahmoudsaber%'
   OR name LIKE '%المعيد الرئيسي%'
   OR name LIKE '%مدير%';

