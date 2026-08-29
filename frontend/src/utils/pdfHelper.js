/**
 * Professional Arabic RTL PDF Generator for Student Reports
 * Generates high-resolution printable report and triggers browser PDF printing
 * with Cairo typography, official branding, and selected filters.
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
        <div class="grades-grid">
          ${includeQuizzes ? `
            <div class="grade-box">
              <div class="grade-title">كويز 1</div>
              <div class="grade-val">${g.quiz_1 || 0}</div>
            </div>
            <div class="grade-box">
              <div class="grade-title">كويز 2</div>
              <div class="grade-val">${g.quiz_2 || 0}</div>
            </div>
          ` : ''}
          ${includeProject ? `
            <div class="grade-box">
              <div class="grade-title">المشروع</div>
              <div class="grade-val">${g.project || 0}</div>
            </div>
          ` : ''}
          ${includeAttendanceScore ? `
            <div class="grade-box">
              <div class="grade-title">درجة الحضور</div>
              <div class="grade-val" style="color: #059669;">${g.attendance_score || 0}</div>
            </div>
          ` : ''}
          ${includeTotal ? `
            <div class="grade-box total-box">
              <div class="grade-title">المجموع الكلي</div>
              <div class="grade-val" style="color: #4f46e5; font-size: 18px;">
                ${(g.quiz_1 || 0) + (g.quiz_2 || 0) + (g.project || 0) + (g.attendance_score || 0)}
              </div>
            </div>
          ` : ''}
        </div>
      `;
    }

    let weeksGridHtml = '';
    if (includeAttendanceDetails) {
      let weeksCells = '';
      for (let w = 1; w <= totalWeeks; w++) {
        const record = subAtt.find(a => a.week_number === w);
        let statusText = 'لم يرصد';
        let statusClass = 'unrecorded';
        if (record) {
          if (record.status === 'present') { statusText = 'حاضر ✓'; statusClass = 'present'; }
          else if (record.status === 'absent') { statusText = 'غائب ✗'; statusClass = 'absent'; }
          else if (record.status === 'late') { statusText = 'تأخير'; statusClass = 'late'; }
          else if (record.status === 'excused') { statusText = 'عذر'; statusClass = 'excused'; }
        }
        weeksCells += `
          <div class="week-pill ${statusClass}">
            <div class="w-num">أسبوع ${w}</div>
            <div class="w-status">${statusText}</div>
          </div>
        `;
      }

      weeksGridHtml = `
        <div class="weeks-section">
          <div class="weeks-header">
            <span>📅 سجل الأسابيع التفصيلي:</span>
            <span style="font-size: 12px; color: #64748b;">(إجمالي الحضور: ${totalAttended} | الغياب: ${totalAbsent})</span>
          </div>
          <div class="weeks-grid">
            ${weeksCells}
          </div>
        </div>
      `;
    }

    subjectsHtml += `
      <div class="subject-card">
        <div class="subject-header">
          <div class="sub-title">${idx + 1}. ${sub.name} (الفرقة ${normalizeYear(sub.year_level)})</div>
          <div class="sub-ta">المشرف / المعيد: <strong>${sub.instructor_name || 'المدير الرئيسي'}</strong></div>
        </div>
        ${gradesCardsHtml}
        ${weeksGridHtml}
        <div class="sub-footer">
          <span>إجمالي المحاضرات المحضورة: <strong>${totalAttended}</strong></span>
          <span>إجمالي مرات الغياب: <strong style="color: #dc2626;">${totalAbsent}</strong></span>
        </div>
      </div>
    `;
  });

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>تقرير الطالب - ${student.name}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
      <style>
        @page { size: A4 portrait; margin: 12mm 15mm; }
        body {
          font-family: 'Cairo', sans-serif;
          background: #ffffff;
          color: #0f172a;
          margin: 0;
          padding: 0;
          font-size: 13px;
          direction: rtl;
        }
        .header-table {
          width: 100%;
          border-bottom: 2px solid #4f46e5;
          padding-bottom: 12px;
          margin-bottom: 16px;
        }
        .header-title { font-size: 22px; font-weight: 800; color: #4f46e5; margin: 0; }
        .header-sub { font-size: 12px; color: #64748b; margin-top: 2px; }
        .student-banner {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 12px 16px;
          margin-bottom: 18px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .student-name { font-size: 17px; font-weight: 800; color: #1e293b; margin: 0; }
        .badges-row { display: flex; gap: 8px; margin-top: 4px; }
        .badge {
          display: inline-block;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 700;
        }
        .badge-id { background: #e2e8f0; color: #334155; }
        .badge-year { background: #e0e7ff; color: #4338ca; }
        .badge-sec { background: #dcfce7; color: #15803d; }
        
        .subject-card {
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 12px 14px;
          margin-bottom: 14px;
          page-break-inside: avoid;
        }
        .subject-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #f1f5f9;
          padding-bottom: 8px;
          margin-bottom: 10px;
        }
        .sub-title { font-size: 15px; font-weight: 800; color: #1e293b; }
        .sub-ta { font-size: 12px; color: #64748b; }
        
        .grades-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
          gap: 8px;
          margin-bottom: 10px;
        }
        .grade-box {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 6px 8px;
          text-align: center;
        }
        .total-box { background: #eef2ff; border-color: #c7d2fe; }
        .grade-title { font-size: 10px; color: #64748b; font-weight: 600; }
        .grade-val { font-size: 15px; font-weight: 800; color: #0f172a; margin-top: 2px; }

        .weeks-section { margin-top: 8px; margin-bottom: 8px; background: #fafafa; border: 1px solid #f1f5f9; border-radius: 6px; padding: 8px; }
        .weeks-header { font-size: 11px; font-weight: 700; color: #334155; margin-bottom: 6px; display: flex; justify-content: space-between; }
        .weeks-grid {
          display: grid;
          grid-template-columns: repeat(12, 1fr);
          gap: 4px;
        }
        .week-pill {
          border-radius: 4px;
          padding: 4px 2px;
          text-align: center;
          font-size: 9px;
          border: 1px solid #cbd5e1;
        }
        .w-num { font-weight: 700; font-size: 8.5px; margin-bottom: 1px; color: #64748b; }
        .w-status { font-weight: 800; font-size: 9.5px; }
        
        .present { background: #ecfdf5; border-color: #a7f3d0; color: #065f46; }
        .absent { background: #fef2f2; border-color: #fecaca; color: #991b1b; }
        .late { background: #fffbeb; border-color: #fde68a; color: #92400e; }
        .excused { background: #eff6ff; border-color: #bfdbfe; color: #1e40af; }
        .unrecorded { background: #f8fafc; border-color: #e2e8f0; color: #94a3b8; }

        .sub-footer {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: #475569;
          border-top: 1px dashed #e2e8f0;
          padding-top: 6px;
          margin-top: 6px;
        }
      </style>
    </head>
    <body>
      <table class="header-table">
        <tr>
          <td>
            <h1 class="header-title">Gradely — كشف السجل الأكاديمي والغياب</h1>
            <div class="header-sub">تقرير شامل ومفصل لمتابعة أداء الطالب والالتزام الأسبوعي</div>
          </td>
          <td style="text-align: left;">
            <div style="font-size: 12px; font-weight: 700; color: #334155;">تاريخ الاستخراج:</div>
            <div style="font-size: 11px; color: #64748b;">${currentDate}</div>
          </td>
        </tr>
      </table>

      <div class="student-banner">
        <div>
          <h2 class="student-name">${student.name}</h2>
          <div class="badges-row">
            <span class="badge badge-id">الرقم الأكاديمي: ${student.user_id}</span>
            <span class="badge badge-year">الفرقة ${normalizeYear(student.year_level)}</span>
            <span class="badge badge-sec">السكشن: ${normalizeSection(student.section || 'S1')}</span>
          </div>
        </div>
      </div>

      ${subjectsHtml}

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
