/**
 * Gradely Automated Cloud Backup Script
 * File: scripts/cron-backup.mjs
 *
 * Runs automatically via GitHub Actions / Cloud Cron at 02:00 AM UTC (5:00 AM Cairo).
 * Zero browser required! Runs 100% serverless in the cloud.
 *
 * 1. Fetches 100% of attendance, grades, users, and subjects from Supabase.
 * 2. Builds complete multi-sheet Excel backup workbook using ExcelJS.
 * 3. Handles both section weeks (1-12) and lecture weeks (101-112).
 * 4. Normalizes Arabic/English status values and trims academic IDs.
 * 5. Converts to Base64 and POSTs to Google Apps Script Webhook.
 * 6. Google Apps Script emails the Excel file to Gmail and saves in Google Drive.
 */

import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
let createClient;
let ExcelJS;

try {
  createClient = require('../frontend/node_modules/@supabase/supabase-js').createClient;
  ExcelJS = require('../frontend/node_modules/exceljs');
} catch (e) {
  createClient = require('@supabase/supabase-js').createClient;
  ExcelJS = require('exceljs');
}

// Environment Configuration (with safe defaults from frontend/.env if present)
const DEFAULT_EMAIL = 'abdo2171999m@gmail.com';
const DEFAULT_WEBHOOK = 'https://script.google.com/macros/s/AKfycbykd7LVJ8p0dqrHqW9UUJ04i40qFwRTa0b98YPA1NgXzJ3U0EECa9i-EbiVa70pvHzbiQ/exec';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://bbdyexsaqnlremprfmph.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_7lextLm1cEOuRlz4XMiV9w_F01aZaho';
const BACKUP_SECRET = process.env.BACKUP_CRON_SECRET || '';
const BACKUP_EMAIL = process.env.BACKUP_EMAIL || DEFAULT_EMAIL;
const WEBHOOK_URL = process.env.BACKUP_WEBHOOK_URL || DEFAULT_WEBHOOK;

console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║  Gradely Automated Cloud Backup Generator (Zero-Browser)         ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');
console.log(`[INIT] Target Supabase: ${SUPABASE_URL}`);
console.log(`[INIT] Execution Time: ${new Date().toISOString()}`);

if (!WEBHOOK_URL) {
  console.warn('[WARN] No BACKUP_WEBHOOK_URL provided in environment. Excel will be generated and saved locally.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function normalizeStatus(status) {
  if (!status) return 'unrecorded';
  const s = String(status).toLowerCase().trim();
  if (s === 'present' || s === 'حاضر' || s === 'حضور' || s === '1') return 'present';
  if (s === 'absent' || s === 'غائب' || s === 'غياب' || s === '0') return 'absent';
  if (s === 'late' || s === 'تأخير' || s === '2') return 'late';
  if (s === 'excused' || s === 'عذر' || s === 'e') return 'excused';
  return s;
}

function getStatusLabel(norm) {
  if (norm === 'present') return 'حاضر';
  if (norm === 'absent') return 'غائب';
  if (norm === 'late') return 'تأخير';
  if (norm === 'excused') return 'عذر';
  return 'لم يرصد';
}

async function fetchBackupData() {
  console.log('[1/4] Fetching full database snapshot from Supabase...');

  // Try the secure get_system_backup_data RPC first
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('get_system_backup_data', {
      p_backup_secret: BACKUP_SECRET
    });

    if (rpcErr) {
      console.error(`[RPC ERROR] get_system_backup_data returned error:`, rpcErr);
    } else if (rpcData && rpcData.users && rpcData.subjects) {
      console.log(`[DATA] Fetched via Cloud RPC: ${rpcData.users.length} students, ${rpcData.subjects.length} subjects, ${rpcData.attendance?.length || 0} attendance records, ${rpcData.grades?.length || 0} grades.`);
      return rpcData;
    }
  } catch (e) {
    console.error('[RPC EXCEPTION] Failed to call get_system_backup_data:', e.message);
  }

  // Fallback: Paginated table queries
  console.log('[INFO] Attempting direct table queries fallback...');
  async function fetchAll(table, cols) {
    const rows = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase.from(table).select(cols).range(from, from + 999);
      if (error || !data || data.length === 0) break;
      rows.push(...data);
      if (data.length < 1000) break;
      from += 1000;
    }
    return rows;
  }

  const [users, subjects, attendance, grades] = await Promise.all([
    fetchAll('users', 'id, user_id, name, role, year_level, section, assigned_subjects'),
    fetchAll('subjects', 'id, name, year_level, total_weeks, instructor_name, instructor_id, enrolled_students, excluded_students'),
    fetchAll('attendance', 'student_id, subject_id, week_number, status'),
    fetchAll('grades', 'student_id, subject_id, quiz_1, quiz_2, project, attendance_score, final_grade')
  ]);

  if ((!users || users.length === 0) && (!subjects || subjects.length === 0)) {
    throw new Error('Database fetch returned 0 records. Ensure public.get_system_backup_data RPC migration is executed in Supabase.');
  }

  return { users, subjects, attendance, grades };
}

async function generateExcelWorkbook({ users, subjects, attendance, grades }) {
  console.log('[2/4] Constructing multi-sheet Excel workbook...');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Gradely Cloud Engine';
  workbook.created = new Date();

  // Index attendance: matrix[subject_id][student_id][week_number]
  const attMatrix = {};
  (attendance || []).forEach(r => {
    const subId = String(r.subject_id || '').trim();
    const sId = String(r.student_id || '').trim();
    const wNum = parseInt(r.week_number, 10);
    if (!attMatrix[subId]) attMatrix[subId] = {};
    if (!attMatrix[subId][sId]) attMatrix[subId][sId] = {};
    attMatrix[subId][sId][wNum] = r.status;
  });

  // Index grades: gradesMatrix[subject_id][student_id]
  const gradesMatrix = {};
  (grades || []).forEach(g => {
    const subId = String(g.subject_id || '').trim();
    const sId = String(g.student_id || '').trim();
    if (!gradesMatrix[subId]) gradesMatrix[subId] = {};
    gradesMatrix[subId][sId] = g;
  });

  for (const sub of (subjects || [])) {
    const subId = String(sub.id).trim();
    const totalWeeks = sub.total_weeks || 12;
    const subAtt = attMatrix[subId] || {};
    const subGrades = gradesMatrix[subId] || {};

    // Detect if subject has section attendance (<=50) and/or lecture attendance (>100)
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

    if (!hasSections && !hasLectures) {
      hasSections = true;
    }

    // Filter enrolled students for this subject
    const enrolled = (users || []).filter(u => {
      if (u.role !== 'student') return false;
      const uId = String(u.user_id || '').trim();
      const inSub = Array.isArray(sub.enrolled_students) && sub.enrolled_students.map(e => String(e).trim()).includes(uId);
      const hasAssigned = Array.isArray(u.assigned_subjects) && u.assigned_subjects.some(e => typeof e === 'string' && e.startsWith(subId + ':'));
      return inSub || hasAssigned;
    });

    enrolled.sort((a, b) => {
      const secA = (a.section || '').localeCompare(b.section || '');
      if (secA !== 0) return secA;
      return String(a.user_id).localeCompare(String(b.user_id));
    });

    let sheetName = String(sub.name || 'مادة').replace(/[:\\/?*[\]]/g, '').slice(0, 28);
    if (!sheetName) sheetName = 'مادة ' + subId.slice(0, 6);

    const worksheet = workbook.addWorksheet(sheetName, {
      views: [{ rightToLeft: true }]
    });

    // Build Columns
    const columns = [
      { header: 'الرقم الأكاديمي', key: 'user_id', width: 16 },
      { header: 'اسم الطالب', key: 'name', width: 28 },
      { header: 'السكشن', key: 'section', width: 10 },
      { header: 'الفرقة', key: 'year_level', width: 10 },
      { header: 'كويز 1', key: 'quiz_1', width: 10 },
      { header: 'كويز 2', key: 'quiz_2', width: 10 },
      { header: 'المشروع', key: 'project', width: 10 },
      { header: 'درجة الحضور', key: 'attendance_score', width: 12 },
      { header: 'المجموع الكلي', key: 'final_grade', width: 12 }
    ];

    if (hasSections && hasLectures) {
      for (let w = 1; w <= totalWeeks; w++) {
        columns.push({ header: `سكشن أسبوع ${w}`, key: `sec_w_${w}`, width: 12 });
      }
      for (let w = 1; w <= totalWeeks; w++) {
        columns.push({ header: `محاضرة أسبوع ${w}`, key: `lec_w_${w}`, width: 12 });
      }
    } else if (hasLectures && !hasSections) {
      for (let w = 1; w <= totalWeeks; w++) {
        columns.push({ header: `أسبوع ${w}`, key: `lec_w_${w}`, width: 12 });
      }
    } else {
      for (let w = 1; w <= totalWeeks; w++) {
        columns.push({ header: `أسبوع ${w}`, key: `sec_w_${w}`, width: 12 });
      }
    }

    columns.push(
      { header: 'إجمالي الحضور', key: 'total_present', width: 12 },
      { header: 'إجمالي الغياب', key: 'total_absent', width: 12 },
      { header: 'تأخير / عذر', key: 'total_late_excused', width: 12 },
      { header: 'نسبة الالتزام', key: 'attendance_rate', width: 14 }
    );

    worksheet.columns = columns;

    // Header styling
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' }
    };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

    // Add Data Rows
    enrolled.forEach(stu => {
      const stuId = String(stu.user_id || '').trim();
      const stuGrade = subGrades[stuId] || {};

      let stuSubSec = stu.section || 'S1';
      if (Array.isArray(stu.assigned_subjects)) {
        const m = stu.assigned_subjects.find(e => typeof e === 'string' && e.startsWith(subId + ':'));
        if (m) stuSubSec = m.split(':')[1];
      }

      const rowData = {
        user_id: stu.user_id,
        name: stu.name,
        section: stuSubSec,
        year_level: stu.year_level || sub.year_level || '1',
        quiz_1: stuGrade.quiz_1 != null ? stuGrade.quiz_1 : 0,
        quiz_2: stuGrade.quiz_2 != null ? stuGrade.quiz_2 : 0,
        project: stuGrade.project != null ? stuGrade.project : 0,
        attendance_score: stuGrade.attendance_score != null ? stuGrade.attendance_score : 0,
        final_grade: stuGrade.final_grade != null ? stuGrade.final_grade : 0
      };

      let presentCount = 0;
      let absentCount = 0;
      let lateCount = 0;
      let excusedCount = 0;

      if (hasSections && hasLectures) {
        for (let w = 1; w <= totalWeeks; w++) {
          const secSt = normalizeStatus(subAtt[stuId]?.[w]);
          const secLabel = getStatusLabel(secSt);
          if (secSt === 'present') presentCount++;
          else if (secSt === 'absent') absentCount++;
          else if (secSt === 'late') { lateCount++; presentCount += 0.5; }
          else if (secSt === 'excused') excusedCount++;
          rowData[`sec_w_${w}`] = secLabel;
        }
        for (let w = 1; w <= totalWeeks; w++) {
          const lecSt = normalizeStatus(subAtt[stuId]?.[100 + w]);
          const lecLabel = getStatusLabel(lecSt);
          if (lecSt === 'present') presentCount++;
          else if (lecSt === 'absent') absentCount++;
          else if (lecSt === 'late') { lateCount++; presentCount += 0.5; }
          else if (lecSt === 'excused') excusedCount++;
          rowData[`lec_w_${w}`] = lecLabel;
        }
      } else if (hasLectures && !hasSections) {
        for (let w = 1; w <= totalWeeks; w++) {
          const lecSt = normalizeStatus(subAtt[stuId]?.[100 + w]);
          const lecLabel = getStatusLabel(lecSt);
          if (lecSt === 'present') presentCount++;
          else if (lecSt === 'absent') absentCount++;
          else if (lecSt === 'late') { lateCount++; presentCount += 0.5; }
          else if (lecSt === 'excused') excusedCount++;
          rowData[`lec_w_${w}`] = lecLabel;
        }
      } else {
        for (let w = 1; w <= totalWeeks; w++) {
          const st = normalizeStatus(subAtt[stuId]?.[w]);
          const label = getStatusLabel(st);
          if (st === 'present') presentCount++;
          else if (st === 'absent') absentCount++;
          else if (st === 'late') { lateCount++; presentCount += 0.5; }
          else if (st === 'excused') excusedCount++;
          rowData[`sec_w_${w}`] = label;
        }
      }

      const totalRecorded = presentCount + absentCount + (lateCount * 0.5);
      const attRate = totalRecorded > 0 ? Math.round((presentCount / totalRecorded) * 100) + '%' : '0%';

      rowData.total_present = presentCount;
      rowData.total_absent = absentCount;
      rowData.total_late_excused = lateCount + excusedCount;
      rowData.attendance_rate = attRate;

      const addedRow = worksheet.addRow(rowData);
      addedRow.alignment = { horizontal: 'center', vertical: 'middle' };
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  console.log(`[EXCEL] Generated ${workbook.worksheets.length} sheets (${(buffer.length / 1024).toFixed(1)} KB)`);
  return Buffer.from(buffer);
}

async function sendBackupWebhook(buffer) {
  if (!WEBHOOK_URL) {
    console.log('[INFO] Skipping webhook delivery (no WEBHOOK_URL configured).');
    const localPath = path.join(process.cwd(), 'Gradely_Daily_Backup_Latest.xlsx');
    fs.writeFileSync(localPath, buffer);
    console.log(`[SAVE] Local file saved: ${localPath}`);
    return;
  }

  console.log('[3/4] Uploading Excel backup to Google Apps Script Webhook...');
  const base64 = buffer.toString('base64');
  const nowStr = new Date().toISOString().split('T')[0];
  const filename = `Gradely_Daily_Backup_${nowStr}.xlsx`;

  const payload = {
    email: BACKUP_EMAIL,
    filename,
    fileBase64: base64,
    source: 'github_actions_cron'
  };

  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    redirect: 'follow',
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  console.log(`[4/4] Google Webhook Response (${res.status}): ${text.slice(0, 150)}`);

  if (!res.ok) {
    throw new Error(`Google Apps Script returned status ${res.status}: ${text}`);
  }

  console.log('🎉 [SUCCESS] Daily backup successfully generated and sent to Gmail and Google Drive!');
}

async function main() {
  try {
    const data = await fetchBackupData();
    const excelBuffer = await generateExcelWorkbook(data);
    await sendBackupWebhook(excelBuffer);
    process.exit(0);
  } catch (err) {
    console.error('❌ [ERROR] Automated backup failed:', err);
    process.exit(1);
  }
}

main();
