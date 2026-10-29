import { DatasetColumn, DatasetRow } from './report.models';
import { DATASET_LIMITS, inferColumnType, normalizeCell } from './data.util';

export type RawMatrix = unknown[][];

export interface ParsedSheet {
  name: string;
  matrix: RawMatrix;
}

export interface MatrixConversion {
  columns: DatasetColumn[];
  rows: DatasetRow[];
  truncatedRows: number;
  truncatedColumns: number;
}

//********************************************** File Read Start **********************************************//
/** Reads .csv / .xlsx into one or more raw sheets. Everything happens in the browser. */
export async function parseDataFile(file: File): Promise<ParsedSheet[]> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (file.size > DATASET_LIMITS.MAX_FILE_MB * 1024 * 1024) {
    throw new Error(`File is larger than ${DATASET_LIMITS.MAX_FILE_MB} MB.`);
  }
  if (extension === 'csv' || extension === 'txt') {
    return [{ name: file.name, matrix: parseCsv(await file.text()) }];
  }
  if (extension === 'xlsx') {
    return parseExcel(await file.arrayBuffer());
  }
  throw new Error('Only .xlsx and .csv files are supported. For .xls, save the file as .xlsx first.');
}

/** RFC 4180 CSV parser — handles quoted fields, escaped quotes and line breaks inside quotes. */
export function parseCsv(text: string): RawMatrix {
  const content = text.replace(/^﻿/, '');
  const delimiter = detectDelimiter(content);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && content[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const candidates = [',', ';', '\t', '|'];
  return candidates.reduce((best, d) => (firstLine.split(d).length > firstLine.split(best).length ? d : best), ',');
}

async function parseExcel(buffer: ArrayBuffer): Promise<ParsedSheet[]> {
  const mod: any = await import('exceljs');
  const ExcelJS = mod.default ?? mod;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheets: ParsedSheet[] = [];
  workbook.eachSheet((sheet: any) => {
    const matrix: RawMatrix = [];
    sheet.eachRow({ includeEmpty: true }, (row: any, rowNumber: number) => {
      const values: unknown[] = [];
      row.eachCell({ includeEmpty: true }, (cell: any, colNumber: number) => {
        values[colNumber - 1] = excelCellValue(cell.value);
      });
      matrix[rowNumber - 1] = values;
    });
    sheets.push({ name: sheet.name, matrix: Array.from(matrix, (r) => r ?? []) });
  });
  return sheets.filter((s) => s.matrix.length);
}

/** Flattens exceljs cell values (formula, rich text, hyperlink, error) into plain values. */
function excelCellValue(value: any): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return excelDateText(value);
  if (typeof value !== 'object') return value;
  if ('result' in value) return excelCellValue(value.result);
  if ('richText' in value) return value.richText.map((t: any) => t.text).join('');
  if ('text' in value) return value.text;
  if ('error' in value) return null;
  return `${value}`;
}

/** Excel stores dates as UTC — read UTC parts so the day never shifts with the browser timezone. */
function excelDateText(d: Date): string {
  const pad = (n: number) => `${n}`.padStart(2, '0');
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const hasTime = d.getUTCHours() || d.getUTCMinutes();
  return hasTime ? `${date} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : date;
}
//********************************************** File Read End **********************************************//

//********************************************** Matrix → Dataset Start **********************************************//
export function matrixToDataset(matrix: RawMatrix, firstRowIsHeader: boolean): MatrixConversion {
  // drop fully empty rows, then trailing empty columns
  const isBlank = (v: unknown) => v === null || v === undefined || `${v}`.trim() === '';
  const nonEmpty = matrix.filter((r) => r.some((v) => !isBlank(v)));
  const width = nonEmpty.reduce((w, r) => {
    let last = r.length - 1;
    while (last >= 0 && isBlank(r[last])) last--;
    return Math.max(w, last + 1);
  }, 0);

  const columnCount = Math.min(width, DATASET_LIMITS.MAX_COLUMNS);
  const header = firstRowIsHeader ? nonEmpty[0] ?? [] : [];
  const body = firstRowIsHeader ? nonEmpty.slice(1) : nonEmpty;
  const keptBody = body.slice(0, DATASET_LIMITS.MAX_ROWS);

  const usedNames = new Set<string>();
  const columns: DatasetColumn[] = [];
  for (let i = 0; i < columnCount; i++) {
    let name = isBlank(header[i]) ? `Column ${i + 1}` : `${header[i]}`.trim();
    // keep names unique so exports and pickers stay readable
    const base = name;
    let n = 2;
    while (usedNames.has(name.toLowerCase())) name = `${base} (${n++})`;
    usedNames.add(name.toLowerCase());

    columns.push({
      key: `c${i + 1}`,
      name,
      type: inferColumnType(keptBody.map((r) => r[i])),
    });
  }

  const rows: DatasetRow[] = keptBody.map((r) => {
    const row: DatasetRow = {};
    columns.forEach((c, i) => (row[c.key] = normalizeCell(r[i], c.type)));
    return row;
  });

  return {
    columns,
    rows,
    truncatedRows: body.length - keptBody.length,
    truncatedColumns: width - columnCount,
  };
}
//********************************************** Matrix → Dataset End **********************************************//
