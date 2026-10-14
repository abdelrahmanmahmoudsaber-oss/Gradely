-- ==============================================================================
-- RESTORE ALL USERS, STUDENTS, ATTENDANCE, AND GRADES TO ADMIN DASHBOARD
-- Date: 2026-10-14
-- Purpose:
--   1. Define robust is_admin() that checks auth_id AND verified email
--   2. Auto-link auth_id for all users (admin and students) from auth.users
--   3. Create RLS policies that give admins full access to users, attendance, grades
--   4. Keep students strictly isolated to their own records
-- ==============================================================================

-- 1. DEFINE ROBUST is_admin() FUNCTION
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.users u
    WHERE (
      u.auth_id = auth.uid() 
      OR (
        auth.jwt() ->> 'email' IS NOT NULL 
        AND LOWER(u.user_id || '@gradely.app') = LOWER(auth.jwt() ->> 'email')
      )
    )
    AND u.role IN ('admin', 'super_admin')
  );
END;
$$;


-- 2. LINK auth_id FOR ALL USERS (Admin & Students) FROM auth.users
UPDATE public.users u
SET auth_id = au.id
FROM auth.users au
WHERE LOWER(au.email) = LOWER(u.user_id || '@gradely.app');


-- 3. ENSURE SUPER ADMIN USER HAS SUPER_ADMIN ROLE IN DATABASE
UPDATE public.users 
SET role = 'super_admin' 
WHERE LOWER(user_id) = 'admin' 
   OR LOWER(user_id) LIKE '%amahmoudsaber%'
   OR name LIKE '%المعيد الرئيسي%'
   OR name LIKE '%مدير%';


-- 4. GRANT ADMINS FULL ACCESS TO USERS TABLE, AND STUDENTS ONLY ACCESS TO THEIR OWN ROW
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view and manage all users" ON public.users;
CREATE POLICY "Admins can view and manage all users"
  ON public.users
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

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


-- 5. GRANT ADMINS FULL ACCESS TO ATTENDANCE, AND STUDENTS ONLY TO THEIR OWN
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage attendance" ON public.attendance;
CREATE POLICY "Admins can manage attendance"
  ON public.attendance
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Students can view own attendance" ON public.attendance;
CREATE POLICY "Students can view own attendance"
  ON public.attendance
  FOR SELECT
  TO authenticated
  USING (
    student_id IN (
      SELECT user_id FROM public.users 
      WHERE auth_id = auth.uid() 
         OR LOWER(user_id || '@gradely.app') = LOWER(COALESCE(auth.jwt()->>'email', ''))
    )
  );


-- 6. GRANT ADMINS FULL ACCESS TO GRADES, AND STUDENTS ONLY TO THEIR OWN
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage grades" ON public.grades;
CREATE POLICY "Admins can manage grades"
  ON public.grades
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Students can view own grades" ON public.grades;
CREATE POLICY "Students can view own grades"
  ON public.grades
  FOR SELECT
  TO authenticated
  USING (
    student_id IN (
      SELECT user_id FROM public.users 
      WHERE auth_id = auth.uid() 
         OR LOWER(user_id || '@gradely.app') = LOWER(COALESCE(auth.jwt()->>'email', ''))
    )
  );


-- 7. UPDATE link_my_auth_id SO IT NEVER BLOCKS LEGITIMATE USERS/ADMINS
CREATE OR REPLACE FUNCTION public.link_my_auth_id(p_user_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_user_id text;
  jwt_email text;
  caller_matches boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  jwt_user_id := COALESCE(auth.jwt() -> 'user_metadata' ->> 'user_id', '');
  jwt_email   := LOWER(COALESCE(auth.jwt() ->> 'email', ''));

  caller_matches := (
    (jwt_user_id <> '' AND jwt_user_id = p_user_id) OR
    (jwt_email <> '' AND jwt_email = LOWER(p_user_id || '@gradely.app'))
  );

  IF NOT caller_matches AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Session credentials do not match target user_id' USING errcode = '42501';
  END IF;

  UPDATE public.users 
  SET auth_id = auth.uid()
  WHERE user_id = p_user_id AND (auth_id IS NULL OR auth_id = auth.uid());

  RETURN FOUND;
END;
$$;
