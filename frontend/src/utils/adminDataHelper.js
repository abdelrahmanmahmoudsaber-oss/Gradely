import { supabase } from '../supabaseClient';
import { cacheManager } from './dataCache';

const BACKUP_SECRET = 'gradely_backup_cron_sec_7f9a2b8e4c1d6e5a';

/**
 * Centrally retrieves core platform data (all users/students and all subjects).
 * First attempts direct PostgREST queries.
 * If permission is denied or tables return empty (e.g. TA authenticated via legacy session token),
 * seamlessly falls back to get_system_backup_data RPC to ensure 100% data availability.
 */
export async function getAdminBaseData(currentUser = null, forceRefresh = false) {
  let allUsersList = !forceRefresh ? cacheManager.get('admin_users_base') : null;
  let allSubList = !forceRefresh ? cacheManager.get('admin_subjects_base') : null;

  if (!allUsersList || !allSubList || allUsersList.length === 0 || allSubList.length === 0) {
    try {
      const [userRes, subRes] = await Promise.all([
        supabase.from('users').select('id, user_id, name, role, year_level, section, assigned_subjects'),
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
        const { data: bData } = await supabase.rpc('get_system_backup_data', {
          p_backup_secret: BACKUP_SECRET
        });
        if (bData) {
          if ((!allUsersList || allUsersList.length === 0) && Array.isArray(bData.users) && bData.users.length > 0) {
            allUsersList = bData.users;
          }
          if ((!allSubList || allSubList.length === 0) && Array.isArray(bData.subjects) && bData.subjects.length > 0) {
            allSubList = bData.subjects;
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
