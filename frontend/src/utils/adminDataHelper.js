import { supabase } from '../supabaseClient';
import { cacheManager } from './dataCache';

/**
 * Centrally retrieves core platform data (all users/students and all subjects).
 * First attempts direct PostgREST queries.
 * If permission is denied or tables return empty (e.g. TA authenticated via legacy session token),
 * seamlessly falls back to get_system_backup_data RPC to ensure 100% data availability.
 */
export async function getAdminBaseData(currentUser = null, forceRefresh = false) {
  let allUsersList = !forceRefresh ? cacheManager.get('admin_users_base') : null;
  let allSubList = !forceRefresh ? cacheManager.get('admin_subjects_base') : null;

  // Auto-invalidate stale cache if last_sign_in_at wasn't previously cached
  if (allUsersList && allUsersList.length > 0 && allUsersList[0].last_sign_in_at === undefined) {
    allUsersList = null;
  }

  if (!allUsersList || !allSubList || allUsersList.length === 0 || allSubList.length === 0) {
    try {
      const [userRes, subRes] = await Promise.all([
        supabase.from('users').select('id, user_id, name, role, year_level, section, assigned_subjects, last_sign_in_at'),
        supabase.from('subjects').select('id, name, year_level, total_weeks, instructor_name, instructor_id, enrolled_students, excluded_students')
      ]);

      if (userRes.data && userRes.data.length > 0) allUsersList = userRes.data;
      if (subRes.data && subRes.data.length > 0) allSubList = subRes.data;
    } catch (e) {
      console.warn('Direct fetch notice:', e);
    }

    // High-reliability fallback for TAs where direct table SELECT might be restricted
    if (!allUsersList || allUsersList.length === 0 || !allSubList || allSubList.length === 0) {
      try {
        const sessionToken = currentUser?.session_token || localStorage.getItem('gradely_session_token') || '';
        const { data: bData } = await supabase.rpc('get_system_backup_data', {
          p_session_token: sessionToken
        });
        if (bData) {
          if ((!allUsersList || allUsersList.length === 0) && Array.isArray(bData.users) && bData.users.length > 0) {
            allUsersList = bData.users;
          }
          if ((!allSubList || allSubList.length === 0) && Array.isArray(bData.subjects) && bData.subjects.length > 0) {
            allSubList = bData.subjects;
          }
          if (Array.isArray(bData.attendance)) {
            cacheManager.set('admin_attendance_backup', bData.attendance);
          }
          if (Array.isArray(bData.grades)) {
            cacheManager.set('admin_grades_backup', bData.grades);
          }
        }
      } catch (backupErr) {
        console.warn('Backup RPC fallback notice:', backupErr);
      }
    }

    allUsersList = allUsersList || [];
    allSubList = allSubList || [];

    // Ensure currentUser is included in allUsersList if provided
    if (currentUser && currentUser.user_id && !allUsersList.some(u => u.user_id === currentUser.user_id)) {
      allUsersList.push({
        id: currentUser.id,
        user_id: currentUser.user_id,
        name: currentUser.name,
        role: currentUser.role || 'admin',
        assigned_subjects: currentUser.assigned_subjects || []
      });
    }

    // Extract instructors from subjects to ensure full admin/TA directory
    allSubList.forEach(s => {
      if (s.instructor_id && !allUsersList.some(u => u.user_id === s.instructor_id)) {
        allUsersList.push({
          user_id: s.instructor_id,
          name: s.instructor_name || s.instructor_id,
          role: 'admin',
          assigned_subjects: []
        });
      }
    });

    if (allUsersList.length > 0) {
      cacheManager.set('admin_users_base', allUsersList);
    }
    if (allSubList.length > 0) {
      cacheManager.set('admin_subjects_base', allSubList);
    }
  }

  return { allUsersList, allSubList };
}

/**
 * Retrieves attendance and grades dataset using backup RPC fallback if needed.
 */
export async function getBackupAttendanceAndGrades(forceRefresh = false) {
  let att = !forceRefresh ? cacheManager.get('admin_attendance_backup') : null;
  let grd = !forceRefresh ? cacheManager.get('admin_grades_backup') : null;

  if (!att || !grd) {
    try {
      const sessionToken = localStorage.getItem('gradely_session_token') || '';
      const { data: bData } = await supabase.rpc('get_system_backup_data', {
        p_session_token: sessionToken
      });
      if (bData) {
        if (Array.isArray(bData.attendance)) {
          att = bData.attendance;
          cacheManager.set('admin_attendance_backup', att);
        }
        if (Array.isArray(bData.grades)) {
          grd = bData.grades;
          cacheManager.set('admin_grades_backup', grd);
        }
      }
    } catch (err) {
      console.warn('Backup attendance/grades fetch error:', err);
    }
  }

  return { attendance: att || [], grades: grd || [] };
}

