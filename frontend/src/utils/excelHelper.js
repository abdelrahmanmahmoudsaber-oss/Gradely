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

/**
 * Parses an uploaded .xlsx or .xls file into an array of row objects using ExcelJS.
 */
export async function parseExcelFile(file) {
  if (!file) throw new Error('No file provided');

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error('حجم الملف كبير جداً (الحد الأقصى 5 ميجابايت).');
  }

  const arrayBuffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return [];
  }

  const rowCount = worksheet.rowCount;
  if (rowCount - 1 > MAX_ROWS) {
    throw new Error(`عدد الصفوف (${rowCount - 1}) يتجاوز الحد الأقصى المسموح (${MAX_ROWS} صف).`);
  }

  const headerRow = worksheet.getRow(1);
  const headers = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = cell.value !== null && cell.value !== undefined ? String(cell.value).trim() : '';
  });

  const data = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    let hasValue = false;
    const rowObj = {};

    headers.forEach((header, colNumber) => {
      if (header) {
        const cell = row.getCell(colNumber);
        let val = cell.value;

        if (val && typeof val === 'object' && val.result !== undefined) {
          val = val.result;
        }

        if (val !== null && val !== undefined && String(val).trim() !== '') {
          hasValue = true;
          rowObj[header] = typeof val === 'object' ? String(val) : val;
        } else {
          rowObj[header] = '';
        }
      }
    });

    if (hasValue) {
      data.push(rowObj);
    }
  });

  return data;
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
 * Generates an Excel template (.xlsx) for attendance recording.
 */
export async function exportAttendanceTemplateExcel(students, subjectName, totalWeeks = 12) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('سجل الغياب');

  // Title Row
  worksheet.mergeCells('A1', 'F1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `نموذج رصد غياب مادة: ${subjectName}`;
  titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Subtitle / Instruction Row
  worksheet.mergeCells('A2', 'F2');
  const instCell = worksheet.getCell('A2');
  instCell.value = 'اكتب (1) حاضر، (0) غايب، (2) تأخير، (E) عذر في خانات السكاشن والأسابيع';
  instCell.font = { italic: true, size: 10, color: { argb: 'FF475569' } };
  instCell.alignment = { horizontal: 'center' };

  // Header Row (Row 3)
  const headers = ['No.', 'Section', 'ID', 'Name'];
  for (let w = 1; w <= totalWeeks; w++) {
    headers.push(`Section ${w}`);
  }

  const headerRow = worksheet.getRow(3);
  headerRow.values = headers;
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  // Populate Student Rows
  students.forEach((stu, idx) => {
    const rowValues = [idx + 1, stu.section || 'S01', stu.user_id, stu.name];
    for (let w = 1; w <= totalWeeks; w++) {
      rowValues.push('');
    }
    const row = worksheet.addRow(rowValues);
    row.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  worksheet.columns.forEach((col, colIdx) => {
    if (colIdx === 2 || colIdx === 3) col.width = 18;
    else if (colIdx === 0) col.width = 8;
    else col.width = 14;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `حضور_${subjectName.replace(/\s+/g, '_')}_نموذج.xlsx`;
  a.click();
  window.URL.revokeObjectURL(url);
}

/**
 * Parses attendance records from an uploaded Excel file.
 */
export async function parseAttendanceExcelFile(file) {
  if (!file) throw new Error('No file provided');
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error('حجم الملف كبير جداً (الحد الأقصى 5 ميجابايت).');
  }

  const arrayBuffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  // Find exact header row by scanning for cells strictly matching 'id', 'no.', 'الرقم الأكاديمي', etc.
  let headerRowIdx = 1;
  for (let r = 1; r <= Math.min(5, worksheet.rowCount); r++) {
    const row = worksheet.getRow(r);
    let cellTexts = [];
    row.eachCell({ includeEmpty: false }, cell => {
      if (cell.value) cellTexts.push(String(cell.value).trim().toLowerCase());
    });
    
    const hasExactId = cellTexts.some(v => v === 'id' || v === 'no.' || v === 'الرقم الأكاديمي' || v === 'الكود' || v === 'رقم الطالب');
    const hasNameOrSec = cellTexts.some(v => v === 'name' || v === 'section' || v === 'الاسم' || v === 'السكشن' || v.includes('section 1') || v.includes('أسبوع 1'));

    if (hasExactId && hasNameOrSec) {
      headerRowIdx = r;
      break;
    }
  }

  const headerRow = worksheet.getRow(headerRowIdx);
  const colMap = {};
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    if (cell.value !== null && cell.value !== undefined) {
      colMap[colNumber] = String(cell.value).trim();
    }
  });

  let idColIdx = null;
  let nameColIdx = null;
  let sectionColIdx = null;
  const weekColMap = {};

  Object.keys(colMap).forEach(colIdxStr => {
    const colNumber = parseInt(colIdxStr, 10);
    const header = colMap[colNumber];
    const lower = header.toLowerCase();

    if (lower === 'id' || lower.includes('الرقم الأكاديمي') || lower.includes('رقم الجلوس') || lower.includes('الكود') || lower.includes('رقم الطالب')) {
      idColIdx = colNumber;
    } else if (lower.includes('name') || lower.includes('الاسم') || lower.includes('اسم الطالب')) {
      nameColIdx = colNumber;
    } else if (lower === 'section' || lower === 'السكشن' || lower === 'فرقة') {
      sectionColIdx = colNumber;
    } else {
      const match = header.match(/(\d+)/);
      if (match && (lower.includes('sec') || lower.includes('week') || lower.includes('أسبوع') || lower.includes('سكشن') || lower.includes('w') || lower.includes('s') || /^\d+$/.test(header))) {
        const weekNum = parseInt(match[1], 10);
        if (weekNum >= 1 && weekNum <= 30) {
          weekColMap[colNumber] = weekNum;
        }
      }
    }
  });

  if (!idColIdx) {
    idColIdx = 3; // Default Column C
  }

  const cleanVal = (val) => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'object' && val.result !== undefined) val = val.result;
    let str = String(val).trim();
    return str.replace(/\.0+$/, '');
  };

  const parsedRecords = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowIdx) return;

    const studentId = cleanVal(idColIdx ? row.getCell(idColIdx).value : null);
    const studentName = cleanVal(nameColIdx ? row.getCell(nameColIdx).value : null);
    const section = cleanVal(sectionColIdx ? row.getCell(sectionColIdx).value : null);

    if (!studentId && !studentName) return;

    const weekStatuses = {};

    Object.keys(weekColMap).forEach(colIdxStr => {
      const colNumber = parseInt(colIdxStr, 10);
      const weekNum = weekColMap[colNumber];
      const cellVal = row.getCell(colNumber).value;

      let strVal = cleanVal(cellVal).toLowerCase();

      if (strVal === '1' || strVal === 'حاضر' || strVal === 'present' || strVal === 'p') {
        weekStatuses[weekNum] = 'present';
      } else if (strVal === '0' || strVal === 'غائب' || strVal === 'absent' || strVal === 'a') {
        weekStatuses[weekNum] = 'absent';
      } else if (strVal === '2' || strVal === 'تأخير' || strVal === 'late' || strVal === 'l') {
        weekStatuses[weekNum] = 'late';
      } else if (strVal === 'e' || strVal === 'عذر' || strVal === 'excused' || strVal === 'ع') {
        weekStatuses[weekNum] = 'excused';
      }
    });

    parsedRecords.push({
      studentId,
      studentName,
      section,
      weekStatuses
    });
  });

  return parsedRecords;
}
