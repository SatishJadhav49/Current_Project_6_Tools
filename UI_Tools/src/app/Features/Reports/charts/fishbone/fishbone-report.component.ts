import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatasetColumn, DatasetRow } from '../../shared/report.models';
import { ExportTable, ReportChart } from '../../shared/chart-registry';
import { FishboneDiagramComponent } from './fishbone-diagram.component';
import {
  FISHBONE_LIMITS,
  FishboneBuildResult,
  FishboneConfig,
  buildFishbone,
  normalizeFishboneConfig,
} from './fishbone.model';

/** Fishbone chart type: column mapping panel + diagram. Created dynamically by the report builder. */
@Component({
  selector: 'app-fishbone-report',
  standalone: true,
  imports: [CommonModule, FormsModule, FishboneDiagramComponent],
  templateUrl: './fishbone-report.component.html',
})
export class FishboneReportComponent implements ReportChart<FishboneConfig>, OnChanges {
  @Input() columns: DatasetColumn[] = [];
  @Input() rows: DatasetRow[] = [];
  @Input() config!: FishboneConfig;
  @Input() readonly = false;
  @Output() configChange = new EventEmitter<FishboneConfig>();

  @ViewChild(FishboneDiagramComponent) private diagram?: FishboneDiagramComponent;

  readonly limits = FISHBONE_LIMITS;
  readonly colors = FishboneDiagramComponent.COLORS;

  cfg!: FishboneConfig;
  result!: FishboneBuildResult;
  showSettings = true;

  get numericColumns(): DatasetColumn[] {
    return this.columns.filter((c) => c.type === 'number');
  }

  get mappingReady(): boolean {
    return !!this.cfg.categoryColumn && !!this.cfg.causeColumn && this.cfg.categoryColumn !== this.cfg.causeColumn;
  }

  get drawnCauses(): number {
    return this.result.data.categories.reduce((n, c) => n + c.causes.length, 0);
  }

  ngOnChanges(changes: SimpleChanges) {
    // rows change on every filter edit — only re-read the config when it (or the columns) really changed,
    // otherwise unsaved settings would be reset
    if (!this.cfg || changes['config'] || changes['columns']) {
      this.cfg = normalizeFishboneConfig(this.config, this.columns);
    }
    this.rebuild();
  }

  //********************************************** Config Start **********************************************//
  onConfigChanged() {
    this.rebuild();
    this.configChange.emit({ ...this.cfg, selectedCategories: [...this.cfg.selectedCategories] });
  }

  isSelected(name: string): boolean {
    const selected = this.cfg.selectedCategories;
    if (!selected.length) return this.result.data.categories.some((c) => c.name === name);
    return selected.some((s) => s.toLowerCase() === name.toLowerCase());
  }

  canSelectMore(): boolean {
    const current = this.cfg.selectedCategories.length || this.result.data.categories.length;
    return current < this.limits.MAX_CATEGORIES;
  }

  toggleCategory(name: string) {
    // first manual pick starts from what is drawn right now
    let selected = this.cfg.selectedCategories.length
      ? [...this.cfg.selectedCategories]
      : this.result.data.categories.map((c) => c.name);
    const index = selected.findIndex((s) => s.toLowerCase() === name.toLowerCase());
    if (index >= 0) selected.splice(index, 1);
    else if (selected.length < this.limits.MAX_CATEGORIES) selected.push(name);
    this.cfg.selectedCategories = selected;
    this.onConfigChanged();
  }

  resetCategories() {
    this.cfg.selectedCategories = [];
    this.onConfigChanged();
  }

  private rebuild() {
    this.result = buildFishbone(this.rows, this.cfg);
  }
  //********************************************** Config End **********************************************//

  //********************************************** Export Start **********************************************//
  getExportSvg(): SVGSVGElement | null {
    return this.diagram?.svgElement ?? null;
  }

  getExportTables(): ExportTable[] {
    const countHeader = this.cfg.countColumn
      ? this.columns.find((c) => c.key === this.cfg.countColumn)?.name ?? 'Count'
      : 'Occurrences';
    return [
      {
        title: 'Fishbone Causes',
        headers: ['Category', 'Cause', countHeader, 'Drawn on diagram'],
        rows: this.result.allCategories.flatMap((cat) => {
          const drawn = this.result.data.categories.find((d) => d.name === cat.name);
          return cat.causes.map((cause) => [
            cat.name,
            cause.text,
            cause.count,
            drawn?.causes.some((d) => d.text === cause.text) ? 'Yes' : 'No',
          ]);
        }),
      },
    ];
  }
  //********************************************** Export End **********************************************//
}
