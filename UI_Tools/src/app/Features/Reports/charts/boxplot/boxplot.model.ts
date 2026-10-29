import { DatasetColumn, DatasetRow } from '../../shared/report.models';
import { parseNumber } from '../../shared/data.util';

//********************************************** Models Start **********************************************//
/** How the X axis column is turned into groups */
export type BoxPlotGroupBy =
  | 'value' // the column values as they are (Line A, Shift 1, 2024, Jan...)
  | 'year'
  | 'quarter' // Q1 2024
  | 'month' // Jan 2024
  | 'week' // ISO week 2024-W05
  | 'day'
  | 'quarterOfYear' // Q1..Q4 across all years
  | 'monthOfYear'; // Jan..Dec across all years

export type BoxPlotGroupSort = 'natural' | 'dataset' | 'medianDesc' | 'medianAsc';
export type BoxPlotWhisker = 'tukey' | 'minmax';

/** Saved in Config_Json.chart for Box Plot reports */
export interface BoxPlotConfig {
  title: string;
  valueColumn: string; // numeric measure (Y axis)
  groupColumn: string; // X axis column ('' = one box for all rows)
  groupBy: BoxPlotGroupBy;
  yearStartMonth: number; // 1 = calendar year, 4 = Indian financial year (Apr–Mar)
  groupSort: BoxPlotGroupSort;
  whisker: BoxPlotWhisker;
  showOutliers: boolean;
  showMean: boolean;
  showPoints: boolean; // every value as a jittered dot
  connectMedians: boolean; // trend line through the medians — handy for Year / Month axes
  colorByGroup: boolean;
  yAxisLabel: string; // '' = value column name
  lsl: number | null; // lower spec limit
  usl: number | null; // upper spec limit
  target: number | null;
}

export interface BoxStats {
  key: string; // sort / identity key
  label: string; // shown on the X axis
  n: number;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  mean: number;
  stdDev: number;
  iqr: number;
  lowerWhisker: number;
  upperWhisker: number;
  outliers: number[];
  values: number[]; // sorted ascending
}

export interface BoxPlotBuildResult {
  groups: BoxStats[]; // what is drawn (capped)
  allGroups: BoxStats[]; // every group, sorted — used by the export
  overall: BoxStats | null; // every value together
  hiddenGroups: number;
  skippedRows: number; // no numeric value or no X value
  totalValues: number;
}

export const BOXPLOT_LIMITS = {
  MAX_GROUPS: 40, // beyond this the boxes get too thin to read
  MAX_POINTS_PER_GROUP: 400, // jittered points are skipped above this to keep the SVG light
};

export const GROUP_BY_OPTIONS: { value: BoxPlotGroupBy; label: string; dateOnly: boolean }[] = [
  { value: 'value', label: 'Column values as they are', dateOnly: false },
  { value: 'year', label: 'Year', dateOnly: true },
  { value: 'quarter', label: 'Quarter (Q1 2024)', dateOnly: true },
  { value: 'month', label: 'Month (Jan 2024)', dateOnly: true },
  { value: 'week', label: 'Week (ISO)', dateOnly: true },
  { value: 'day', label: 'Day', dateOnly: true },
  { value: 'quarterOfYear', label: 'Quarter of year (Q1–Q4, all years)', dateOnly: true },
  { value: 'monthOfYear', label: 'Month of year (Jan–Dec, all years)', dateOnly: true },
];

export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
//********************************************** Models End **********************************************//

//********************************************** Default Config Start **********************************************//
const VALUE_HINTS = ['value', 'measure', 'reading', 'result', 'thickness', 'weight', 'time', 'qty', 'quantity', 'count'];
const GROUP_HINTS = ['date', 'month', 'year', 'quarter', 'week', 'line', 'shift', 'machine', 'group', 'batch', 'lot'];

function findColumn(columns: DatasetColumn[], hints: string[], filter: (c: DatasetColumn) => boolean): string {
  const candidates = columns.filter(filter);
  for (const hint of hints) {
    const match = candidates.find((c) => c.name.toLowerCase().includes(hint));
    if (match) return match.key;
  }
  return candidates[0]?.key ?? '';
}

export function defaultBoxPlotConfig(columns: DatasetColumn[]): BoxPlotConfig {
  const valueColumn = findColumn(columns, VALUE_HINTS, (c) => c.type === 'number');
  const groupColumn =
    findColumn(columns, ['date'], (c) => c.type === 'date') ||
    findColumn(columns, GROUP_HINTS, (c) => c.key !== valueColumn && c.type !== 'number');
  const groupType = columns.find((c) => c.key === groupColumn)?.type;
  return {
    title: '',
    valueColumn,
    groupColumn,
    groupBy: groupType === 'date' ? 'month' : 'value',
    yearStartMonth: 1,
    groupSort: 'natural',
    whisker: 'tukey',
    showOutliers: true,
    showMean: true,
    showPoints: false,
    connectMedians: false,
    colorByGroup: false,
    yAxisLabel: '',
    lsl: null,
    usl: null,
    target: null,
  };
}

export function normalizeBoxPlotConfig(config: Partial<BoxPlotConfig> | null | undefined, columns: DatasetColumn[]): BoxPlotConfig {
  const defaults = defaultBoxPlotConfig(columns);
  const merged = { ...defaults, ...(config || {}) } as BoxPlotConfig;
  const column = (key: string) => columns.find((c) => c.key === key);
  if (column(merged.valueColumn)?.type !== 'number') merged.valueColumn = defaults.valueColumn;
  if (merged.groupColumn && !column(merged.groupColumn)) {
    merged.groupColumn = defaults.groupColumn;
    merged.groupBy = defaults.groupBy;
  }
  // date periods only make sense on a date column
  const option = GROUP_BY_OPTIONS.find((o) => o.value === merged.groupBy);
  if (!option || (option.dateOnly && column(merged.groupColumn)?.type !== 'date')) merged.groupBy = 'value';
  merged.yearStartMonth = Math.min(Math.max(Math.round(Number(merged.yearStartMonth) || 1), 1), 12);
  merged.lsl = toNumberOrNull(merged.lsl);
  merged.usl = toNumberOrNull(merged.usl);
  merged.target = toNumberOrNull(merged.target);
  return merged;
}

export function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || `${value}`.trim() === '') return null;
  const n = typeof value === 'number' ? value : parseNumber(`${value}`);
  return n === null || !isFinite(n) ? null : n;
}
//********************************************** Default Config End **********************************************//

//********************************************** Statistics Start **********************************************//
/** Quantile with linear interpolation — same as Excel QUARTILE.INC / PERCENTILE.INC */
export function quantile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * p;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (pos - lower);
}

export function computeBoxStats(key: string, label: string, values: number[], whisker: BoxPlotWhisker): BoxStats {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const q1 = quantile(sorted, 0.25);
  const median = quantile(sorted, 0.5);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const mean = sorted.reduce((s, v) => s + v, 0) / n;
  // sample standard deviation (n - 1), as Excel STDEV.S
  const stdDev = n > 1 ? Math.sqrt(sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)) : 0;

  let lowerWhisker = sorted[0];
  let upperWhisker = sorted[n - 1];
  let outliers: number[] = [];
  if (whisker === 'tukey') {
    // whiskers end at the furthest value still inside 1.5 × IQR of the box
    const lowFence = q1 - 1.5 * iqr;
    const highFence = q3 + 1.5 * iqr;
    lowerWhisker = sorted.find((v) => v >= lowFence) ?? q1;
    upperWhisker = [...sorted].reverse().find((v) => v <= highFence) ?? q3;
    outliers = sorted.filter((v) => v < lowFence || v > highFence);
  }

  return {
    key,
    label,
    n,
    min: sorted[0],
    q1,
    median,
    q3,
    max: sorted[n - 1],
    mean,
    stdDev,
    iqr,
    lowerWhisker,
    upperWhisker,
    outliers,
    values: sorted,
  };
}
//********************************************** Statistics End **********************************************//

//********************************************** Grouping Start **********************************************//
interface GroupKey {
  key: string;
  label: string;
  order: number; // chronological / natural order
}

/** Reads 'yyyy-mm-dd' (how dates are stored) without time zone shifts, falls back to Date.parse */
function readDate(raw: unknown): { y: number; m: number; d: number } | null {
  const text = `${raw ?? ''}`.trim();
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return { y: +iso[1], m: +iso[2], d: +iso[3] };
  const parsed = Date.parse(text);
  if (isNaN(parsed)) return null;
  const date = new Date(parsed);
  return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() };
}

function isoWeek(y: number, m: number, d: number): { year: number; week: number } {
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day); // Thursday of this week decides the year
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  return { year: date.getUTCFullYear(), week: Math.ceil(((date.getTime() - yearStart) / 86400000 + 1) / 7) };
}

/** Year label for a (possibly financial) year that starts in startMonth */
function yearLabel(fiscalYear: number, startMonth: number): string {
  if (startMonth === 1) return `${fiscalYear}`;
  return `FY ${fiscalYear}-${`${(fiscalYear + 1) % 100}`.padStart(2, '0')}`;
}

function dateGroupKey(raw: unknown, groupBy: BoxPlotGroupBy, startMonth: number): GroupKey | null {
  const date = readDate(raw);
  if (!date) return null;
  const { y, m, d } = date;
  const pad = (n: number) => `${n}`.padStart(2, '0');
  // financial year: months before the start month belong to the previous year
  const fy = m >= startMonth ? y : y - 1;
  const fyMonthIndex = (m - startMonth + 12) % 12; // 0 = first month of the year
  const fq = Math.floor(fyMonthIndex / 3) + 1;

  switch (groupBy) {
    case 'year':
      return { key: `${fy}`, label: yearLabel(fy, startMonth), order: fy };
    case 'quarter':
      return {
        key: `${fy}-Q${fq}`,
        label: startMonth === 1 ? `Q${fq} ${fy}` : `Q${fq} ${yearLabel(fy, startMonth)}`,
        order: fy * 4 + fq,
      };
    case 'month':
      return { key: `${y}-${pad(m)}`, label: `${MONTH_NAMES[m - 1]} ${y}`, order: y * 12 + m };
    case 'week': {
      const w = isoWeek(y, m, d);
      return { key: `${w.year}-W${pad(w.week)}`, label: `${w.year}-W${pad(w.week)}`, order: w.year * 60 + w.week };
    }
    case 'day':
      return { key: `${y}-${pad(m)}-${pad(d)}`, label: `${pad(d)} ${MONTH_NAMES[m - 1]} ${y}`, order: Date.UTC(y, m - 1, d) };
    case 'quarterOfYear':
      return { key: `Q${fq}`, label: `Q${fq}`, order: fq };
    case 'monthOfYear':
      // follows the year start month, e.g. Apr … Mar for a financial year
      return { key: MONTH_NAMES[m - 1], label: MONTH_NAMES[m - 1], order: fyMonthIndex };
    default:
      return null;
  }
}

const MONTH_LOOKUP: Record<string, number> = {};
MONTH_NAMES.forEach((name, i) => {
  MONTH_LOOKUP[name.toLowerCase()] = i;
  MONTH_LOOKUP[new Date(2000, i, 1).toLocaleString('en', { month: 'long' }).toLowerCase()] = i;
});
MONTH_LOOKUP['sept'] = 8;

/**
 * Natural order for raw column values: month names (Jan / January / Jan-2024), quarters (Q1 / Q1 2024 / 2024-Q1),
 * numbers (years, shifts) and finally text with numbers sorted naturally (Line 2 before Line 10).
 */
function naturalRank(label: string): number[] | null {
  const text = label.trim().toLowerCase();
  const number = parseNumber(text);
  if (number !== null) return [number];

  const quarter = text.match(/^q([1-4])[\s\-/']*(\d{2,4})?$/) || text.match(/^(\d{4})[\s\-/]*q([1-4])$/);
  if (quarter) {
    const [q, y] = /^q/.test(text) ? [+quarter[1], +(quarter[2] ?? 0)] : [+quarter[2], +quarter[1]];
    return [fullYear(y), q];
  }

  const month = text.match(/^([a-z]+)[\s\-/']*(\d{2,4})?$/) || text.match(/^(\d{4})[\s\-/]+([a-z]+)$/);
  if (month) {
    const [name, y] = /^[a-z]/.test(text) ? [month[1], +(month[2] ?? 0)] : [month[2], +month[1]];
    const index = MONTH_LOOKUP[name];
    if (index !== undefined) return [fullYear(y), index];
  }
  return null;
}

function fullYear(y: number): number {
  return y && y < 100 ? 2000 + y : y;
}

export function buildBoxPlot(rows: DatasetRow[], columns: DatasetColumn[], config: BoxPlotConfig): BoxPlotBuildResult {
  const groupColumn = columns.find((c) => c.key === config.groupColumn);
  const useDate = !!groupColumn && config.groupBy !== 'value' && groupColumn.type === 'date';
  const map = new Map<string, GroupKey & { firstSeen: number; values: number[] }>();
  let skippedRows = 0;
  let totalValues = 0;
  const allValues: number[] = [];

  for (const row of rows) {
    const raw = row[config.valueColumn];
    const value = typeof raw === 'number' ? raw : parseNumber(`${raw ?? ''}`);
    if (value === null || !isFinite(value)) {
      skippedRows++;
      continue;
    }

    let group: GroupKey | null;
    if (!groupColumn) group = { key: 'all', label: 'All values', order: 0 };
    else if (useDate) group = dateGroupKey(row[groupColumn.key], config.groupBy, config.yearStartMonth);
    else {
      const text = `${row[groupColumn.key] ?? ''}`.trim();
      group = text ? { key: text.toLowerCase(), label: text, order: 0 } : null;
    }
    if (!group) {
      skippedRows++;
      continue;
    }

    if (!map.has(group.key)) map.set(group.key, { ...group, firstSeen: map.size, values: [] });
    map.get(group.key)!.values.push(value);
    allValues.push(value);
    totalValues++;
  }

  const entries = [...map.values()];
  const stats = entries.map((e) => ({ entry: e, stats: computeBoxStats(e.key, e.label, e.values, config.whisker) }));

  stats.sort((a, b) => {
    switch (config.groupSort) {
      case 'dataset':
        return a.entry.firstSeen - b.entry.firstSeen;
      case 'medianDesc':
        return b.stats.median - a.stats.median || a.entry.firstSeen - b.entry.firstSeen;
      case 'medianAsc':
        return a.stats.median - b.stats.median || a.entry.firstSeen - b.entry.firstSeen;
      default:
        return useDate ? a.entry.order - b.entry.order : compareNatural(a.entry.label, b.entry.label);
    }
  });

  const groups = stats.map((s) => s.stats);
  return {
    groups: groups.slice(0, BOXPLOT_LIMITS.MAX_GROUPS),
    allGroups: groups,
    overall: allValues.length ? computeBoxStats('all', 'All values', allValues, config.whisker) : null,
    hiddenGroups: Math.max(groups.length - BOXPLOT_LIMITS.MAX_GROUPS, 0),
    skippedRows,
    totalValues,
  };
}

function compareNatural(a: string, b: string): number {
  const ra = naturalRank(a);
  const rb = naturalRank(b);
  if (ra && rb) {
    for (let i = 0; i < Math.max(ra.length, rb.length); i++) {
      const diff = (ra[i] ?? 0) - (rb[i] ?? 0);
      if (diff) return diff;
    }
    return 0;
  }
  if (ra) return -1; // recognised values first
  if (rb) return 1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}
//********************************************** Grouping End **********************************************//

//********************************************** Formatting Start **********************************************//
/** Rounds to a readable number of decimals for labels and tables */
export function formatStat(value: number, decimals = 3): string {
  if (value === null || value === undefined || !isFinite(value)) return '–';
  return `${+value.toFixed(decimals)}`;
}
//********************************************** Formatting End **********************************************//
