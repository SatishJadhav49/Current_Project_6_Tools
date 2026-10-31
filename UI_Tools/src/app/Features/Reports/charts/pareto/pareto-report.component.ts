import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatasetColumn, DatasetRow } from '../../shared/report.models';
import { ExportTable, ReportChart } from '../../shared/chart-registry';
import { ParetoDiagramComponent, ParetoDisplay } from './pareto-diagram.component';
import {
  PARETO_LIMITS,
  ParetoBuildResult,
  ParetoConfig,
  buildPareto,
  formatNumber,
  formatPercent,
  normalizeParetoConfig,
} from './pareto.model';

/** Pareto chart type: settings panel + ranked bars with cumulative % line + ranking table. Created by the report builder. */
@Component({
  selector: 'app-pareto-report',
  standalone: true,
  imports: [CommonModule, FormsModule, ParetoDiagramComponent],
  templateUrl: './pareto-report.component.html',
})
export class ParetoReportComponent implements ReportChart<ParetoConfig>, OnChanges {
  @Input() columns: DatasetColumn[] = [];
  @Input() rows: DatasetRow[] = [];
  @Input() config!: ParetoConfig;
  @Input() readonly = false;
  @Output() configChange = new EventEmitter<ParetoConfig>();

  @ViewChild(ParetoDiagramComponent) private diagram?: ParetoDiagramComponent;

  readonly limits = PARETO_LIMITS;
  readonly num = (v: number) => formatNumber(v);
  readonly pct = formatPercent;
  readonly barOptions = [5, 8, 10, 12, 15, 20, 25, 30, 40];

  cfg!: ParetoConfig;
  result!: ParetoBuildResult;
  display!: ParetoDisplay;
  showSettings = true;
  showTable = true;
  showAllRows = false;

  get categoryColumns(): DatasetColumn[] {
    return this.columns.filter((c) => c.key !== this.cfg.valueColumn);
  }

  get numericColumns(): DatasetColumn[] {
    return this.columns.filter((c) => c.type === 'number' && c.key !== this.cfg.categoryColumn);
  }

  get categoryName(): string {
    return this.columns.find((c) => c.key === this.cfg.categoryColumn)?.name ?? 'Category';
  }

  /** "Count" when rows are counted, otherwise the summed column's name */
  get valueName(): string {
    return this.cfg.valueColumn ? this.columns.find((c) => c.key === this.cfg.valueColumn)?.name ?? 'Value' : 'Count';
  }

  /** Ranking table rows — the full list, or the first 15 until "show all" */
  get tableItems() {
    return this.showAllRows ? this.result.allItems : this.result.allItems.slice(0, 15);
  }

  ngOnChanges(changes: SimpleChanges) {
    // rows change on every filter edit — only re-read the config when it (or the columns) really changed
    if (!this.cfg || changes['config'] || changes['columns']) {
      this.cfg = normalizeParetoConfig(this.config, this.columns);
    }
    this.rebuild();
  }

  //********************************************** Config Start **********************************************//
  onConfigChanged() {
    this.rebuild();
    this.configChange.emit({ ...this.cfg });
  }

  onCutoffChange(value: number | string | null) {
    const n = Number(value);
    if (!value || isNaN(n) || n < 1 || n > 99) return; // keep the last valid cut-off while typing
    this.cfg.cutoff = n;
    this.onConfigChanged();
  }

  private rebuild() {
    this.result = buildPareto(this.rows, this.cfg);
    this.display = {
      title: this.cfg.title.trim(),
      yAxisLabel: this.cfg.yAxisLabel.trim() || this.valueName,
      xAxisLabel: this.categoryName,
      total: this.result.total,
      cutoff: this.cfg.cutoff,
      showCutoff: this.cfg.showCutoff,
      highlightVitalFew: this.cfg.highlightVitalFew,
      showValueLabels: this.cfg.showValueLabels,
      showPercentLabels: this.cfg.showPercentLabels,
    };
  }
  //********************************************** Config End **********************************************//

  //********************************************** Export Start **********************************************//
  getExportSvg(): SVGSVGElement | null {
    return this.result.items.length ? this.diagram?.svgElement ?? null : null;
  }

  getExportTables(): ExportTable[] {
    return [
      {
        title: `Pareto Ranking — ${this.valueName} by ${this.categoryName}`,
        headers: ['Rank', this.categoryName, this.valueName, '% of Total', 'Cumulative', 'Cumulative %', `Within ${this.cfg.cutoff}%`],
        rows: this.result.allItems.map((item, i) => [
          i + 1,
          item.label,
          round(item.value),
          round(item.percent, 2),
          round(item.cumulative),
          round(item.cumulativePercent, 2),
          item.vital ? 'Vital few' : 'Useful many',
        ]),
      },
    ];
  }
  //********************************************** Export End **********************************************//
}

function round(value: number, decimals = 4): number {
  return +value.toFixed(decimals);
}
