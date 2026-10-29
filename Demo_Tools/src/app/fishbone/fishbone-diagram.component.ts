import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';

//********************************************** Models Start **********************************************//
// Move these to Shared/models/fishbone.model.ts in the main project
export interface FishboneCategory {
  name: string;
  causes: string[]; // single-line items (e.g. question + answer), no sub-causes
}

export interface FishboneData {
  problem: string;
  categories: FishboneCategory[];
}
//********************************************** Models End **********************************************//

//********************************************** TEMP STATIC DATA Start **********************************************//
// TEMP STATIC DATA — replace with API data in the main project (call loadData() with the response)
// Note: uneven counts on purpose (7 / 5 / 4 / 6 / 3 / 4) to prove the layout adapts
const FISHBONE_STATIC_DATA: FishboneData = {
  problem: 'High Paint Defect Rate on Body Line (4.8%)',
  categories: [
    {
      name: 'Man',
      causes: [
        'Operator not trained on latest SOP',
        'Skill matrix not updated for Line-2',
        'New operator on critical station',
        'No refresher training conducted',
        'Operator fatigue in night shift',
        'Frequent operator rotation',
        'High absenteeism on weekends',
      ],
    },
    {
      name: 'Machine',
      causes: [
        'Spray gun nozzle worn out',
        'PM schedule overdue by 3 weeks',
        'Booth air balance drifting',
        'Exhaust filter choked',
        'Conveyor speed fluctuation',
      ],
    },
    {
      name: 'Method',
      causes: [
        'Wrong flash-off time between coats',
        'Gun distance not standardized',
        'Viscosity check done once per shift only',
        'SOP not updated after paint change',
      ],
    },
    {
      name: 'Material',
      causes: [
        'Paint batch viscosity variation',
        'Supplier changed in Mar-2026',
        'No incoming inspection for thinner',
        'Contaminated thinner drums',
        'Expired hardener stock used',
        'Primer stored above rated temperature',
      ],
    },
    {
      name: 'Measurement',
      causes: [
        'DFT gauge calibration overdue',
        'Defect grading varies by inspector',
        'No SPC on booth parameters',
      ],
    },
    {
      name: 'Environment',
      causes: [
        'Humidity above 70% in monsoon',
        'No dehumidifier in paint booth',
        'Dust ingress near booth door',
        'Temperature swing across shifts',
      ],
    },
  ],
};
//********************************************** TEMP STATIC DATA End **********************************************//

//********************************************** Render Models Start **********************************************//
// Internal, computed geometry — only FishboneData drives the diagram, never edit these for data changes
interface CauseRender {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  labelX: number;
  labelY: number;
  label: string; // truncated for display
  fullText: string; // full text shown as hover tooltip
}

interface BoneRender {
  name: string;
  color: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  boxX: number;
  boxY: number;
  boxW: number;
  boxH: number;
  labelX: number;
  labelY: number;
  causes: CauseRender[];
}

interface HeadLine {
  text: string;
  x: number;
  y: number;
}
//********************************************** Render Models End **********************************************//

@Component({
  selector: 'app-fishbone-diagram',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './fishbone-diagram.component.html',
  styleUrl: './fishbone-diagram.component.css',
})
export class FishboneDiagramComponent implements OnInit {
  data: FishboneData = FISHBONE_STATIC_DATA;

  //********************************************** Layout Constants Start **********************************************//
  readonly MAX_CATEGORIES = 6; // Man, Machine, Method... — never more than 6 main bones
  readonly MAX_CAUSES_PER_CATEGORY = 10; // hard cap so the design never breaks; extras are dropped
  private readonly STORAGE_KEY = 'fishbone-analysis-data';
  private readonly MAX_LABEL_CHARS = 40; // longer text is truncated, full text on hover
  private readonly CAUSE_GAP = 40; // min vertical px between two causes on a bone
  private readonly CAUSE_LEN = 200; // length of horizontal cause lines
  private readonly MIN_BONE_DY = 240; // bone vertical reach never smaller than this
  private readonly F_START = 0.16; // causes occupy this fraction range along the bone
  private readonly F_END = 0.88;
  private readonly COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#0891b2', '#e11d48'];
  //********************************************** Layout Constants End **********************************************//

  // all computed by buildLayout()
  viewBox = '';
  viewW = 0;
  viewH = 0;
  spineY = 0;
  spineX1 = 0;
  spineX2 = 0;
  tailPoints = '';
  headPath = '';
  headLines: HeadLine[] = [];
  bones: BoneRender[] = [];
  totalCauses = 0;

  @ViewChild('fishboneSvg') private svgRef!: ElementRef<SVGSVGElement>;

  // editor state
  showEditor = false;
  problemText = '';
  newCategoryName = '';
  newCauseText: string[] = [];

  private boneDY = 0;
  private boneDX = 0;
  private pairSpacing = 0;

  ngOnInit() {
    // Add api to get fishbone data from backend and call loadData() with the response.

    this.loadData(this.readFromStorage() ?? FISHBONE_STATIC_DATA);
  }

  //********************************************** Layout Build Start **********************************************//
  // Public on purpose: in the main project call this with API data after fetch
  loadData(data: FishboneData) {
    // enforce both caps so an oversized payload can never break the design
    this.data = {
      problem: data.problem,
      categories: data.categories.slice(0, this.MAX_CATEGORIES).map((c) => ({
        name: c.name,
        causes: c.causes.slice(0, this.MAX_CAUSES_PER_CATEGORY),
      })),
    };
    this.totalCauses = this.data.categories.reduce((n, c) => n + c.causes.length, 0);
    this.problemText = this.data.problem;
    this.newCauseText = this.data.categories.map(() => '');
    this.buildLayout();
  }

  private buildLayout() {
    const cats = this.data.categories;
    const pairCount = Math.max(Math.ceil(cats.length / 2), 1);

    // bone size grows with the largest category so causes always have room
    const maxCauses = Math.max(...cats.map((c) => c.causes.length), 1);
    const span = this.F_END - this.F_START;
    this.boneDY = Math.max(this.MIN_BONE_DY, Math.ceil(((maxCauses - 1) * this.CAUSE_GAP) / span));
    this.boneDX = Math.round(this.boneDY * 0.5);
    this.pairSpacing = Math.max(this.boneDX + 210, 330);

    // canvas grows with bone size and pair count
    const leftmostPairX = this.boneDX + 300;
    const firstPairX = leftmostPairX + (pairCount - 1) * this.pairSpacing;
    const headBaseX = firstPairX + 65;
    this.viewW = headBaseX + 170;
    this.spineY = this.boneDY + 100;
    this.viewH = this.spineY + this.boneDY + 100;
    this.viewBox = `0 0 ${this.viewW} ${this.viewH}`;
    this.spineX2 = headBaseX;

    this.buildHead(headBaseX);
    this.buildBones(firstPairX);
    this.buildTail();
  }

  private buildHead(headBaseX: number) {
    const hx = headBaseX;
    const sy = this.spineY;
    // fish head: curved back + pointed nose
    this.headPath =
      `M ${hx} ${sy - 74}` +
      ` Q ${hx + 100} ${sy - 60} ${hx + 148} ${sy}` +
      ` Q ${hx + 100} ${sy + 60} ${hx} ${sy + 74}` +
      ` Q ${hx + 26} ${sy} ${hx} ${sy - 74} Z`;

    const lines = this.wrap(this.data.problem, 14);
    const cx = hx + 62;
    const startY = sy - ((lines.length - 1) / 2) * 16 + 4;
    this.headLines = lines.map((text, i) => ({ text, x: cx, y: startY + i * 16 }));
  }

  private buildBones(firstPairX: number) {
    this.bones = this.data.categories.map((cat, i) => {
      const pairIndex = Math.floor(i / 2);
      const isTop = i % 2 === 0;
      const sx = firstPairX - pairIndex * this.pairSpacing; // spine attach point
      const dir = isTop ? -1 : 1;
      const endX = sx - this.boneDX;
      const endY = this.spineY + dir * this.boneDY;
      const color = this.COLORS[i % this.COLORS.length];

      const boxW = Math.max(cat.name.length * 8 + 28, 96);
      const boxH = 34;
      const boxCY = endY + dir * 32;

      return {
        name: cat.name,
        color,
        x1: sx,
        y1: this.spineY,
        x2: endX,
        y2: endY,
        boxX: endX - boxW / 2,
        boxY: boxCY - boxH / 2,
        boxW,
        boxH,
        labelX: endX,
        labelY: boxCY + 4.5,
        causes: this.buildCauses(cat, sx, dir),
      };
    });
  }

  private buildCauses(cat: FishboneCategory, sx: number, dir: number): CauseRender[] {
    const n = cat.causes.length;
    const step = n > 1 ? (this.F_END - this.F_START) / (n - 1) : 0;

    return cat.causes.map((cause, j) => {
      // read top-down on both halves: top bones start at the outer end, bottom bones at the spine
      const f = n === 1 ? 0.52 : dir === -1 ? this.F_END - j * step : this.F_START + j * step;
      const px = sx - this.boneDX * f;
      const py = this.spineY + dir * this.boneDY * f;

      const truncated =
        cause.length > this.MAX_LABEL_CHARS ? cause.slice(0, this.MAX_LABEL_CHARS - 1).trimEnd() + '…' : cause;

      return {
        x1: px,
        y1: py,
        x2: px - this.CAUSE_LEN,
        y2: py,
        // top bones lean left as they rise, so push the label a bit further out
        labelX: px - (dir === -1 ? 15 : 6),
        labelY: py - 6,
        label: truncated,
        fullText: cause,
      };
    });
  }

  private buildTail() {
    const sy = this.spineY;
    const tipX = 150;
    this.spineX1 = tipX;
    // concave fish tail
    this.tailPoints = `${tipX - 62},${sy - 52} ${tipX},${sy} ${tipX - 62},${sy + 52} ${tipX - 34},${sy}`;
  }

  private wrap(text: string, maxChars: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      if (current && (current + ' ' + word).length > maxChars) {
        lines.push(current);
        current = word;
      } else {
        current = current ? current + ' ' + word : word;
      }
    }
    if (current) lines.push(current);
    return lines;
  }
  //********************************************** Layout Build End **********************************************//

  //********************************************** Editor + LocalStorage Start **********************************************//
  private readFromStorage(): FishboneData | null {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      return raw ? (JSON.parse(raw) as FishboneData) : null;
    } catch {
      return null;
    }
  }

  private applyAndSave() {
    this.loadData(this.data);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
  }

  updateProblem() {
    const text = this.problemText.trim();
    if (!text || text === this.data.problem) return;
    this.data.problem = text;
    this.applyAndSave();
  }

  addCategory() {
    const name = this.newCategoryName.trim();
    if (!name || this.data.categories.length >= this.MAX_CATEGORIES) return;
    if (this.data.categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) return;
    this.data.categories.push({ name, causes: [] });
    this.newCategoryName = '';
    this.applyAndSave();
  }

  removeCategory(i: number) {
    this.data.categories.splice(i, 1);
    this.applyAndSave();
  }

  addCause(i: number) {
    const text = (this.newCauseText[i] ?? '').trim();
    if (!text || this.data.categories[i].causes.length >= this.MAX_CAUSES_PER_CATEGORY) return;
    this.data.categories[i].causes.push(text);
    this.applyAndSave();
  }

  removeCause(i: number, j: number) {
    this.data.categories[i].causes.splice(j, 1);
    this.applyAndSave();
  }

  resetToDemo() {
    localStorage.removeItem(this.STORAGE_KEY);
    this.loadData(FISHBONE_STATIC_DATA);
  }

  colorOf(i: number): string {
    return this.COLORS[i % this.COLORS.length];
  }
  //********************************************** Editor + LocalStorage End **********************************************//

  //********************************************** Download PNG / PDF Start **********************************************//
  // The diagram is pure SVG, so exports are exact copies of what is on screen — no library needed
  private serializeSvg(): string {
    const clone = this.svgRef.nativeElement.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(this.viewW));
    clone.setAttribute('height', String(this.viewH));
    clone.style.fontFamily = "ui-sans-serif, system-ui, 'Segoe UI', sans-serif";
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', '100%');
    bg.setAttribute('height', '100%');
    bg.setAttribute('fill', '#ffffff');
    clone.insertBefore(bg, clone.firstChild);
    return new XMLSerializer().serializeToString(clone);
  }

  downloadPng() {
    const scale = 2; // 2x resolution for a crisp image
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = this.viewW * scale;
      canvas.height = this.viewH * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, this.viewW, this.viewH);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'fishbone-diagram.png';
        a.click();
        URL.revokeObjectURL(url);
      });
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(this.serializeSvg());
  }

  downloadPdf() {
    // print window with only the diagram — "Save as PDF" in the dialog gives a vector-sharp PDF
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(
      `<!DOCTYPE html><html><head><title>Fishbone Diagram</title>` +
        `<style>@page { size: A4 landscape; margin: 8mm; } body { margin: 0; } svg { width: 100%; height: auto; }</style>` +
        `</head><body>${this.serializeSvg()}</body></html>`
    );
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  }
  //********************************************** Download PNG / PDF End **********************************************//
}
