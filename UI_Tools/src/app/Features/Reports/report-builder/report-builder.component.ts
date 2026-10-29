import { CommonModule } from '@angular/common';
import {
  Component,
  ComponentRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  ViewContainerRef,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, of, switchMap } from 'rxjs';
import { ConfirmationService, ToastService } from '../../../services';
import { ReportsService } from '../shared/reports.service';
import { DatasetColumn, DatasetRow, ReportConfig, ReportDetail, ReportFilter } from '../shared/report.models';
import { ChartDefinition, ReportChart, getChartDefinition } from '../shared/chart-registry';
import {
  applyFilters,
  describeFilter,
  distinctValues,
  operatorNeedsValue,
  operatorsFor,
} from '../shared/data.util';
import { exportCsv, exportExcel, exportPdf, exportPng, safeFileName, ReportExportInput } from '../shared/export.util';
import { DataTableComponent } from '../shared/components/data-table.component';
import { ShareDialogComponent } from '../shared/components/share-dialog.component';

type ExportFormat = 'pdf' | 'excel' | 'csv' | 'png';

@Component({
  selector: 'app-report-builder',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, DataTableComponent, ShareDialogComponent],
  templateUrl: './report-builder.component.html',
})
export class ReportBuilderComponent implements OnInit, OnDestroy {
  //*************************************************** Dependency Start *************************************//
  readonly reportsService = inject(ReportsService);
  readonly toastService = inject(ToastService);
  readonly confirmationService = inject(ConfirmationService);
  readonly route = inject(ActivatedRoute);
  readonly router = inject(Router);
  //*************************************************** Dependency End ****************************************//

  @ViewChild('chartHost', { read: ViewContainerRef, static: true }) private chartHost!: ViewContainerRef;
  private chartRef: ComponentRef<ReportChart> | null = null;
  private chartSub?: Subscription;
  private dataSub?: Subscription;

  report: ReportDetail | null = null;
  chartDef: ChartDefinition | undefined;
  columns: DatasetColumn[] = [];
  rows: DatasetRow[] = [];
  filteredRows: DatasetRow[] = [];

  reportName = '';
  description = '';
  filters: ReportFilter[] = [];
  chartConfig: any = {};

  loading = true;
  chartLoading = false;
  saving = false;
  dirty = false;
  dataDirty = false; // rows were changed through the chart's data editor
  exporting: ExportFormat | null = null;
  showExportMenu = false;
  showShare = false;
  showFilters = true;
  showData = true;

  readonly operatorsFor = operatorsFor;
  readonly needsValue = operatorNeedsValue;

  get canEdit(): boolean {
    return !!this.report?.Can_Edit;
  }

  get isOwner(): boolean {
    return !!this.report?.Is_Owner;
  }

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id) {
      this.router.navigate(['/reports/myreports']);
      return;
    }
    this.reportsService.getReportById(id).subscribe({
      next: (report) => {
        if (!report) {
          this.loading = false;
          return;
        }
        this.setReport(report);
      },
      error: () => this.router.navigate(['/reports/myreports']),
    });
  }

  ngOnDestroy() {
    this.chartSub?.unsubscribe();
    this.dataSub?.unsubscribe();
    this.chartRef?.destroy();
  }

  private setReport(report: ReportDetail) {
    this.report = report;
    this.chartDef = getChartDefinition(report.Chart_Type_Code);
    this.reportName = report.Report_Name;
    this.description = report.Description;
    this.columns = safeParse<DatasetColumn[]>(report.Columns_Json, []);
    this.rows = safeParse<DatasetRow[]>(report.Rows_Json, []);

    const config = safeParse<Partial<ReportConfig>>(report.Config_Json, {});
    // drop filters on columns that were removed from the dataset
    this.filters = (config.filters ?? []).filter((f) => this.columns.some((c) => c.key === f.columnKey));
    this.chartConfig = config.chart ?? {};
    this.filteredRows = applyFilters(this.rows, this.columns, this.filters);
    this.loading = false;
    this.mountChart();
  }

  //********************************************** Chart Host Start **********************************************//
  private async mountChart() {
    if (!this.chartDef?.loadComponent) return;
    this.chartLoading = true;
    const component = await this.chartDef.loadComponent();
    this.chartHost.clear();
    this.chartRef = this.chartHost.createComponent(component);
    this.chartRef.setInput('columns', this.columns);
    this.chartRef.setInput('rows', this.filteredRows);
    this.chartRef.setInput('config', this.chartConfig);
    this.chartRef.setInput('readonly', !this.canEdit);
    this.chartSub = this.chartRef.instance.configChange.subscribe((config: any) => {
      this.chartConfig = config;
      this.markDirty();
    });

    // charts with in-place data entry edit the dataset rows directly (owner only — datasets are private)
    const dataChange = this.chartRef.instance.dataChange;
    if (dataChange) {
      this.chartRef.setInput('dataRows', this.rows);
      this.chartRef.setInput('canEditData', this.isOwner);
      this.chartRef.setInput('filtersActive', this.filters.length > 0);
      this.dataSub = dataChange.subscribe(() => {
        this.dataDirty = true;
        this.markDirty();
        // always a new array: rows were edited in place, so the chart / table must see a new reference
        this.filteredRows = [...applyFilters(this.rows, this.columns, this.filters)];
        this.chartRef?.setInput('rows', this.filteredRows);
      });
    }
    this.chartLoading = false;
  }
  //********************************************** Chart Host End **********************************************//

  //********************************************** Filters Start **********************************************//
  columnOf(key: string): DatasetColumn | undefined {
    return this.columns.find((c) => c.key === key);
  }

  suggestions(key: string): string[] {
    const column = this.columnOf(key);
    if (!column || column.type === 'number') return [];
    return distinctValues(this.rows, key).slice(0, 200);
  }

  addFilter() {
    const column = this.columns[0];
    if (!column) return;
    this.filters = [...this.filters, { columnKey: column.key, operator: column.type === 'text' ? 'equals' : 'gte', value: '' }];
    this.showFilters = true;
  }

  onFilterColumnChange(filter: ReportFilter) {
    const type = this.columnOf(filter.columnKey)?.type ?? 'text';
    if (!operatorsFor(type).some((o) => o.value === filter.operator)) filter.operator = 'equals';
    filter.value = '';
    this.applyFilterChange();
  }

  removeFilter(index: number) {
    this.filters = this.filters.filter((_, i) => i !== index);
    this.applyFilterChange();
  }

  clearFilters() {
    this.filters = [];
    this.applyFilterChange();
  }

  applyFilterChange() {
    this.filteredRows = applyFilters(this.rows, this.columns, this.filters);
    this.chartRef?.setInput('rows', this.filteredRows);
    if (this.chartRef?.instance.dataChange) this.chartRef.setInput('filtersActive', this.filters.length > 0);
    if (this.canEdit) this.markDirty();
  }

  get filterSummary(): string {
    return this.filters
      .map((f) => describeFilter(f, this.columns))
      .filter((t) => t)
      .join(' AND ');
  }
  //********************************************** Filters End **********************************************//

  //********************************************** Save Start **********************************************//
  markDirty() {
    this.dirty = true;
  }

  save() {
    if (!this.report || !this.canEdit) return;
    if (!this.reportName.trim()) {
      this.toastService.showWarning('Name required', 'Please give the report a name.');
      return;
    }
    const config: ReportConfig = { filters: this.filters, chart: this.chartConfig };
    const report = this.report;
    this.saving = true;

    const saveReport$ = this.reportsService.updateReport(report.Report_ID, {
      Report_Name: this.reportName.trim(),
      Description: this.description.trim(),
      Config_Json: JSON.stringify(config),
      Employee_ID: this.reportsService.employeeId,
      Host: this.reportsService.host,
    });

    // data edited in the chart → save the dataset first (keeping its name / source), then the report
    const request$ = this.dataDirty
      ? this.reportsService.getDatasetById(report.Dataset_ID).pipe(
          switchMap((dataset) =>
            this.reportsService.updateDataset(report.Dataset_ID, {
              Dataset_Name: dataset.Dataset_Name,
              Description: dataset.Description,
              Source_Type: dataset.Source_Type,
              Source_File_Name: dataset.Source_File_Name || null,
              Columns_Json: JSON.stringify(this.columns),
              Rows_Json: JSON.stringify(this.cleanRows()),
              Employee_ID: this.reportsService.employeeId,
              Plant_ID: this.reportsService.plantId,
              Host: this.reportsService.host,
            })
          ),
          switchMap((datasetId) => (datasetId ? saveReport$ : of(null)))
        )
      : saveReport$;

    request$.subscribe({
      next: (id) => {
        this.saving = false;
        if (!id) return;
        this.dirty = false;
        this.dataDirty = false;
        report.Report_Name = this.reportName.trim();
        this.toastService.showSuccess('Report saved', this.reportName.trim());
      },
      error: () => (this.saving = false),
    });
  }

  /** Drop rows the data editor left without any value */
  private cleanRows(): DatasetRow[] {
    return this.rows.filter((r) => this.columns.some((c) => r[c.key] !== null && r[c.key] !== undefined && `${r[c.key]}`.trim() !== ''));
  }

  /** Used by the route guard and the browser close warning */
  hasUnsavedChanges(): boolean {
    return this.dirty && this.canEdit;
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent) {
    if (this.hasUnsavedChanges()) event.preventDefault();
  }

  @HostListener('document:click')
  closeMenus() {
    this.showExportMenu = false;
  }
  //********************************************** Save End **********************************************//

  //********************************************** Export Start **********************************************//
  async export(format: ExportFormat) {
    this.showExportMenu = false;
    if (!this.report) return;

    const chart = this.chartRef?.instance;
    const subtitleParts = [
      this.report.Chart_Type_Name,
      `Dataset: ${this.report.Dataset_Name}`,
      `${this.filteredRows.length} of ${this.rows.length} rows`,
    ];
    if (this.filterSummary) subtitleParts.push(`Filters: ${this.filterSummary}`);

    const input: ReportExportInput = {
      title: this.reportName || this.report.Report_Name,
      subtitle: subtitleParts.join('  ·  '),
      fileName: safeFileName(this.reportName || this.report.Report_Name),
      svg: chart?.getExportSvg() ?? null,
      columns: this.columns,
      rows: this.filteredRows,
      tables: chart?.getExportTables?.() ?? [],
    };

    this.exporting = format;
    try {
      if (format === 'pdf') await exportPdf(input);
      else if (format === 'excel') await exportExcel(input);
      else if (format === 'png') await exportPng(input);
      else exportCsv(input);
    } catch (e: any) {
      console.error('Export failed', e);
      this.toastService.showError('Export failed', e?.message || 'Please try again.');
    } finally {
      this.exporting = null;
    }
  }
  //********************************************** Export End **********************************************//

  async deleteReport() {
    if (!this.report || !this.isOwner) return;
    const confirmed = await this.confirmationService.confirmDelete(
      'Delete Report',
      'This report and its sharing will be removed. The dataset is not affected.',
      this.report.Report_Name
    );
    if (!confirmed) return;
    this.reportsService.deleteReport(this.report.Report_ID).subscribe((res) => {
      if (res?.isSuccessMessage) {
        this.dirty = false;
        this.toastService.showSuccess('Deleted', this.report!.Report_Name);
        this.router.navigate(['/reports/myreports']);
      }
    });
  }
}

function safeParse<T>(json: string | null | undefined, fallback: T): T {
  try {
    return json ? (JSON.parse(json) as T) : fallback;
  } catch {
    return fallback;
  }
}
