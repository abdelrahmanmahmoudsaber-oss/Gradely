-- ==============================================================================
-- Migration: Suppress No-Op Audit Logs (Clean Audit Trail & Extended Retention)
-- Date: 2026-11-03
-- Purpose:
--   1. Prevent duplicate audit log rows when an attendance or grade record is updated
--      with identical values (e.g. bulk-saving a sheet without changes).
--   2. Keep the audit log focused only on genuine modifications.
--   3. Dramatically extend effective log retention so logs cover weeks and months.
-- ==============================================================================

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
  
  IF v_actor_auth_id IS NOT NULL THEN
    SELECT user_id INTO v_actor_user_id FROM public.users WHERE auth_id = v_actor_auth_id LIMIT 1;
  END IF;

  IF (TG_OP = 'DELETE') THEN
    v_rec_id := COALESCE(OLD.id::text, '');
    INSERT INTO public.audit_logs (actor_auth_id, actor_user_id, action, table_name, record_id, old_data)
    VALUES (v_actor_auth_id, v_actor_user_id, 'DELETE', TG_TABLE_NAME, v_rec_id, to_jsonb(OLD));
    RETURN OLD;

  ELSIF (TG_OP = 'UPDATE') THEN
    -- 1. Suppress no-op attendance updates where status, week, subject, and student are unchanged
    IF (TG_TABLE_NAME = 'attendance') THEN
      IF (OLD.status IS NOT DISTINCT FROM NEW.status 
          AND OLD.student_id IS NOT DISTINCT FROM NEW.student_id 
          AND OLD.subject_id IS NOT DISTINCT FROM NEW.subject_id 
          AND OLD.week_number IS NOT DISTINCT FROM NEW.week_number) THEN
        RETURN NEW;
      END IF;
    END IF;

    -- 2. Suppress no-op grade updates where all assessment columns are unchanged
    IF (TG_TABLE_NAME = 'grades') THEN
      IF (OLD.quiz_1 IS NOT DISTINCT FROM NEW.quiz_1 
          AND OLD.quiz_2 IS NOT DISTINCT FROM NEW.quiz_2 
          AND OLD.project IS NOT DISTINCT FROM NEW.project 
          AND OLD.attendance_score IS NOT DISTINCT FROM NEW.attendance_score 
          AND OLD.final_grade IS NOT DISTINCT FROM NEW.final_grade) THEN
        RETURN NEW;
      END IF;
    END IF;

    -- 3. Suppress no-op users updates where core fields are identical
    IF (TG_TABLE_NAME = 'users') THEN
      IF (OLD.name IS NOT DISTINCT FROM NEW.name
          AND OLD.role IS NOT DISTINCT FROM NEW.role
          AND OLD.year_level IS NOT DISTINCT FROM NEW.year_level
          AND OLD.section IS NOT DISTINCT FROM NEW.section
          AND OLD.assigned_subjects IS NOT DISTINCT FROM NEW.assigned_subjects) THEN
        RETURN NEW;
      END IF;
    END IF;

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
