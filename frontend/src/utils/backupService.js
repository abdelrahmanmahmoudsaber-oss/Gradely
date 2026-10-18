import { supabase } from '../supabaseClient';
import { generateMultiSheetExcelBase64 } from './excelHelper';
import { isSuperUser } from './dataCache';

const DEFAULT_EMAIL = '';
const DEFAULT_WEBHOOK = '';

// Interval to ms
export const scheduleToMs = (schedule) => {
  switch (schedule) {
    case 'daily':   return 24 * 60 * 60 * 1000;
    case '3days':   return 3 * 24 * 60 * 60 * 1000;
    case 'weekly':  return 7 * 24 * 60 * 60 * 1000;
    case 'monthly': return 30 * 24 * 60 * 60 * 1000;
    default:        return 24 * 60 * 60 * 1000;
  }
};

// In-memory mutex to prevent concurrent backup runs
let isBackupRunning = false;

/**
 * Loads backup settings securely from the Super Admin's private browser storage
 */
export async function getBackupSettings() {
  return {
    email: localStorage.getItem('gradely_backup_email') || '',
    schedule: localStorage.getItem('gradely_backup_schedule') || 'daily',
    webhookUrl: localStorage.getItem('gradely_webhook_url') || '',
    lastBackup: localStorage.getItem('gradely_last_backup') || '',
    nextBackup: localStorage.getItem('gradely_next_backup') || '',
    lastBackupTimestamp: parseInt(localStorage.getItem('gradely_last_backup_timestamp') || '0', 10)
  };
}

/**
 * Saves backup settings securely to private browser storage
 */
export async function saveBackupSettings(settings) {
  const email = (settings.email || '').trim();
  const schedule = settings.schedule || 'daily';
  const webhookUrl = (settings.webhookUrl || '').trim();
  const lastBackup = settings.lastBackup || localStorage.getItem('gradely_last_backup') || '';
  const nextBackup = settings.nextBackup || localStorage.getItem('gradely_next_backup') || '';
  const timestamp = settings.lastBackupTimestamp || parseInt(localStorage.getItem('gradely_last_backup_timestamp') || '0', 10);

  if (email) localStorage.setItem('gradely_backup_email', email);
  if (schedule) localStorage.setItem('gradely_backup_schedule', schedule);
  if (webhookUrl) localStorage.setItem('gradely_webhook_url', webhookUrl);
  if (lastBackup) localStorage.setItem('gradely_last_backup', lastBackup);
  if (nextBackup) localStorage.setItem('gradely_next_backup', nextBackup);
  if (timestamp) localStorage.setItem('gradely_last_backup_timestamp', timestamp.toString());
}

/**
 * Cleans up any legacy backup settings leaked into subjects.excluded_students
 */
export async function cleanupBackupSettingsFromSubjects() {
  try {
    const { data: subs } = await supabase.from('subjects').select('id, excluded_students');
    if (subs && subs.length > 0) {
      for (const s of subs) {
        if (Array.isArray(s.excluded_students) && s.excluded_students.some(e => typeof e === 'string' && e.startsWith('CONFIG_BACKUP_SETTINGS:'))) {
          const filtered = s.excluded_students.filter(e => typeof e !== 'string' || !e.startsWith('CONFIG_BACKUP_SETTINGS:'));
          await supabase.from('subjects').update({ excluded_students: filtered }).eq('id', s.id);
        }
      }
    }
  } catch (e) {
    console.warn('cleanupBackupSettingsFromSubjects notice:', e);
  }
}

/**
 * Fetches all rows from a Supabase table with pagination to bypass the 1000-row limit
 */
export async function fetchAllSupabaseRows(table, selectCols = '*') {
  let allRows = [];
  let from = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(selectCols)
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error(`Error fetching from ${table}:`, error);
      break;
    }
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return allRows;
}

export const normalizeStatus = (status) => {
  if (!status) return 'unrecorded';
  const s = String(status).toLowerCase().trim();
  if (s === 'present' || s === 'حاضر' || s === 'حضور' || s === '1') return 'present';
  if (s === 'absent' || s === 'غائب' || s === 'غياب' || s === '0') return 'absent';
  if (s === 'late' || s === 'تأخير' || s === '2') return 'late';
  if (s === 'excused' || s === 'عذر' || s === 'e') return 'excused';
  return s;
};

export const getStatusLabel = (norm) => {
  if (norm === 'present') return 'حاضر';
  if (norm === 'absent') return 'غائب';
  if (norm === 'late') return 'تأخير';
  if (norm === 'excused') return 'عذر';
  return 'لم يرصد';
};

/**
 * Sends full system backup (Excel sheet) via Google Apps Script Webhook
 */
export async function sendFullSystemBackupEmail({ isAuto = false, user, customEmail = null, customWebhook = null } = {}) {
  if (isBackupRunning) {
    return { success: false, message: 'هناك عملية نسخ احتياطي قيد التنفيذ حالياً...' };
  }

  const settings = await getBackupSettings();
  const emailToUse = (customEmail || settings.email || '').trim();
  const targetWebhook = (customWebhook || settings.webhookUrl || '').trim();

  if (!emailToUse || !emailToUse.includes('@')) {
    return { success: false, message: 'يرجى كتابة بريد إلكتروني صحيح للنسخ الاحتياطي أولاً' };
  }

  if (!targetWebhook || !targetWebhook.startsWith('https://script.google.com/')) {
    return { success: false, needWebhookModal: true, message: 'يرجى تفعيل وإدخال رابط Google Apps Script الخاص بك أولاً' };
  }

  if (!targetWebhook || targetWebhook.includes('AKfycbzBUNCHESyAtmUK_V8Wm7KV')) {
    return { success: false, needWebhookModal: true, message: 'يرجى تفعيل ووضع رابط Google Apps Script أولاً' };
  }

  isBackupRunning = true;

  try {
    // 0. Flush any pending offline attendance to Supabase before export
    try {
      const pending = JSON.parse(localStorage.getItem('gradely_pending_attendance_sync') || '[]');
      if (Array.isArray(pending) && pending.length > 0 && navigator.onLine) {
        const upsertRows = pending.map(q => ({
          student_id: String(q.student_id).trim(),
          subject_id: String(q.subject_id).trim(),
          week_number: parseInt(q.week_number, 10),
          status: q.status || 'unrecorded'
        }));
        await supabase.from('attendance').upsert(upsertRows, { onConflict: 'student_id,subject_id,week_number' });
        localStorage.removeItem('gradely_pending_attendance_sync');
      }
    } catch (syncErr) {
      console.warn('Sync pending queue before backup error:', syncErr);
    }

    // 1. Fetch 100% of all rows across all tables using pagination (no 1000-row cutoff)
    const [allUsers, allSubs, allAtt, allGrades] = await Promise.all([
      fetchAllSupabaseRows('users', 'id, user_id, name, role, year_level, section, assigned_subjects'),
      fetchAllSupabaseRows('subjects', 'id, name, year_level, total_weeks, instructor_name, instructor_id, enrolled_students, excluded_students'),
      fetchAllSupabaseRows('attendance', 'student_id, subject_id, week_number, status'),
      fetchAllSupabaseRows('grades', 'student_id, subject_id, quiz_1, quiz_2, project, attendance_score, final_grade')
    ]);

    const isSuper = isSuperUser(user);
    const freshCurrentUser = allUsers.find(u => String(u.user_id).trim() === String(user?.user_id).trim()) || user;
    const rawAssigned = Array.isArray(freshCurrentUser?.assigned_subjects) ? freshCurrentUser.assigned_subjects : [];
    const assignedSubIds = rawAssigned.map(e => e.split(':')[0].trim());

    let mySubs = [];
    if (isSuper) {
      mySubs = allSubs;
    } else {
      mySubs = allSubs.filter(s =>
        s.instructor_id === user?.user_id ||
        s.instructor_name === user?.name ||
        assignedSubIds.includes(String(s.id).trim())
      );
    }

    if (mySubs.length === 0) {
      isBackupRunning = false;
      return { success: false, message: 'لا توجد مواد مسندة لتصدير كشوفها' };
    }

    // 2. Build attendance matrix with trimmed student and subject keys
    const attMatrix = {};
    allAtt.forEach(r => {
      const subId = String(r.subject_id || '').trim();
      const sId = String(r.student_id || '').trim();
      const wNum = parseInt(r.week_number, 10);
      if (!attMatrix[subId]) attMatrix[subId] = {};
      if (!attMatrix[subId][sId]) attMatrix[subId][sId] = {};
      attMatrix[subId][sId][wNum] = r.status;
    });

    // Merge any live localStorage records from the admin browser session
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('gradely_local_att_')) {
          const match = key.match(/gradely_local_att_(sec|lec)_(.+)_w(\d+)/);
          if (match) {
            const [, type, subId, wStr] = match;
            const cleanSubId = String(subId).trim();
            const wNum = parseInt(wStr, 10);
            const effW = type === 'lec' ? 100 + wNum : wNum;
            const parsed = JSON.parse(localStorage.getItem(key) || '{}');
            if (parsed.records && typeof parsed.records === 'object') {
              if (!attMatrix[cleanSubId]) attMatrix[cleanSubId] = {};
              Object.keys(parsed.records).forEach(stuId => {
                const cleanStuId = String(stuId).trim();
                if (!attMatrix[cleanSubId][cleanStuId]) attMatrix[cleanSubId][cleanStuId] = {};
                if (!attMatrix[cleanSubId][cleanStuId][effW] || attMatrix[cleanSubId][cleanStuId][effW] === 'unrecorded') {
                  attMatrix[cleanSubId][cleanStuId][effW] = parsed.records[stuId];
                }
              });
            }
          }
        }
      }
    } catch (e) {}

    // 3. Build grades matrix with trimmed keys
    const gradesMatrix = {};
    allGrades.forEach(g => {
      const subId = String(g.subject_id || '').trim();
      const sId = String(g.student_id || '').trim();
      if (!gradesMatrix[subId]) gradesMatrix[subId] = {};
      gradesMatrix[subId][sId] = g;
    });

    const sheets = [];

    mySubs.forEach(sub => {
      const subId = String(sub.id).trim();
      const totalWeeks = sub.total_weeks || 12;
      const subAtt = attMatrix[subId] || {};
      const subGrades = gradesMatrix[subId] || {};

      // Determine attendance modes present in this subject
      let hasSections = false;
      let hasLectures = false;

      Object.values(subAtt).forEach(weeks => {
        Object.keys(weeks).forEach(wKey => {
          const wn = parseInt(wKey, 10);
          const st = normalizeStatus(weeks[wKey]);
          if (st !== 'unrecorded') {
            if (wn <= 50) hasSections = true;
            if (wn > 100) hasLectures = true;
          }
        });
      });

      // Default to standard section weeks if nothing recorded yet
      if (!hasSections && !hasLectures) {
        hasSections = true;
      }

      // Filter enrolled students for this subject
      const enrolled = allUsers.filter(u => {
        if (u.role !== 'student') return false;
        const uId = String(u.user_id).trim();
        const inSub = Array.isArray(sub.enrolled_students) && sub.enrolled_students.map(e => String(e).trim()).includes(uId);
        const hasAssigned = Array.isArray(u.assigned_subjects) && u.assigned_subjects.some(e => typeof e === 'string' && e.startsWith(subId + ':'));
        return inSub || hasAssigned;
      });

      // Sort deterministically: section, then academic ID
      enrolled.sort((a, b) => {
        const secA = (a.section || '').localeCompare(b.section || '');
        if (secA !== 0) return secA;
        return String(a.user_id).localeCompare(String(b.user_id));
      });

      const rows = enrolled.map(stu => {
        const stuId = String(stu.user_id || '').trim();
        const stuSubSec = (() => {
          if (Array.isArray(stu.assigned_subjects)) {
            const m = stu.assigned_subjects.find(e => typeof e === 'string' && e.startsWith(subId + ':'));
            if (m) return m.split(':')[1];
          }
          return stu.section || 'S1';
        })();

        const stuGrade = subGrades[stuId] || {};

        const row = {
          'الرقم الأكاديمي': stu.user_id,
          'اسم الطالب': stu.name,
          'السكشن': stuSubSec,
          'الفرقة': stu.year_level || sub.year_level || '1',
          'كويز 1': stuGrade.quiz_1 != null ? stuGrade.quiz_1 : 0,
          'كويز 2': stuGrade.quiz_2 != null ? stuGrade.quiz_2 : 0,
          'المشروع': stuGrade.project != null ? stuGrade.project : 0,
          'درجة الحضور': stuGrade.attendance_score != null ? stuGrade.attendance_score : 0,
          'المجموع الكلي': stuGrade.final_grade != null ? stuGrade.final_grade : 0
        };

        let presentCount = 0;
        let absentCount = 0;
        let lateCount = 0;
        let excusedCount = 0;

        // Case A: Both section and lecture attendance exist for this subject
        if (hasSections && hasLectures) {
          for (let w = 1; w <= totalWeeks; w++) {
            const secSt = normalizeStatus(subAtt[stuId]?.[w]);
            const secLabel = getStatusLabel(secSt);
            if (secSt === 'present') { presentCount++; }
            else if (secSt === 'absent') { absentCount++; }
            else if (secSt === 'late') { lateCount++; presentCount += 0.5; }
            else if (secSt === 'excused') { excusedCount++; }
            row['سكشن أسبوع ' + w] = secLabel;
          }
          for (let w = 1; w <= totalWeeks; w++) {
            const lecSt = normalizeStatus(subAtt[stuId]?.[100 + w]);
            const lecLabel = getStatusLabel(lecSt);
            if (lecSt === 'present') { presentCount++; }
            else if (lecSt === 'absent') { absentCount++; }
            else if (lecSt === 'late') { lateCount++; presentCount += 0.5; }
            else if (lecSt === 'excused') { excusedCount++; }
            row['محاضرة أسبوع ' + w] = lecLabel;
          }
        } else if (hasLectures && !hasSections) {
          // Case B: Only lecture attendance recorded for this subject
          for (let w = 1; w <= totalWeeks; w++) {
            const lecSt = normalizeStatus(subAtt[stuId]?.[100 + w]);
            const lecLabel = getStatusLabel(lecSt);
            if (lecSt === 'present') { presentCount++; }
            else if (lecSt === 'absent') { absentCount++; }
            else if (lecSt === 'late') { lateCount++; presentCount += 0.5; }
            else if (lecSt === 'excused') { excusedCount++; }
            row['أسبوع ' + w] = lecLabel;
          }
        } else {
          // Case C: Section attendance (default)
          for (let w = 1; w <= totalWeeks; w++) {
            const st = normalizeStatus(subAtt[stuId]?.[w]);
            const label = getStatusLabel(st);
            if (st === 'present') { presentCount++; }
            else if (st === 'absent') { absentCount++; }
            else if (st === 'late') { lateCount++; presentCount += 0.5; }
            else if (st === 'excused') { excusedCount++; }
            row['أسبوع ' + w] = label;
          }
        }

        const totalRecorded = presentCount + absentCount + (lateCount * 0.5);
        const attRate = totalRecorded > 0 ? Math.round((presentCount / totalRecorded) * 100) + '%' : '0%';

        row['إجمالي الحضور'] = presentCount;
        row['إجمالي الغياب'] = absentCount;
        row['تأخير / عذر'] = lateCount + excusedCount;
        row['نسبة الالتزام'] = attRate;

        return row;
      });

      let sheetName = sub.name.replace(/[:\\/?*[\]]/g, '').slice(0, 28);
      if (!sheetName) sheetName = 'مادة ' + sub.id.slice(0, 6);
      sheets.push({ name: sheetName, data: rows });
    });

    const fileBase64 = await generateMultiSheetExcelBase64(sheets);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 10);
    const filename = 'Gradely_Full_Grades_And_Attendance_' + timestamp + '.xlsx';

    const payload = JSON.stringify({
      email: emailToUse,
      filename: filename,
      fileBase64: fileBase64
    });

    await fetch(targetWebhook, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: payload
    });

    const nowMs = Date.now();
    const nowIso = new Date().toLocaleString('ar-EG');
    const nextMs = nowMs + scheduleToMs(settings.schedule);
    const nextIso = new Date(nextMs).toISOString();

    await saveBackupSettings({
      ...settings,
      email: emailToUse,
      webhookUrl: targetWebhook,
      lastBackup: nowIso,
      nextBackup: nextIso,
      lastBackupTimestamp: nowMs
    });

    isBackupRunning = false;
    return {
      success: true,
      lastBackup: nowIso,
      nextBackup: nextIso,
      message: '🎉 ' + (isAuto ? 'إرسال تلقائي مجدول: ' : '') + 'تم إرسال كشف الغياب والدرجات بنجاح إلى (' + emailToUse + ') وحفظه في Google Drive!'
    };
  } catch (err) {
    isBackupRunning = false;
    console.error('sendFullSystemBackupEmail error:', err);
    return { success: false, message: '❌ حدث خطأ أثناء إرسال النسخة: ' + err.message };
  }
}

/**
 * Checks if a scheduled backup is due and executes it automatically
 */
export async function checkAndRunScheduledBackup(user, onBackupSent = null) {
  if (isBackupRunning) return;
  if (!isSuperUser(user)) return;

  try {
    const settings = await getBackupSettings();
    if (!settings.email || !settings.email.includes('@')) return;
    if (!settings.webhookUrl || settings.webhookUrl.includes('AKfycbzBUNCHESyAtmUK_V8Wm7KV')) return;

    const sched = settings.schedule || 'daily';
    const lastTimestamp = settings.lastBackupTimestamp || 0;
    const requiredInterval = scheduleToMs(sched);

    let isDue = false;

    // Check if backup is due
    if (!lastTimestamp) {
      // If no timestamp recorded yet, it is due
      isDue = true;
    } else {
      const elapsedMs = Date.now() - lastTimestamp;
      // For daily schedule, if 20 hours or more have passed since last backup, trigger it
      const thresholdMs = sched === 'daily' ? 20 * 60 * 60 * 1000 : requiredInterval;
      if (elapsedMs >= thresholdMs) {
        isDue = true;
      }
    }

    if (isDue) {
      console.log('🤖 Auto scheduled backup is DUE. Triggering send...');
      const res = await sendFullSystemBackupEmail({ isAuto: true, user });
      if (res.success && typeof onBackupSent === 'function') {
        onBackupSent(res);
      }
    }
  } catch (e) {
    console.warn('checkAndRunScheduledBackup error:', e);
  }
}
