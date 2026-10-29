import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ConfirmationService, ToastService } from '../../../services';
import { ReportsService } from '../shared/reports.service';
import { DatasetSummary } from '../shared/report.models';
import { NewReportDialogComponent } from '../shared/components/new-report-dialog.component';

@Component({
  selector: 'app-dataset-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, NewReportDialogComponent],
  template: `
    <div class="mx-auto max-w-[1520px] space-y-5 p-2 md:p-4">
      <!-- ************************************ Header ************************************ -->
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-xl font-bold text-slate-800">My Datasets</h1>
          <p class="mt-0.5 text-sm text-slate-500">Upload Excel / CSV or type your data once — reuse it for any number of reports.</p>
        </div>
        <div class="flex items-center gap-2">
          <a routerLink="/reports/myreports"
             class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">My Reports</a>
          <a routerLink="/reports/datasets/new"
             class="inline-flex items-center gap-2 rounded-lg bg-[#e31837] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#c41530]">
            <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" d="M12 5v14M5 12h14" /></svg>
            New Dataset
          </a>
        </div>
      </div>

      <div class="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <p class="text-sm font-semibold text-slate-700">{{ filtered.length }} dataset(s)</p>
          <div class="relative w-full sm:w-64">
            <svg class="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" /><path stroke-linecap="round" d="m20 20-3.5-3.5" />
            </svg>
            <input [(ngModel)]="search" placeholder="Search datasets..."
                   class="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
        </div>

        @if (loading) {
          <div class="space-y-2 p-4">
            @for (i of [1, 2, 3]; track i) {
              <div class="h-14 animate-pulse rounded-lg bg-slate-100"></div>
            }
          </div>
        } @else if (!datasets.length) {
          <div class="flex flex-col items-center justify-center py-14 text-center">
            <div class="mb-3 grid h-12 w-12 place-items-center rounded-full bg-slate-100">
              <svg class="h-6 w-6 text-slate-400" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
                <ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
              </svg>
            </div>
            <p class="text-sm font-semibold text-slate-700">No datasets yet</p>
            <p class="mt-1 max-w-sm text-sm text-slate-500">Start by uploading an Excel / CSV file or entering data manually.</p>
            <a routerLink="/reports/datasets/new" class="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">Create dataset</a>
          </div>
        } @else {
          <div class="overflow-x-auto">
            <table class="min-w-full text-left text-sm">
              <thead class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th class="px-4 py-3 font-semibold">Dataset</th>
                  <th class="px-4 py-3 font-semibold">Source</th>
                  <th class="px-4 py-3 text-right font-semibold">Rows</th>
                  <th class="px-4 py-3 text-right font-semibold">Columns</th>
                  <th class="px-4 py-3 text-right font-semibold">Reports</th>
                  <th class="px-4 py-3 font-semibold">Updated</th>
                  <th class="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (d of filtered; track d.Dataset_ID) {
                  <tr class="border-t border-slate-100 hover:bg-slate-50">
                    <td class="px-4 py-3">
                      <a [routerLink]="['/reports/datasets', d.Dataset_ID]" class="font-semibold text-slate-800 hover:text-blue-600">{{ d.Dataset_Name }}</a>
                      @if (d.Description) {
                        <p class="max-w-md truncate text-xs text-slate-500" [title]="d.Description">{{ d.Description }}</p>
                      }
                    </td>
                    <td class="px-4 py-3">
                      <span class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold" [ngClass]="sourceClass(d.Source_Type)">
                        {{ d.Source_Type === 'MANUAL' ? 'Manual' : d.Source_Type }}
                      </span>
                      @if (d.Source_File_Name) {
                        <p class="mt-0.5 max-w-[180px] truncate text-[11px] text-slate-400" [title]="d.Source_File_Name">{{ d.Source_File_Name }}</p>
                      }
                    </td>
                    <td class="px-4 py-3 text-right tabular-nums text-slate-700">{{ d.Row_Count | number }}</td>
                    <td class="px-4 py-3 text-right tabular-nums text-slate-700">{{ d.Column_Count }}</td>
                    <td class="px-4 py-3 text-right tabular-nums text-slate-700">{{ d.Report_Count }}</td>
                    <td class="whitespace-nowrap px-4 py-3 text-slate-500">{{ (d.Updated_Date || d.Inserted_Date) | date: 'dd-MMM-yy HH:mm' }}</td>
                    <td class="px-4 py-3">
                      <div class="flex justify-end gap-1">
                        <button type="button" (click)="newReportFor = d.Dataset_ID"
                                class="whitespace-nowrap rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">Create report</button>
                        <a [routerLink]="['/reports/datasets', d.Dataset_ID]" title="View / edit data"
                           class="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white">Edit</a>
                        <button type="button" (click)="deleteDataset(d)" title="Delete"
                                class="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                          <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="7" class="px-4 py-10 text-center text-sm text-slate-400">No dataset matches "{{ search }}".</td></tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    </div>

    @if (newReportFor) {
      <app-new-report-dialog [presetDatasetId]="newReportFor" (closed)="newReportFor = null" />
    }
  `,
})
export class DatasetListComponent implements OnInit {
  readonly reportsService = inject(ReportsService);
  readonly toastService = inject(ToastService);
  readonly confirmationService = inject(ConfirmationService);
  readonly router = inject(Router);

  datasets: DatasetSummary[] = [];
  loading = true;
  search = '';
  newReportFor: number | null = null;

  ngOnInit() {
    this.reportsService.getDatasetList().subscribe({
      next: (datasets) => {
        this.datasets = datasets ?? [];
        this.loading = false;
      },
      error: () => (this.loading = false),
    });
  }

  get filtered(): DatasetSummary[] {
    const q = this.search.trim().toLowerCase();
    if (!q) return this.datasets;
    return this.datasets.filter(
      (d) => d.Dataset_Name.toLowerCase().includes(q) || (d.Description || '').toLowerCase().includes(q)
    );
  }

  sourceClass(source: string): string {
    switch (source) {
      case 'EXCEL':
        return 'bg-emerald-50 text-emerald-700';
      case 'CSV':
        return 'bg-sky-50 text-sky-700';
      default:
        return 'bg-slate-100 text-slate-600';
    }
  }

  async deleteDataset(dataset: DatasetSummary) {
    if (dataset.Report_Count > 0) {
      this.toastService.showWarning('Dataset in use', `${dataset.Report_Count} report(s) use this dataset. Delete them first.`, 4000);
      return;
    }
    const confirmed = await this.confirmationService.confirmDelete(
      'Delete Dataset',
      'The dataset and all its rows will be removed.',
      dataset.Dataset_Name
    );
    if (!confirmed) return;

    this.reportsService.deleteDataset(dataset.Dataset_ID).subscribe((res) => {
      if (res?.isAlertMessage) {
        this.toastService.showWarning(res.messageTitle, res.messageDetail, 4000);
      } else if (res?.isSuccessMessage) {
        this.toastService.showSuccess('Deleted', dataset.Dataset_Name);
        this.datasets = this.datasets.filter((d) => d.Dataset_ID !== dataset.Dataset_ID);
      }
    });
  }
}
