import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ToastService } from '../../../../services/toast.service';
import { ReportsService } from '../reports.service';
import { DatasetColumn, DatasetSummary, ReportConfig } from '../report.models';
import { CHART_DEFINITIONS, ChartDefinition } from '../chart-registry';
import { ModalComponent } from './modal.component';

/** Name + chart type + dataset → creates the report and opens the builder. */
@Component({
  selector: 'app-new-report-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ModalComponent],
  template: `
    <app-modal title="New Report" subtitle="Pick a chart and the dataset it should be built from." (closed)="closed.emit()" size="lg">
      <div class="space-y-5">
        <div>
          <label class="mb-1 block text-xs font-semibold text-slate-500">Report name <span class="text-red-500">*</span></label>
          <input [(ngModel)]="name" maxlength="150" placeholder="e.g. Paint defects — Oct 2026 RCA" autofocus
                 class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>

        <div>
          <label class="mb-2 block text-xs font-semibold text-slate-500">Chart type <span class="text-red-500">*</span></label>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
            @for (chart of charts; track chart.code) {
              <button type="button" (click)="chart.loadComponent && (chartCode = chart.code)" [disabled]="!chart.loadComponent"
                      class="relative flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-center transition disabled:cursor-not-allowed disabled:opacity-50"
                      [ngClass]="chartCode === chart.code ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'">
                <svg class="h-6 w-6" fill="none" [attr.stroke]="chart.color" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
                  <path [attr.d]="chart.icon" />
                </svg>
                <span class="text-xs font-semibold text-slate-700">{{ chart.name }}</span>
                @if (!chart.loadComponent) {
                  <span class="text-[10px] font-medium text-slate-400">Coming soon</span>
                }
              </button>
            }
          </div>
        </div>

        <div>
          <label class="mb-1 block text-xs font-semibold text-slate-500">Dataset <span class="text-red-500">*</span></label>
          @if (loadingDatasets) {
            <div class="h-10 animate-pulse rounded-lg bg-slate-100"></div>
          } @else if (!datasets.length) {
            <div class="rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500">
              You have no datasets yet.
              <a routerLink="/reports/datasets/new" (click)="closed.emit()" class="font-semibold text-blue-600 hover:underline">Create a dataset</a>
              by uploading Excel / CSV or entering data manually.
            </div>
          } @else {
            <select [(ngModel)]="datasetId"
                    class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option [ngValue]="null" disabled>Select dataset</option>
              @for (d of datasets; track d.Dataset_ID) {
                <option [ngValue]="d.Dataset_ID">{{ d.Dataset_Name }} ({{ d.Row_Count }} rows)</option>
              }
            </select>
          }
        </div>

        <div>
          <label class="mb-1 block text-xs font-semibold text-slate-500">Description</label>
          <textarea [(ngModel)]="description" rows="2" maxlength="500" placeholder="Optional"
                    class="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"></textarea>
        </div>
      </div>

      <ng-container modal-footer>
        <button type="button" (click)="closed.emit()"
                class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
        <button type="button" (click)="create()" [disabled]="!canCreate || saving"
                class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300">
          {{ saving ? 'Creating...' : 'Create & Open' }}
        </button>
      </ng-container>
    </app-modal>
  `,
})
export class NewReportDialogComponent implements OnInit {
  @Input() presetChartCode: string | null = null;
  @Input() presetDatasetId: number | null = null;
  @Output() closed = new EventEmitter<void>();

  readonly reportsService = inject(ReportsService);
  readonly toastService = inject(ToastService);
  readonly router = inject(Router);

  readonly charts: ChartDefinition[] = CHART_DEFINITIONS;
  datasets: DatasetSummary[] = [];
  loadingDatasets = true;
  saving = false;

  name = '';
  description = '';
  chartCode = '';
  datasetId: number | null = null;

  get canCreate(): boolean {
    return !!this.name.trim() && !!this.chartCode && !!this.datasetId;
  }

  ngOnInit() {
    const preset = this.charts.find((c) => c.code === this.presetChartCode && c.loadComponent);
    this.chartCode = preset?.code ?? this.charts.find((c) => c.loadComponent)?.code ?? '';
    this.datasetId = this.presetDatasetId;

    this.reportsService.getDatasetList().subscribe({
      next: (datasets) => {
        this.datasets = datasets ?? [];
        if (!this.datasetId && this.datasets.length === 1) this.datasetId = this.datasets[0].Dataset_ID;
        this.loadingDatasets = false;
      },
      error: () => (this.loadingDatasets = false),
    });
  }

  async create() {
    if (!this.canCreate) return;
    this.saving = true;

    // let the chart pre-pick sensible columns from the dataset
    const chart = this.charts.find((c) => c.code === this.chartCode)!;
    let chartConfig: any = {};
    try {
      const dataset = await new Promise<any>((resolve, reject) =>
        this.reportsService.getDatasetById(this.datasetId!).subscribe({ next: resolve, error: reject })
      );
      const columns: DatasetColumn[] = JSON.parse(dataset?.Columns_Json || '[]');
      chartConfig = (await chart.defaultConfig?.(columns)) ?? {};
    } catch {
      chartConfig = {}; // the chart falls back to its own defaults when opened
    }
    const config: ReportConfig = { filters: [], chart: chartConfig };

    this.reportsService
      .createReport({
        Report_Name: this.name.trim(),
        Description: this.description.trim(),
        Chart_Type_Code: this.chartCode,
        Dataset_ID: this.datasetId!,
        Config_Json: JSON.stringify(config),
        Employee_ID: this.reportsService.employeeId,
        Plant_ID: this.reportsService.plantId,
        Host: this.reportsService.host,
      })
      .subscribe({
        next: (reportId) => {
          this.saving = false;
          if (!reportId) return;
          this.toastService.showSuccess('Report created', this.name.trim());
          this.closed.emit();
          this.router.navigate(['/reports/view', reportId]);
        },
        error: () => (this.saving = false),
      });
  }
}
