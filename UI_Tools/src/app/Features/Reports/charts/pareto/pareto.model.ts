import { DatasetColumn, DatasetRow } from '../../shared/report.models';
import { parseNumber } from '../../shared/data.util';

//********************************************** Models Start **********************************************//
/** Saved in Config_Json.chart for Pareto reports */
export interface ParetoConfig {
  title: string;
  categoryColumn: string; // defect type, cause, machine...
  valueColumn: string; // numeric column summed per category ('' = count rows)
  maxBars: number; // categories beyond this are combined into "Others"
  groupOthers: boolean; // false = extra categories are simply not drawn
  cutoff: number; // vital-few line, usually 80 %
  showCutoff: boolean;
  highlightVitalFew: boolean;
  showValueLabels: boolean;
  showPercentLabels: boolean; // cumulative % above each point of the line
  yAxisLabel: string; // '' = value column name / "Count"
}

export interface ParetoItem {
  label: string;
  value: number;
  percent: number; // share of the total
  cumulative: number; // running total
  cumulativePercent: number;
  vital: boolean; // inside the vital few (up to and including the bar that crosses the cutoff)
  isOthers: boolean;
  members: number; // categories combined in "Others" (1 for normal bars)
}

export interface ParetoBuildResult {
  items: ParetoItem[]; // what is drawn, highest first, "Others" last
  allItems: ParetoItem[]; // every category, highest first — used by the export
  total: number;
  categoryCount: number;
  vitalCount: number;
  vitalPercent: number; // share of the total covered by the vital few
  hiddenCategories: number; // only when groupOthers is off
  skippedRows: number; // empty category, non-numeric or negative value
}

export const PARETO_LIMITS = {
  MIN_BARS: 3,
  MAX_BARS: 40,
  DEFAULT_BARS: 12,
};

export const OTHERS_LABEL = 'Others';
//********************************************** Models End **********************************************//

//********************************************** Default Config Start **********************************************//
const CATEGORY_HINTS = ['defect', 'cause', 'reason', 'category', 'problem', 'issue', 'type', 'failure', 'mode'];
const VALUE_HINTS = ['count', 'qty', 'quantity', 'occurrence', 'frequency', 'nos', 'cost', 'value'];

function findColumn(columns: DatasetColumn[], hints: string[], filter: (c: DatasetColumn) => boolean): string {
  const candidates = columns.filter(filter);
  for (const hint of hints) {
    const match = candidates.find((c) => c.name.toLowerCase().includes(hint));
    if (match) return match.key;
  }
  return '';
}

export function defaultParetoConfig(columns: DatasetColumn[]): ParetoConfig {
  const categoryColumn =
    findColumn(columns, CATEGORY_HINTS, (c) => c.type === 'text') ||
    columns.find((c) => c.type === 'text')?.key ||
    columns[0]?.key ||
    '';
  return {
    title: '',
    categoryColumn,
    valueColumn: findColumn(columns, VALUE_HINTS, (c) => c.type === 'number' && c.key !== categoryColumn),
    maxBars: PARETO_LIMITS.DEFAULT_BARS,
    groupOthers: true,
    cutoff: 80,
    showCutoff: true,
    highlightVitalFew: true,
    showValueLabels: true,
    showPercentLabels: true,
    yAxisLabel: '',
  };
}

export function normalizeParetoConfig(config: Partial<ParetoConfig> | null | undefined, columns: DatasetColumn[]): ParetoConfig {
  const defaults = defaultParetoConfig(columns);
  const merged = { ...defaults, ...(config || {}) } as ParetoConfig;
  const column = (key: string) => columns.find((c) => c.key === key);
  if (!column(merged.categoryColumn)) merged.categoryColumn = defaults.categoryColumn;
  if (merged.valueColumn && column(merged.valueColumn)?.type !== 'number') merged.valueColumn = '';
  merged.maxBars = clamp(Math.round(Number(merged.maxBars) || PARETO_LIMITS.DEFAULT_BARS), PARETO_LIMITS.MIN_BARS, PARETO_LIMITS.MAX_BARS);
  merged.cutoff = clamp(Number(merged.cutoff) || 80, 1, 99);
  return merged;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
//********************************************** Default Config End **********************************************//

//********************************************** Build From Rows Start **********************************************//
export function buildPareto(rows: DatasetRow[], config: ParetoConfig): ParetoBuildResult {
  const map = new Map<string, { label: string; value: number; order: number }>();
  let skippedRows = 0;

  for (const row of rows) {
    const label = `${row[config.categoryColumn] ?? ''}`.trim();
    let value = 1;
    if (config.valueColumn) {
      const raw = row[config.valueColumn];
      const n = typeof raw === 'number' ? raw : parseNumber(`${raw ?? ''}`);
      value = n === null || !isFinite(n) ? NaN : n;
    }
    // a Pareto ranks non-negative contributions — anything else can't be placed on the chart
    if (!label || isNaN(value) || value < 0) {
      skippedRows++;
      continue;
    }
    // group case-insensitively, keep the first spelling seen
    const key = label.toLowerCase();
    if (!map.has(key)) map.set(key, { label, value: 0, order: map.size });
    map.get(key)!.value += value;
  }

  const sorted = [...map.values()].filter((e) => e.value > 0).sort((a, b) => b.value - a.value || a.order - b.order);
  const total = sorted.reduce((sum, e) => sum + e.value, 0);

  const allItems = withCumulative(
    sorted.map((e) => ({ label: e.label, value: e.value, isOthers: false, members: 1 })),
    total,
    config.cutoff
  );

  // keep the chart readable: top N bars, the rest combined into "Others" (always drawn last, never vital)
  let drawn = sorted.map((e) => ({ label: e.label, value: e.value, isOthers: false, members: 1 }));
  let hiddenCategories = 0;
  if (drawn.length > config.maxBars) {
    if (config.groupOthers) {
      const kept = drawn.slice(0, config.maxBars - 1);
      const rest = drawn.slice(config.maxBars - 1);
      drawn = [...kept, { label: OTHERS_LABEL, value: rest.reduce((s, e) => s + e.value, 0), isOthers: true, members: rest.length }];
    } else {
      hiddenCategories = drawn.length - config.maxBars;
      drawn = drawn.slice(0, config.maxBars);
    }
  }
  const items = withCumulative(drawn, total, config.cutoff);

  const vital = allItems.filter((i) => i.vital);
  return {
    items,
    allItems,
    total,
    categoryCount: sorted.length,
    vitalCount: vital.length,
    vitalPercent: vital.length ? vital[vital.length - 1].cumulativePercent : 0,
    hiddenCategories,
    skippedRows,
  };
}

function withCumulative(
  entries: { label: string; value: number; isOthers: boolean; members: number }[],
  total: number,
  cutoff: number
): ParetoItem[] {
  let cumulative = 0;
  return entries.map((e) => {
    const before = total ? (cumulative / total) * 100 : 0;
    cumulative += e.value;
    const cumulativePercent = total ? (cumulative / total) * 100 : 0;
    return {
      ...e,
      percent: total ? (e.value / total) * 100 : 0,
      cumulative,
      cumulativePercent,
      // the bar that crosses the cutoff still belongs to the vital few
      vital: !e.isOthers && before < cutoff - 1e-9,
    };
  });
}
//********************************************** Build From Rows End **********************************************//

//********************************************** Formatting Start **********************************************//
export function formatNumber(value: number, decimals = 2): string {
  if (value === null || value === undefined || !isFinite(value)) return '–';
  return (+value.toFixed(decimals)).toLocaleString('en-IN');
}

export function formatPercent(value: number, decimals = 1): string {
  if (value === null || value === undefined || !isFinite(value)) return '–';
  return `${value.toFixed(decimals)}%`;
}
//********************************************** Formatting End **********************************************//
