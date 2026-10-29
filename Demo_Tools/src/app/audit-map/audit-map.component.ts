import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import * as XLSX from 'xlsx';

//********************************************** Models Start **********************************************//
// Move these to Shared/models/audit-map.model.ts in the main project
export interface AuditRow {
  [column: string]: string | number; // one sheet row — columns are whatever the uploaded file has
}

export interface AuditMarker {
  id: number;
  part: string; // value from the part column this marker is mapped to
  x: number; // % of image width (0–100)
  y: number; // % of image height (0–100)
}

export interface AuditMapData {
  title: string;
  imageDataUrl: string | null;
  columns: string[]; // sheet header row, in original order
  partColumn: string; // which column identifies the part
  rows: AuditRow[];
  markers: AuditMarker[];
}

// side-panel summary line, computed from rows + markers
export interface PartSummary {
  part: string;
  count: number;
  mapped: boolean;
}
//********************************************** Models End **********************************************//

//********************************************** TEMP STATIC DATA Start **********************************************//
// TEMP STATIC DATA — replace with API data in the main project (call loadData() with the response)
const DEMO_CAR_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400">` +
  `<rect width="800" height="400" fill="#f1f5f9"/>` +
  `<path d="M70 265 Q75 220 150 208 L240 198 Q300 135 405 130 L510 130 Q585 135 625 195 L705 208 Q735 218 738 255 L738 268 Q738 282 720 282 L688 282 A52 52 0 0 0 584 282 L286 282 A52 52 0 0 0 182 282 L88 282 Q70 282 70 265 Z" fill="#94a3b8" stroke="#475569" stroke-width="4"/>` +
  `<path d="M262 196 Q310 145 400 141 L400 196 Z" fill="#e2e8f0" stroke="#475569" stroke-width="3"/>` +
  `<path d="M416 141 L505 141 Q560 146 596 192 L416 192 Z" fill="#e2e8f0" stroke="#475569" stroke-width="3"/>` +
  `<line x1="408" y1="135" x2="408" y2="270" stroke="#475569" stroke-width="3"/>` +
  `<circle cx="234" cy="282" r="46" fill="#1e293b"/><circle cx="234" cy="282" r="20" fill="#cbd5e1"/>` +
  `<circle cx="636" cy="282" r="46" fill="#1e293b"/><circle cx="636" cy="282" r="20" fill="#cbd5e1"/>` +
  `</svg>`;

const DEMO_ROWS: AuditRow[] = [
  { 'VIN No': 'MA3EJKD1S00101', 'Part': 'RH Front Door', 'Defect': 'Paint sag near handle', 'Attribution': 'Paint Shop', 'Severity': 'Major' },
  { 'VIN No': 'MA3EJKD1S00104', 'Part': 'RH Front Door', 'Defect': 'Dust particle inclusion', 'Attribution': 'Paint Shop', 'Severity': 'Minor' },
  { 'VIN No': 'MA3EJKD1S00109', 'Part': 'RH Front Door', 'Defect': 'Scratch below molding', 'Attribution': 'Assembly', 'Severity': 'Minor' },
  { 'VIN No': 'MA3EJKD1S00115', 'Part': 'RH Front Door', 'Defect': 'Orange peel on lower panel', 'Attribution': 'Paint Shop', 'Severity': 'Major' },
  { 'VIN No': 'MA3EJKD1S00102', 'Part': 'Bonnet', 'Defect': 'Crater defect', 'Attribution': 'Paint Shop', 'Severity': 'Major' },
  { 'VIN No': 'MA3EJKD1S00107', 'Part': 'Bonnet', 'Defect': 'Thin DFT patch', 'Attribution': 'Paint Shop', 'Severity': 'Minor' },
  { 'VIN No': 'MA3EJKD1S00112', 'Part': 'Bonnet', 'Defect': 'Fitment gap at hinge', 'Attribution': 'Assembly', 'Severity': 'Minor' },
  { 'VIN No': 'MA3EJKD1S00103', 'Part': 'Rear Fender', 'Defect': 'Fitment gap uneven', 'Attribution': 'Body Shop', 'Severity': 'Major' },
  { 'VIN No': 'MA3EJKD1S00118', 'Part': 'Rear Fender', 'Defect': 'Weld spatter visible', 'Attribution': 'Body Shop', 'Severity': 'Minor' },
  { 'VIN No': 'MA3EJKD1S00105', 'Part': 'Windshield', 'Defect': 'Sealant overflow', 'Attribution': 'Assembly', 'Severity': 'Minor' },
  { 'VIN No': 'MA3EJKD1S00121', 'Part': 'Windshield', 'Defect': 'Glass chip at corner', 'Attribution': 'Supplier', 'Severity': 'Major' },
  { 'VIN No': 'MA3EJKD1S00108', 'Part': 'Front Wheel', 'Defect': 'Alloy scratch', 'Attribution': 'Logistics', 'Severity': 'Minor' },
];

const AUDIT_MAP_STATIC_DATA: AuditMapData = {
  title: 'Vehicle Audit Map — Jun 2026',
  imageDataUrl: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(DEMO_CAR_SVG),
  columns: ['VIN No', 'Part', 'Defect', 'Attribution', 'Severity'],
  partColumn: 'Part',
  rows: DEMO_ROWS,
  // two parts pre-mapped, rest left in "unmapped" to show the flow
  markers: [
    { id: 1, part: 'RH Front Door', x: 44, y: 55 },
    { id: 2, part: 'Bonnet', x: 20, y: 55 },
  ],
};
//********************************************** TEMP STATIC DATA End **********************************************//

@Component({
  selector: 'app-audit-map',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './audit-map.component.html',
  styleUrl: './audit-map.component.css',
})
export class AuditMapComponent implements OnInit {
  data: AuditMapData = AUDIT_MAP_STATIC_DATA;

  //********************************************** Limits + Constants Start **********************************************//
  readonly MAX_ROWS = 5000; // sheet rows beyond this are dropped so localStorage stays safe
  private readonly STORAGE_KEY = 'audit-map-data';
  private readonly MAX_UPLOAD_WIDTH = 1600;
  private readonly COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#0891b2', '#e11d48'];
  //********************************************** Limits + Constants End **********************************************//

  // computed from rows + markers
  partSummary: PartSummary[] = [];
  unmappedParts: PartSummary[] = [];
  defectColumn = ''; // auto-detected column used for hover tooltips

  // interaction state
  selectedMarker: AuditMarker | null = null;
  selectedRows: AuditRow[] = [];
  pending: { x: number; y: number } | null = null;
  pendingPart = '';
  titleText = '';
  private storageWarned = false;

  ngOnInit() {
    this.loadData(this.readFromStorage() ?? AUDIT_MAP_STATIC_DATA);
  }

  //********************************************** Data Load Start **********************************************//
  // Public on purpose: in the main project call this with API data after fetch
  loadData(data: AuditMapData) {
    this.data = {
      title: data.title,
      imageDataUrl: data.imageDataUrl,
      columns: [...data.columns],
      partColumn: data.partColumn,
      rows: data.rows.slice(0, this.MAX_ROWS),
      markers: data.markers.map((m) => ({ ...m })),
    };
    this.selectedMarker = null;
    this.pending = null;
    this.titleText = this.data.title;
    this.refreshSummary();
  }

  private refreshSummary() {
    const counts = new Map<string, number>();
    for (const row of this.data.rows) {
      const part = String(row[this.data.partColumn] ?? '').trim();
      if (!part) continue;
      counts.set(part, (counts.get(part) ?? 0) + 1);
    }
    const mapped = new Set(this.data.markers.map((m) => m.part));
    this.partSummary = [...counts.entries()]
      .map(([part, count]) => ({ part, count, mapped: mapped.has(part) }))
      .sort((a, b) => b.count - a.count);
    this.unmappedParts = this.partSummary.filter((p) => !p.mapped);
    // drop markers whose part no longer exists in the sheet
    this.data.markers = this.data.markers.filter((m) => counts.has(m.part));
    this.defectColumn =
      this.data.columns.find((c) => /defect|issue|concern|problem/i.test(c) && c !== this.data.partColumn) ?? '';
  }

  countFor(part: string): number {
    return this.partSummary.find((p) => p.part === part)?.count ?? 0;
  }

  rowsFor(part: string): AuditRow[] {
    return this.data.rows.filter((r) => String(r[this.data.partColumn] ?? '').trim() === part);
  }

  // hover tooltip content: defect column values for that part (first few)
  tooltipLines(part: string): string[] {
    if (!this.defectColumn) return [];
    return this.rowsFor(part)
      .map((r) => String(r[this.defectColumn]))
      .filter((t) => t && t !== 'undefined')
      .slice(0, 6);
  }
  //********************************************** Data Load End **********************************************//

  //********************************************** Sheet Upload Start **********************************************//
  onSheetSelected(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (this.data.markers.length && !confirm('Loading a new sheet will clear the current markers. Continue?')) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const wb = XLSX.read(reader.result, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<AuditRow>(sheet, { defval: '' });
        if (!rows.length) {
          alert('The sheet has no data rows.');
          return;
        }
        const columns = Object.keys(rows[0]);
        this.data.columns = columns;
        this.data.rows = rows.slice(0, this.MAX_ROWS);
        this.data.partColumn = this.detectPartColumn(columns);
        this.data.markers = [];
        this.selectedMarker = null;
        this.pending = null;
        this.applyAndSave();
      } catch {
        alert('Could not read this file. Please upload a valid Excel or CSV file.');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  private detectPartColumn(columns: string[]): string {
    return columns.find((c) => /part|panel|component|zone|area/i.test(c)) ?? columns[0] ?? '';
  }

  // user picked a different part column — markers no longer make sense
  onPartColumnChange() {
    this.data.markers = [];
    this.selectedMarker = null;
    this.pending = null;
    this.applyAndSave();
  }
  //********************************************** Sheet Upload End **********************************************//

  //********************************************** Image Upload Start **********************************************//
  onFileSelected(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    if (this.data.markers.length && !confirm('Replacing the image will clear all markers. Continue?')) return;

    const reader = new FileReader();
    reader.onload = () => this.setImage(reader.result as string, file.type);
    reader.readAsDataURL(file);
  }

  private setImage(dataUrl: string, mime: string) {
    const img = new Image();
    img.onload = () => {
      let finalUrl = dataUrl;
      if (img.naturalWidth > this.MAX_UPLOAD_WIDTH && mime !== 'image/svg+xml') {
        const scale = this.MAX_UPLOAD_WIDTH / img.naturalWidth;
        const canvas = document.createElement('canvas');
        canvas.width = this.MAX_UPLOAD_WIDTH;
        canvas.height = Math.round(img.naturalHeight * scale);
        canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
        finalUrl = canvas.toDataURL('image/jpeg', 0.85);
      }
      this.data.imageDataUrl = finalUrl;
      this.data.markers = [];
      this.selectedMarker = null;
      this.pending = null;
      this.applyAndSave();
    };
    img.src = dataUrl;
  }
  //********************************************** Image Upload End **********************************************//

  //********************************************** Marker Interaction Start **********************************************//
  // click on the image = pick which part from the sheet sits at that spot
  onImageClick(ev: MouseEvent) {
    if (!this.unmappedParts.length) return; // everything already mapped
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    this.pending = {
      x: +(((ev.clientX - rect.left) / rect.width) * 100).toFixed(2),
      y: +(((ev.clientY - rect.top) / rect.height) * 100).toFixed(2),
    };
    this.pendingPart = this.unmappedParts[0]?.part ?? '';
    this.selectedMarker = null;
  }

  confirmPending() {
    if (!this.pending || !this.pendingPart) return;
    const marker: AuditMarker = { id: Date.now(), part: this.pendingPart, x: this.pending.x, y: this.pending.y };
    this.data.markers.push(marker);
    this.pending = null;
    this.selectMarker(marker);
    this.applyAndSave();
  }

  cancelPending() {
    this.pending = null;
  }

  selectMarker(marker: AuditMarker, ev?: Event) {
    ev?.stopPropagation();
    this.pending = null;
    this.selectedMarker = marker;
    this.selectedRows = this.rowsFor(marker.part);
  }

  closePanel() {
    this.selectedMarker = null;
  }

  removeMarker(marker: AuditMarker) {
    this.data.markers = this.data.markers.filter((m) => m.id !== marker.id);
    if (this.selectedMarker?.id === marker.id) this.selectedMarker = null;
    this.applyAndSave();
  }

  updateTitle() {
    const text = this.titleText.trim();
    if (!text || text === this.data.title) return;
    this.data.title = text;
    this.applyAndSave();
  }

  colorOf(i: number): string {
    return this.COLORS[i % this.COLORS.length];
  }

  indexOfMarker(marker: AuditMarker): number {
    return this.data.markers.findIndex((m) => m.id === marker.id);
  }

  // columns shown in the detail panel — everything except the part column (it is the panel title)
  detailColumns(): string[] {
    return this.data.columns.filter((c) => c !== this.data.partColumn);
  }
  //********************************************** Marker Interaction End **********************************************//

  //********************************************** LocalStorage Start **********************************************//
  private readFromStorage(): AuditMapData | null {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      return raw ? (JSON.parse(raw) as AuditMapData) : null;
    } catch {
      return null;
    }
  }

  private applyAndSave() {
    this.refreshSummary();
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      if (!this.storageWarned) {
        this.storageWarned = true;
        alert('Data is too large to save locally — your work will be lost on refresh.');
      }
    }
  }

  resetToDemo() {
    localStorage.removeItem(this.STORAGE_KEY);
    this.loadData(AUDIT_MAP_STATIC_DATA);
  }
  //********************************************** LocalStorage End **********************************************//

  //********************************************** Download PNG / PDF Start **********************************************//
  private buildAnnotatedCanvas(): Promise<HTMLCanvasElement> {
    return new Promise((resolve, reject) => {
      if (!this.data.imageDataUrl) return reject(new Error('no image'));
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('no canvas context'));
        ctx.drawImage(img, 0, 0);

        const s = Math.max(1, w / 1000);
        this.data.markers.forEach((m, i) => {
          const px = (m.x / 100) * w;
          const py = (m.y / 100) * h;
          const color = this.colorOf(i);
          const count = this.countFor(m.part);

          ctx.beginPath();
          ctx.arc(px, py, 11 * s, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.lineWidth = 2.5 * s;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
          ctx.fillStyle = '#ffffff';
          ctx.font = `700 ${Math.round(12 * s)}px ui-sans-serif, system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(count), px, py + 0.5 * s);

          const label = m.part;
          ctx.font = `700 ${Math.round(13 * s)}px ui-sans-serif, system-ui, sans-serif`;
          const tw = ctx.measureText(label).width;
          const bx = px - tw / 2 - 7 * s;
          const by = py + 15 * s;
          const bw = tw + 14 * s;
          const bh = 22 * s;
          this.roundedRect(ctx, bx, by, bw, bh, 6 * s);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.fillText(label, px, by + bh / 2 + 0.5 * s);
        });
        resolve(canvas);
      };
      img.onerror = () => reject(new Error('image load failed'));
      img.src = this.data.imageDataUrl;
    });
  }

  private roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  downloadPng() {
    this.buildAnnotatedCanvas().then((canvas) => {
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'audit-map.png';
        a.click();
        URL.revokeObjectURL(url);
      });
    });
  }

  downloadPdf() {
    // print window: annotated image + full row table for every mapped part
    this.buildAnnotatedCanvas().then((canvas) => {
      const win = window.open('', '_blank');
      if (!win) return;
      const cols = this.data.columns;
      const header = cols.map((c) => `<th>${c}</th>`).join('');
      const mappedParts = new Set(this.data.markers.map((m) => m.part));
      const body = this.data.rows
        .filter((r) => mappedParts.has(String(r[this.data.partColumn] ?? '').trim()))
        .map((r) => `<tr>${cols.map((c) => `<td>${r[c] ?? ''}</td>`).join('')}</tr>`)
        .join('');
      win.document.write(
        `<!DOCTYPE html><html><head><title>${this.data.title}</title>` +
          `<style>@page { size: A4 landscape; margin: 8mm; } body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; }` +
          ` img { width: 100%; height: auto; } table { border-collapse: collapse; width: 100%; margin-top: 10px; font-size: 11px; }` +
          ` th, td { border: 1px solid #cbd5e1; padding: 4px 8px; text-align: left; } th { background: #f1f5f9; }</style>` +
          `</head><body><h3 style="margin:4px 0 8px">${this.data.title}</h3>` +
          `<img src="${canvas.toDataURL('image/png')}"/>` +
          `<table><tr>${header}</tr>${body}</table></body></html>`
      );
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 300);
    });
  }
  //********************************************** Download PNG / PDF End **********************************************//
}
