import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, Input, OnChanges, ViewChild } from '@angular/core';
import { BOXPLOT_LIMITS, BoxStats, formatStat } from './boxplot.model';
import { formatTick, niceScale } from '../../shared/chart-axis.util';

//********************************************** Render Models Start **********************************************//
// Internal, computed geometry — only the inputs drive the diagram
interface BoxRender {
  stats: BoxStats;
  color: string;
  cx: number;
  boxX: number;
  boxW: number;
  capW: number;
  yQ1: number;
  yQ3: number;
  yMedian: number;
  yMean: number;
  yLow: number;
  yHigh: number;
  outliers: { y: number; value: number }[];
  points: { x: number; y: number }[];
  labelX: number;
  labelY: number;
  label: string;
  fullLabel: string;
}

interface Tick {
  y: number;
  label: string;
}

interface RefLine {
  y: number;
  label: string;
  color: string;
  dash: string;
}

export interface BoxPlotDisplay {
  title: string;
  yAxisLabel: string;
  xAxisLabel: string;
  showOutliers: boolean;
  showMean: boolean;
  showPoints: boolean;
  connectMedians: boolean;
  colorByGroup: boolean;
  lsl: number | null;
  usl: number | null;
  target: number | null;
}
//********************************************** Render Models End **********************************************//

/**
 * Pure SVG box & whisker renderer — exports (PNG / PDF / Excel) are exact copies of the screen.
 * Give it computed BoxStats; it lays out axes, boxes, whiskers, outliers, means and spec lines.
 */
@Component({
  selector: 'app-boxplot-diagram',
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
    <div class="relative" [style.min-width.px]="minWidth">
      <svg #boxSvg [attr.viewBox]="'0 0 ' + width + ' ' + height" class="h-auto w-full" xmlns="http://www.w3.org/2000/svg">
        <!-- Title -->
        @if (display.title) {
          <text [attr.x]="width / 2" y="26" text-anchor="middle" font-size="16" font-weight="700" fill="#1e293b">{{ display.title }}</text>
        }

        <!-- Grid + Y axis -->
        @for (t of ticks; track t.y) {
          <line [attr.x1]="plotLeft" [attr.x2]="plotRight" [attr.y1]="t.y" [attr.y2]="t.y" stroke="#e2e8f0" stroke-width="1" />
          <text [attr.x]="plotLeft - 8" [attr.y]="t.y + 4" text-anchor="end" font-size="11" fill="#64748b">{{ t.label }}</text>
        }
        <line [attr.x1]="plotLeft" [attr.x2]="plotLeft" [attr.y1]="plotTop" [attr.y2]="plotBottom" stroke="#94a3b8" stroke-width="1" />
        <line [attr.x1]="plotLeft" [attr.x2]="plotRight" [attr.y1]="plotBottom" [attr.y2]="plotBottom" stroke="#94a3b8" stroke-width="1" />
        <text [attr.transform]="'translate(18,' + (plotTop + plotBottom) / 2 + ') rotate(-90)'" text-anchor="middle"
              font-size="12" font-weight="600" fill="#475569">{{ display.yAxisLabel }}</text>
        @if (display.xAxisLabel) {
          <text [attr.x]="(plotLeft + plotRight) / 2" [attr.y]="height - 10" text-anchor="middle"
                font-size="12" font-weight="600" fill="#475569">{{ display.xAxisLabel }}</text>
        }

        <!-- Spec limits / target -->
        @for (r of refLines; track r.label) {
          <line [attr.x1]="plotLeft" [attr.x2]="plotRight" [attr.y1]="r.y" [attr.y2]="r.y"
                [attr.stroke]="r.color" stroke-width="1.5" [attr.stroke-dasharray]="r.dash" />
          <text [attr.x]="plotRight + 6" [attr.y]="r.y + 4" font-size="11" font-weight="700" [attr.fill]="r.color">{{ r.label }}</text>
        }

        <!-- Boxes -->
        @for (b of boxes; track b.stats.key; let i = $index) {
          <g (mouseenter)="hovered = i" (mouseleave)="hovered = null" class="cursor-default">
            <!-- hover band -->
            <rect [attr.x]="b.cx - band / 2" [attr.y]="plotTop" [attr.width]="band" [attr.height]="plotBottom - plotTop"
                  [attr.fill]="hovered === i ? '#f1f5f9' : 'transparent'" />
            <!-- whiskers -->
            <line [attr.x1]="b.cx" [attr.x2]="b.cx" [attr.y1]="b.yQ3" [attr.y2]="b.yHigh" [attr.stroke]="b.color" stroke-width="1.5" />
            <line [attr.x1]="b.cx" [attr.x2]="b.cx" [attr.y1]="b.yQ1" [attr.y2]="b.yLow" [attr.stroke]="b.color" stroke-width="1.5" />
            <line [attr.x1]="b.cx - b.capW / 2" [attr.x2]="b.cx + b.capW / 2" [attr.y1]="b.yHigh" [attr.y2]="b.yHigh" [attr.stroke]="b.color" stroke-width="1.5" />
            <line [attr.x1]="b.cx - b.capW / 2" [attr.x2]="b.cx + b.capW / 2" [attr.y1]="b.yLow" [attr.y2]="b.yLow" [attr.stroke]="b.color" stroke-width="1.5" />
            <!-- box -->
            <rect [attr.x]="b.boxX" [attr.y]="b.yQ3" [attr.width]="b.boxW" [attr.height]="max(b.yQ1 - b.yQ3, 1)" rx="2"
                  [attr.fill]="b.color" fill-opacity="0.16" [attr.stroke]="b.color" stroke-width="1.5" />
            <line [attr.x1]="b.boxX" [attr.x2]="b.boxX + b.boxW" [attr.y1]="b.yMedian" [attr.y2]="b.yMedian" [attr.stroke]="b.color" stroke-width="3" />
            <!-- points -->
            @for (p of b.points; track $index) {
              <circle [attr.cx]="p.x" [attr.cy]="p.y" r="2.2" [attr.fill]="b.color" fill-opacity="0.45" />
            }
            <!-- outliers -->
            @for (o of b.outliers; track $index) {
              <circle [attr.cx]="b.cx" [attr.cy]="o.y" r="3.5" fill="#ffffff" stroke="#dc2626" stroke-width="1.5" />
            }
            <!-- mean -->
            @if (display.showMean) {
              <path [attr.d]="diamond(b.cx, b.yMean, 5)" fill="#ffffff" stroke="#0f172a" stroke-width="1.5" />
            }
            <!-- x label -->
            <text [attr.x]="b.labelX" [attr.y]="b.labelY" font-size="11" fill="#334155"
                  [attr.text-anchor]="rotateLabels ? 'end' : 'middle'"
                  [attr.transform]="rotateLabels ? 'rotate(-40 ' + b.labelX + ' ' + b.labelY + ')' : null">{{ b.label }}<title>{{ b.fullLabel }}</title></text>
            <text [attr.x]="b.cx" [attr.y]="plotBottom + nRowOffset" text-anchor="middle" font-size="9.5" fill="#94a3b8">n={{ b.stats.n }}</text>
          </g>
        }

        <!-- Median trend -->
        @if (display.connectMedians && boxes.length > 1) {
          <polyline [attr.points]="medianLine" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linejoin="round" pointer-events="none" />
          @for (b of boxes; track b.stats.key) {
            <circle [attr.cx]="b.cx" [attr.cy]="b.yMedian" r="3" fill="#f59e0b" pointer-events="none" />
          }
        }

        <!-- Legend -->
        <g [attr.transform]="'translate(' + plotLeft + ',' + legendY + ')'">
          <rect x="0" y="-8" width="14" height="10" rx="2" fill="#2563eb" fill-opacity="0.16" stroke="#2563eb" stroke-width="1.2" />
          <text x="19" y="1" font-size="10.5" fill="#475569">Q1–Q3 (IQR)</text>
          <line x1="96" x2="112" y1="-3" y2="-3" stroke="#2563eb" stroke-width="3" />
          <text x="117" y="1" font-size="10.5" fill="#475569">Median</text>
          @if (display.showMean) {
            <path [attr.d]="diamond(172, -3, 4.5)" fill="#ffffff" stroke="#0f172a" stroke-width="1.3" />
            <text x="181" y="1" font-size="10.5" fill="#475569">Mean</text>
          }
          @if (display.showOutliers) {
            <circle cx="227" cy="-3" r="3.5" fill="#ffffff" stroke="#dc2626" stroke-width="1.4" />
            <text x="235" y="1" font-size="10.5" fill="#475569">Outlier</text>
          }
          <text x="290" y="1" font-size="10.5" fill="#94a3b8">Whiskers: {{ whiskerText }}</text>
        </g>
      </svg>

      <!-- Hover card -->
      @if (hovered !== null && boxes[hovered]; as b) {
        <div class="pointer-events-none absolute z-10 w-48 -translate-x-1/2 -translate-y-full rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg"
             [style.left.%]="(b.cx / width) * 100" [style.top.%]="(max(b.yHigh - 10, 0) / height) * 100">
          <div class="mb-1 truncate font-bold text-slate-800">{{ b.fullLabel }}</div>
          <dl class="grid grid-cols-2 gap-x-2 gap-y-0.5 text-slate-600">
            <dt>N</dt><dd class="text-right font-semibold text-slate-800">{{ b.stats.n }}</dd>
            <dt>Max</dt><dd class="text-right">{{ fmt(b.stats.max) }}</dd>
            <dt>Q3</dt><dd class="text-right">{{ fmt(b.stats.q3) }}</dd>
            <dt>Median</dt><dd class="text-right font-semibold text-slate-800">{{ fmt(b.stats.median) }}</dd>
            <dt>Q1</dt><dd class="text-right">{{ fmt(b.stats.q1) }}</dd>
            <dt>Min</dt><dd class="text-right">{{ fmt(b.stats.min) }}</dd>
            <dt>Mean</dt><dd class="text-right">{{ fmt(b.stats.mean) }}</dd>
            <dt>Std Dev</dt><dd class="text-right">{{ fmt(b.stats.stdDev) }}</dd>
            <dt>Outliers</dt><dd class="text-right" [class.text-red-600]="b.stats.outliers.length">{{ b.stats.outliers.length }}</dd>
          </dl>
        </div>
      }
    </div>
  `,
})
export class BoxPlotDiagramComponent implements OnChanges {
  @Input({ required: true }) groups: BoxStats[] = [];
  @Input({ required: true }) display!: BoxPlotDisplay;
  @Input() whiskerText = '1.5 × IQR';

  @ViewChild('boxSvg', { static: true }) private svgRef!: ElementRef<SVGSVGElement>;

  static readonly COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#dc2626', '#475569'];
  static readonly SINGLE_COLOR = '#2563eb';

  readonly max = Math.max;
  readonly fmt = (v: number) => formatStat(v);

  width = 900;
  height = 480;
  minWidth = 640;
  plotLeft = 72;
  plotRight = 860;
  plotTop = 48;
  plotBottom = 400;
  band = 60;
  rotateLabels = false;
  nRowOffset = 30;
  legendY = 470;

  ticks: Tick[] = [];
  refLines: RefLine[] = [];
  boxes: BoxRender[] = [];
  medianLine = '';
  hovered: number | null = null;

  get svgElement(): SVGSVGElement {
    return this.svgRef.nativeElement;
  }

  ngOnChanges() {
    this.hovered = null;
    this.layout();
  }

  diamond(x: number, y: number, r: number): string {
    return `M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z`;
  }

  //********************************************** Layout Start **********************************************//
  private layout() {
    const groups = this.groups;
    const d = this.display;
    const count = Math.max(groups.length, 1);

    // X axis: a band per group; long or many labels are rotated
    const longest = groups.reduce((m, g) => Math.max(m, Math.min(g.label.length, 22)), 0);
    const hasRefs = d.lsl !== null || d.usl !== null || d.target !== null;
    this.plotLeft = 78;
    const rightPad = hasRefs ? 70 : 24;
    const minBand = 46;
    this.width = Math.max(900, this.plotLeft + rightPad + count * minBand);
    this.plotRight = this.width - rightPad;
    this.band = (this.plotRight - this.plotLeft) / count;
    this.rotateLabels = longest * 6.4 + 10 > this.band;

    const labelSpace = this.rotateLabels ? Math.min(longest * 5 + 18, 130) : 22;
    this.plotTop = d.title ? 48 : 22;
    const plotHeight = 340;
    this.plotBottom = this.plotTop + plotHeight;
    this.nRowOffset = 14 + labelSpace + (this.rotateLabels ? 2 : 0);
    const xLabelSpace = d.xAxisLabel ? 22 : 0;
    this.legendY = this.plotBottom + this.nRowOffset + 22;
    this.height = this.legendY + 14 + xLabelSpace;
    this.minWidth = Math.min(this.width, Math.max(640, count * 34 + 140));

    // Y axis domain from everything that is drawn
    const values: number[] = [];
    for (const g of groups) {
      values.push(g.lowerWhisker, g.upperWhisker, g.q1, g.q3);
      if (d.showOutliers) values.push(...g.outliers);
      if (d.showPoints) values.push(g.min, g.max);
      if (d.showMean) values.push(g.mean);
    }
    for (const ref of [d.lsl, d.usl, d.target]) if (ref !== null) values.push(ref);
    let lo = values.length ? Math.min(...values) : 0;
    let hi = values.length ? Math.max(...values) : 1;
    if (lo === hi) {
      const pad = Math.abs(lo) * 0.1 || 1;
      lo -= pad;
      hi += pad;
    }
    const { min, max, step } = niceScale(lo, hi, 6);
    const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
    const y = (v: number) => this.plotBottom - ((v - min) / (max - min)) * plotHeight;

    this.ticks = [];
    for (let v = min; v <= max + step / 2; v += step) {
      this.ticks.push({ y: y(v), label: formatTick(v, decimals) });
    }

    this.refLines = [];
    if (d.usl !== null) this.refLines.push({ y: y(d.usl), label: `USL ${formatStat(d.usl)}`, color: '#dc2626', dash: '6 4' });
    if (d.target !== null) this.refLines.push({ y: y(d.target), label: `Target ${formatStat(d.target)}`, color: '#16a34a', dash: '2 3' });
    if (d.lsl !== null) this.refLines.push({ y: y(d.lsl), label: `LSL ${formatStat(d.lsl)}`, color: '#dc2626', dash: '6 4' });

    // Boxes
    const boxW = Math.min(64, Math.max(this.band * 0.55, 10));
    this.boxes = groups.map((g, i) => {
      const cx = this.plotLeft + this.band * (i + 0.5);
      const color = d.colorByGroup
        ? BoxPlotDiagramComponent.COLORS[i % BoxPlotDiagramComponent.COLORS.length]
        : BoxPlotDiagramComponent.SINGLE_COLOR;
      const points =
        d.showPoints && g.values.length <= BOXPLOT_LIMITS.MAX_POINTS_PER_GROUP
          ? g.values.map((v, k) => ({ x: cx + jitter(i, k) * boxW * 0.38, y: y(v) }))
          : [];
      const maxChars = this.rotateLabels ? 22 : Math.max(Math.floor(this.band / 6.4), 4);
      return {
        stats: g,
        color,
        cx,
        boxX: cx - boxW / 2,
        boxW,
        capW: boxW * 0.5,
        yQ1: y(g.q1),
        yQ3: y(g.q3),
        yMedian: y(g.median),
        yMean: y(g.mean),
        yLow: y(g.lowerWhisker),
        yHigh: y(g.upperWhisker),
        outliers: d.showOutliers ? g.outliers.map((v) => ({ y: y(v), value: v })) : [],
        points,
        labelX: cx,
        labelY: this.plotBottom + 16,
        label: g.label.length > maxChars ? g.label.slice(0, maxChars - 1) + '…' : g.label,
        fullLabel: g.label,
      };
    });
    this.medianLine = this.boxes.map((b) => `${b.cx},${b.yMedian}`).join(' ');
  }
  //********************************************** Layout End **********************************************//
}

//********************************************** Helpers Start **********************************************//
/** Deterministic jitter in [-1, 1] so exports and redraws look the same */
function jitter(group: number, index: number): number {
  const s = Math.sin((group + 1) * 12.9898 + (index + 1) * 78.233) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}
//********************************************** Helpers End **********************************************//
