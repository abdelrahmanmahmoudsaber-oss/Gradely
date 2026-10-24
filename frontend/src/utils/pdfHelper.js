/**
 * Professional Arabic RTL PDF Generator for Student Reports
 * Generates high-resolution A4 Portrait printable reports with Cairo typography,
 * subject breakdown, full weekly attendance grid, and instructor signature section.
 */

import { getSectionInstructorName as resolveSectionTA } from './sectionHelper';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const escapeHtml = (str) => {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

export function printStudentReportPDF({ student, subjects, grades, attendance, options }) {
  const {
    includeAttendanceDetails = true,
    includeGrades = true,
    includeQuizzes = true,
    includeProject = true,
    includeAttendanceScore = true,
    includeTotal = true,
    selectedSubjectIds = null
  } = options || {};

  const filteredSubjects = selectedSubjectIds && selectedSubjectIds.length > 0
    ? subjects.filter(s => selectedSubjectIds.includes(s.id))
    : subjects;

  const inferStudentYear = (stuId, rawLevel = '') => {
    const strId = String(stuId || '').trim();
    const digits = strId.replace(/\D/g, '');
    if (digits.length >= 6) {
      const prefix = digits.slice(0, 2);
      if (prefix === '26') return '1';
      if (prefix === '25') return '2';
      if (prefix === '24') return '3';
      if (prefix === '23' || prefix === '22' || prefix === '21' || prefix === '20') return '4';
    }
    if (rawLevel) {
      const s = rawLevel.toString().trim();
      if (/أول|الأولى/i.test(s) || s === '1') return '1';
      if (/ثاني|الثانية/i.test(s) || s === '2') return '2';
      if (/ثالث|الثالثة/i.test(s) || s === '3') return '3';
      if (/رابع|الرابعة/i.test(s) || s === '4') return '4';
    }
    return '1';
  };

  const normalizeYear = (yr) => {
    if (!yr) return '1';
    return yr.toString().replace('الفرقة ', '').replace('الأولى', '1').replace('الثانية', '2').replace('الثالثة', '3').replace('الرابعة', '4').trim();
  };

  const normalizeSection = (sec) => {
    if (!sec) return 'S1';
    const s = sec.toString().trim().toUpperCase().replace(/\s+/g, '');
    const match = s.match(/(\d+)/);
    if (match) return 'S' + parseInt(match[1], 10);
    return 'S1';
  };

    const formatDisplayDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const monthIndex = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
        if (monthIndex >= 0 && monthIndex < 12) {
          return day + ' ' + months[monthIndex];
        }
      }
      return dateStr;
    } catch (e) {
      return dateStr;
    }
  };

  const getSubjectWeekDate = (sub, weekNum, studentSec, record) => {
    if (sub && Array.isArray(sub.excluded_students)) {
      if (studentSec) {
        const sec = normalizeSection(studentSec);
        const secPrefix = 'WEEK_DATE_W' + weekNum + '_' + sec + ':';
        const secEntry = sub.excluded_students.find(e => typeof e === 'string' && e.startsWith(secPrefix));
        if (secEntry) return secEntry.replace(secPrefix, '');
      }
      const prefix = 'WEEK_DATE_W' + weekNum + ':';
      const entry = sub.excluded_students.find(e => typeof e === 'string' && e.startsWith(prefix));
      if (entry) return entry.replace(prefix, '');
    }
    if (record && record.date) return record.date;
    if (record && record.created_at) {
      try { return record.created_at.split('T')[0]; } catch (e) {}
    }
    return '';
  };

  const getSubjectLectureDate = (sub, weekNum) => {
    if (!sub || !Array.isArray(sub.excluded_students)) return '';
    const prefix = 'LEC_DATE_W' + weekNum + ':';
    const entry = sub.excluded_students.find(e => typeof e === 'string' && e.startsWith(prefix));
    return entry ? entry.replace(prefix, '') : '';
  };

  const getStudentSubSection = (student, subId) => {
    if (student && Array.isArray(student.assigned_subjects)) {
      const match = student.assigned_subjects.find(entry => typeof entry === 'string' && entry.startsWith(subId + ':'));
      if (match) return normalizeSection(match.split(':')[1]);
    }
    return normalizeSection(student?.section || 'S1');
  };

  const currentDate = new Date().toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('يرجى السماح بالنوافذ المنبثقة (Popups) لتوليد ملف الـ PDF');
    return;
  }

  let subjectsHtml = '';

  filteredSubjects.forEach((sub, idx) => {
    const g = grades.find(grd => grd.subject_id === sub.id) || {};
    const normalizeStatus = (status) => {
      if (!status) return 'unrecorded';
      const s = String(status).toLowerCase().trim();
      if (s === 'present' || s === 'حاضر' || s === 'حضور') return 'present';
      if (s === 'absent' || s === 'غائب' || s === 'غياب') return 'absent';
      if (s === 'late' || s === 'تأخير') return 'late';
      if (s === 'excused' || s === 'عذر') return 'excused';
      return s;
    };

    const subAtt = attendance.filter(a => a.subject_id === sub.id);
    const totalAttended = subAtt.filter(a => {
      const s = normalizeStatus(a.status);
      return s === 'present' || s === 'late';
    }).length;
    const totalAbsent = subAtt.filter(a => normalizeStatus(a.status) === 'absent').length;
    const totalWeeks = sub.total_weeks || 12;

    let gradesCardsHtml = '';
    if (includeGrades) {
      gradesCardsHtml = `
        <table class="grades-table">
          <thead>
            <tr>
              ${includeQuizzes ? '<th>كويز 1</th><th>كويز 2</th>' : ''}
              ${includeProject ? '<th>المشروع</th>' : ''}
              ${includeAttendanceScore ? '<th>درجة الحضور</th>' : ''}
              ${includeTotal ? '<th class="total-th">المجموع الكلي</th>' : ''}
            </tr>
          </thead>
          <tbody>
            <tr>
              ${includeQuizzes ? `<td>${g.quiz_1 !== null && g.quiz_1 !== undefined ? g.quiz_1 : 'لم ترصد'}</td><td>${g.quiz_2 !== null && g.quiz_2 !== undefined ? g.quiz_2 : 'لم ترصد'}</td>` : ''}
              ${includeProject ? `<td>${g.project !== null && g.project !== undefined ? g.project : 'لم ترصد'}</td>` : ''}
              ${includeAttendanceScore ? `<td style="color: #059669; font-weight: bold;">${g.attendance_score !== null && g.attendance_score !== undefined ? g.attendance_score : 'لم ترصد'}</td>` : ''}
              ${includeTotal ? `<td class="total-td">${(g.quiz_1 || 0) + (g.quiz_2 || 0) + (g.project || 0) + (g.attendance_score || 0)}</td>` : ''}
            </tr>
          </tbody>
        </table>
      `;
    }

    let weeksGridHtml = '';
    if (includeAttendanceDetails) {
      let sectionCells = '';
      for (let w = 1; w <= totalWeeks; w++) {
        const record = subAtt.find(a => a.week_number === w);
        let statusText = '—';
        let statusClass = 'unrecorded';
        const stuSec = getStudentSubSection(student, sub.id);
        const wDate = getSubjectWeekDate(sub, w, stuSec, record);
        let dateHint = wDate ? `<div class="w-date" style="color:#2563eb;font-weight:bold;font-size:0.65rem;">${escapeHtml(formatDisplayDate(wDate))}</div>` : '';
        
        if (record) {
          const norm = normalizeStatus(record.status);
          if (norm === 'present') { statusText = 'حاضر ✓'; statusClass = 'present'; }
          else if (norm === 'absent') { statusText = 'غائب ✗'; statusClass = 'absent'; }
          else if (norm === 'late') { statusText = 'تأخير'; statusClass = 'late'; }
          else if (norm === 'excused') { 
            statusText = `عذر${record.excuse_reason ? '*' : ''}`; 
            statusClass = 'excused'; 
          }
        }
        sectionCells += `
          <div class="week-cell ${statusClass}">
            <div class="w-num">أسبوع ${w}</div>
            <div class="w-status">${statusText}</div>
            ${dateHint}
          </div>
        `;
      }

      let lectureSectionHtml = '';
      const hasLectureRecords = subAtt.some(a => a.week_number > 100);
      if (hasLectureRecords) {
        let lectureCells = '';
        for (let w = 1; w <= totalWeeks; w++) {
          const record = subAtt.find(a => a.week_number === (100 + w));
          let statusText = '—';
          let statusClass = 'unrecorded';
          const wDate = getSubjectLectureDate(sub, w) || (record?.created_at ? record.created_at.split('T')[0] : '');
          let dateHint = wDate ? `<div class="w-date" style="color:#0d9488;font-weight:bold;font-size:0.65rem;">${escapeHtml(formatDisplayDate(wDate))}</div>` : '';
          
          if (record) {
            const norm = normalizeStatus(record.status);
            if (norm === 'present') { statusText = 'حاضر ✓'; statusClass = 'present'; }
            else if (norm === 'absent') { statusText = 'غائب ✗'; statusClass = 'absent'; }
            else if (norm === 'late') { statusText = 'تأخير'; statusClass = 'late'; }
            else if (norm === 'excused') { 
              statusText = `عذر${record.excuse_reason ? '*' : ''}`; 
              statusClass = 'excused'; 
            }
          }
          lectureCells += `
            <div class="week-cell ${statusClass}">
              <div class="w-num">محاضرة ${w}</div>
              <div class="w-status">${statusText}</div>
              ${dateHint}
            </div>
          `;
        }
        lectureSectionHtml = `
          <div class="weeks-title" style="margin-top:8px;">🏛️ تفاصيل حضور وغياب المحاضرات:</div>
          <div class="weeks-grid">
            ${lectureCells}
          </div>
        `;
      }

      weeksGridHtml = `
        <div class="weeks-container">
          <div class="weeks-title">🏢 تفاصيل حضور وغياب السكاشن:</div>
          <div class="weeks-grid">
            ${sectionCells}
          </div>
          ${lectureSectionHtml}
        </div>
      `;
    }

    const studentSec = getStudentSubSection(student, sub.id);
    const taName = (typeof options?.getSectionInstructorName === 'function')
      ? options.getSectionInstructorName(sub.id, studentSec)
      : resolveSectionTA(sub, studentSec);

    subjectsHtml += `
      <div class="subject-block">
        <div class="subject-head">
          <span class="sub-name">${idx + 1}. ${escapeHtml(sub.name)} (فرقة المقرر: ${escapeHtml(normalizeYear(sub.year_level))}) — <strong style="color: #059669;">السكشن: ${escapeHtml(studentSec)}</strong></span>
          <span class="sub-instructor">المشرف / المعيد: <strong>${escapeHtml(taName)}</strong></span>
        </div>
        ${gradesCardsHtml}
        ${weeksGridHtml}
        <div class="subject-stats">
          <span>إجمالي المحاضرات المحضورة: <strong>${totalAttended}</strong></span>
          <span>إجمالي الغياب: <strong style="color: #dc2626;">${totalAbsent}</strong></span>
        </div>
      </div>
    `;
  });

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>التقرير الأكاديمي - ${escapeHtml(student.name)}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
      <style>
        @page {
          size: A4 portrait;
          margin: 10mm 12mm;
        }
        * { box-sizing: border-box; }
        body {
          font-family: 'Cairo', sans-serif;
          background: #ffffff;
          color: #1e293b;
          margin: 0;
          padding: 0;
          font-size: 12px;
          direction: rtl;
        }
        .header-table {
          width: 100%;
          border-bottom: 2px solid #4f46e5;
          padding-bottom: 8px;
          margin-bottom: 12px;
        }
        .app-title { font-size: 20px; font-weight: 800; color: #4f46e5; margin: 0; }
        .app-subtitle { font-size: 11px; color: #64748b; margin-top: 2px; }
        
        .student-info-box {
          background: #f8fafc;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 10px 14px;
          margin-bottom: 14px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .student-name { font-size: 16px; font-weight: 800; color: #0f172a; margin: 0; }
        .meta-tags { display: flex; gap: 8px; margin-top: 4px; }
        .tag {
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 700;
        }
        .tag-id { background: #e2e8f0; color: #334155; }
        .tag-year { background: #e0e7ff; color: #4338ca; }
        .tag-sec { background: #dcfce7; color: #15803d; }

        .subject-block {
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 10px 12px;
          margin-bottom: 12px;
          page-break-inside: avoid;
        }
        .subject-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 6px;
          margin-bottom: 8px;
        }
        .sub-name { font-size: 14px; font-weight: 800; color: #1e293b; }
        .sub-instructor { font-size: 11px; color: #64748b; }

        .grades-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 8px;
          font-size: 11.5px;
        }
        .grades-table th, .grades-table td {
          border: 1px solid #cbd5e1;
          padding: 5px 8px;
          text-align: center;
        }
        .grades-table th {
          background: #f1f5f9;
          font-weight: 700;
          color: #475569;
        }
        .total-th { background: #e0e7ff !important; color: #4338ca !important; }
        .total-td { background: #eef2ff; font-weight: 800; color: #4f46e5; font-size: 13px; }

        .weeks-container {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          padding: 6px 8px;
          margin-bottom: 6px;
        }
        .weeks-title { font-size: 10.5px; font-weight: 700; color: #475569; margin-bottom: 4px; }
        .weeks-grid {
          display: grid;
          grid-template-columns: repeat(12, 1fr);
          gap: 3px;
        }
        .week-cell {
          border: 1px solid #cbd5e1;
          border-radius: 3px;
          padding: 3px 1px;
          text-align: center;
          font-size: 8.5px;
        }
        .w-num { font-weight: 700; color: #64748b; font-size: 8px; margin-bottom: 1px; }
        .w-status { font-weight: 800; font-size: 9px; }
        .w-date { font-size: 7.5px; color: #94a3b8; }

        .present { background: #ecfdf5; border-color: #a7f3d0; color: #065f46; }
        .absent { background: #fef2f2; border-color: #fecaca; color: #991b1b; }
        .late { background: #fffbeb; border-color: #fde68a; color: #92400e; }
        .excused { background: #eff6ff; border-color: #bfdbfe; color: #1e40af; }
        .unrecorded { background: #f8fafc; color: #94a3b8; }

        .subject-stats {
          display: flex;
          justify-content: space-between;
          font-size: 10.5px;
          color: #64748b;
          border-top: 1px dashed #e2e8f0;
          padding-top: 5px;
          margin-top: 4px;
        }

        .signatures-area {
          margin-top: 25px;
          padding-top: 15px;
          border-top: 1px solid #94a3b8;
          display: flex;
          justify-content: space-between;
          page-break-inside: avoid;
        }
        .sig-box {
          width: 45%;
          text-align: center;
          font-size: 11.5px;
          font-weight: 700;
          color: #334155;
        }
        .sig-line {
          margin-top: 25px;
          border-bottom: 1px dashed #64748b;
          width: 80%;
          margin-left: auto;
          margin-right: auto;
        }
      </style>
    </head>
    <body>
      <table class="header-table">
        <tr>
          <td>
            <h1 class="app-title">Gradely — التقرير الأكاديمي وسجل الحضور</h1>
            <div class="app-subtitle">كشف رسمي معتمد لأعمال الفصل والالتزام الأسبوعي</div>
          </td>
          <td style="text-align: left;">
            <div style="font-size: 11px; font-weight: 700; color: #334155;">تاريخ الاستخراج:</div>
            <div style="font-size: 10.5px; color: #64748b;">${currentDate}</div>
          </td>
        </tr>
      </table>

      <div class="student-info-box">
        <div>
          <h2 class="student-name">${escapeHtml(student.name)}</h2>
          <div class="meta-tags">
            <span class="tag tag-id">الرقم الأكاديمي: ${escapeHtml(student.user_id)}</span>
            <span class="tag tag-year">الفرقة ${escapeHtml(inferStudentYear(student.user_id, student.year_level))}</span>
            <span class="tag tag-sec">السكشن: ${escapeHtml(normalizeSection(student.section || 'S1'))}</span>
          </div>
        </div>
      </div>

      ${subjectsHtml}

      <div class="signatures-area">
        <div class="sig-box">
          <div>توقيع معيد / مشرف المادة</div>
          <div class="sig-line"></div>
        </div>
        <div class="sig-box">
          <div>اعتماد أستاذ المادة</div>
          <div class="sig-line"></div>
        </div>
      </div>

      <script>
        window.onload = function() {
          window.focus();
          window.print();
        };
      </script>
    </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();
}

/**
 * Generates and prints ultra-compact A4 admission/credential slips for students.
 * Ultra-tight layout: 30 to 33 students per page (3 columns x 10-11 rows) with zero wasted space.
 */
export function printStudentCredentialsSlips({ credentialsList, title = 'كروت كلمات المرور' }) {
  if (!Array.isArray(credentialsList) || credentialsList.length === 0) {
    alert('لا توجد بيانات طلاب لطباعة الكروت');
    return;
  }

  const inferStudentYear = (stuId, rawLevel = '') => {
    const strId = String(stuId || '').trim();
    const digits = strId.replace(/\D/g, '');
    if (digits.length >= 6) {
      const prefix = digits.slice(0, 2);
      if (prefix === '26') return '1';
      if (prefix === '25') return '2';
      if (prefix === '24') return '3';
      if (prefix === '23' || prefix === '22' || prefix === '21' || prefix === '20') return '4';
    }
    if (rawLevel) {
      const s = rawLevel.toString().trim();
      if (/أول|الأولى/i.test(s) || s === '1') return '1';
      if (/ثاني|الثانية/i.test(s) || s === '2') return '2';
      if (/ثاني|الثانية/i.test(s) || s === '2') return '2';
      if (/ثالث|الثالثة/i.test(s) || s === '3') return '3';
      if (/رابع|الرابعة/i.test(s) || s === '4') return '4';
    }
    return '1';
  };

  const normalizeSection = (sec) => {
    if (!sec) return 'S1';
    const s = sec.toString().trim().toUpperCase().replace(/\s+/g, '');
    const match = s.match(/(\d+)/);
    if (match) return 'S' + parseInt(match[1], 10);
    return 'S1';
  };

  const cardsHtml = credentialsList.map((item) => `
    <div class="card-item">
      <div class="card-header-bar">
        <span class="st-name">${escapeHtml(item.name || 'طالب')}</span>
        <span class="st-meta">الفرقة ${escapeHtml(inferStudentYear(item.user_id, item.year_level))} - ${escapeHtml(normalizeSection(item.section))}</span>
      </div>

      <div class="field-row">
        <div class="field-label-group">
          <svg class="field-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
          </svg>
          <span class="field-label">USER</span>
        </div>
        <div class="field-input-box user-box">${escapeHtml(item.user_id)}</div>
      </div>

      <div class="field-row">
        <div class="field-label-group">
          <svg class="field-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
          </svg>
          <span class="field-label">PASSWORD</span>
        </div>
        <div class="field-input-box pass-box">${escapeHtml(item.password)}</div>
      </div>

      <div class="card-bottom-bar">
        <div class="card-h-line"></div>
        <div class="corner-slashes">
          <span></span><span></span><span></span>
        </div>
      </div>
    </div>
  `).join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8" />
      <title>${escapeHtml(title)}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@600;700;800;900&family=Inter:wght@600;700;800&family=JetBrains+Mono:wght@700;800&display=swap" rel="stylesheet">
      <style>
        @page {
          size: A4 portrait;
          margin: 6mm 7mm;
        }
        * {
          box-sizing: border-box !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        html, body {
          width: 100%;
          max-width: 100%;
          margin: 0;
          padding: 0;
          background: #ffffff;
          color: #000000;
          font-family: 'Inter', 'Cairo', -apple-system, BlinkMacSystemFont, sans-serif;
          overflow-x: hidden;
        }
        .cards-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 2.5mm 2.5mm;
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
        }
        .card-item {
          border: 1.4px solid #111111;
          border-radius: 9px;
          padding: 4px 7px 3.5px 7px;
          background: #ffffff;
          page-break-inside: avoid;
          break-inside: avoid;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          height: 29mm;
          box-sizing: border-box;
          position: relative;
          min-width: 0;
          overflow: hidden;
        }
        .card-header-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          direction: rtl;
          gap: 4px;
          margin-bottom: 2px;
          line-height: 1.1;
        }
        .st-name {
          font-family: 'Cairo', sans-serif;
          font-size: 8.5px;
          font-weight: 800;
          color: #111111;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 1;
          text-align: right;
        }
        .st-meta {
          font-family: 'Cairo', sans-serif;
          font-size: 7.5px;
          font-weight: 700;
          color: #333333;
          background: #f1f5f9;
          border: 0.8px solid #cbd5e1;
          padding: 0.5px 4px;
          border-radius: 3px;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .field-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          direction: ltr;
          gap: 5px;
          margin: 1.2px 0;
        }
        .field-label-group {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-shrink: 0;
        }
        .field-icon {
          width: 12.5px;
          height: 12.5px;
          color: #111111;
        }
        .field-label {
          font-family: 'Inter', sans-serif;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: 0.5px;
          color: #111111;
        }
        .field-input-box {
          flex: 1;
          max-width: 37mm;
          border: 1.2px solid #222222;
          border-radius: 12px;
          background: #ffffff;
          padding: 1.5px 6px;
          text-align: center;
          font-family: 'JetBrains Mono', 'Consolas', monospace;
          font-size: 9.5px;
          font-weight: 800;
          color: #000000;
          letter-spacing: 0.4px;
          line-height: 1.2;
          box-shadow: inset 0 1px 2px rgba(0,0,0,0.04);
        }
        .card-bottom-bar {
          display: flex;
          align-items: center;
          gap: 6px;
          direction: ltr;
          margin-top: 1.5px;
          height: 5px;
        }
        .card-h-line {
          flex: 1;
          height: 1px;
          background: #333333;
        }
        .corner-slashes {
          display: flex;
          gap: 2px;
        }
        .corner-slashes span {
          display: block;
          width: 3.2px;
          height: 5.5px;
          background: #111111;
          transform: skewX(-26deg);
          border-radius: 0.5px;
        }
        @media print {
          .no-print-toolbar {
            display: none !important;
          }
        }
        .no-print-toolbar {
          background: #0f172a;
          color: white;
          padding: 10px 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          position: sticky;
          top: 0;
          z-index: 9999;
          box-shadow: 0 2px 8px rgba(0,0,0,0.25);
          font-family: 'Cairo', sans-serif;
          margin-bottom: 8px;
        }
        .print-btn {
          background: #4f46e5;
          color: white;
          border: none;
          padding: 8px 18px;
          border-radius: 6px;
          font-weight: 800;
          font-size: 13px;
          cursor: pointer;
          font-family: inherit;
        }
        .print-btn:hover {
          background: #4338ca;
        }
      </style>
    </head>
    <body>
      <div class="no-print-toolbar">
        <span style="font-weight:800;font-size:14px;">🖨️ كروت بيانات دخول الطلاب (A4) - جاهز للطباعة والقص</span>
        <button class="print-btn" onclick="window.print()">📄 اضغط للطباعة / الحفظ كـ PDF (Ctrl + P)</button>
      </div>

      <div class="cards-grid">
        ${cardsHtml}
      </div>

      <script>
        window.addEventListener('load', function() {
          setTimeout(function() {
            try {
              window.focus();
              window.print();
            } catch (e) {}
          }, 500);
        });
      </script>
    </body>
    </html>
  `;

  try {
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    
    // 1. Try direct window.open
    const printWindow = window.open(blobUrl, '_blank');
    if (printWindow) {
      setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
      return;
    }

    // 2. If blocked by popup blocker, try temporary anchor click
    const a = document.createElement('a');
    a.href = blobUrl;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
  } catch (err) {
    console.error('Error opening print preview:', err);
    // 3. Last fallback: inline document open
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(htmlContent);
      printWindow.document.close();
    } else {
      alert('يرجى السماح بالنوافذ المنبثقة (Popups) لعرض كروت الطباعة');
    }
  }
}

/**
 * Generates and downloads an official A4 Week Attendance Sheet PDF directly to device.
 * Paginated cleanly per page to prevent row cutting or missing headers.
 * Uses html2canvas + jsPDF for direct file download on mobile and PC.
 */
export async function printWeekAttendancePDF({
  subjectName = 'المقرر الدراسي',
  yearLevel = '',
  sectionName = 'الكل',
  groupName = '',
  weekNum = 1,
  sessionDate = '',
  instructorName = 'معيد المادة',
  attendanceType = 'section',
  filterType = 'all',
  students = [],
  attendanceRecords = {},
  excuseReasons = {},
  getStudentSubSection = (s) => s.section || 'S1',
  getStudentLectureGroup = () => 'A',
  filename = '',
  onProgress = null
}) {
  const isLecture = attendanceType === 'lecture';
  const typeLabel = isLecture ? 'محاضرة' : 'سكشن';

  let countPresent = 0;
  let countAbsent = 0;
  let countLate = 0;
  let countExcused = 0;
  let countUnrecorded = 0;

  students.forEach(s => {
    const st = attendanceRecords[s.user_id];
    if (st === 'present') countPresent++;
    else if (st === 'absent') countAbsent++;
    else if (st === 'late') countLate++;
    else if (st === 'excused') countExcused++;
    else countUnrecorded++;
  });

  const buildRowHtml = (s, globalIdx) => {
    const st = attendanceRecords[s.user_id];
    let badgeBg = '#f1f5f9';
    let badgeColor = '#64748b';
    let badgeBorder = '#cbd5e1';
    let statusText = 'لم يرصد';

    if (st === 'present') {
      badgeBg = '#dcfce7';
      badgeColor = '#15803d';
      badgeBorder = '#86efac';
      statusText = 'حاضر';
    } else if (st === 'absent') {
      badgeBg = '#fee2e2';
      badgeColor = '#b91c1c';
      badgeBorder = '#fca5a5';
      statusText = 'غائب';
    } else if (st === 'late') {
      badgeBg = '#fef3c7';
      badgeColor = '#b45309';
      badgeBorder = '#fcd34d';
      statusText = 'تأخير';
    } else if (st === 'excused') {
      badgeBg = '#dbeafe';
      badgeColor = '#1d4ed8';
      badgeBorder = '#93c5fd';
      statusText = 'عذر';
    }

    const sec = getStudentSubSection(s);
    const grp = getStudentLectureGroup ? getStudentLectureGroup(s) : 'A';

    return `
      <tr style="border-bottom: 1px solid #cbd5e1; background-color: ${globalIdx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
        <td style="text-align:center;font-weight:bold;color:#64748b;padding:5px 4px;border:1px solid #cbd5e1;font-size:11px;">${globalIdx + 1}</td>
        <td style="text-align:center;font-family:monospace;font-weight:bold;padding:5px 6px;border:1px solid #cbd5e1;color:#1e293b;font-size:11px;">${escapeHtml(s.user_id)}</td>
        <td style="font-weight:600;padding:5px 8px;border:1px solid #cbd5e1;color:#0f172a;text-align:right;font-size:11.5px;word-break:break-word;">${escapeHtml(s.name)}</td>
        <td style="text-align:center;padding:5px 4px;border:1px solid #cbd5e1;color:#334155;font-size:11px;">${escapeHtml(sec)}</td>
        <td style="text-align:center;font-weight:bold;color:#0d9488;padding:5px 4px;border:1px solid #cbd5e1;font-size:11px;">${escapeHtml(grp)}</td>
        <td style="text-align:center;padding:5px 4px;border:1px solid #cbd5e1;">
          <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10.5px;font-weight:700;background-color:${badgeBg};color:${badgeColor};border:1px solid ${badgeBorder};">${statusText}</span>
        </td>
        <td style="text-align:center;min-width:65px;padding:5px 4px;border:1px solid #cbd5e1;">&nbsp;</td>
      </tr>
    `;
  };

  const theadHtml = `
    <thead>
      <tr style="background:#1e293b;color:#ffffff;">
        <th style="width:35px;padding:7px 4px;border:1px solid #1e293b;font-weight:700;text-align:center;font-size:11.5px;">م</th>
        <th style="width:95px;padding:7px 4px;border:1px solid #1e293b;font-weight:700;text-align:center;font-size:11.5px;">الرقم الأكاديمي</th>
        <th style="padding:7px 8px;border:1px solid #1e293b;font-weight:700;text-align:right;font-size:11.5px;">اسم الطالب</th>
        <th style="width:60px;padding:7px 4px;border:1px solid #1e293b;font-weight:700;text-align:center;font-size:11.5px;">السكشن</th>
        <th style="width:60px;padding:7px 4px;border:1px solid #1e293b;font-weight:700;text-align:center;font-size:11.5px;">الجروب</th>
        <th style="width:80px;padding:7px 4px;border:1px solid #1e293b;font-weight:700;text-align:center;font-size:11.5px;">الحالة</th>
        <th style="width:70px;padding:7px 4px;border:1px solid #1e293b;font-weight:700;text-align:center;font-size:11.5px;">الدرجة</th>
      </tr>
    </thead>
  `;

  // Safe pagination chunks:
  // Page 1 has header, meta-card, stats bar, table header -> fits 20 students comfortably.
  // Page 2+ has compact header, table header -> fits 24 students comfortably.
  const PAGE_1_MAX = 20;
  const PAGE_N_MAX = 24;

  let pageChunks = [];
  if (students.length === 0) {
    pageChunks.push([]);
  } else if (students.length <= 22) {
    pageChunks.push(students);
  } else {
    pageChunks.push(students.slice(0, PAGE_1_MAX));
    let start = PAGE_1_MAX;
    while (start < students.length) {
      pageChunks.push(students.slice(start, start + PAGE_N_MAX));
      start += PAGE_N_MAX;
    }
  }

  const totalPages = pageChunks.length;
  const safeFilename = (filename || `Attendance_${subjectName}_Week${weekNum}.pdf`).replace(/[/\\?%*:|"<>]/g, '_');
  const finalFilename = safeFilename.endsWith('.pdf') ? safeFilename : `${safeFilename}.pdf`;

  // Create wrapper off-screen but visible to html2canvas
  const wrapper = document.createElement('div');
  wrapper.id = 'attendance-pdf-render-wrapper';
  wrapper.style.position = 'fixed';
  wrapper.style.left = '0';
  wrapper.style.top = '0';
  wrapper.style.zIndex = '-9999';
  wrapper.style.opacity = '1';
  wrapper.style.pointerEvents = 'none';
  wrapper.style.backgroundColor = '#ffffff';

  const pageElements = [];
  let globalStudentOffset = 0;

  for (let pIdx = 0; pIdx < totalPages; pIdx++) {
    const chunk = pageChunks[pIdx];
    const pageDiv = document.createElement('div');
    pageDiv.setAttribute('dir', 'rtl');
    pageDiv.style.width = '794px';
    pageDiv.style.height = '1120px';
    pageDiv.style.maxHeight = '1120px';
    pageDiv.style.boxSizing = 'border-box';
    pageDiv.style.padding = '22px 26px';
    pageDiv.style.backgroundColor = '#ffffff';
    pageDiv.style.color = '#0f172a';
    pageDiv.style.fontFamily = "'Cairo', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    pageDiv.style.display = 'flex';
    pageDiv.style.flexDirection = 'column';
    pageDiv.style.justifyContent = 'space-between';
    pageDiv.style.overflow = 'hidden';

    let pageHeaderHtml = '';
    if (pIdx === 0) {
      pageHeaderHtml = `
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #0f172a;padding-bottom:8px;margin-bottom:10px;">
            <div>
              <h1 style="margin:0;font-size:19px;font-weight:800;color:#1e1b4b;">كشف حضور وغياب الطلاب (${escapeHtml(typeLabel)})</h1>
            </div>
            <div style="text-align:left;font-size:11.5px;color:#64748b;">
              <div>تاريخ الطباعة: ${escapeHtml(new Date().toLocaleDateString('ar-EG'))}</div>
              <div style="font-weight:700;color:#0f172a;margin-top:2px;">الأسبوع ${escapeHtml(weekNum)}</div>
            </div>
          </div>

          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;margin-bottom:10px;display:grid;grid-template-columns:repeat(3, 1fr);gap:6px;font-size:12px;">
            <div><span style="color:#64748b;font-weight:600;">المادة:</span> <span style="color:#0f172a;font-weight:700;">${escapeHtml(subjectName)}</span></div>
            <div><span style="color:#64748b;font-weight:600;">الفرقة:</span> <span style="color:#0f172a;font-weight:700;">${escapeHtml(yearLevel ? 'الفرقة ' + yearLevel : '—')}</span></div>
            <div><span style="color:#64748b;font-weight:600;">المجموعة:</span> <span style="color:#0f172a;font-weight:700;">${escapeHtml(groupName || sectionName || 'A / B')}</span></div>
            <div><span style="color:#64748b;font-weight:600;">تاريخ الجلسة:</span> <span style="color:#0f172a;font-weight:700;">${escapeHtml(sessionDate || '—')}</span></div>
            <div><span style="color:#64748b;font-weight:600;">المعيد:</span> <span style="color:#0f172a;font-weight:700;">${escapeHtml(instructorName || '—')}</span></div>
          </div>

          <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;font-size:11.5px;">
            <div style="padding:3px 8px;border-radius:5px;font-weight:700;background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;">إجمالي المعروضين: ${students.length}</div>
            <div style="padding:3px 8px;border-radius:5px;font-weight:700;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;">حاضر: ${countPresent}</div>
            <div style="padding:3px 8px;border-radius:5px;font-weight:700;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;">غائب: ${countAbsent}</div>
            <div style="padding:3px 8px;border-radius:5px;font-weight:700;background:#fffbeb;color:#b45309;border:1px solid #fde68a;">تأخير: ${countLate}</div>
            <div style="padding:3px 8px;border-radius:5px;font-weight:700;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;">عذر: ${countExcused}</div>
          </div>
        </div>
      `;
    } else {
      pageHeaderHtml = `
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #0f172a;padding-bottom:8px;margin-bottom:10px;">
          <div>
            <h2 style="margin:0;font-size:15px;font-weight:800;color:#1e1b4b;">كشف حضور وغياب الطلاب (${escapeHtml(typeLabel)}) - تابع</h2>
            <div style="font-size:11px;color:#475569;margin-top:2px;">
              المادة: <strong>${escapeHtml(subjectName)}</strong> | الأسبوع: <strong>${escapeHtml(weekNum)}</strong> | المجموعة: <strong>${escapeHtml(groupName || sectionName || 'A / B')}</strong>
            </div>
          </div>
          <div style="text-align:left;font-size:11px;color:#64748b;font-weight:700;">
            <div>صفحة ${pIdx + 1} من ${totalPages}</div>
            <div style="font-size:10px;color:#94a3b8;font-weight:normal;margin-top:2px;">${escapeHtml(new Date().toLocaleDateString('ar-EG'))}</div>
          </div>
        </div>
      `;
    }

    const chunkRowsHtml = chunk.map((s, idx) => buildRowHtml(s, globalStudentOffset + idx)).join('');
    globalStudentOffset += chunk.length;

    pageDiv.innerHTML = `
      <div style="flex:1;">
        ${pageHeaderHtml}
        <table style="width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:10px;">
          ${theadHtml}
          <tbody>
            ${chunkRowsHtml || '<tr><td colspan="7" style="text-align:center;padding:20px;color:#94a3b8;border:1px solid #cbd5e1;">لا توجد سجلات مطابقة</td></tr>'}
          </tbody>
        </table>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid #e2e8f0;padding-top:8px;margin-top:auto;font-size:10.5px;color:#94a3b8;">
        <div>منصة Gradely الأكاديمية</div>
        <div style="font-weight:700;color:#64748b;">صفحة ${pIdx + 1} من ${totalPages}</div>
        <div>تاريخ التصدير: ${escapeHtml(new Date().toLocaleDateString('ar-EG'))}</div>
      </div>
    `;

    wrapper.appendChild(pageDiv);
    pageElements.push(pageDiv);
  }

  document.body.appendChild(wrapper);

  try {
    if (document.fonts && document.fonts.ready) {
      try {
        await document.fonts.ready;
      } catch (e) {
        // ignore font readiness error
      }
    }
    // Allow browser layout flush
    await new Promise(resolve => setTimeout(resolve, 80));

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = 210; // mm
    const pdfHeight = 297; // mm

    for (let i = 0; i < pageElements.length; i++) {
      if (typeof onProgress === 'function') {
        onProgress(i + 1, totalPages);
      }

      const pageEl = pageElements[i];
      const canvas = await html2canvas(pageEl, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: 794
      });

      if (i > 0) {
        pdf.addPage();
      }

      const pageImgData = canvas.toDataURL('image/jpeg', 0.95);
      pdf.addImage(pageImgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
    }

    const blob = pdf.output('blob');
    const blobUrl = URL.createObjectURL(blob);

    // Trigger direct native file download (mobile & desktop)
    try {
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = finalFilename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try {
          document.body.removeChild(a);
        } catch (e) {}
      }, 4000);
    } catch (saveErr) {
      pdf.save(finalFilename);
    }

    return {
      success: true,
      blob,
      blobUrl,
      filename: finalFilename
    };
  } catch (err) {
    console.error('Canvas PDF export failed, fallback to print window:', err);
    // Graceful fallback to HTML print if canvas failed
    const blob = new Blob([wrapper.innerHTML], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    return {
      success: true,
      blob,
      blobUrl,
      filename: finalFilename
    };
  } finally {
    if (wrapper.parentNode) {
      wrapper.parentNode.removeChild(wrapper);
    }
  }
}




