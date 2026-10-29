import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';

//********************************************** Models Start **********************************************//
// Move these to Shared/models/image-map.model.ts in the main project
export interface ImagePart {
  id: number;
  name: string; // user-given part name, e.g. "RH Door"
  x: number; // marker position as % of image width (0–100) — stays anchored at any display size
  y: number; // marker position as % of image height (0–100)
  defects: string[]; // single-line defect entries for this part
}

export interface ImageMapData {
  title: string;
  imageDataUrl: string | null; // uploaded image as data URL (null = nothing uploaded yet)
  parts: ImagePart[];
}
//********************************************** Models End **********************************************//

//********************************************** TEMP STATIC DATA Start **********************************************//
// TEMP STATIC DATA — replace with API data in the main project (call loadData() with the response)
// The demo image is an inline SVG car so the feature works out of the box with no asset files
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

const IMAGE_MAP_STATIC_DATA: ImageMapData = {
  title: 'Car Body Defect Map — Line 2',
  imageDataUrl: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(DEMO_CAR_SVG),
  parts: [
    {
      id: 1,
      name: 'RH Front Door',
      x: 44,
      y: 55,
      defects: [
        'Paint sag near handle',
        'Dust particle inclusion',
        'Scratch below molding',
        'Orange peel on lower panel',
      ],
    },
    { id: 2, name: 'Bonnet', x: 20, y: 45, defects: ['Crater defect', 'Thin DFT patch'] },
    { id: 3, name: 'Rear Fender', x: 84, y: 58, defects: ['Fitment gap uneven'] },
  ],
};
//********************************************** TEMP STATIC DATA End **********************************************//

@Component({
  selector: 'app-image-map',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './image-map.component.html',
  styleUrl: './image-map.component.css',
})
export class ImageMapComponent implements OnInit {
  data: ImageMapData = IMAGE_MAP_STATIC_DATA;

  //********************************************** Limits + Constants Start **********************************************//
  readonly MAX_PARTS = 40; // hard cap so the report never becomes unreadable
  readonly MAX_DEFECTS_PER_PART = 20;
  private readonly STORAGE_KEY = 'image-map-data';
  private readonly MAX_UPLOAD_WIDTH = 1600; // larger uploads are downscaled so localStorage can hold them
  private readonly COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#0891b2', '#e11d48'];
  //********************************************** Limits + Constants End **********************************************//

  // interaction state
  selectedPart: ImagePart | null = null; // part open in the side panel
  pending: { x: number; y: number } | null = null; // click position waiting for a part name
  pendingName = '';
  newDefectText = '';
  titleText = '';
  totalDefects = 0;
  private storageWarned = false;

  @ViewChild('pendingInput') private pendingInput?: ElementRef<HTMLInputElement>;

  ngOnInit() {
    this.loadData(this.readFromStorage() ?? IMAGE_MAP_STATIC_DATA);
  }

  //********************************************** Data Load Start **********************************************//
  // Public on purpose: in the main project call this with API data after fetch
  loadData(data: ImageMapData) {
    this.data = {
      title: data.title,
      imageDataUrl: data.imageDataUrl,
      parts: data.parts.slice(0, this.MAX_PARTS).map((p) => ({
        ...p,
        defects: p.defects.slice(0, this.MAX_DEFECTS_PER_PART),
      })),
    };
    this.selectedPart = null;
    this.pending = null;
    this.titleText = this.data.title;
    this.refreshTotals();
  }

  private refreshTotals() {
    this.totalDefects = this.data.parts.reduce((n, p) => n + p.defects.length, 0);
  }
  //********************************************** Data Load End **********************************************//

  //********************************************** Image Upload Start **********************************************//
  onFileSelected(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    if (this.data.parts.length && !confirm('Replacing the image will clear all marked parts. Continue?')) return;

    const reader = new FileReader();
    reader.onload = () => this.setImage(reader.result as string, file.type);
    reader.readAsDataURL(file);
  }

  private setImage(dataUrl: string, mime: string) {
    const img = new Image();
    img.onload = () => {
      let finalUrl = dataUrl;
      // downscale big photos so the data URL fits comfortably in localStorage
      if (img.naturalWidth > this.MAX_UPLOAD_WIDTH && mime !== 'image/svg+xml') {
        const scale = this.MAX_UPLOAD_WIDTH / img.naturalWidth;
        const canvas = document.createElement('canvas');
        canvas.width = this.MAX_UPLOAD_WIDTH;
        canvas.height = Math.round(img.naturalHeight * scale);
        canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
        finalUrl = canvas.toDataURL('image/jpeg', 0.85);
      }
      this.data.imageDataUrl = finalUrl;
      this.data.parts = [];
      this.selectedPart = null;
      this.pending = null;
      this.applyAndSave();
    };
    img.src = dataUrl;
  }
  //********************************************** Image Upload End **********************************************//

  //********************************************** Marker Interaction Start **********************************************//
  // click on the image = start a new marker at that exact spot
  onImageClick(ev: MouseEvent) {
    if (this.data.parts.length >= this.MAX_PARTS) return;
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    this.pending = {
      x: +(((ev.clientX - rect.left) / rect.width) * 100).toFixed(2),
      y: +(((ev.clientY - rect.top) / rect.height) * 100).toFixed(2),
    };
    this.pendingName = '';
    this.selectedPart = null;
    setTimeout(() => this.pendingInput?.nativeElement.focus());
  }

  confirmPending() {
    const name = this.pendingName.trim();
    if (!name || !this.pending) return;
    const part: ImagePart = { id: Date.now(), name, x: this.pending.x, y: this.pending.y, defects: [] };
    this.data.parts.push(part);
    this.pending = null;
    this.selectedPart = part; // open the panel right away so defects can be added
    this.newDefectText = '';
    this.applyAndSave();
  }

  cancelPending() {
    this.pending = null;
    this.pendingName = '';
  }

  selectPart(part: ImagePart, ev?: Event) {
    ev?.stopPropagation();
    this.pending = null;
    this.selectedPart = part;
    this.newDefectText = '';
  }

  closePanel() {
    this.selectedPart = null;
  }

  renameSelected() {
    if (!this.selectedPart) return;
    this.selectedPart.name = this.selectedPart.name.trim() || this.selectedPart.name;
    this.applyAndSave();
  }

  removePart(part: ImagePart) {
    this.data.parts = this.data.parts.filter((p) => p.id !== part.id);
    if (this.selectedPart?.id === part.id) this.selectedPart = null;
    this.applyAndSave();
  }

  addDefect() {
    const text = this.newDefectText.trim();
    if (!text || !this.selectedPart) return;
    if (this.selectedPart.defects.length >= this.MAX_DEFECTS_PER_PART) return;
    this.selectedPart.defects.push(text);
    this.newDefectText = '';
    this.applyAndSave();
  }

  removeDefect(j: number) {
    this.selectedPart?.defects.splice(j, 1);
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

  indexOfPart(part: ImagePart): number {
    return this.data.parts.findIndex((p) => p.id === part.id);
  }
  //********************************************** Marker Interaction End **********************************************//

  //********************************************** LocalStorage Start **********************************************//
  private readFromStorage(): ImageMapData | null {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      return raw ? (JSON.parse(raw) as ImageMapData) : null;
    } catch {
      return null;
    }
  }

  private applyAndSave() {
    this.refreshTotals();
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // image data URL too big for localStorage — keep working, just warn once
      if (!this.storageWarned) {
        this.storageWarned = true;
        alert('This image is too large to save locally — your markers will be lost on refresh.');
      }
    }
  }

  resetToDemo() {
    localStorage.removeItem(this.STORAGE_KEY);
    this.loadData(IMAGE_MAP_STATIC_DATA);
  }
  //********************************************** LocalStorage End **********************************************//

  //********************************************** Download PNG / PDF Start **********************************************//
  // Markers are drawn onto a canvas over the original image, so the export matches the screen
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

        const s = Math.max(1, w / 1000); // annotation sizes scale with image resolution
        this.data.parts.forEach((p, i) => {
          const px = (p.x / 100) * w;
          const py = (p.y / 100) * h;
          const color = this.colorOf(i);

          // count dot
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
          ctx.fillText(String(p.defects.length), px, py + 0.5 * s);

          // name chip below the dot
          const label = p.name;
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
        a.download = 'image-defect-map.png';
        a.click();
        URL.revokeObjectURL(url);
      });
    });
  }

  downloadPdf() {
    // print window with the annotated image + defect list — "Save as PDF" gives the full report
    this.buildAnnotatedCanvas().then((canvas) => {
      const win = window.open('', '_blank');
      if (!win) return;
      const rows = this.data.parts
        .map(
          (p, i) =>
            `<tr><td style="padding:4px 10px;white-space:nowrap;font-weight:700;color:${this.colorOf(i)}">${p.name}</td>` +
            `<td style="padding:4px 10px;text-align:center">${p.defects.length}</td>` +
            `<td style="padding:4px 10px">${p.defects.join('; ') || '—'}</td></tr>`
        )
        .join('');
      win.document.write(
        `<!DOCTYPE html><html><head><title>${this.data.title}</title>` +
          `<style>@page { size: A4 landscape; margin: 8mm; } body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; }` +
          ` img { width: 100%; height: auto; } table { border-collapse: collapse; width: 100%; margin-top: 10px; font-size: 12px; }` +
          ` th, td { border: 1px solid #cbd5e1; } th { background: #f1f5f9; padding: 5px 10px; text-align: left; }</style>` +
          `</head><body><h3 style="margin:4px 0 8px">${this.data.title}</h3>` +
          `<img src="${canvas.toDataURL('image/png')}"/>` +
          `<table><tr><th>Part</th><th>Defects</th><th>Details</th></tr>${rows}</table></body></html>`
      );
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 300);
    });
  }
  //********************************************** Download PNG / PDF End **********************************************//
}
