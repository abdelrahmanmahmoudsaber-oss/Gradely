import { supabase } from '../supabaseClient';
import { generateMultiSheetExcelBase64 } from './excelHelper';
import { isSuperUser } from './dataCache';

const DEFAULT_EMAIL = 'abdo2171999m@gmail.com';
const DEFAULT_WEBHOOK = 'https://script.google.com/macros/s/AKfycbykd7LVJ8p0dqrHqW9UUJ04i40qFwRTa0b98YPA1NgXzJ3U0EECa9i-EbiVa70pvHzbiQ/exec';

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
 * Loads backup settings from Supabase (fallback to localStorage)
 */
export async function getBackupSettings() {
  const localSettings = {
    email: localStorage.getItem('gradely_backup_email') || DEFAULT_EMAIL,
    schedule: localStorage.getItem('gradely_backup_schedule') || 'daily',
    webhookUrl: localStorage.getItem('gradely_webhook_url') || DEFAULT_WEBHOOK,
    lastBackup: localStorage.getItem('gradely_last_backup') || '',
    nextBackup: localStorage.getItem('gradely_next_backup') || ''
  };

  try {
    const { data } = await supabase.from('subjects').select('id, excluded_students').limit(15);
    if (data && Array.isArray(data)) {
      for (const s of data) {
        if (Array.isArray(s.excluded_students)) {
          const cfg = s.excluded_students.find(e => typeof e === 'string' && e.startsWith('CONFIG_BACKUP_SETTINGS:'));
          if (cfg) {
            const parsed = JSON.parse(cfg.replace('CONFIG_BACKUP_SETTINGS:', ''));
            const merged = { ...localSettings, ...parsed };
            // sync to localStorage
            if (merged.email) localStorage.setItem('gradely_backup_email', merged.email);
            if (merged.schedule) localStorage.setItem('gradely_backup_schedule', merged.schedule);
            if (merged.webhookUrl) localStorage.setItem('gradely_webhook_url', merged.webhookUrl);
            if (merged.lastBackup) localStorage.setItem('gradely_last_backup', merged.lastBackup);
            if (merged.nextBackup) localStorage.setItem('gradely_next_backup', merged.nextBackup);
            return merged;
          }
        }
      }
    }
  } catch (e) {
    console.warn('getBackupSettings Supabase error:', e);
  }

  return localSettings;
}

/**
 * Saves backup settings to Supabase and localStorage
 */
export async function saveBackupSettings(settings) {
  const email = settings.email || DEFAULT_EMAIL;
  const schedule = settings.schedule || 'daily';
  const webhookUrl = settings.webhookUrl || DEFAULT_WEBHOOK;
  const lastBackup = settings.lastBackup || localStorage.getItem('gradely_last_backup') || '';
  const nextBackup = settings.nextBackup || localStorage.getItem('gradely_next_backup') || '';

  localStorage.setItem('gradely_backup_email', email);
  localStorage.setItem('gradely_backup_schedule', schedule);
  localStorage.setItem('gradely_webhook_url', webhookUrl);
  if (lastBackup) localStorage.setItem('gradely_last_backup', lastBackup);
  if (nextBackup) localStorage.setItem('gradely_next_backup', nextBackup);

  const payload = { email, schedule, webhookUrl, lastBackup, nextBackup, updatedAt: Date.now() };
  const prefix = 'CONFIG_BACKUP_SETTINGS:';

  try {
    const { data: subs } = await supabase.from('subjects').select('id, excluded_students');
    if (subs && subs.length > 0) {
      for (const s of subs) {
        const cur = Array.isArray(s.excluded_students) ? [...s.excluded_students] : [];
        const filtered = cur.filter(e => typeof e === 'string' && !e.startsWith(prefix));
        filtered.push(prefix + JSON.stringify(payload));
        await supabase.from('subjects').update({ excluded_students: filtered }).eq('id', s.id);
      }
    }
  } catch (e) {
    console.warn('saveBackupSettings error:', e);
  }
}

/**
 * Sends full system backup (Excel sheet) via Google Apps Script Webhook
 */
export async function sendFullSystemBackupEmail({ isAuto = false, user, customEmail = null, customWebhook = null } = {}) {
  if (isBackupRunning) {
    return { success: false, message: 'هناك عملية نسخ احتياطي قيد التنفيذ حالياً...' };
  }

  const settings = await getBackupSettings();
  const emailToUse = customEmail || settings.email || DEFAULT_EMAIL;
  const targetWebhook = (customWebhook || settings.webhookUrl || DEFAULT_WEBHOOK).trim();

  if (!emailToUse || !emailToUse.includes('@')) {
    return { success: false, message: 'يرجى كتابة بريد إلكتروني صحيح أولاً' };
  }

  if (!targetWebhook || targetWebhook.includes('AKfycbzBUNCHESyAtmUK_V8Wm7KV')) {
    return { success: false, needWebhookModal: true, message: 'يرجى تفعيل ووضع رابط Google Apps Script أولاً' };
  }

  isBackupRunning = true;

  try {
    const [usersRes, subRes, attRes, grdRes] = await Promise.all([
      supabase.from('users').select('id, user_id, name, role, year_level, section, assigned_subjects'),
      supabase.from('subjects').select('id, name, year_level, total_weeks, instructor_name, instructor_id, enrolled_students, excluded_students'),
      supabase.from('attendance').select('student_id, subject_id, week_number, status'),
      supabase.from('grades').select('student_id, subject_id, quiz_1, quiz_2, project, attendance_score, final_grade')
    ]);

    const allUsers = usersRes.data || [];
    const allSubs = subRes.data || [];
    const allAtt = attRes.data || [];
    const allGrades = grdRes.data || [];

    const isSuper = isSuperUser(user);
    const freshCurrentUser = allUsers.find(u => u.user_id === user?.user_id) || user;
    const rawAssigned = Array.isArray(freshCurrentUser?.assigned_subjects) ? freshCurrentUser.assigned_subjects : [];
    const assignedSubIds = rawAssigned.map(e => e.split(':')[0]);

    let mySubs = [];
    if (isSuper) {
      mySubs = allSubs;
    } else {
      mySubs = allSubs.filter(s =>
        s.instructor_id === user?.user_id ||
        s.instructor_name === user?.name ||
        assignedSubIds.includes(s.id)
      );
    }

    if (mySubs.length === 0) {
      isBackupRunning = false;
      return { success: false, message: 'لا توجد مواد مسندة لتصدير كشوفها' };
    }

    const attMatrix = {};
    allAtt.forEach(r => {
      if (!attMatrix[r.subject_id]) attMatrix[r.subject_id] = {};
      if (!attMatrix[r.subject_id][r.student_id]) attMatrix[r.subject_id][r.student_id] = {};
      attMatrix[r.subject_id][r.student_id][r.week_number] = r.status;
    });

    const gradesMatrix = {};
    allGrades.forEach(g => {
      if (!gradesMatrix[g.subject_id]) gradesMatrix[g.subject_id] = {};
      gradesMatrix[g.subject_id][g.student_id] = g;
    });

    const sheets = [];

    mySubs.forEach(sub => {
      const totalWeeks = sub.total_weeks || 12;
      const subAtt = attMatrix[sub.id] || {};
      const subGrades = gradesMatrix[sub.id] || {};

      const enrolled = allUsers.filter(u => {
        if (u.role !== 'student') return false;
        const inSub = Array.isArray(sub.enrolled_students) && sub.enrolled_students.includes(u.user_id);
        const hasAssigned = Array.isArray(u.assigned_subjects) && u.assigned_subjects.some(e => typeof e === 'string' && e.startsWith(sub.id + ':'));
        return inSub || hasAssigned;
      });

      const rows = enrolled.map(stu => {
        const stuSubSec = (() => {
          if (Array.isArray(stu.assigned_subjects)) {
            const m = stu.assigned_subjects.find(e => typeof e === 'string' && e.startsWith(sub.id + ':'));
            if (m) return m.split(':')[1];
          }
          return stu.section || 'S1';
        })();

        const stuGrade = subGrades[stu.user_id] || {};

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

        for (let w = 1; w <= totalWeeks; w++) {
          const st = subAtt[stu.user_id]?.[w];
          let label = 'لم يرصد';
          if (st === 'present') { label = 'حاضر'; presentCount++; }
          else if (st === 'absent') { label = 'غائب'; absentCount++; }
          else if (st === 'late') { label = 'تأخير'; lateCount++; presentCount += 0.5; }
          else if (st === 'excused') { label = 'عذر'; excusedCount++; }
          row['أسبوع ' + w] = label;
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

    const nowIso = new Date().toLocaleString('ar-EG');
    const nextMs = Date.now() + scheduleToMs(settings.schedule);
    const nextIso = new Date(nextMs).toISOString();

    await saveBackupSettings({
      ...settings,
      email: emailToUse,
      webhookUrl: targetWebhook,
      lastBackup: nowIso,
      nextBackup: nextIso
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
    const lastBackupStr = settings.lastBackup || '';
    const nextBackupIso = settings.nextBackup || '';

    let isDue = false;

    // Check 1: Has a backup already been sent today (for daily schedule)?
    if (sched === 'daily') {
      const todayDateStr = new Date().toLocaleDateString('ar-EG');
      const lastBackupDatePart = lastBackupStr ? lastBackupStr.split(',')[0].trim() : '';
      
      // If no last backup exists, or last backup was NOT recorded today:
      if (!lastBackupStr || todayDateStr !== lastBackupDatePart) {
        if (nextBackupIso) {
          const nextTime = new Date(nextBackupIso).getTime();
          // If nextTime has arrived, or if more than 20 hours have passed since last backup
          if (!isNaN(nextTime) && Date.now() >= nextTime) {
            isDue = true;
          } else if (isNaN(nextTime)) {
            isDue = true;
          }
        } else {
          isDue = true;
        }
      }
    } else {
      // 3days, weekly, monthly
      if (nextBackupIso) {
        const nextTime = new Date(nextBackupIso).getTime();
        if (!isNaN(nextTime) && Date.now() >= nextTime) {
          isDue = true;
        }
      } else if (!lastBackupStr) {
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
