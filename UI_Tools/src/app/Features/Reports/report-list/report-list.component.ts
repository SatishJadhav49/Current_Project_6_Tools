import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ConfirmationService, ToastService } from '../../../services';
import { ReportsService } from '../shared/reports.service';
import { ReportSummary } from '../shared/report.models';
import { CHART_DEFINITIONS, ChartDefinition, getChartDefinition, getChartDefinitionBySlug } from '../shared/chart-registry';
import { NewReportDialogComponent } from '../shared/components/new-report-dialog.component';
import { ShareDialogComponent } from '../shared/components/share-dialog.component';

@Component({
  selector: 'app-report-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, NewReportDialogComponent, ShareDialogComponent],
  templateUrl: './report-list.component.html',
})
export class ReportListComponent implements OnInit {
  //*************************************************** Dependency Start *************************************//
  readonly reportsService = inject(ReportsService);
  readonly toastService = inject(ToastService);
  readonly confirmationService = inject(ConfirmationService);
  readonly route = inject(ActivatedRoute);
  readonly router = inject(Router);
  //*************************************************** Dependency End ****************************************//

  readonly charts = CHART_DEFINITIONS;

  reports: ReportSummary[] = [];
  loading = true;

  tab: 'mine' | 'shared' = 'mine';
  search = '';
  chartFilter = ''; // chart type code, '' = all

  /** Set when opened from a chart menu shortcut, e.g. /reports/fishbone */
  focusChart: ChartDefinition | undefined;

  showNewReport = false;
  newReportChart: string | null = null;
  shareReport: ReportSummary | null = null;

  ngOnInit() {
    this.route.paramMap.subscribe((params) => {
      this.focusChart = getChartDefinitionBySlug(params.get('chartSlug'));
      this.chartFilter = this.focusChart?.code ?? '';
    });
    this.loadReports();
  }

  loadReports() {
    this.loading = true;
    this.reportsService.getReportList().subscribe({
      next: (reports) => {
        this.reports = reports ?? [];
        this.loading = false;
      },
      error: () => (this.loading = false),
    });
  }

  get myCount(): number {
    return this.reports.filter((r) => r.Is_Owner).length;
  }

  get sharedCount(): number {
    return this.reports.filter((r) => !r.Is_Owner).length;
  }

  get filteredReports(): ReportSummary[] {
    const q = this.search.trim().toLowerCase();
    return this.reports
      .filter((r) => (this.tab === 'mine' ? r.Is_Owner : !r.Is_Owner))
      .filter((r) => !this.chartFilter || r.Chart_Type_Code === this.chartFilter)
      .filter(
        (r) =>
          !q ||
          r.Report_Name.toLowerCase().includes(q) ||
          r.Dataset_Name.toLowerCase().includes(q) ||
          r.Owner_Name.toLowerCase().includes(q) ||
          (r.Description || '').toLowerCase().includes(q)
      );
  }

  chartOf(code: string): ChartDefinition | undefined {
    return getChartDefinition(code);
  }

  reportCountFor(code: string): number {
    return this.reports.filter((r) => r.Chart_Type_Code === code).length;
  }

  //********************************************** Actions Start **********************************************//
  openNewReport(chartCode: string | null = null) {
    const chart = chartCode ? getChartDefinition(chartCode) : undefined;
    if (chart && !chart.loadComponent) {
      this.toastService.showInfo(chart.name, 'This chart is coming in a future release.');
      return;
    }
    this.newReportChart = chartCode;
    this.showNewReport = true;
  }

  openReport(report: ReportSummary) {
    this.router.navigate(['/reports/view', report.Report_ID]);
  }

  async deleteReport(report: ReportSummary, event: Event) {
    event.stopPropagation();
    const confirmed = await this.confirmationService.confirmDelete(
      'Delete Report',
      'This report and its sharing will be removed. The dataset is not affected.',
      report.Report_Name
    );
    if (!confirmed) return;

    this.reportsService.deleteReport(report.Report_ID).subscribe((res) => {
      if (res?.isSuccessMessage) {
        this.toastService.showSuccess('Deleted', report.Report_Name);
        this.reports = this.reports.filter((r) => r.Report_ID !== report.Report_ID);
      }
    });
  }

  openShare(report: ReportSummary, event: Event) {
    event.stopPropagation();
    this.shareReport = report;
  }

  onShared(count: number) {
    if (this.shareReport) this.shareReport.Share_Count = count;
  }
  //********************************************** Actions End **********************************************//
}
