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
