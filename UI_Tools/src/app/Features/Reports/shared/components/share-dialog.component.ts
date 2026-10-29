import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../../../services/toast.service';
import { ReportsService } from '../reports.service';
import { EmployeeOption, ReportShare } from '../report.models';
import { ModalComponent } from './modal.component';

/** Owner picks users and gives each one View or Edit access to a report. */
@Component({
  selector: 'app-share-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalComponent],
  template: `
    <app-modal title="Share Report" [subtitle]="reportName" (closed)="closed.emit()">
      <div class="relative">
        <label class="mb-1 block text-xs font-semibold text-slate-500">Add people</label>
        <input [(ngModel)]="search" (focus)="pickerOpen = true" placeholder="Search by name or token number..."
               class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
        @if (pickerOpen && search.trim()) {
          <ul class="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            @for (emp of candidates; track emp.Employee_ID) {
              <li>
                <button type="button" (click)="add(emp)" class="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50">
                  <span class="text-slate-700">{{ emp.Employee_Name }}</span>
                  <span class="text-xs text-slate-400">{{ emp.Employee_No }}</span>
                </button>
              </li>
            } @empty {
              <li class="px-3 py-2 text-sm text-slate-400">No matching user.</li>
            }
          </ul>
        }
      </div>

      <div class="mt-5">
        <p class="mb-2 text-xs font-semibold text-slate-500">People with access</p>
        @if (loading) {
          <div class="space-y-2">
            <div class="h-10 animate-pulse rounded-lg bg-slate-100"></div>
            <div class="h-10 animate-pulse rounded-lg bg-slate-100"></div>
          </div>
        } @else {
          <ul class="divide-y divide-slate-100 rounded-lg border border-slate-200">
            @for (share of shares; track share.Employee_ID) {
              <li class="flex items-center gap-3 px-3 py-2">
                <div class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                  {{ initials(share.Employee_Name) }}
                </div>
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-medium text-slate-700">{{ share.Employee_Name }}</p>
                  <p class="text-xs text-slate-400">{{ share.Employee_No }}</p>
                </div>
                <select [(ngModel)]="share.Can_Edit"
                        class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs focus:border-blue-500 focus:outline-none">
                  <option [ngValue]="false">Can view</option>
                  <option [ngValue]="true">Can edit</option>
                </select>
                <button type="button" (click)="remove(share)" title="Remove access"
                        class="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600">
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              </li>
            } @empty {
              <li class="px-3 py-6 text-center text-sm text-slate-400">Only you can see this report.</li>
            }
          </ul>
          <p class="mt-2 text-[11px] text-slate-400">"Can edit" users can change the chart settings and filters. Only you can delete or re-share the report.</p>
        }
      </div>

      <ng-container modal-footer>
        <button type="button" (click)="closed.emit()"
                class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
        <button type="button" (click)="save()" [disabled]="saving || loading"
                class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-300">
          {{ saving ? 'Saving...' : 'Save Access' }}
        </button>
      </ng-container>
    </app-modal>
  `,
})
export class ShareDialogComponent implements OnInit {
  @Input({ required: true }) reportId!: number;
  @Input() reportName = '';
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<number>(); // new share count

  readonly reportsService = inject(ReportsService);
  readonly toastService = inject(ToastService);

  employees: EmployeeOption[] = [];
  shares: ReportShare[] = [];
  search = '';
  pickerOpen = false;
  loading = true;
  saving = false;

  get candidates(): EmployeeOption[] {
    const q = this.search.trim().toLowerCase();
    const me = this.reportsService.employeeId;
    return this.employees
      .filter((e) => e.Employee_ID !== me && !this.shares.some((s) => s.Employee_ID === e.Employee_ID))
      .filter((e) => e.Employee_Name?.toLowerCase().includes(q) || e.Employee_No?.toLowerCase().includes(q))
      .slice(0, 20);
  }

  ngOnInit() {
    this.reportsService.getEmployees().subscribe((employees) => (this.employees = employees ?? []));
    this.reportsService.getReportShares(this.reportId).subscribe({
      next: (shares) => {
        this.shares = shares ?? [];
        this.loading = false;
      },
      error: () => (this.loading = false),
    });
  }

  add(emp: EmployeeOption) {
    this.shares = [
      ...this.shares,
      { Employee_ID: emp.Employee_ID, Employee_Name: emp.Employee_Name, Employee_No: emp.Employee_No, Can_Edit: false },
    ];
    this.search = '';
    this.pickerOpen = false;
  }

  remove(share: ReportShare) {
    this.shares = this.shares.filter((s) => s !== share);
  }

  initials(name: string): string {
    const words = (name || '').trim().split(/\s+/);
    return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase();
  }

  save() {
    this.saving = true;
    this.reportsService.saveReportShares(this.reportId, this.shares).subscribe({
      next: (res) => {
        this.saving = false;
        if (res?.isSuccessMessage) {
          this.toastService.showSuccess('Sharing updated', `${this.shares.length} user(s) have access.`);
          this.saved.emit(this.shares.length);
          this.closed.emit();
        }
      },
      error: () => (this.saving = false),
    });
  }
}
