import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatasetColumn, DatasetRow } from '../../shared/report.models';
import { ExportTable, ReportChart } from '../../shared/chart-registry';
import { BoxPlotDiagramComponent, BoxPlotDisplay } from './boxplot-diagram.component';
import {
  BOXPLOT_LIMITS,
  BoxPlotBuildResult,
  BoxPlotConfig,
  BoxStats,
  GROUP_BY_OPTIONS,
  MONTH_NAMES,
  buildBoxPlot,
  formatStat,
  normalizeBoxPlotConfig,
  toNumberOrNull,
} from './boxplot.model';

/** Box Plot chart type: settings panel + box & whisker diagram + statistics table. Created by the report builder. */
@Component({
  selector: 'app-boxplot-report',
  standalone: true,
  imports: [CommonModule, FormsModule, BoxPlotDiagramComponent],
  templateUrl: './boxplot-report.component.html',
})
export class BoxPlotReportComponent implements ReportChart<BoxPlotConfig>, OnChanges {
  @Input() columns: DatasetColumn[] = [];
  @Input() rows: DatasetRow[] = [];
  @Input() config!: BoxPlotConfig;
  @Input() readonly = false;
  @Output() configChange = new EventEmitter<BoxPlotConfig>();

  @ViewChild(BoxPlotDiagramComponent) private diagram?: BoxPlotDiagramComponent;

  readonly limits = BOXPLOT_LIMITS;
  readonly monthNames = MONTH_NAMES;
  readonly fmt = formatStat;

  cfg!: BoxPlotConfig;
  result!: BoxPlotBuildResult;
  display!: BoxPlotDisplay;
  showSettings = true;
  showStats = true;

  get numericColumns(): DatasetColumn[] {
    return this.columns.filter((c) => c.type === 'number');
  }

  get groupColumns(): DatasetColumn[] {
    return this.columns.filter((c) => c.key !== this.cfg.valueColumn);
  }

  get groupColumn(): DatasetColumn | undefined {
    return this.columns.find((c) => c.key === this.cfg.groupColumn);
  }

  get groupByOptions() {
    const isDate = this.groupColumn?.type === 'date';
    return GROUP_BY_OPTIONS.filter((o) => isDate || !o.dateOnly);
  }

  get usesYearStart(): boolean {
    return ['year', 'quarter', 'quarterOfYear', 'monthOfYear'].includes(this.cfg.groupBy) && this.groupColumn?.type === 'date';
  }

  get valueName(): string {
    return this.columns.find((c) => c.key === this.cfg.valueColumn)?.name ?? 'Value';
  }

  get hasSpecs(): boolean {
    return this.cfg.lsl !== null || this.cfg.usl !== null;
  }

  get tooManyPoints(): boolean {
    return this.result.groups.some((g) => g.n > BOXPLOT_LIMITS.MAX_POINTS_PER_GROUP);
  }

  get whiskerText(): string {
    return this.cfg.whisker === 'tukey' ? '1.5 × IQR' : 'min – max';
  }

  /** Statistics of every value together — shown as the first row of the table */
  get overall(): BoxStats | null {
    return this.result.overall;
  }

  ngOnChanges(changes: SimpleChanges) {
    // rows change on every filter edit — only re-read the config when it (or the columns) really changed
    if (!this.cfg || changes['config'] || changes['columns']) {
      this.cfg = normalizeBoxPlotConfig(this.config, this.columns);
    }
    this.rebuild();
  }

  //********************************************** Config Start **********************************************//
  onConfigChanged() {
    this.rebuild();
    this.configChange.emit({ ...this.cfg });
  }

  onValueColumnChange() {
    if (this.cfg.groupColumn === this.cfg.valueColumn) this.cfg.groupColumn = '';
    this.onConfigChanged();
  }

  onGroupColumnChange() {
    // a date column defaults to months, anything else uses its values directly
    this.cfg.groupBy = this.groupColumn?.type === 'date' ? 'month' : 'value';
    this.onConfigChanged();
  }

  onSpecChange(field: 'lsl' | 'usl' | 'target', value: string | number | null) {
    this.cfg[field] = toNumberOrNull(value);
    this.onConfigChanged();
  }

  private rebuild() {
    const built = buildBoxPlot(this.rows, this.columns, this.cfg);
    this.result = built;
    this.display = {
      title: this.cfg.title.trim(),
      yAxisLabel: this.cfg.yAxisLabel.trim() || this.valueName,
      xAxisLabel: this.groupColumn ? this.xAxisLabel() : '',
      showOutliers: this.cfg.showOutliers && this.cfg.whisker === 'tukey', // min–max whiskers have no outliers
      showMean: this.cfg.showMean,
      showPoints: this.cfg.showPoints,
      connectMedians: this.cfg.connectMedians,
      colorByGroup: this.cfg.colorByGroup,
      lsl: this.cfg.lsl,
      usl: this.cfg.usl,
      target: this.cfg.target,
    };
  }

  private xAxisLabel(): string {
    const name = this.groupColumn?.name ?? '';
    if (this.cfg.groupBy === 'value') return name;
    const period = GROUP_BY_OPTIONS.find((o) => o.value === this.cfg.groupBy)?.label.replace(/\s*\(.*\)$/, '') ?? '';
    const fy = this.usesYearStart && this.cfg.yearStartMonth !== 1 ? `, FY from ${MONTH_NAMES[this.cfg.yearStartMonth - 1]}` : '';
    return `${name} (by ${period.toLowerCase()}${fy})`;
  }
  //********************************************** Config End **********************************************//

  //********************************************** Capability Start **********************************************//
  /** Cpk against the spec limits (Cpu / Cpl when only one limit is set) */
  cpk(s: BoxStats): number | null {
    const { lsl, usl } = this.cfg;
    if ((lsl === null && usl === null) || s.n < 2 || !s.stdDev) return null;
    const upper = usl !== null ? (usl - s.mean) / (3 * s.stdDev) : Infinity;
    const lower = lsl !== null ? (s.mean - lsl) / (3 * s.stdDev) : Infinity;
    return Math.min(upper, lower);
  }

  outOfSpec(s: BoxStats): number {
    const { lsl, usl } = this.cfg;
    return s.values.filter((v) => (lsl !== null && v < lsl) || (usl !== null && v > usl)).length;
  }

  cpkClass(value: number | null): string {
    if (value === null) return 'text-slate-400';
    if (value >= 1.33) return 'text-emerald-700';
    if (value >= 1) return 'text-amber-700';
    return 'text-red-600';
  }
  //********************************************** Capability End **********************************************//

  //********************************************** Export Start **********************************************//
  getExportSvg(): SVGSVGElement | null {
    return this.result.groups.length ? this.diagram?.svgElement ?? null : null;
  }

  getExportTables(): ExportTable[] {
    const headers = ['Group', 'N', 'Min', 'Q1', 'Median', 'Q3', 'Max', 'IQR', 'Mean', 'Std Dev', 'Lower Whisker', 'Upper Whisker', 'Outliers'];
    if (this.hasSpecs) headers.push('Cpk', 'Out of Spec');
    const toRow = (s: BoxStats): (string | number | null)[] => {
      const row: (string | number | null)[] = [
        s.label,
        s.n,
        round(s.min),
        round(s.q1),
        round(s.median),
        round(s.q3),
        round(s.max),
        round(s.iqr),
        round(s.mean),
        round(s.stdDev),
        round(s.lowerWhisker),
        round(s.upperWhisker),
        s.outliers.length ? s.outliers.map((v) => round(v)).join(', ') : 0,
      ];
      if (this.hasSpecs) {
        const cpk = this.cpk(s);
        row.push(cpk === null ? null : round(cpk), this.outOfSpec(s));
      }
      return row;
    };
    const rows = this.result.allGroups.map(toRow);
    if (this.overall && this.result.allGroups.length > 1) rows.push(toRow({ ...this.overall, label: 'All values' }));
    return [{ title: `Box Plot Statistics — ${this.valueName}`, headers, rows }];
  }
  //********************************************** Export End **********************************************//
}

function round(value: number): number {
  return +value.toFixed(4);
}
