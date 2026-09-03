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
              ${includeQuizzes ? `<td>${g.quiz_1 || 0}</td><td>${g.quiz_2 || 0}</td>` : ''}
              ${includeProject ? `<td>${g.project || 0}</td>` : ''}
              ${includeAttendanceScore ? `<td style="color: #059669; font-weight: bold;">${g.attendance_score || 0}</td>` : ''}
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
        let dateHint = record?.session_date ? `<div class="w-date">${record.session_date.slice(5)}</div>` : '';
        
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
          <span class="sub-name">${idx + 1}. ${sub.name} (الفرقة ${normalizeYear(sub.year_level)}) — <strong style="color: #059669;">سكشن ${getStudentSubSection(student, sub.id)}</strong></span>
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
