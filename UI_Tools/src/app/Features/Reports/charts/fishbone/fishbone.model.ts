import { DatasetColumn, DatasetRow } from '../../shared/report.models';

//********************************************** Models Start **********************************************//
export interface FishboneCause {
  text: string;
  count: number; // occurrences (or sum of the count column)
}

export interface FishboneCategory {
  name: string;
  causes: FishboneCause[];
  total: number;
}

export interface FishboneData {
  problem: string;
  categories: FishboneCategory[];
}

export type FishboneCategorySort = 'dataset' | 'impact' | 'name';

/** Saved in Config_Json.chart for Fishbone reports */
export interface FishboneConfig {
  problem: string;
  categoryColumn: string; // column key → main bones (Man, Machine...)
  causeColumn: string; // column key → causes on each bone
  countColumn: string; // optional numeric column summed per cause ('' = count rows)
  showCounts: boolean;
  categorySort: FishboneCategorySort;
  causeSort: 'impact' | 'dataset';
  /** Categories the user picked to draw. Empty = first MAX_CATEGORIES after sorting. */
  selectedCategories: string[];
}

export const FISHBONE_LIMITS = {
  MAX_CATEGORIES: 6, // never more than 6 main bones — keeps the design readable
  MAX_CAUSES_PER_CATEGORY: 10, // hard cap so the design never breaks; extras are reported, not drawn
};
//********************************************** Models End **********************************************//

//********************************************** Default Config Start **********************************************//
const CATEGORY_HINTS = ['category', 'bone', '6m', 'main cause', 'type', 'group'];
const CAUSE_HINTS = ['cause', 'reason', 'description', 'problem', 'issue', 'defect'];
const COUNT_HINTS = ['count', 'occurrence', 'qty', 'quantity', 'frequency', 'nos'];

function findColumn(columns: DatasetColumn[], hints: string[], exclude: string[] = [], numericOnly = false): string {
  const candidates = columns.filter((c) => !exclude.includes(c.key) && (!numericOnly || c.type === 'number'));
  for (const hint of hints) {
    const match = candidates.find((c) => c.name.toLowerCase().includes(hint));
    if (match) return match.key;
  }
  return '';
}

export function defaultFishboneConfig(columns: DatasetColumn[]): FishboneConfig {
  const textColumns = columns.filter((c) => c.type !== 'number');
  const categoryColumn = findColumn(columns, CATEGORY_HINTS) || textColumns[0]?.key || columns[0]?.key || '';
  const causeColumn =
    findColumn(columns, CAUSE_HINTS, [categoryColumn]) ||
    textColumns.find((c) => c.key !== categoryColumn)?.key ||
    columns.find((c) => c.key !== categoryColumn)?.key ||
    '';
  return {
    problem: '',
    categoryColumn,
    causeColumn,
    countColumn: findColumn(columns, COUNT_HINTS, [categoryColumn, causeColumn], true),
    showCounts: true,
    categorySort: 'dataset',
    causeSort: 'impact',
    selectedCategories: [],
  };
}

export function normalizeFishboneConfig(config: Partial<FishboneConfig> | null | undefined, columns: DatasetColumn[]): FishboneConfig {
  const defaults = defaultFishboneConfig(columns);
  const merged = { ...defaults, ...(config || {}) } as FishboneConfig;
  const exists = (key: string) => columns.some((c) => c.key === key);
  if (!exists(merged.categoryColumn)) merged.categoryColumn = defaults.categoryColumn;
  if (!exists(merged.causeColumn)) merged.causeColumn = defaults.causeColumn;
  if (merged.countColumn && !exists(merged.countColumn)) merged.countColumn = '';
  merged.selectedCategories = Array.isArray(merged.selectedCategories) ? merged.selectedCategories : [];
  return merged;
}
//********************************************** Default Config End **********************************************//

//********************************************** Build From Rows Start **********************************************//
export interface FishboneBuildResult {
  data: FishboneData; // what is drawn (capped)
  allCategories: FishboneCategory[]; // every category found, sorted
  hiddenCategories: number;
  hiddenCauses: number;
  skippedRows: number; // rows without category or cause
}

export function buildFishbone(rows: DatasetRow[], config: FishboneConfig): FishboneBuildResult {
  const map = new Map<string, { name: string; order: number; causes: Map<string, FishboneCause & { order: number }> }>();
  let skippedRows = 0;

  rows.forEach((row) => {
    const category = `${row[config.categoryColumn] ?? ''}`.trim();
    const cause = `${row[config.causeColumn] ?? ''}`.trim();
    if (!category || !cause) {
      skippedRows++;
      return;
    }
    const weight = config.countColumn ? Number(row[config.countColumn]) || 0 : 1;

    // group case-insensitively, keep the first spelling seen
    const categoryKey = category.toLowerCase();
    if (!map.has(categoryKey)) map.set(categoryKey, { name: category, order: map.size, causes: new Map() });
    const entry = map.get(categoryKey)!;

    const causeKey = cause.toLowerCase();
    const existing = entry.causes.get(causeKey);
    if (existing) existing.count += weight;
    else entry.causes.set(causeKey, { text: cause, count: weight, order: entry.causes.size });
  });

  const allCategories: FishboneCategory[] = [...map.values()]
    .map((entry) => {
      const causes = [...entry.causes.values()].sort((a, b) =>
        config.causeSort === 'impact' ? b.count - a.count || a.order - b.order : a.order - b.order
      );
      return {
        name: entry.name,
        causes: causes.map(({ text, count }) => ({ text, count })),
        total: causes.reduce((sum, c) => sum + c.count, 0),
        order: entry.order,
      };
    })
    .sort((a, b) => {
      if (config.categorySort === 'impact') return b.total - a.total || a.order - b.order;
      if (config.categorySort === 'name') return a.name.localeCompare(b.name);
      return a.order - b.order;
    })
    .map(({ order, ...category }) => category);

  const selected = config.selectedCategories.map((s) => s.toLowerCase());
  const chosen = selected.length
    ? allCategories.filter((c) => selected.includes(c.name.toLowerCase()))
    : allCategories;
  const drawn = chosen.slice(0, FISHBONE_LIMITS.MAX_CATEGORIES);

  let hiddenCauses = 0;
  const categories = drawn.map((c) => {
    hiddenCauses += Math.max(c.causes.length - FISHBONE_LIMITS.MAX_CAUSES_PER_CATEGORY, 0);
    return { ...c, causes: c.causes.slice(0, FISHBONE_LIMITS.MAX_CAUSES_PER_CATEGORY) };
  });

  return {
    data: { problem: config.problem?.trim() || 'Problem / Effect', categories },
    allCategories,
    hiddenCategories: allCategories.length - drawn.length,
    hiddenCauses,
    skippedRows,
  };
}
//********************************************** Build From Rows End **********************************************//
