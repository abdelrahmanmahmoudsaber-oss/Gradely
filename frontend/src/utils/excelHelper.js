import ExcelJS from 'exceljs';

// Excel Security Limits
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_ROWS = 10000;

// Formula Injection Protection: Neutralize dangerous leading characters (=, +, -, @, |)
export const sanitizeCell = (val) => {
  if (typeof val === 'string' && /^[=+\-@|]/.test(val.trim())) {
    return "'" + val;
  }
  return val;
};

// Helper: extract raw or rich text from any ExcelJS cell
const extractCellValue = (cell) => {
  if (cell === null || cell === undefined) return '';
  let val = cell.value;
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') {
    if (val.result !== undefined && val.result !== null) return String(val.result).trim();
    if (val.text !== undefined && val.text !== null) return String(val.text).trim();
    if (Array.isArray(val.richText)) {
      return val.richText.map(t => t.text || '').join('').trim();
    }
    if (val instanceof Date) return val.toISOString().slice(0, 10);
    return String(val).trim();
  }
  return String(val).trim();
};

/**
 * Parses an uploaded .xlsx or .xls file into an array of row objects using ExcelJS.
 * Features smart multi-sheet scanning and automated header row auto-detection.
 */
export async function parseExcelFile(file) {
  if (!file) throw new Error('No file provided');

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error('حجم الملف كبير جداً (الحد الأقصى 5 ميجابايت).');
  }

  const arrayBuffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);

  const activeWorksheets = (workbook.worksheets || []).filter(ws => ws && ws.rowCount > 0);
  if (activeWorksheets.length === 0) {
    return [];
  }

  const allData = [];
  const headerKeywords = [
    'id', 'name', 'اسم', 'كود', 'رقم', 'مادة', 'subject', 'course', 'مقرر', 
    'فرقة', 'year', 'level', 'سكشن', 'sec', 'group', 'مجموعة', 'ta', 'معيد', 'مشرف', 'جلوس'
  ];

  for (const worksheet of activeWorksheets) {
    let headerRowIdx = 1;
    let maxHeaderScore = 0;
    let detectedHeaders = {};

    // Scan first 12 rows to find true header row
    const scanLimit = Math.min(12, worksheet.rowCount);
    for (let r = 1; r <= scanLimit; r++) {
      const row = worksheet.getRow(r);
      let score = 0;
      let cellCount = 0;
      const rowHeaders = {};

      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const strVal = extractCellValue(cell);
        if (strVal) {
          cellCount++;
          rowHeaders[colNumber] = strVal;
          const lowerVal = strVal.toLowerCase();
          if (headerKeywords.some(k => lowerVal.includes(k))) {
            score += 3;
          } else {
            score += 1;
          }
        }
      });

      if (cellCount >= 2 && score > maxHeaderScore) {
        maxHeaderScore = score;
        headerRowIdx = r;
        detectedHeaders = rowHeaders;
      }
    }

    // Fallback: if no scored header row found, use row 1
    if (Object.keys(detectedHeaders).length === 0) {
      const row1 = worksheet.getRow(1);
      row1.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const strVal = extractCellValue(cell);
        if (strVal) detectedHeaders[colNumber] = strVal;
      });
      headerRowIdx = 1;
    }

    // Parse data rows starting after headerRowIdx
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber <= headerRowIdx) return;

      let hasValue = false;
      const rowObj = {};

      Object.entries(detectedHeaders).forEach(([colNumberStr, headerName]) => {
        const colNumber = parseInt(colNumberStr, 10);
        const cell = row.getCell(colNumber);
        const val = extractCellValue(cell);

        if (val !== '') {
          hasValue = true;
          rowObj[headerName] = val;
        } else {
          rowObj[headerName] = '';
        }
      });

      if (hasValue) {
        allData.push(rowObj);
      }
    });
  }

  return allData;
}

/**
 * Exports an array of row objects to a single-sheet .xlsx file.
 */
export async function exportExcelFile(data, fileName) {
  if (!data || data.length === 0) return;

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Sheet1');

  const colKeys = Object.keys(data[0]);
  worksheet.columns = colKeys.map(key => ({
    header: key,
    key: key,
    width: Math.max(key.length + 5, 15)
  }));

  worksheet.getRow(1).font = { bold: true };

  data.forEach(item => {
    const rowValues = {};
    colKeys.forEach(key => {
      const val = item[key];
      const strVal = val === null || val === undefined ? '' : String(val);
      rowValues[key] = sanitizeCell(strVal);
    });
    worksheet.addRow(rowValues);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  const safeFileName = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = safeFileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}

/**
 * Exports multiple datasets into separate tabs/sheets in a single comprehensive .xlsx workbook.
 */
export async function exportMultiSheetExcelFile(sheets, fileName) {
  if (!sheets || sheets.length === 0) return;

  const workbook = new ExcelJS.Workbook();

  sheets.forEach(({ name, data }) => {
    const sheetName = name.slice(0, 31).replace(/[*?:/\\[\]]/g, '_');
    const worksheet = workbook.addWorksheet(sheetName);

    if (data && data.length > 0) {
      const colKeys = Object.keys(data[0]);
      worksheet.columns = colKeys.map(key => ({
        header: key,
        key: key,
        width: Math.max(key.length + 5, 15)
      }));

      worksheet.getRow(1).font = { bold: true };

      data.forEach(item => {
        const rowValues = {};
        colKeys.forEach(key => {
          const val = item[key];
          const strVal = val === null || val === undefined ? '' : String(val);
          rowValues[key] = sanitizeCell(strVal);
        });
        worksheet.addRow(rowValues);
      });
    } else {
      worksheet.addRow(['لا توجد بيانات مسجلة']);
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  const safeFileName = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = safeFileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}

/**
 * Generates Base64 encoded string of a multi-sheet .xlsx workbook for emailing and webhooks.
 */
export async function generateMultiSheetExcelBase64(sheets) {
  if (!sheets || sheets.length === 0) return '';

  const workbook = new ExcelJS.Workbook();

  sheets.forEach(({ name, data }) => {
    const sheetName = name.slice(0, 31).replace(/[*?:/\\[\]]/g, '_');
    const worksheet = workbook.addWorksheet(sheetName);

    if (data && data.length > 0) {
      const colKeys = Object.keys(data[0]);
      worksheet.columns = colKeys.map(key => ({
        header: key,
        key: key,
        width: Math.max(key.length + 5, 15)
      }));

      worksheet.getRow(1).font = { bold: true };

      data.forEach(item => {
        const rowValues = {};
        colKeys.forEach(key => {
          const val = item[key];
          const strVal = val === null || val === undefined ? '' : String(val);
          rowValues[key] = sanitizeCell(strVal);
        });
        worksheet.addRow(rowValues);
      });
    } else {
      worksheet.addRow(['لا توجد بيانات مسجلة']);
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}


/**
 * Resolves a student's lecture group (Group A, Group B) based strictly on section in the given subject.
 * Rule:
 * Section 1 and Section 2 => Group A
 * Section 3 and Section 4 => Group B
 */
export const getStudentLectureGroup = (student, subId = null) => {
  if (!student) return 'A';

  // 1. Subject-specific explicit group if set: '<subId>:GROUP:A'
  if (subId && Array.isArray(student.assigned_subjects)) {
    const subGroup = student.assigned_subjects.find(e => typeof e === 'string' && e.startsWith(subId + ':GROUP:'));
    if (subGroup) return subGroup.split(':')[2].toUpperCase();
  }

  // 2. Explicit global group tag on student: 'GROUP:A' or 'GROUP:B'
  if (Array.isArray(student.assigned_subjects)) {
    const globalGroup = student.assigned_subjects.find(e => typeof e === 'string' && (e === 'GROUP:A' || e === 'GROUP:B' || e.startsWith('GROUP:')));
    if (globalGroup) return globalGroup.split(':')[1].toUpperCase();
  }

  // 3. Resolve section for this specific subject first
  let sec = null;
  if (subId && Array.isArray(student.assigned_subjects)) {
    const match = student.assigned_subjects.find(e => typeof e === 'string' && e.startsWith(subId + ':') && !e.includes(':GROUP:'));
    if (match) sec = match.split(':')[1];
  }

  // 4. Fallback to student base section if not assigned per-subject
  if (!sec) {
    sec = student.section || 'S1';
  }

  // 5. Strict Binary Mapping based on section number:
  // Sections 1 & 2 -> ALWAYS Group A
  // Sections 3 & 4 -> ALWAYS Group B
  const cleanSec = sec.toString().trim().toUpperCase().replace(/\s+/g, '');
  const match = cleanSec.match(/(\d+)/);
  const num = match ? parseInt(match[1], 10) : 1;

  if (num === 1 || num === 2) return 'A';
  if (num === 3 || num === 4) return 'B';
  return (num % 2 === 1) ? 'A' : 'B';
};

/**
 * Generates an Excel template (.xlsx) for attendance recording (Section or Lecture).
 */
export async function exportAttendanceTemplateExcel(students, subjectName, totalWeeks = 12, attendanceType = 'section', selectedGroup = 'all') {
  const workbook = new ExcelJS.Workbook();
  const isLecture = attendanceType === 'lecture';
  const sheetName = isLecture ? 'غياب المحاضرات' : 'غياب السكاشن';
  const worksheet = workbook.addWorksheet(sheetName);

  // Title Row
  worksheet.mergeCells('A1', 'G1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = isLecture 
    ? `نموذج رصد غياب محاضرات مادة: ${subjectName} ${selectedGroup !== 'all' ? `(مجموعة ${selectedGroup})` : '(كافة المجموعات)'}`
    : `نموذج رصد غياب سكاشن مادة: ${subjectName}`;
  titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isLecture ? 'FF0D9488' : 'FF4F46E5' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Subtitle / Instruction Row
  worksheet.mergeCells('A2', 'G2');
  const instCell = worksheet.getCell('A2');
  instCell.value = 'اكتب (1) حاضر، (0) غايب، (2) تأخير، (E) عذر في خانات الأسابيع';
  instCell.font = { italic: true, size: 10, color: { argb: 'FF475569' } };
  instCell.alignment = { horizontal: 'center' };

  // Header Row (Row 3)
  const headers = ['No.', 'Section', 'Group', 'ID', 'Name'];
  for (let w = 1; w <= totalWeeks; w++) {
    headers.push(isLecture ? `Lecture ${w}` : `Section ${w}`);
  }

  const headerRow = worksheet.getRow(3);
  headerRow.values = headers;
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isLecture ? 'FF115E59' : 'FF1E293B' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  // Populate Student Rows
  students.forEach((stu, idx) => {
    const grp = getStudentLectureGroup(stu);
    const rowValues = [
      idx + 1, 
      sanitizeCell(stu.section || 'S01'), 
      sanitizeCell(`Group ${grp}`), 
      sanitizeCell(stu.user_id), 
      sanitizeCell(stu.name)
    ];
    for (let w = 1; w <= totalWeeks; w++) {
      rowValues.push('');
    }
    const row = worksheet.addRow(rowValues);
    row.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  worksheet.columns.forEach((col, colIdx) => {
    if (colIdx === 3 || colIdx === 4) col.width = 18;
    else if (colIdx === 0) col.width = 8;
    else col.width = 13;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const prefix = isLecture ? 'محاضرات' : 'سكاشن';
  a.download = `${prefix}_${subjectName.replace(/\s+/g, '_')}_نموذج.xlsx`;
  a.click();
  window.URL.revokeObjectURL(url);
}

/**
 * Normalizes subject names for fuzzy comparison and auto-matching.
 */
export const normalizeSubjectNameForMatch = (name) => {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[-_–—/\\(),.:;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Smart matcher: matches an Excel sheet name to a platform Subject object.
 * Supports exact names, course codes, standard abbreviations (OOP, CG, CNT, DS, DB...),
 * and localized variations (e.g. 'Math 0' <-> 'Mathematics - 0', 'Graphics' <-> 'Computer Graphics').
 */
export const matchSheetToSubject = (sheetName, subjects = []) => {
  if (!sheetName || !Array.isArray(subjects) || subjects.length === 0) return null;
  const rawSheet = String(sheetName).trim();
  const cleanSheet = normalizeSubjectNameForMatch(rawSheet);
  const compactSheet = cleanSheet.replace(/\s+/g, '');

  // 1. Direct exact match (name or code)
  for (const sub of subjects) {
    if (!sub) continue;
    const subName = String(sub.name || '').trim();
    const subCode = String(sub.code || '').trim();
    if (subName.toLowerCase() === rawSheet.toLowerCase()) return sub;
    if (subCode && subCode.toLowerCase() === rawSheet.toLowerCase()) return sub;
  }

  // 2. Normalized match (without symbols/accents)
  for (const sub of subjects) {
    if (!sub) continue;
    const cleanSub = normalizeSubjectNameForMatch(sub.name);
    const compactSub = cleanSub.replace(/\s+/g, '');
    if (cleanSub === cleanSheet || compactSub === compactSheet) return sub;
  }

  // 3. Known subject aliases & abbreviations
  const aliases = [
    { keys: ['math 0', 'math0', 'mathematics 0', 'رياضة 0'], subMatches: ['mathematics - 0', 'mathematics 0', 'math 0'] },
    { keys: ['math 3', 'math3', 'mathematics 3', 'رياضة 3'], subMatches: ['mathematics 3', 'math 3'] },
    { keys: ['math 1', 'math1', 'mathematics 1', 'رياضة 1'], subMatches: ['mathematics 1', 'math 1'] },
    { keys: ['math 2', 'math2', 'mathematics 2', 'رياضة 2'], subMatches: ['mathematics 2', 'math 2'] },
    { keys: ['cg', 'computer graphics', 'graphics', 'رسم بالحاسب', 'جرافيكس'], subMatches: ['computer graphics', 'graphics'] },
    { keys: ['oop', 'object oriented', 'برمجة كائنية'], subMatches: ['object oriented programming', 'oop'] },
    { keys: ['cnt', 'computer networks', 'networks', 'شبكات'], subMatches: ['computer networks', 'networks', 'cnt'] },
    { keys: ['db', 'database', 'قواعد بيانات'], subMatches: ['database systems', 'database', 'db'] },
    { keys: ['ds', 'data structures', 'هياكل بيانات'], subMatches: ['data structures', 'ds'] },
    { keys: ['os', 'operating systems', 'نظم تشغيل'], subMatches: ['operating systems', 'os'] },
    { keys: ['ai', 'artificial intelligence', 'ذكاء اصطناعي'], subMatches: ['artificial intelligence', 'ai'] },
    { keys: ['logic', 'digital logic', 'لوجيك', 'منطق رقمي'], subMatches: ['digital logic design', 'logic'] },
  ];

  for (const alias of aliases) {
    const sheetMatchesAlias = alias.keys.some(k => cleanSheet.includes(k) || compactSheet.includes(k.replace(/\s+/g, '')));
    if (sheetMatchesAlias) {
      const foundSub = subjects.find(s => {
        const cleanS = normalizeSubjectNameForMatch(s.name);
        return alias.subMatches.some(m => cleanS.includes(m));
      });
      if (foundSub) return foundSub;
    }
  }

  // 4. Substring & digit-aligned inclusion match
  for (const sub of subjects) {
    if (!sub) continue;
    const cleanSub = normalizeSubjectNameForMatch(sub.name);
    const sheetDigits = rawSheet.match(/\d+/g);
    const subDigits = (sub.name || '').match(/\d+/g);
    const digitsMatch = (!sheetDigits && !subDigits) || 
      (sheetDigits && subDigits && sheetDigits.join('') === subDigits.join(''));

    if (digitsMatch) {
      if (cleanSub.includes(cleanSheet) || cleanSheet.includes(cleanSub)) return sub;
    }
  }

  return null;
};

/**
 * Parses attendance records from an uploaded Excel file.
 * Supports multi-sheet workbooks (e.g. one sheet per subject: Math 0, OOP, Computer Graphics...).
 * Employs deep auto-detection for ID columns, names, and week status columns.
 */
export async function parseAttendanceExcelFile(file) {
  if (!file) throw new Error('No file provided');
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error('حجم الملف كبير جداً (الحد الأقصى 5 ميجابايت).');
  }

  const arrayBuffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);

  const activeWorksheets = (workbook.worksheets || []).filter(ws => ws && ws.rowCount > 0);
  if (activeWorksheets.length === 0) {
    const emptyRes = [];
    emptyRes.sheets = [];
    return emptyRes;
  }

  const cleanVal = (val) => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') {
      if (val.result !== undefined && val.result !== null) return String(val.result).trim().replace(/\.0+$/, '');
      if (val.text !== undefined && val.text !== null) return String(val.text).trim().replace(/\.0+$/, '');
      if (Array.isArray(val.richText)) {
        return val.richText.map(t => t.text || '').join('').trim().replace(/\.0+$/, '');
      }
      if (val instanceof Date) return val.toISOString().slice(0, 10);
      return String(val).trim().replace(/\.0+$/, '');
    }
    return String(val).trim().replace(/\.0+$/, '');
  };

  const parsedSheets = [];

  for (let sIdx = 0; sIdx < activeWorksheets.length; sIdx++) {
    const worksheet = activeWorksheets[sIdx];
    const sheetName = worksheet.name || `Sheet${sIdx + 1}`;

    // Scan first 15 rows to find the best header row
    let headerRowIdx = 1;
    let bestHeaderScore = -1;
    let detectedColMap = {};

    const scanLimit = Math.min(15, worksheet.rowCount);
    for (let r = 1; r <= scanLimit; r++) {
      const row = worksheet.getRow(r);
      let score = 0;
      let tempColMap = {};
      let hasIdKeyword = false;
      let hasWeekKeyword = false;
      let hasNameKeyword = false;

      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const strVal = cleanVal(cell.value).toLowerCase();
        if (!strVal) return;
        tempColMap[colNumber] = cleanVal(cell.value);

        if (strVal === 'id' || strVal === 'no.' || strVal === 'كود' || strVal === 'رقم' || 
            strVal.includes('الرقم الأكاديمي') || strVal.includes('كود الطالب') || 
            strVal.includes('رقم الطالب') || strVal.includes('رقم الجلوس') || 
            strVal.includes('student id') || strVal.includes('academic id')) {
          score += 15;
          hasIdKeyword = true;
        } else if (strVal.includes('name') || strVal.includes('الاسم') || strVal.includes('اسم الطالب')) {
          score += 8;
          hasNameKeyword = true;
        } else if (strVal.includes('section') || strVal.includes('السكشن') || strVal.includes('sec')) {
          score += 5;
        } else if (strVal.includes('group') || strVal.includes('المجموعة') || strVal.includes('الجروب')) {
          score += 4;
        }

        const match = strVal.match(/(\d+)/);
        if (match && (
          strVal.includes('sec') || strVal.includes('week') || strVal.includes('lec') || 
          strVal.includes('محاضرة') || strVal.includes('أسبوع') || strVal.includes('سكشن') || 
          strVal.includes('w') || strVal.includes('s') || strVal.includes('l') || /^\d+$/.test(strVal)
        )) {
          score += 3;
          hasWeekKeyword = true;
        }
      });

      if (hasIdKeyword && (hasWeekKeyword || hasNameKeyword)) {
        score += 20;
      }

      if (score > bestHeaderScore && score >= 8) {
        bestHeaderScore = score;
        headerRowIdx = r;
        detectedColMap = tempColMap;
      }
    }

    // Fallback if no scored header found
    if (Object.keys(detectedColMap).length === 0) {
      headerRowIdx = 1;
      const row1 = worksheet.getRow(1);
      row1.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const val = cleanVal(cell.value);
        if (val) detectedColMap[colNumber] = val;
      });
    }

    let idColIdx = null;
    let nameColIdx = null;
    let sectionColIdx = null;
    let groupColIdx = null;
    const weekColMap = {};

    Object.keys(detectedColMap).forEach(colIdxStr => {
      const colNumber = parseInt(colIdxStr, 10);
      const header = detectedColMap[colNumber];
      const lower = header.toLowerCase();

      if (lower === 'id' || lower.includes('الرقم الأكاديمي') || lower.includes('رقم الجلوس') || 
          lower.includes('الكود') || lower.includes('كود الطالب') || lower.includes('رقم الطالب') ||
          lower.includes('student id') || lower.includes('academic id') || lower === 'no.') {
        idColIdx = colNumber;
      } else if (lower.includes('name') || lower.includes('الاسم') || lower.includes('اسم الطالب')) {
        nameColIdx = colNumber;
      } else if (lower === 'section' || lower === 'السكشن' || lower === 'sec' || lower === 'فرقة' || lower === 'الفرقة') {
        sectionColIdx = colNumber;
      } else if (lower === 'group' || lower.includes('الجروب') || lower.includes('المجموعة') || lower.includes('مجموعة')) {
        groupColIdx = colNumber;
      } else {
        const match = header.match(/(\d+)/);
        if (match && (
          lower.includes('sec') || lower.includes('week') || lower.includes('lec') || 
          lower.includes('محاضرة') || lower.includes('أسبوع') || lower.includes('سكشن') || 
          lower.includes('w') || lower.includes('s') || lower.includes('l') || /^\d+$/.test(header.trim())
        )) {
          const weekNum = parseInt(match[1], 10);
          if (weekNum >= 1 && weekNum <= 30) {
            weekColMap[colNumber] = weekNum;
          }
        }
      }
    });

    // Deep column fallback for ID: scan sample rows to detect student number column (>=4 digits)
    if (!idColIdx) {
      const colDigitCounts = {};
      const sampleLimit = Math.min(headerRowIdx + 12, worksheet.rowCount);
      for (let r = headerRowIdx + 1; r <= sampleLimit; r++) {
        const row = worksheet.getRow(r);
        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
          const str = cleanVal(cell.value);
          if (/^\d{4,10}$/.test(str)) {
            colDigitCounts[colNumber] = (colDigitCounts[colNumber] || 0) + 1;
          }
        });
      }
      let maxDigitsCol = null;
      let maxCount = 0;
      Object.entries(colDigitCounts).forEach(([col, count]) => {
        if (count > maxCount) {
          maxCount = count;
          maxDigitsCol = parseInt(col, 10);
        }
      });
      if (maxDigitsCol) {
        idColIdx = maxDigitsCol;
      } else {
        idColIdx = 2; // Default to Column B
      }
    }

    if (!nameColIdx) {
      nameColIdx = idColIdx === 2 ? 3 : (idColIdx === 1 ? 2 : 1);
    }

    const sheetRecords = [];

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber <= headerRowIdx) return;

      const studentId = cleanVal(idColIdx ? row.getCell(idColIdx).value : null);
      const studentName = cleanVal(nameColIdx ? row.getCell(nameColIdx).value : null);
      const section = cleanVal(sectionColIdx ? row.getCell(sectionColIdx).value : null);
      let group = cleanVal(groupColIdx ? row.getCell(groupColIdx).value : null);
      if (group) {
        group = group.toUpperCase().replace('GROUP', '').replace('مجموعة', '').replace('جروب', '').trim();
      }

      // Ignore summary, total or completely empty rows
      if (!studentId && !studentName) return;
      if (studentId.toLowerCase().includes('total') || studentId.toLowerCase().includes('اجمالي') || studentName.includes('المجموع')) return;

      const weekStatuses = {};

      Object.keys(weekColMap).forEach(colIdxStr => {
        const colNumber = parseInt(colIdxStr, 10);
        const weekNum = weekColMap[colNumber];
        const cellVal = row.getCell(colNumber).value;

        let strVal = cleanVal(cellVal).toLowerCase();

        if (strVal === '1' || strVal === '1.0' || strVal === 'حاضر' || strVal === 'present' || strVal === 'p' || strVal === 'ح' || strVal === 'true' || strVal === 'yes' || strVal === '✓' || strVal === '✔') {
          weekStatuses[weekNum] = 'present';
        } else if (strVal === '0' || strVal === '0.0' || strVal === 'غائب' || strVal === 'absent' || strVal === 'a' || strVal === 'غ' || strVal === 'false' || strVal === 'no' || strVal === '✗' || strVal === '❌') {
          weekStatuses[weekNum] = 'absent';
        } else if (strVal === '2' || strVal === '2.0' || strVal === 'تأخير' || strVal === 'late' || strVal === 'l' || strVal === 'ت') {
          weekStatuses[weekNum] = 'late';
        } else if (strVal === 'e' || strVal === 'عذر' || strVal === 'excused' || strVal === 'ع' || strVal === 'ex') {
          weekStatuses[weekNum] = 'excused';
        }
      });

      sheetRecords.push({
        studentId,
        studentName,
        section,
        group,
        weekStatuses,
        sheetName
      });
    });

    if (sheetRecords.length > 0) {
      parsedSheets.push({
        sheetIndex: sIdx,
        sheetName,
        headerRow: headerRowIdx,
        idCol: idColIdx,
        nameCol: nameColIdx,
        weeksDetected: Object.values(weekColMap).sort((a, b) => a - b),
        records: sheetRecords
      });
    }
  }

  // Create flat records array with .sheets attached for full backwards compatibility
  const flatRecords = parsedSheets.flatMap(s => s.records);
  flatRecords.sheets = parsedSheets;
  return flatRecords;
}
