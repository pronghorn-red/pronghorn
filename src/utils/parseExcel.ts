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
  warnings?: string[];
}

export async function parseExcelFile(file: File): Promise<ExcelData> {
  const workbook = new ExcelJS.Workbook();
  const arrayBuffer = await file.arrayBuffer();
  
  const warnings: string[] = [];
  
  try {
    await workbook.xlsx.load(arrayBuffer);
  } catch (loadError: any) {
    // If main load fails, try with a simpler approach
    console.error('ExcelJS load error:', loadError);
    throw new Error(`Failed to parse Excel file: ${loadError.message}`);
  }

  const sheets: SheetData[] = [];

  workbook.eachSheet((worksheet) => {
    const rows: string[][] = [];
    let headers: string[] = [];
    let headerRowIndex = 0;

    try {
      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        const rowData: string[] = [];
        
        try {
          row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            let value = '';
            try {
              if (cell.value !== null && cell.value !== undefined) {
                if (typeof cell.value === 'object') {
                  const cellValue = cell.value as any;
                  
                  // Rich text - concatenate all text parts
                  if ('richText' in cellValue && Array.isArray(cellValue.richText)) {
                    value = cellValue.richText.map((rt: any) => rt.text).join('');
                  }
                  // Hyperlink - get the text, not the hyperlink object
                  else if ('text' in cellValue && typeof cellValue.text === 'string') {
                    value = cellValue.text;
                  }
                  // Formula cell - get the calculated result, NOT the formula itself
                  else if ('formula' in cellValue || 'sharedFormula' in cellValue) {
                    if ('result' in cellValue && cellValue.result !== undefined && cellValue.result !== null) {
                      // Handle error results from formulas
                      if (typeof cellValue.result === 'object' && cellValue.result !== null) {
                        if ('error' in cellValue.result) {
                          value = '#ERROR';
                        } else {
                          // Try to extract a meaningful value from the result object
                          value = '';
                        }
                      } else {
                        // Normal formula result - number, string, boolean
                        value = String(cellValue.result);
                      }
                    } else {
                      // Formula without calculated result - leave empty rather than show formula
                      value = '';
                    }
                  }
                  // Error value in cell
                  else if ('error' in cellValue) {
                    value = '#ERROR';
                  }
                  // Date object
                  else if (cellValue instanceof Date) {
                    value = cellValue.toISOString();
                  }
                  // Check for 'result' property (another formula format)
                  else if ('result' in cellValue && cellValue.result !== undefined) {
                    if (typeof cellValue.result === 'object' && cellValue.result !== null) {
                      value = '';
                    } else {
                      value = String(cellValue.result);
                    }
                  }
                  // Unknown object - avoid [object Object]
                  else {
                    // Try common value extraction patterns
                    if ('value' in cellValue && typeof cellValue.value !== 'object') {
                      value = String(cellValue.value);
                    } else if ('valueOf' in cellValue && typeof cellValue.valueOf === 'function') {
                      const v = cellValue.valueOf();
                      if (typeof v !== 'object') {
                        value = String(v);
                      } else {
                        console.warn(`Unhandled cell object at row ${rowNumber}, col ${colNumber}:`, Object.keys(cellValue));
                        value = '';
                      }
                    } else {
                      console.warn(`Unknown cell object at row ${rowNumber}, col ${colNumber}:`, Object.keys(cellValue));
                      value = '';
                    }
                  }
                } else {
                  value = String(cell.value);
                }
              }
            } catch (cellError) {
              // Skip problematic cells (like those with AutoFilter data)
              console.warn(`Cell parsing error at row ${rowNumber}, col ${colNumber}:`, cellError);
              value = '';
            }
            
            // Pad with empty strings if there are gaps
            while (rowData.length < colNumber - 1) {
              rowData.push('');
            }
            rowData.push(value);
          });
        } catch (rowCellError: any) {
          // Handle row-level cell iteration errors (often caused by AutoFilter/filters)
          if (rowCellError.message?.includes('filterButton') || 
              rowCellError.message?.includes('Cannot set properties of undefined')) {
            warnings.push(`Row ${rowNumber}: Some cell formatting was skipped due to Excel filter features`);
          } else {
            console.warn(`Row ${rowNumber} cell iteration error:`, rowCellError);
          }
        }
        
        if (rowData.length > 0) {
          rows.push(rowData);
        }
      });
    } catch (sheetError: any) {
      // Handle sheet-level errors gracefully
      console.error(`Sheet "${worksheet.name}" parsing error:`, sheetError);
      warnings.push(`Sheet "${worksheet.name}": Some data may be incomplete due to parsing issues`);
    }

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

  // If no sheets were parsed successfully, throw an error
  if (sheets.length === 0) {
    throw new Error('No data could be extracted from the Excel file. The file may be corrupted or in an unsupported format.');
  }

  return {
    fileName: file.name,
    sheets,
    warnings: warnings.length > 0 ? warnings : undefined
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
