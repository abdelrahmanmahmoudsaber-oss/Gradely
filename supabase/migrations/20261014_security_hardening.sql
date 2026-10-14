-- ==============================================================================
-- GRADELY SYSTEM-WIDE CRITICAL SECURITY HARDENING SCRIPT
-- Resolves: ISSUE-6 (Account Takeover), ISSUE-7 (PII Leakage in user_profiles),
--           ISSUE-8 (Password Hash Exposure), and Privilege Escalation Triggers.
-- Run this script in: Supabase Dashboard -> SQL Editor -> Run
-- ==============================================================================

-- 1. FIX ISSUE-6: Secure link_my_auth_id (Prevent arbitrary account takeover)
-- Only allow linking if:
--   a) The caller is an established admin in public.users, OR
--   b) The requested p_user_id exactly matches auth.jwt() -> 'user_metadata' ->> 'user_id',
--      AND the target user is NOT an admin (admins cannot be claimed by regular users).
CREATE OR REPLACE FUNCTION public.link_my_auth_id(p_user_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_user_id text;
  target_role text;
  is_caller_admin boolean;
BEGIN
  -- Caller must be authenticated
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  jwt_user_id := COALESCE(auth.jwt() -> 'user_metadata' ->> 'user_id', '');

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

  -- If the target is an admin, regular users CAN NEVER claim it
  IF target_role IN ('admin', 'super_admin') AND NOT is_caller_admin THEN
    RAISE EXCEPTION 'Unauthorized: Admin accounts cannot be self-linked via client RPC' USING errcode = '42501';
  END IF;

  -- Non-admins can only link their own verified user_id (set during login)
  IF NOT is_caller_admin AND (p_user_id <> jwt_user_id OR jwt_user_id = '') THEN
    RAISE EXCEPTION 'Unauthorized: Session user_metadata does not match target user_id' USING errcode = '42501';
  END IF;

  -- Apply the update (only if not already bound)
  UPDATE public.users 
  SET auth_id = auth.uid()
  WHERE user_id = p_user_id AND auth_id IS NULL;

  RETURN FOUND;
END;
$$;


-- 2. FIX ISSUE-7: Secure user_profiles View (Enforce Security Invoker RLS)
DROP VIEW IF EXISTS public.user_profiles CASCADE;

CREATE VIEW public.user_profiles
WITH (security_invoker = true) AS
SELECT user_id, name, role, year_level, section, assigned_subjects, auth_id
FROM public.users;

-- Revoke anon access completely
REVOKE ALL ON public.user_profiles FROM anon;
GRANT SELECT ON public.user_profiles TO authenticated;


-- 3. FIX ISSUE-8: Revoke SELECT on password column
REVOKE SELECT (password) ON public.users FROM authenticated, anon;


-- 4. HARDENING: Prevent Students from Elevating Roles or Stealing Permissions via PATCH /users
-- Even if an attacker has an authenticated session, this trigger prevents them
-- from ever modifying 'role', 'assigned_subjects', or overwriting 'auth_id'.
CREATE OR REPLACE FUNCTION public.protect_user_role_and_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_caller_admin boolean;
BEGIN
  -- Allow service_role key to do administrative syncs
  IF (COALESCE(auth.jwt() ->> 'role', '') = 'service_role') THEN
    RETURN NEW;
  END IF;

  -- Check if caller is an established admin
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_id = auth.uid() AND u.role IN ('admin', 'super_admin')
  ) INTO is_caller_admin;

  -- Protect 'role' column
  IF (NEW.role IS DISTINCT FROM OLD.role) THEN
    IF NOT is_caller_admin THEN
      RAISE EXCEPTION 'Unauthorized: Only administrators can modify roles' USING errcode = '42501';
    END IF;
  END IF;

  -- Protect 'assigned_subjects' column for admins
  IF (NEW.assigned_subjects IS DISTINCT FROM OLD.assigned_subjects) THEN
    -- If modifying an admin's assigned_subjects or setting admin subjects, must be admin
    IF (OLD.role IN ('admin', 'super_admin') OR NEW.role IN ('admin', 'super_admin')) AND NOT is_caller_admin THEN
      RAISE EXCEPTION 'Unauthorized: Only administrators can modify admin assigned subjects' USING errcode = '42501';
    END IF;
  END IF;

  -- Prevent stealing or changing an already linked auth_id
  IF (OLD.auth_id IS NOT NULL AND NEW.auth_id IS DISTINCT FROM OLD.auth_id) THEN
    IF NOT is_caller_admin THEN
      RAISE EXCEPTION 'Unauthorized: Cannot rebind an already assigned auth_id' USING errcode = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_user_role ON public.users;
CREATE TRIGGER trg_protect_user_role
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_user_role_and_permissions();


-- 5. SECURE RLS POLICIES ON attendance AND grades
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 6. ENSURE SEARCH_PATH IS PINNED ON ALL SECURITY DEFINER FUNCTIONS
ALTER FUNCTION public.link_my_auth_id(text) SET search_path = public;
ALTER FUNCTION public.protect_user_role_and_permissions() SET search_path = public;

-- 7. ENSURE SUPER ADMIN ROLE IS PROPERLY CONFIGURED IN DATABASE
UPDATE public.users 
SET role = 'super_admin' 
WHERE user_id = 'admin' OR user_id = 'amahmoudsaber20262027217@@';

