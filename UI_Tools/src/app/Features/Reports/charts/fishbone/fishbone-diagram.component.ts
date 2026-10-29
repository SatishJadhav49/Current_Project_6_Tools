import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, Input, OnChanges, ViewChild } from '@angular/core';
import { FishboneCategory, FishboneData } from './fishbone.model';

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

/**
 * Pure SVG Ishikawa renderer (layout logic from the Demo_Tools POC).
 * Give it FishboneData — it computes every coordinate, so any category / cause count lays out cleanly.
 */
@Component({
  selector: 'app-fishbone-diagram',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      svg text {
        user-select: none;
        font-family: ui-sans-serif, system-ui, 'Segoe UI', sans-serif;
      }
    `,
  ],
  template: `
    <svg #fishboneSvg [attr.viewBox]="viewBox" class="h-auto w-full min-w-[1000px]" xmlns="http://www.w3.org/2000/svg">
      <!-- Spine -->
      <line [attr.x1]="spineX1" [attr.y1]="spineY" [attr.x2]="spineX2" [attr.y2]="spineY"
            stroke="#334155" stroke-width="5" stroke-linecap="round" />

      <!-- Tail -->
      <polygon [attr.points]="tailPoints" fill="#334155" />

      <!-- Head + problem text -->
      <path [attr.d]="headPath" fill="#dc2626" />
      <text text-anchor="middle" font-size="12.5" font-weight="700" fill="#ffffff">
        @for (l of headLines; track $index) {
          <tspan [attr.x]="l.x" [attr.y]="l.y">{{ l.text }}</tspan>
        }
      </text>

      <!-- Category bones -->
      @for (b of bones; track $index) {
        <g>
          <!-- diagonal bone -->
          <line [attr.x1]="b.x1" [attr.y1]="b.y1" [attr.x2]="b.x2" [attr.y2]="b.y2"
                [attr.stroke]="b.color" stroke-width="3" stroke-linecap="round" />
          <!-- junction dot on spine -->
          <circle [attr.cx]="b.x1" [attr.cy]="b.y1" r="5" [attr.fill]="b.color" />

          <!-- category label box -->
          <rect [attr.x]="b.boxX" [attr.y]="b.boxY" [attr.width]="b.boxW" [attr.height]="b.boxH"
                rx="8" [attr.fill]="b.color" />
          <text [attr.x]="b.labelX" [attr.y]="b.labelY" text-anchor="middle"
                font-size="13" font-weight="700" fill="#ffffff">{{ b.name }}</text>

          <!-- causes (single line each, full text on hover) -->
          @for (c of b.causes; track $index) {
            <g>
              <title>{{ c.fullText }}</title>
              <line [attr.x1]="c.x1" [attr.y1]="c.y1" [attr.x2]="c.x2" [attr.y2]="c.y2"
                    stroke="#64748b" stroke-width="1.6" />
              <circle [attr.cx]="c.x1" [attr.cy]="c.y1" r="3" [attr.fill]="b.color" />
              <text [attr.x]="c.labelX" [attr.y]="c.labelY" text-anchor="end"
                    font-size="12" font-weight="600" fill="#334155">{{ c.label }}</text>
            </g>
          }
        </g>
      }
    </svg>
  `,
})
export class FishboneDiagramComponent implements OnChanges {
  @Input({ required: true }) data!: FishboneData;
  /** none = plain causes, repeats = show (n) when a cause occurs more than once, all = always show (n) */
  @Input() countLabel: 'none' | 'repeats' | 'all' = 'repeats';

  //********************************************** Layout Constants Start **********************************************//
  private readonly MAX_LABEL_CHARS = 40; // longer text is truncated, full text on hover
  private readonly CAUSE_GAP = 40; // min vertical px between two causes on a bone
  private readonly CAUSE_LEN = 200; // length of horizontal cause lines
  private readonly MIN_BONE_DY = 240; // bone vertical reach never smaller than this
  private readonly F_START = 0.16; // causes occupy this fraction range along the bone
  private readonly F_END = 0.88;
  static readonly COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#0891b2', '#e11d48'];
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

  @ViewChild('fishboneSvg', { static: true }) private svgRef!: ElementRef<SVGSVGElement>;

  private boneDY = 0;
  private boneDX = 0;
  private pairSpacing = 0;

  get svgElement(): SVGSVGElement {
    return this.svgRef.nativeElement;
  }

  ngOnChanges() {
    if (this.data) this.buildLayout();
  }

  //********************************************** Layout Build Start **********************************************//
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

    // the head fits ~5 lines; longer problem statements are cut with an ellipsis
    let lines = this.wrap(this.data.problem, 14);
    if (lines.length > 5) lines = [...lines.slice(0, 4), lines[4].slice(0, 12) + '…'];
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
      const color = FishboneDiagramComponent.COLORS[i % FishboneDiagramComponent.COLORS.length];

      const name = cat.name.length > 24 ? cat.name.slice(0, 23) + '…' : cat.name;
      const boxW = Math.max(name.length * 8 + 28, 96);
      const boxH = 34;
      const boxCY = endY + dir * 32;

      return {
        name,
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

      const suffix =
        this.countLabel === 'all' || (this.countLabel === 'repeats' && cause.count > 1) ? ` (${+cause.count.toFixed(2)})` : '';
      const room = this.MAX_LABEL_CHARS - suffix.length;
      const text = cause.text.length > room ? cause.text.slice(0, room - 1).trimEnd() + '…' : cause.text;

      return {
        x1: px,
        y1: py,
        x2: px - this.CAUSE_LEN,
        y2: py,
        // top bones lean left as they rise, so push the label a bit further out
        labelX: px - (dir === -1 ? 15 : 6),
        labelY: py - 6,
        label: text + suffix,
        fullText: cause.text + suffix,
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
}
