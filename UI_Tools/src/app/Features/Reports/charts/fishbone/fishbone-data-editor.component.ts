import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService } from '../../../../services/confirmation.service';
import { DatasetColumn, DatasetRow } from '../../shared/report.models';
import { FishboneDiagramComponent } from './fishbone-diagram.component';

interface CategoryGroup {
  name: string;
  rows: DatasetRow[]; // every row of this category — references into the dataset rows, edits write straight into them
  causes: DatasetRow[]; // rows shown as causes (category-only placeholder rows are hidden)
  newCause: string;
}

/**
 * Card based Fishbone data entry (same feel as the Demo_Tools POC editor):
 * one card per category, causes listed inside, ✕ to remove, + to add.
 * It edits the dataset rows in place — each cause is one row (Category, Cause, optional count),
 * so other columns of an uploaded dataset are kept untouched.
 */
@Component({
  selector: 'app-fishbone-data-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 class="text-sm font-bold text-slate-800">{{ title }}</h3>
          <p class="mt-0.5 text-xs text-slate-500">{{ hint }}</p>
        </div>
        <div class="min-w-[260px]">
          <label class="mb-1 block text-xs font-semibold text-slate-500">New category</label>
          <div class="flex gap-2">
            <input #categoryInput (input)="newCategoryName = categoryInput.value" (keyup.enter)="addCategory(categoryInput)" maxlength="40" [disabled]="readonly"
                   placeholder="e.g. Management"
                   class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-slate-100" />
            <button type="button" (click)="addCategory(categoryInput)" [disabled]="readonly || !newCategoryName.trim()"
                    class="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300">
              + Add
            </button>
          </div>
        </div>
      </div>

      @if (!groups.length) {
        <div class="rounded-lg border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500">
          No categories yet — add one above (Man, Machine, Method, Material, Measurement, Environment…).
        </div>
      }

      <div class="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        @for (group of groups; track group; let i = $index) {
          <div class="flex flex-col rounded-lg border border-slate-200">
            <!-- category header -->
            <div class="flex items-center gap-1 rounded-t-lg px-3 py-2" [style.background]="colorOf(i)">
              <input [ngModel]="group.name" (change)="renameCategory(group, $any($event.target).value)" [disabled]="readonly"
                     maxlength="40" title="Click to rename"
                     class="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-sm font-bold text-white placeholder:text-white/60 hover:border-white/40 focus:border-white focus:bg-white/10 focus:outline-none" />
              <span class="shrink-0 text-xs font-medium text-white/70">{{ group.causes.length }}</span>
              @if (!readonly) {
                <button type="button" (click)="removeCategory(group)" title="Remove category"
                        class="shrink-0 rounded px-1.5 text-white/80 hover:bg-white/20 hover:text-white">&#10005;</button>
              }
            </div>

            <!-- causes -->
            <ul class="max-h-56 flex-1 overflow-y-auto px-3 py-2">
              @for (row of group.causes; track row) {
                <li class="flex items-center gap-2 border-b border-slate-100 py-1 last:border-0">
                  <input [ngModel]="row[causeKey]" (ngModelChange)="setCause(row, $event)" [disabled]="readonly" maxlength="200"
                         [title]="row[causeKey] ?? ''"
                         class="min-w-0 flex-1 truncate rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-slate-600 hover:border-slate-200 focus:border-blue-500 focus:bg-white focus:outline-none" />
                  @if (countKey) {
                    <input type="number" min="0" [ngModel]="row[countKey]" (ngModelChange)="setCount(row, $event)" [disabled]="readonly"
                           [title]="countName"
                           class="w-12 shrink-0 rounded border border-slate-200 px-1.5 py-0.5 text-right text-xs text-slate-600 focus:border-blue-500 focus:outline-none" />
                  }
                  @if (!readonly) {
                    <button type="button" (click)="removeCause(group, row)" title="Remove cause"
                            class="shrink-0 rounded px-1 text-slate-300 hover:bg-red-50 hover:text-red-500">&#10005;</button>
                  }
                </li>
              } @empty {
                <li class="py-1 text-xs italic text-slate-400">No causes yet</li>
              }
            </ul>

            <!-- add cause -->
            @if (!readonly) {
              <div class="flex gap-1.5 border-t border-slate-100 p-2">
                <input #causeInput (input)="group.newCause = causeInput.value" (keyup.enter)="addCause(group, causeInput)" maxlength="200" placeholder="Add cause..."
                       class="w-full rounded border border-slate-200 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none" />
                <button type="button" (click)="addCause(group, causeInput)" [disabled]="!group.newCause.trim()"
                        class="shrink-0 rounded bg-slate-800 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-700 disabled:bg-slate-300">+</button>
              </div>
            }
          </div>
        }
      </div>

      @if (groups.length > maxCategories) {
        <p class="mt-3 text-xs text-amber-700">The diagram draws {{ maxCategories }} categories at a time — pick which ones in the Fishbone settings.</p>
      }
    </div>
  `,
})
export class FishboneDataEditorComponent implements OnChanges {
  @Input({ required: true }) columns: DatasetColumn[] = [];
  /** Mutated in place — the parent keeps the same array reference */
  @Input({ required: true }) rows: DatasetRow[] = [];
  @Input({ required: true }) categoryKey = '';
  @Input({ required: true }) causeKey = '';
  @Input() countKey = '';
  @Input() readonly = false;
  @Input() title = 'Fishbone Data';
  @Input() hint = 'Add categories and their causes. Click a name to rename it, ✕ to remove. Categories without causes are not saved.';
  @Input() maxCategories = 6;
  @Output() changed = new EventEmitter<void>();

  readonly confirmationService = inject(ConfirmationService);

  groups: CategoryGroup[] = [];
  newCategoryName = '';

  get countName(): string {
    return this.columns.find((c) => c.key === this.countKey)?.name ?? 'Count';
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['rows'] || changes['categoryKey'] || changes['causeKey']) this.buildGroups();
  }

  //********************************************** Grouping Start **********************************************//
  private buildGroups() {
    // keep categories the user added that have no rows yet
    const emptyGroups = this.groups.filter((g) => !g.rows.length);
    const map = new Map<string, CategoryGroup>();
    for (const row of this.rows) {
      const name = `${row[this.categoryKey] ?? ''}`.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!map.has(key)) map.set(key, { name, rows: [], causes: [], newCause: '' });
      const group = map.get(key)!;
      group.rows.push(row);
      if (!this.isPlaceholder(row)) group.causes.push(row);
    }
    for (const g of emptyGroups) if (!map.has(g.name.toLowerCase())) map.set(g.name.toLowerCase(), g);
    this.groups = [...map.values()];
  }

  /** Rows that only carry the category name (e.g. from the 6M template) are placeholders, not causes */
  private isPlaceholder(row: DatasetRow): boolean {
    return `${row[this.causeKey] ?? ''}`.trim() === '';
  }

  colorOf(i: number): string {
    return FishboneDiagramComponent.COLORS[i % FishboneDiagramComponent.COLORS.length];
  }
  //********************************************** Grouping End **********************************************//

  //********************************************** Editing Start **********************************************//
  // The add boxes are cleared through the element itself: with event coalescing a fast "type + Enter"
  // can skip the change detection pass that would let ngModel notice the value went back to ''.
  addCategory(input: HTMLInputElement) {
    const name = input.value.trim();
    input.value = '';
    this.newCategoryName = '';
    if (!name) return;
    if (this.groups.some((g) => g.name.toLowerCase() === name.toLowerCase())) return;
    this.groups.push({ name, rows: [], causes: [], newCause: '' });
  }

  renameCategory(group: CategoryGroup, value: string) {
    const name = `${value ?? ''}`.trim();
    if (!name || name === group.name) return;
    group.name = name;
    group.rows.forEach((r) => (r[this.categoryKey] = name));
    this.changed.emit();
  }

  async removeCategory(group: CategoryGroup) {
    const causes = group.causes.length;
    if (causes) {
      const ok = await this.confirmationService.confirmDelete(
        'Remove category',
        `This removes the category and its ${causes} cause(s).`,
        group.name,
        'Remove'
      );
      if (!ok) return;
    }
    for (const row of group.rows) {
      const index = this.rows.indexOf(row);
      if (index >= 0) this.rows.splice(index, 1);
    }
    this.groups = this.groups.filter((g) => g !== group);
    if (group.rows.length) this.changed.emit();
  }

  addCause(group: CategoryGroup, input: HTMLInputElement) {
    const text = input.value.trim();
    input.value = '';
    group.newCause = '';
    if (!text) return;
    // fill a placeholder row first so the template rows don't stay behind empty
    let row = group.rows.find((r) => !group.causes.includes(r) && this.isPlaceholder(r));
    if (!row) {
      row = {};
      this.columns.forEach((c) => (row![c.key] = null));
      row[this.categoryKey] = group.name;
      this.rows.push(row);
      group.rows.push(row);
    }
    row[this.causeKey] = text;
    group.causes.push(row);
    input.focus(); // ready for the next cause
    if (this.countKey && (row[this.countKey] === null || row[this.countKey] === undefined || row[this.countKey] === '')) {
      row[this.countKey] = 1;
    }
    this.changed.emit();
  }

  setCause(row: DatasetRow, value: string) {
    row[this.causeKey] = value;
    this.changed.emit();
  }

  setCount(row: DatasetRow, value: number | string | null) {
    const n = value === null || value === '' ? null : Number(value);
    row[this.countKey] = n === null || isNaN(n) ? null : n;
    this.changed.emit();
  }

  removeCause(group: CategoryGroup, row: DatasetRow) {
    const index = this.rows.indexOf(row);
    if (index >= 0) this.rows.splice(index, 1);
    group.rows = group.rows.filter((r) => r !== row);
    group.causes = group.causes.filter((r) => r !== row);
    this.changed.emit();
  }
  //********************************************** Editing End **********************************************//
}
