import ExcelJS from 'exceljs';

export interface SheetData {
  name: string;
  headers: string[];
  rows: string[][];
  headerRowIndex: number;
}

export interface ExcelData {
  fileName: string;
  sheets: SheetData[];
}

export async function parseExcelFile(file: File): Promise<ExcelData> {
  const workbook = new ExcelJS.Workbook();
  const arrayBuffer = await file.arrayBuffer();
  await workbook.xlsx.load(arrayBuffer);

  const sheets: SheetData[] = [];

  workbook.eachSheet((worksheet) => {
    const rows: string[][] = [];
    let headers: string[] = [];
    let headerRowIndex = 0;

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const rowData: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        let value = '';
        if (cell.value !== null && cell.value !== undefined) {
          if (typeof cell.value === 'object') {
            if ('richText' in cell.value) {
              value = cell.value.richText.map((rt: any) => rt.text).join('');
            } else if ('text' in cell.value) {
              value = String(cell.value.text);
            } else if ('result' in cell.value) {
              value = String(cell.value.result);
            } else {
              value = String(cell.value);
            }
          } else {
            value = String(cell.value);
          }
        }
        // Pad with empty strings if there are gaps
        while (rowData.length < colNumber - 1) {
          rowData.push('');
        }
        rowData.push(value);
      });
      rows.push(rowData);
    });

    // Auto-detect header row (first row with multiple non-empty cells)
    for (let i = 0; i < rows.length; i++) {
      const nonEmptyCells = rows[i].filter(cell => cell.trim() !== '').length;
      if (nonEmptyCells >= 2) {
        headerRowIndex = i;
        headers = rows[i];
        break;
      }
    }

    if (rows.length > 0) {
      sheets.push({
        name: worksheet.name,
        headers,
        rows,
        headerRowIndex,
      });
    }
  });

  return {
    fileName: file.name,
    sheets,
  };
}

export function formatExcelDataAsJson(
  sheets: SheetData[],
  selectedRows: Map<string, Set<number>>
): string {
  const result: Record<string, any[]> = {};

  sheets.forEach(sheet => {
    const sheetSelections = selectedRows.get(sheet.name);
    if (!sheetSelections || sheetSelections.size === 0) return;

    const headers = sheet.headers.length > 0 ? sheet.headers : sheet.rows[0] || [];
    const dataRows: any[] = [];

    sheetSelections.forEach(rowIndex => {
      if (rowIndex === sheet.headerRowIndex) return; // Skip header row
      const row = sheet.rows[rowIndex];
      if (!row) return;

      const rowObj: Record<string, string> = {};
      headers.forEach((header, colIndex) => {
        const key = header.trim() || `Column${colIndex + 1}`;
        rowObj[key] = row[colIndex] || '';
      });
      dataRows.push(rowObj);
    });

    if (dataRows.length > 0) {
      result[sheet.name] = dataRows;
    }
  });

  return JSON.stringify(result, null, 2);
}

export function formatExcelDataAsMarkdown(
  sheets: SheetData[],
  selectedRows: Map<string, Set<number>>
): string {
  const lines: string[] = [];

  sheets.forEach(sheet => {
    const sheetSelections = selectedRows.get(sheet.name);
    if (!sheetSelections || sheetSelections.size === 0) return;

    lines.push(`## ${sheet.name}\n`);

    const headers = sheet.headers.length > 0 ? sheet.headers : sheet.rows[0] || [];
    
    // Header row
    lines.push('| ' + headers.map(h => h.trim() || '-').join(' | ') + ' |');
    lines.push('| ' + headers.map(() => '---').join(' | ') + ' |');

    // Data rows
    sheetSelections.forEach(rowIndex => {
      if (rowIndex === sheet.headerRowIndex) return;
      const row = sheet.rows[rowIndex];
      if (!row) return;
      
      const cells = headers.map((_, colIndex) => (row[colIndex] || '').replace(/\|/g, '\\|'));
      lines.push('| ' + cells.join(' | ') + ' |');
    });

    lines.push('');
  });

  return lines.join('\n');
}
