import { CellValue, ColumnType, DatasetColumn, DatasetRow, FilterOperator, ReportFilter } from './report.models';

//********************************************** Limits Start **********************************************//
export const DATASET_LIMITS = {
  MAX_ROWS: 20000,
  MAX_COLUMNS: 50,
  MAX_FILE_MB: 10,
};
//********************************************** Limits End **********************************************//

//********************************************** Filters Start **********************************************//
export const FILTER_OPERATORS: { value: FilterOperator; label: string; needsValue: boolean; types: ColumnType[] }[] = [
  { value: 'equals', label: 'equals', needsValue: true, types: ['text', 'number', 'date'] },
  { value: 'notEquals', label: 'not equals', needsValue: true, types: ['text', 'number', 'date'] },
  { value: 'contains', label: 'contains', needsValue: true, types: ['text'] },
  { value: 'notContains', label: 'does not contain', needsValue: true, types: ['text'] },
  { value: 'gt', label: '>', needsValue: true, types: ['number', 'date'] },
  { value: 'gte', label: '>=', needsValue: true, types: ['number', 'date'] },
  { value: 'lt', label: '<', needsValue: true, types: ['number', 'date'] },
  { value: 'lte', label: '<=', needsValue: true, types: ['number', 'date'] },
  { value: 'isEmpty', label: 'is empty', needsValue: false, types: ['text', 'number', 'date'] },
  { value: 'isNotEmpty', label: 'is not empty', needsValue: false, types: ['text', 'number', 'date'] },
];

export function operatorsFor(type: ColumnType) {
  return FILTER_OPERATORS.filter((o) => o.types.includes(type));
}

export function operatorNeedsValue(operator: FilterOperator): boolean {
  return FILTER_OPERATORS.find((o) => o.value === operator)?.needsValue ?? true;
}

/** All filters are AND-ed. Filters on columns that no longer exist are ignored. */
export function applyFilters(rows: DatasetRow[], columns: DatasetColumn[], filters: ReportFilter[]): DatasetRow[] {
  const active = (filters || []).filter((f) => {
    const column = columns.find((c) => c.key === f.columnKey);
    return column && (!operatorNeedsValue(f.operator) || `${f.value ?? ''}`.trim() !== '');
  });
  if (!active.length) return rows;

  return rows.filter((row) =>
    active.every((f) => {
      const column = columns.find((c) => c.key === f.columnKey)!;
      return matchFilter(row[f.columnKey], f, column.type);
    })
  );
}

function matchFilter(raw: CellValue, filter: ReportFilter, type: ColumnType): boolean {
  const isEmpty = raw === null || raw === undefined || `${raw}`.trim() === '';
  if (filter.operator === 'isEmpty') return isEmpty;
  if (filter.operator === 'isNotEmpty') return !isEmpty;
  if (isEmpty) return filter.operator === 'notEquals' || filter.operator === 'notContains';

  const text = `${raw}`.trim().toLowerCase();
  const target = `${filter.value}`.trim().toLowerCase();

  if (type === 'number' || type === 'date') {
    const a = type === 'number' ? Number(raw) : Date.parse(`${raw}`);
    const b = type === 'number' ? Number(filter.value) : Date.parse(`${filter.value}`);
    if (!isNaN(a) && !isNaN(b)) {
      switch (filter.operator) {
        case 'equals': return a === b;
        case 'notEquals': return a !== b;
        case 'gt': return a > b;
        case 'gte': return a >= b;
        case 'lt': return a < b;
        case 'lte': return a <= b;
      }
    }
  }

  switch (filter.operator) {
    case 'equals': return text === target;
    case 'notEquals': return text !== target;
    case 'contains': return text.includes(target);
    case 'notContains': return !text.includes(target);
    default: return true;
  }
}

export function describeFilter(filter: ReportFilter, columns: DatasetColumn[]): string {
  const column = columns.find((c) => c.key === filter.columnKey);
  const operator = FILTER_OPERATORS.find((o) => o.value === filter.operator);
  if (!column || !operator) return '';
  return `${column.name} ${operator.label}${operator.needsValue ? ' "' + filter.value + '"' : ''}`;
}
//********************************************** Filters End **********************************************//

//********************************************** Sort + Search Start **********************************************//
export function compareCells(a: CellValue, b: CellValue, type: ColumnType): number {
  const aEmpty = a === null || a === undefined || a === '';
  const bEmpty = b === null || b === undefined || b === '';
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1; // empty always last
  if (bEmpty) return -1;
  if (type === 'number') return Number(a) - Number(b);
  if (type === 'date') return Date.parse(`${a}`) - Date.parse(`${b}`);
  return `${a}`.localeCompare(`${b}`, undefined, { numeric: true, sensitivity: 'base' });
}

export function sortRows(rows: DatasetRow[], column: DatasetColumn | undefined, direction: 'asc' | 'desc'): DatasetRow[] {
  if (!column) return rows;
  const factor = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const result = compareCells(a[column.key], b[column.key], column.type);
    // keep empties last for both directions
    const aEmpty = a[column.key] === null || a[column.key] === '';
    const bEmpty = b[column.key] === null || b[column.key] === '';
    return aEmpty || bEmpty ? result : result * factor;
  });
}

export function searchRows(rows: DatasetRow[], columns: DatasetColumn[], term: string): DatasetRow[] {
  const q = term.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => columns.some((c) => `${row[c.key] ?? ''}`.toLowerCase().includes(q)));
}
//********************************************** Sort + Search End **********************************************//

//********************************************** Columns + Values Start **********************************************//
export function nextColumnKey(columns: DatasetColumn[]): string {
  const max = columns.reduce((m, c) => Math.max(m, Number(c.key.replace(/\D/g, '')) || 0), 0);
  return `c${max + 1}`;
}

/** Converts raw text into the stored value for a column type ('' → null). */
export function normalizeCell(value: unknown, type: ColumnType): CellValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return type === 'date' ? toIsoDate(value) : value.toISOString();
  const text = `${value}`.trim();
  if (text === '') return null;
  if (type === 'number') {
    const n = parseNumber(text);
    return n === null ? text : n; // keep the original text so nothing is silently lost
  }
  if (type === 'date') {
    const d = parseDate(text);
    return d ? toIsoDate(d) : text;
  }
  return text;
}

export function parseNumber(text: string): number | null {
  const cleaned = text.replace(/,/g, '').trim();
  if (cleaned === '' || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?%?$/i.test(cleaned)) return null;
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function parseDate(text: string): Date | null {
  // yyyy-mm-dd, dd-mm-yyyy, dd/mm/yyyy (Indian format first), or anything Date can read
  let m = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  m = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return validDate(+m[3], +m[2], +m[1]);
  if (!/[a-z]{3}/i.test(text)) return null;
  const parsed = Date.parse(text);
  return isNaN(parsed) ? null : new Date(parsed);
}

function validDate(y: number, mo: number, d: number): Date | null {
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? date : null;
}

export function toIsoDate(d: Date): string {
  const pad = (n: number) => `${n}`.padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** number if every non-empty value is numeric, date if every one is a date, otherwise text. */
export function inferColumnType(values: unknown[]): ColumnType {
  const filled = values.filter((v) => v !== null && v !== undefined && `${v}`.trim() !== '');
  if (!filled.length) return 'text';
  if (filled.every((v) => typeof v === 'number' || (typeof v === 'string' && parseNumber(v) !== null))) return 'number';
  if (filled.every((v) => v instanceof Date || (typeof v === 'string' && parseDate(v) !== null))) return 'date';
  return 'text';
}

/** Distinct non-empty values of a column, in first-seen order. */
export function distinctValues(rows: DatasetRow[], key: string): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    const value = row[key];
    if (value === null || value === undefined) continue;
    const text = `${value}`.trim();
    if (text) seen.add(text);
  }
  return [...seen];
}

export function formatCell(value: CellValue): string {
  return value === null || value === undefined ? '' : `${value}`;
}
//********************************************** Columns + Values End **********************************************//
