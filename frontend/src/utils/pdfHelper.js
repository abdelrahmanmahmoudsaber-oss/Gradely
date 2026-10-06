/**
 * Professional Arabic RTL PDF Generator for Student Reports
 * Generates high-resolution A4 Portrait printable reports with Cairo typography,
 * subject breakdown, full weekly attendance grid, and instructor signature section.
 */

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

  const getSubjectWeekDate = (sub, weekNum) => {
    if (!sub || !Array.isArray(sub.excluded_students)) return '';
    const prefix = 'WEEK_DATE_W' + weekNum + ':';
    const entry = sub.excluded_students.find(e => typeof e === 'string' && e.startsWith(prefix));
    return entry ? entry.replace(prefix, '') : '';
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
    const subAtt = attendance.filter(a => a.subject_id === sub.id);
    const totalAttended = subAtt.filter(a => a.status === 'present' || a.status === 'late').length;
    const totalAbsent = subAtt.filter(a => a.status === 'absent').length;
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
      let weeksCells = '';
      for (let w = 1; w <= totalWeeks; w++) {
        const record = subAtt.find(a => a.week_number === w);
        let statusText = '—';
        let statusClass = 'unrecorded';
        const wDate = getSubjectWeekDate(sub, w);
        let dateHint = wDate ? `<div class="w-date" style="color:#2563eb;font-weight:bold;font-size:0.65rem;">${formatDisplayDate(wDate)}</div>` : '';
        
        if (record) {
          if (record.status === 'present') { statusText = 'حاضر ✓'; statusClass = 'present'; }
          else if (record.status === 'absent') { statusText = 'غائب ✗'; statusClass = 'absent'; }
          else if (record.status === 'late') { statusText = 'تأخير'; statusClass = 'late'; }
          else if (record.status === 'excused') { 
            const reasonStr = record.excuse_reason ? ` title="${record.excuse_reason}"` : '';
            statusText = `عذر${record.excuse_reason ? '*' : ''}`; 
            statusClass = 'excused'; 
          }
        }
        weeksCells += `
          <div class="week-cell ${statusClass}">
            <div class="w-num">أسبوع ${w}</div>
            <div class="w-status">${statusText}</div>
            ${dateHint}
          </div>
        `;
      }

      weeksGridHtml = `
        <div class="weeks-container">
          <div class="weeks-title">📅 تفاصيل سجل الحضور والغياب الأسبوعي:</div>
          <div class="weeks-grid">
            ${weeksCells}
          </div>
        </div>
      `;
    }

    subjectsHtml += `
      <div class="subject-block">
        <div class="subject-head">
          <span class="sub-name">${idx + 1}. ${sub.name} (فرقة المقرر: ${normalizeYear(sub.year_level)}) — <strong style="color: #059669;">السكشن: ${getStudentSubSection(student, sub.id)}</strong></span>
          <span class="sub-instructor">المشرف / المعيد: <strong>${sub.instructor_name || 'المدير الرئيسي'}</strong></span>
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
      <title>التقرير الأكاديمي - ${student.name}</title>
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
          <h2 class="student-name">${student.name}</h2>
          <div class="meta-tags">
            <span class="tag tag-id">الرقم الأكاديمي: ${student.user_id}</span>
            <span class="tag tag-year">الفرقة ${inferStudentYear(student.user_id, student.year_level)}</span>
            <span class="tag tag-sec">السكشن: ${normalizeSection(student.section || 'S1')}</span>
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
        <span class="st-name">${item.name || 'طالب'}</span>
        <span class="st-meta">الفرقة ${inferStudentYear(item.user_id, item.year_level)} - ${normalizeSection(item.section)}</span>
      </div>

      <div class="field-row">
        <div class="field-label-group">
          <svg class="field-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
          </svg>
          <span class="field-label">USER</span>
        </div>
        <div class="field-input-box user-box">${item.user_id}</div>
      </div>

      <div class="field-row">
        <div class="field-label-group">
          <svg class="field-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
          </svg>
          <span class="field-label">PASSWORD</span>
        </div>
        <div class="field-input-box pass-box">${item.password}</div>
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
      <title>${title}</title>
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



