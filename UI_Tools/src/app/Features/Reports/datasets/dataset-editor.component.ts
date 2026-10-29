import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ConfirmationService, ToastService } from '../../../services';
import { ReportsService } from '../shared/reports.service';
import { CellValue, ColumnType, DatasetColumn, DatasetRow, DatasetSourceType } from '../shared/report.models';
import { DATASET_LIMITS, formatCell, nextColumnKey, normalizeCell, parseNumber } from '../shared/data.util';
import { ParsedSheet, matrixToDataset, parseDataFile } from '../shared/import.util';
import { FishboneDataEditorComponent } from '../charts/fishbone/fishbone-data-editor.component';
import { defaultFishboneConfig } from '../charts/fishbone/fishbone.model';

interface DatasetTemplate {
  id: string;
  name: string;
  hint: string;
  columns: { name: string; type: ColumnType }[];
  rows: CellValue[][];
}

const TEMPLATES: DatasetTemplate[] = [
  {
    id: 'blank',
    name: 'Blank sheet',
    hint: '3 empty columns',
    columns: [
      { name: 'Column 1', type: 'text' },
      { name: 'Column 2', type: 'text' },
      { name: 'Column 3', type: 'text' },
    ],
    rows: [[], [], [], [], []],
  },
  {
    id: 'fishbone',
    name: 'Fishbone (6M)',
    hint: 'Category · Cause · Occurrences',
    columns: [
      { name: 'Category', type: 'text' },
      { name: 'Cause', type: 'text' },
      { name: 'Occurrences', type: 'number' },
    ],
    rows: [
      ['Man', '', null],
      ['Machine', '', null],
      ['Method', '', null],
      ['Material', '', null],
      ['Measurement', '', null],
      ['Environment', '', null],
    ],
  },
  {
    id: 'measurement',
    name: 'Measurements',
    hint: 'Date · Sample · Value',
    columns: [
      { name: 'Date', type: 'date' },
      { name: 'Sample', type: 'text' },
      { name: 'Value', type: 'number' },
    ],
    rows: [[], [], [], [], []],
  },
];

@Component({
  selector: 'app-dataset-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, FishboneDataEditorComponent],
  templateUrl: './dataset-editor.component.html',
})
export class DatasetEditorComponent implements OnInit {
  //*************************************************** Dependency Start *************************************//
  readonly reportsService = inject(ReportsService);
  readonly toastService = inject(ToastService);
  readonly confirmationService = inject(ConfirmationService);
  readonly route = inject(ActivatedRoute);
  readonly router = inject(Router);
  //*************************************************** Dependency End ****************************************//

  readonly limits = DATASET_LIMITS;
  readonly templates = TEMPLATES;
  readonly pageSize = 50;
  readonly format = formatCell;

  datasetId: number | null = null;
  reportCount = 0;
  loading = false;
  saving = false;
  dirty = false;

  name = '';
  description = '';
  sourceType: DatasetSourceType = 'MANUAL';
  sourceFileName: string | null = null;

  /** Step 1 for new datasets: choose how to start. Hidden once a grid exists. */
  mode: 'choose' | 'upload' | 'grid' = 'choose';

  // upload state
  dragOver = false;
  parsing = false;
  pendingFile: File | null = null;
  sheets: ParsedSheet[] = [];
  selectedSheet = 0;
  firstRowIsHeader = true;
  importNotice = '';

  // grid state
  columns: DatasetColumn[] = [];
  rows: DatasetRow[] = [];
  page = 1;

  // fishbone card view — same rows, shown as category cards
  view: 'grid' | 'fishbone' = 'grid';
  fbCategory = '';
  fbCause = '';
  fbCount = '';

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (id) {
      this.datasetId = id;
      this.loadDataset(id);
    }
  }

  private loadDataset(id: number) {
    this.loading = true;
    this.reportsService.getDatasetById(id).subscribe({
      next: (dataset) => {
        this.loading = false;
        if (!dataset) return;
        this.name = dataset.Dataset_Name;
        this.description = dataset.Description;
        this.sourceType = dataset.Source_Type;
        this.sourceFileName = dataset.Source_File_Name || null;
        this.reportCount = dataset.Report_Count;
        this.columns = JSON.parse(dataset.Columns_Json || '[]');
        this.rows = JSON.parse(dataset.Rows_Json || '[]');
        this.mode = 'grid';
        // datasets that look like fishbone data open straight in the card view
        const names = this.columns.map((c) => c.name.toLowerCase());
        if (names.some((n) => n.includes('category')) && names.some((n) => n.includes('cause'))) this.setView('fishbone');
      },
      error: () => {
        this.loading = false;
        this.router.navigate(['/reports/datasets']);
      },
    });
  }

  //********************************************** Start Options Start **********************************************//
  useTemplate(template: DatasetTemplate) {
    this.columns = template.columns.map((c, i) => ({ key: `c${i + 1}`, name: c.name, type: c.type }));
    this.rows = template.rows.map((values) => this.emptyRow(values));
    this.sourceType = 'MANUAL';
    this.sourceFileName = null;
    this.importNotice = '';
    this.page = 1;
    this.mode = 'grid';
    this.dirty = true;
    this.setView(template.id === 'fishbone' ? 'fishbone' : 'grid');
  }

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow picking the same file again
    if (file) await this.readFile(file);
  }

  async onDrop(event: DragEvent) {
    event.preventDefault();
    this.dragOver = false;
    const file = event.dataTransfer?.files?.[0];
    if (file) await this.readFile(file);
  }

  private async readFile(file: File) {
    this.parsing = true;
    this.importNotice = '';
    try {
      const sheets = await parseDataFile(file);
      if (!sheets.length) throw new Error('The file has no data.');
      this.pendingFile = file;
      this.sheets = sheets;
      this.selectedSheet = 0;
      this.mode = 'upload';
      if (!this.name) this.name = file.name.replace(/\.[^.]+$/, '');
    } catch (e: any) {
      this.toastService.showError('Could not read file', e?.message || 'Unsupported file.');
    } finally {
      this.parsing = false;
    }
  }

  get previewRows(): unknown[][] {
    return (this.sheets[this.selectedSheet]?.matrix ?? []).slice(0, 6);
  }

  get previewWidth(): number[] {
    const width = Math.min(Math.max(...this.previewRows.map((r) => r.length), 0), 12);
    return Array.from({ length: width }, (_, i) => i);
  }

  applyImport() {
    const sheet = this.sheets[this.selectedSheet];
    if (!sheet || !this.pendingFile) return;
    const result = matrixToDataset(sheet.matrix, this.firstRowIsHeader);
    if (!result.columns.length) {
      this.toastService.showError('No data found', 'The selected sheet is empty.');
      return;
    }
    this.columns = result.columns;
    this.rows = result.rows;
    this.sourceType = this.pendingFile.name.toLowerCase().endsWith('.xlsx') ? 'EXCEL' : 'CSV';
    this.sourceFileName = this.sheets.length > 1 ? `${this.pendingFile.name} [${sheet.name}]` : this.pendingFile.name;

    const notes = [`Imported ${result.rows.length} rows and ${result.columns.length} columns.`];
    if (result.truncatedRows) notes.push(`${result.truncatedRows} rows over the ${this.limits.MAX_ROWS} limit were skipped.`);
    if (result.truncatedColumns) notes.push(`${result.truncatedColumns} columns over the ${this.limits.MAX_COLUMNS} limit were skipped.`);
    notes.push('Check the column types below, then save.');
    this.importNotice = notes.join(' ');

    this.page = 1;
    this.mode = 'grid';
    this.dirty = true;
    this.sheets = [];
    this.pendingFile = null;
  }

  cancelImport() {
    this.sheets = [];
    this.pendingFile = null;
    this.mode = this.columns.length ? 'grid' : 'choose';
  }

  async replaceFromFile(fileInput: HTMLInputElement) {
    if (this.dirty || this.datasetId) {
      const ok = await this.confirmationService.confirm(
        'Replace data?',
        'The current rows and columns will be replaced by the file you choose. Reports using this dataset will use the new data once you save.',
        'Choose file'
      );
      if (!ok) return;
    }
    fileInput.click();
  }
  //********************************************** Start Options End **********************************************//

  //********************************************** Fishbone View Start **********************************************//
  setView(view: 'grid' | 'fishbone') {
    if (view === 'fishbone') {
      if (this.columns.length < 2) {
        this.toastService.showWarning('Fishbone view', 'Add at least two columns: one for categories and one for causes.');
        return;
      }
      const exists = (key: string) => this.columns.some((c) => c.key === key);
      const defaults = defaultFishboneConfig(this.columns);
      if (!exists(this.fbCategory)) this.fbCategory = defaults.categoryColumn;
      if (!exists(this.fbCause) || this.fbCause === this.fbCategory) this.fbCause = defaults.causeColumn;
      if (!this.numericColumns.some((c) => c.key === this.fbCount)) this.fbCount = defaults.countColumn;
    }
    this.view = view;
  }

  get numericColumns(): DatasetColumn[] {
    return this.columns.filter((c) => c.type === 'number');
  }
  //********************************************** Fishbone View End **********************************************//

  //********************************************** Grid Editing Start **********************************************//
  get totalPages(): number {
    return Math.max(Math.ceil(this.rows.length / this.pageSize), 1);
  }

  get pageRows(): DatasetRow[] {
    const start = (this.page - 1) * this.pageSize;
    return this.rows.slice(start, start + this.pageSize);
  }

  get pageOffset(): number {
    return (this.page - 1) * this.pageSize;
  }

  go(page: number) {
    this.page = Math.min(Math.max(page, 1), this.totalPages);
  }

  private emptyRow(values: CellValue[] = []): DatasetRow {
    const row: DatasetRow = {};
    this.columns.forEach((c, i) => (row[c.key] = values[i] ?? null));
    return row;
  }

  addRows(count = 1) {
    const room = this.limits.MAX_ROWS - this.rows.length;
    if (room <= 0) {
      this.toastService.showWarning('Row limit', `A dataset can have up to ${this.limits.MAX_ROWS} rows.`);
      return;
    }
    for (let i = 0; i < Math.min(count, room); i++) this.rows.push(this.emptyRow());
    this.page = this.totalPages;
    this.dirty = true;
  }

  removeRow(rowIndex: number) {
    this.rows.splice(rowIndex, 1);
    this.page = Math.min(this.page, this.totalPages);
    this.dirty = true;
  }

  addColumn() {
    if (this.columns.length >= this.limits.MAX_COLUMNS) {
      this.toastService.showWarning('Column limit', `A dataset can have up to ${this.limits.MAX_COLUMNS} columns.`);
      return;
    }
    const key = nextColumnKey(this.columns);
    this.columns.push({ key, name: `Column ${this.columns.length + 1}`, type: 'text' });
    this.rows.forEach((r) => (r[key] = null));
    this.dirty = true;
  }

  async removeColumn(column: DatasetColumn) {
    const hasData = this.rows.some((r) => formatCell(r[column.key]).trim() !== '');
    if (hasData) {
      const ok = await this.confirmationService.confirmDelete('Remove column', 'All values in this column will be removed.', column.name, 'Remove');
      if (!ok) return;
    }
    this.columns = this.columns.filter((c) => c.key !== column.key);
    this.rows.forEach((r) => delete r[column.key]);
    this.dirty = true;
  }

  setCell(row: DatasetRow, key: string, value: string) {
    row[key] = value;
    this.dirty = true;
  }

  /** Highlights values that will not convert to the column type (they are kept as text). */
  isInvalid(value: CellValue, type: ColumnType): boolean {
    if (value === null || value === undefined || `${value}`.trim() === '') return false;
    if (type === 'number') return typeof value !== 'number' && parseNumber(`${value}`) === null;
    if (type === 'date') return !/^\d{4}-\d{2}-\d{2}$/.test(`${normalizeCell(value, 'date')}`);
    return false;
  }

  /** Paste a block copied from Excel into the grid starting at this cell. */
  onPaste(event: ClipboardEvent, rowIndex: number, colIndex: number) {
    const text = event.clipboardData?.getData('text/plain') ?? '';
    if (!/[\t\n]/.test(text.trim())) return; // single value → normal paste
    event.preventDefault();

    const matrix = parseClipboardTable(text);
    const neededCols = colIndex + Math.max(...matrix.map((r) => r.length));
    while (this.columns.length < Math.min(neededCols, this.limits.MAX_COLUMNS)) this.addColumn();

    matrix.forEach((values, i) => {
      const target = rowIndex + i;
      if (target >= this.limits.MAX_ROWS) return;
      while (this.rows.length <= target) this.rows.push(this.emptyRow());
      values.forEach((value, j) => {
        const column = this.columns[colIndex + j];
        if (column) this.rows[target][column.key] = value;
      });
    });
    this.dirty = true;
    this.toastService.showInfo('Pasted', `${matrix.length} row(s) pasted into the grid.`, 2000);
  }

  trackByIndex(index: number) {
    return index;
  }
  //********************************************** Grid Editing End **********************************************//

  //********************************************** Save Start **********************************************//
  /** Used by the route guard and the browser close warning */
  hasUnsavedChanges(): boolean {
    return this.dirty;
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent) {
    if (this.dirty) event.preventDefault();
  }

  private validate(): string | null {
    if (!this.name.trim()) return 'Please give the dataset a name.';
    if (!this.columns.length) return 'Add at least one column.';
    const names = this.columns.map((c) => c.name.trim().toLowerCase());
    if (names.some((n) => !n)) return 'Every column needs a name.';
    if (new Set(names).size !== names.length) return 'Column names must be unique.';
    return null;
  }

  save() {
    const error = this.validate();
    if (error) {
      this.toastService.showWarning('Check your data', error, 3500);
      return;
    }

    // trim names, convert values to their column type, drop fully empty rows
    const columns = this.columns.map((c) => ({ ...c, name: c.name.trim() }));
    const rows = this.rows
      .map((r) => {
        const row: DatasetRow = {};
        columns.forEach((c) => (row[c.key] = normalizeCell(r[c.key], c.type)));
        return row;
      })
      .filter((r) => columns.some((c) => r[c.key] !== null))
      // in the card view a category without causes is only a placeholder — don't store it
      .filter((r) => this.view !== 'fishbone' || r[this.fbCause] !== null);

    if (!rows.length) {
      this.toastService.showWarning('Check your data', 'Enter at least one row of data.', 3500);
      return;
    }

    const payload = {
      Dataset_Name: this.name.trim(),
      Description: this.description.trim(),
      Source_Type: this.sourceType,
      Source_File_Name: this.sourceFileName,
      Columns_Json: JSON.stringify(columns),
      Rows_Json: JSON.stringify(rows),
      Employee_ID: this.reportsService.employeeId,
      Plant_ID: this.reportsService.plantId,
      Host: this.reportsService.host,
    };
    if (payload.Rows_Json.length > 25 * 1024 * 1024) {
      this.toastService.showWarning('Dataset too large', 'Please split the data into smaller datasets (max ~25 MB).', 4000);
      return;
    }

    this.saving = true;
    const request = this.datasetId
      ? this.reportsService.updateDataset(this.datasetId, payload)
      : this.reportsService.createDataset(payload);

    request.subscribe({
      next: (id) => {
        this.saving = false;
        if (!id) return;
        this.dirty = false;
        this.toastService.showSuccess('Dataset saved', `${payload.Dataset_Name} · ${rows.length} rows`);
        this.router.navigate(['/reports/datasets']);
      },
      error: () => (this.saving = false),
    });
  }

  async cancel() {
    if (this.dirty) {
      const ok = await this.confirmationService.confirm('Discard changes?', 'Your unsaved changes will be lost.', 'Discard', 'Keep editing');
      if (!ok) return;
      this.dirty = false; // already confirmed — skip the route guard prompt
    }
    this.router.navigate(['/reports/datasets']);
  }
  //********************************************** Save End **********************************************//
}

/** Clipboard from Excel is tab separated, one line per row. */
function parseClipboardTable(text: string): string[][] {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\n$/, '')
    .split('\n')
    .map((line) => line.split('\t').map((v) => v.replace(/^"(.*)"$/s, '$1').trim()));
}
