import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatasetColumn, DatasetRow } from '../report.models';
import { formatCell, searchRows, sortRows } from '../data.util';

/** Read-only data grid with search, click-to-sort headers and paging. */
@Component({
  selector: 'app-data-table',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h3 class="text-sm font-bold text-slate-800">{{ title }}</h3>
          <p class="text-xs text-slate-500">
            {{ view.length }} of {{ rows.length }} rows{{ search ? ' match "' + search + '"' : '' }}
          </p>
        </div>
        <div class="relative w-full sm:w-64">
          <svg class="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" /><path stroke-linecap="round" d="m20 20-3.5-3.5" />
          </svg>
          <input [(ngModel)]="search" (ngModelChange)="page = 1; refresh()" placeholder="Search in data..."
                 class="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="min-w-full text-left text-sm">
          <thead class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th class="w-12 px-3 py-2.5 font-semibold">#</th>
              @for (c of columns; track c.key) {
                <th class="cursor-pointer select-none whitespace-nowrap px-3 py-2.5 font-semibold hover:text-slate-800" (click)="toggleSort(c)">
                  <span class="inline-flex items-center gap-1">
                    {{ c.name }}
                    @if (sortKey === c.key) {
                      <span class="text-blue-600">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
                    } @else {
                      <span class="text-slate-300">↕</span>
                    }
                  </span>
                </th>
              }
            </tr>
          </thead>
          <tbody>
            @for (row of pageRows; track $index) {
              <tr class="border-t border-slate-100 hover:bg-slate-50">
                <td class="px-3 py-2 text-xs text-slate-400">{{ (page - 1) * pageSize + $index + 1 }}</td>
                @for (c of columns; track c.key) {
                  <td class="max-w-xs truncate px-3 py-2 text-slate-700" [class.text-right]="c.type === 'number'"
                      [title]="format(row[c.key])">{{ format(row[c.key]) }}</td>
                }
              </tr>
            } @empty {
              <tr>
                <td [attr.colspan]="columns.length + 1" class="px-4 py-10 text-center text-sm text-slate-400">No rows to show.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      @if (totalPages > 1) {
        <div class="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
          <span>Page {{ page }} of {{ totalPages }}</span>
          <div class="flex gap-1">
            <button type="button" (click)="go(page - 1)" [disabled]="page === 1"
                    class="rounded-md border border-slate-300 px-3 py-1 font-semibold hover:bg-slate-50 disabled:opacity-40">Prev</button>
            <button type="button" (click)="go(page + 1)" [disabled]="page === totalPages"
                    class="rounded-md border border-slate-300 px-3 py-1 font-semibold hover:bg-slate-50 disabled:opacity-40">Next</button>
          </div>
        </div>
      }
    </div>
  `,
})
export class DataTableComponent implements OnChanges {
  @Input() title = 'Data';
  @Input() columns: DatasetColumn[] = [];
  @Input() rows: DatasetRow[] = [];
  @Input() pageSize = 25;

  search = '';
  sortKey = '';
  sortDir: 'asc' | 'desc' = 'asc';
  page = 1;

  view: DatasetRow[] = [];
  pageRows: DatasetRow[] = [];
  totalPages = 1;

  readonly format = formatCell;

  ngOnChanges() {
    this.refresh();
  }

  toggleSort(column: DatasetColumn) {
    if (this.sortKey === column.key) {
      if (this.sortDir === 'asc') this.sortDir = 'desc';
      else this.sortKey = ''; // third click clears the sort
    } else {
      this.sortKey = column.key;
      this.sortDir = 'asc';
    }
    this.refresh();
  }

  go(page: number) {
    this.page = Math.min(Math.max(page, 1), this.totalPages);
    this.slice();
  }

  refresh() {
    const searched = searchRows(this.rows, this.columns, this.search);
    this.view = sortRows(searched, this.columns.find((c) => c.key === this.sortKey), this.sortDir);
    this.totalPages = Math.max(Math.ceil(this.view.length / this.pageSize), 1);
    this.page = Math.min(this.page, this.totalPages);
    this.slice();
  }

  private slice() {
    const start = (this.page - 1) * this.pageSize;
    this.pageRows = this.view.slice(start, start + this.pageSize);
  }
}
