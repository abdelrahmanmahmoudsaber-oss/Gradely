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
            <span class="tag tag-year">الفرقة ${normalizeYear(student.year_level)}</span>
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
 * Optimized for 18 to 21 students per page (3 columns x 6-7 rows) with cuttable dashed borders.
 */
export function printStudentCredentialsSlips({ credentialsList, title = 'كروت كلمات المرور' }) {
  if (!Array.isArray(credentialsList) || credentialsList.length === 0) {
    alert('لا توجد بيانات طلاب لطباعة الكروت');
    return;
  }

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('يرجى السماح بالنوافذ المنبثقة (Popups) لطباعة الكروت');
    return;
  }

  const cardsHtml = credentialsList.map((item) => `
    <div class="credential-card">
      <div class="card-top-row">
        <span class="student-name" title="${item.name}">${item.name || 'طالب'}</span>
        <span class="meta-tag">ف${item.year_level || '1'} | ${item.section || 'S1'}</span>
      </div>
      
      <div class="card-creds-row">
        <div class="cred-item">
          <span class="cred-label">ID:</span>
          <span class="cred-val ltr-text">${item.user_id}</span>
        </div>
        <div class="cred-item">
          <span class="cred-label">Pass:</span>
          <span class="cred-val pwd-box ltr-text">${item.password}</span>
        </div>
      </div>

      <div class="card-hint-row">
        * يرجى تغيير كلمة المرور فور تسجيل الدخول
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
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@600;700;800;900&display=swap" rel="stylesheet">
      <style>
        @page {
          size: A4 portrait;
          margin: 5mm;
        }
        * {
          box-sizing: border-box;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        body {
          font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
          margin: 0;
          padding: 0;
          background: #ffffff;
          color: #0f172a;
          font-size: 11px;
        }
        .cards-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 3mm 3.5mm;
        }
        .credential-card {
          border: 1px dashed #64748b;
          border-radius: 6px;
          padding: 5px 7px;
          background: #fafafa;
          page-break-inside: avoid;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          height: 38mm;
          box-sizing: border-box;
        }
        .card-top-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 4px;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 2px;
          margin-bottom: 2px;
        }
        .student-name {
          font-size: 10.5px;
          font-weight: 800;
          color: #0f172a;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 70%;
        }
        .meta-tag {
          font-size: 8.5px;
          font-weight: 700;
          color: #475569;
          background: #e2e8f0;
          padding: 1px 4px;
          border-radius: 3px;
          white-space: nowrap;
        }
        .card-creds-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #ffffff;
          padding: 3px 6px;
          border-radius: 4px;
          border: 1px solid #cbd5e1;
          margin: 2px 0;
        }
        .cred-item {
          display: flex;
          align-items: center;
          gap: 3px;
        }
        .cred-label {
          font-size: 9px;
          color: #64748b;
          font-weight: 700;
        }
        .cred-val {
          font-size: 10.5px;
          font-weight: 800;
          color: #0f172a;
        }
        .pwd-box {
          background: #f1f5f9;
          padding: 1px 5px;
          border-radius: 3px;
          border: 1px solid #94a3b8;
          color: #1e1b4b;
          font-family: 'Consolas', 'Courier New', monospace;
          letter-spacing: 0.8px;
          font-size: 11px;
        }
        .ltr-text {
          direction: ltr;
          text-align: left;
        }
        .card-hint-row {
          text-align: center;
          font-size: 7.5px;
          font-weight: 700;
          color: #dc2626;
          border-top: 1px solid #f1f5f9;
          padding-top: 2px;
        }
      </style>
    </head>
    <body>
      <div class="cards-grid">
        ${cardsHtml}
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

