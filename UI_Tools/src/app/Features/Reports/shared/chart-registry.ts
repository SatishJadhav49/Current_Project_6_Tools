import { EventEmitter, Type } from '@angular/core';
import { DatasetColumn, DatasetRow } from './report.models';

//********************************************** Chart Contract Start **********************************************//
/**
 * Every chart type is one standalone component that implements this contract.
 * The report builder creates it dynamically, feeds it the (already filtered) rows
 * and saves whatever it emits through configChange into Config_Json.chart.
 */
export interface ReportChart<TConfig = any> {
  columns: DatasetColumn[];
  rows: DatasetRow[];
  config: TConfig;
  readonly: boolean;
  configChange: EventEmitter<TConfig>;

  /** The rendered chart used for PNG / PDF / Excel image export */
  getExportSvg(): SVGSVGElement | null;

  /** Optional chart-specific tables added to Excel / PDF exports (e.g. categories + causes) */
  getExportTables?(): ExportTable[];

  /**
   * Optional in-place data entry (e.g. Fishbone category cards). When the chart has it, the builder
   * passes every dataset row (unfiltered) and saves the dataset when dataChange fires.
   */
  dataChange?: EventEmitter<void>;
}

export interface ExportTable {
  title: string;
  headers: string[];
  rows: (string | number | null)[][];
}
//********************************************** Chart Contract End **********************************************//

//********************************************** Registry Start **********************************************//
export interface ChartDefinition {
  code: string; // matches RPT_Chart_Type.Chart_Type_Code
  name: string;
  description: string;
  slug: string; // menu shortcut: /reports/<slug>
  icon: string; // svg path(s) for a 24x24 stroke icon
  color: string;
  /** Present only once the chart is built — everything else shows as "Coming soon" */
  loadComponent?: () => Promise<Type<ReportChart>>;
  /** First config for a new report — lets the chart pre-pick sensible columns */
  defaultConfig?: (columns: DatasetColumn[]) => any;
}

// To add a chart in a future phase: build the component, add loadComponent + defaultConfig here,
// and set RPT_Chart_Type.Is_Available = 1 for its code.
export const CHART_DEFINITIONS: ChartDefinition[] = [
  {
    code: 'FISHBONE',
    name: 'Fishbone',
    description: 'Ishikawa cause & effect diagram grouped by category.',
    slug: 'fishbone',
    icon: 'M2 12h15M17 12l5-4v8zM6 12 3 6M10 12 7 6M14 12l-3-6M6 12l-3 6M10 12l-3 6M14 12l-3 6',
    color: '#e31837',
    loadComponent: () =>
      import('../charts/fishbone/fishbone-report.component').then((m) => m.FishboneReportComponent),
    defaultConfig: (columns) =>
      import('../charts/fishbone/fishbone.model').then((m) => m.defaultFishboneConfig(columns)),
  },
  {
    code: 'BOX_PLOT',
    name: 'Box Plot',
    description: 'Spread, median and outliers of a numeric measure.',
    slug: 'boxplot',
    icon: 'M12 3v4M12 17v4M7 7h10v10H7zM7 12h10M9 3h6M9 21h6',
    color: '#2563eb',
    loadComponent: () =>
      import('../charts/boxplot/boxplot-report.component').then((m) => m.BoxPlotReportComponent),
    defaultConfig: (columns) =>
      import('../charts/boxplot/boxplot.model').then((m) => m.defaultBoxPlotConfig(columns)),
  },
  {
    code: 'PARETO',
    name: 'Pareto Chart',
    description: 'Ranked bars with cumulative % (80/20 rule).',
    slug: 'pareto',
    icon: 'M4 20V8h3v12M9 20v-9h3v9M14 20v-6h3v6M19 20v-3h2M4 6c5 0 10 1 17 6',
    color: '#059669',
  },
  {
    code: 'HISTOGRAM',
    name: 'Histogram',
    description: 'Frequency distribution of a numeric measure.',
    slug: 'histogram',
    icon: 'M3 20h18M5 20v-5h3v5M8 20v-9h3v9M11 20V6h3v14M14 20v-8h3v8M17 20v-4h3v4',
    color: '#d97706',
  },
  {
    code: 'CONTROL_CHART',
    name: 'Control Chart',
    description: 'Process values against UCL / CL / LCL over time.',
    slug: 'controlchart',
    icon: 'M3 5h18M3 19h18M3 12h18M3 14l4-5 4 6 4-7 3 4 3-2',
    color: '#7c3aed',
  },
  {
    code: 'SCATTER',
    name: 'Scatter Diagram',
    description: 'Relationship between two numeric measures.',
    slug: 'scatter',
    icon: 'M3 3v18h18M8 15h.01M11 12h.01M14 13h.01M16 8h.01M19 6h.01M10 17h.01',
    color: '#0891b2',
  },
  {
    code: 'STRATIFICATION',
    name: 'Stratification',
    description: 'Split data into groups to reveal hidden patterns.',
    slug: 'stratification',
    icon: 'M4 6h16M4 12h16M4 18h16M8 4v4M14 10v4M10 16v4',
    color: '#db2777',
  },
  {
    code: 'FAULT_TREE',
    name: 'Fault Tree Analysis',
    description: 'Top-down logic tree of failure events.',
    slug: 'faulttree',
    icon: 'M9 3h6v4H9zM12 7v4M6 11h12M6 11v3M18 11v3M3 14h6v4H3zM15 14h6v4h-6z',
    color: '#475569',
  },
];

export function getChartDefinition(code: string | null | undefined): ChartDefinition | undefined {
  return CHART_DEFINITIONS.find((c) => c.code === code);
}

export function getChartDefinitionBySlug(slug: string | null | undefined): ChartDefinition | undefined {
  return CHART_DEFINITIONS.find((c) => c.slug === slug);
}

export function isChartBuilt(code: string): boolean {
  return !!getChartDefinition(code)?.loadComponent;
}
//********************************************** Registry End **********************************************//
