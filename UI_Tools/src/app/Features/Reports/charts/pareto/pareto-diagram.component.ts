import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, Input, OnChanges, ViewChild } from '@angular/core';
import { formatTick, niceScale, tickDecimals } from '../../shared/chart-axis.util';
import { ParetoItem, formatNumber, formatPercent } from './pareto.model';

//********************************************** Render Models Start **********************************************//
// Internal, computed geometry — only the inputs drive the diagram
interface BarRender {
  item: ParetoItem;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  pointY: number; // cumulative % point
  valueLabel: string;
  valueInside: boolean; // tall bars carry the value inside, short ones above
  label: string;
  labelX: number;
  labelY: number;
}

interface Tick {
  y: number;
  label: string;
}

export interface ParetoDisplay {
  title: string;
  yAxisLabel: string;
  xAxisLabel: string;
  total: number;
  cutoff: number;
  showCutoff: boolean;
  highlightVitalFew: boolean;
  showValueLabels: boolean;
  showPercentLabels: boolean;
}
//********************************************** Render Models End **********************************************//

/**
 * Pure SVG Pareto renderer (Minitab style): bars on the left axis scaled 0 → total,
 * cumulative % line on the right axis 0 → 100 %, so the line ends exactly at the top.
 */
@Component({
  selector: 'app-pareto-diagram',
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
      <svg #paretoSvg [attr.viewBox]="'0 0 ' + width + ' ' + height" class="h-auto w-full" xmlns="http://www.w3.org/2000/svg">
        <!-- Title -->
        @if (display.title) {
          <text [attr.x]="width / 2" y="26" text-anchor="middle" font-size="16" font-weight="700" fill="#1e293b">{{ display.title }}</text>
        }

        <!-- Vital few zone -->
        @if (display.highlightVitalFew && vitalRight > plotLeft) {
          <rect [attr.x]="plotLeft" [attr.y]="plotTop" [attr.width]="vitalRight - plotLeft" [attr.height]="plotBottom - plotTop" fill="#eff6ff" />
          <text [attr.x]="plotLeft + 6" [attr.y]="plotTop + 14" font-size="10.5" font-weight="700" fill="#2563eb">VITAL FEW</text>
        }

        <!-- Grid (right axis %) -->
        @for (t of percentTicks; track t.y) {
          <line [attr.x1]="plotLeft" [attr.x2]="plotRight" [attr.y1]="t.y" [attr.y2]="t.y" stroke="#e2e8f0" stroke-width="1" />
          <text [attr.x]="plotRight + 8" [attr.y]="t.y + 4" font-size="11" fill="#64748b">{{ t.label }}</text>
        }
        <!-- Left axis ticks -->
        @for (t of valueTicks; track t.y) {
          <line [attr.x1]="plotLeft - 4" [attr.x2]="plotLeft" [attr.y1]="t.y" [attr.y2]="t.y" stroke="#94a3b8" stroke-width="1" />
          <text [attr.x]="plotLeft - 8" [attr.y]="t.y + 4" text-anchor="end" font-size="11" fill="#64748b">{{ t.label }}</text>
        }
        <line [attr.x1]="plotLeft" [attr.x2]="plotLeft" [attr.y1]="plotTop" [attr.y2]="plotBottom" stroke="#94a3b8" stroke-width="1" />
        <line [attr.x1]="plotRight" [attr.x2]="plotRight" [attr.y1]="plotTop" [attr.y2]="plotBottom" stroke="#94a3b8" stroke-width="1" />
        <line [attr.x1]="plotLeft" [attr.x2]="plotRight" [attr.y1]="plotBottom" [attr.y2]="plotBottom" stroke="#94a3b8" stroke-width="1" />
        <text [attr.transform]="'translate(18,' + (plotTop + plotBottom) / 2 + ') rotate(-90)'" text-anchor="middle"
              font-size="12" font-weight="600" fill="#475569">{{ display.yAxisLabel }}</text>
        <text [attr.transform]="'translate(' + (width - 12) + ',' + (plotTop + plotBottom) / 2 + ') rotate(90)'" text-anchor="middle"
              font-size="12" font-weight="600" fill="#475569">Cumulative %</text>
        @if (display.xAxisLabel) {
          <text [attr.x]="(plotLeft + plotRight) / 2" [attr.y]="height - 10" text-anchor="middle"
                font-size="12" font-weight="600" fill="#475569">{{ display.xAxisLabel }}</text>
        }

        <!-- Bars -->
        @for (b of bars; track b.item.label; let i = $index) {
          <g (mouseenter)="hovered = i" (mouseleave)="hovered = null">
            <rect [attr.x]="b.cx - band / 2" [attr.y]="plotTop" [attr.width]="band" [attr.height]="plotBottom - plotTop"
                  [attr.fill]="hovered === i ? '#0f172a' : 'transparent'" [attr.fill-opacity]="hovered === i ? 0.04 : 0" />
            <rect [attr.x]="b.x" [attr.y]="b.y" [attr.width]="b.w" [attr.height]="max(b.h, 0.5)" rx="2" [attr.fill]="b.color" />
            @if (display.showValueLabels) {
              <text [attr.x]="b.cx" [attr.y]="b.valueInside ? b.y + 14 : b.y - 5" text-anchor="middle" font-size="10.5" font-weight="600"
                    [attr.fill]="b.valueInside ? '#ffffff' : '#334155'">{{ b.valueLabel }}</text>
            }
            <text [attr.x]="b.labelX" [attr.y]="b.labelY" font-size="11" fill="#334155"
                  [attr.font-style]="b.item.isOthers ? 'italic' : null"
                  [attr.text-anchor]="rotateLabels ? 'end' : 'middle'"
                  [attr.transform]="rotateLabels ? 'rotate(-40 ' + b.labelX + ' ' + b.labelY + ')' : null">{{ b.label }}<title>{{ b.item.label }}</title></text>
          </g>
        }

        <!-- Cutoff -->
        @if (display.showCutoff) {
          <line [attr.x1]="plotLeft" [attr.x2]="plotRight" [attr.y1]="cutoffY" [attr.y2]="cutoffY"
                stroke="#dc2626" stroke-width="1.2" stroke-dasharray="6 4" pointer-events="none" />
          @if (vitalRight > plotLeft && vitalRight < plotRight) {
            <line [attr.x1]="vitalRight" [attr.x2]="vitalRight" [attr.y1]="plotTop" [attr.y2]="plotBottom"
                  stroke="#dc2626" stroke-width="1.2" stroke-dasharray="6 4" pointer-events="none" />
          }
        }

        <!-- Cumulative line -->
        <polyline [attr.points]="linePoints" fill="none" stroke="#ea580c" stroke-width="2.2" stroke-linejoin="round" pointer-events="none" />
        @for (b of bars; track b.item.label) {
          <circle [attr.cx]="b.cx" [attr.cy]="b.pointY" r="3.6" fill="#ffffff" stroke="#ea580c" stroke-width="2" pointer-events="none" />
          @if (display.showPercentLabels) {
            <text [attr.x]="b.cx" [attr.y]="b.pointY - 8" text-anchor="middle" font-size="10" font-weight="600" fill="#c2410c"
                  pointer-events="none">{{ pct(b.item.cumulativePercent, 0) }}</text>
          }
        }

        <!-- Legend -->
        <g [attr.transform]="'translate(' + plotLeft + ',' + legendY + ')'">
          <rect x="0" y="-9" width="14" height="10" rx="2" [attr.fill]="display.highlightVitalFew ? colors.vital : colors.bar" />
          <text x="19" y="0" font-size="10.5" fill="#475569">{{ display.highlightVitalFew ? 'Vital few' : valueName }}</text>
          @if (display.highlightVitalFew) {
            <rect x="80" y="-9" width="14" height="10" rx="2" [attr.fill]="colors.trivial" />
            <text x="99" y="0" font-size="10.5" fill="#475569">Useful many</text>
          }
          <line x1="180" x2="200" y1="-4" y2="-4" stroke="#ea580c" stroke-width="2.2" />
          <circle cx="190" cy="-4" r="3" fill="#ffffff" stroke="#ea580c" stroke-width="1.8" />
          <text x="206" y="0" font-size="10.5" fill="#475569">Cumulative %</text>
          @if (display.showCutoff) {
            <line x1="290" x2="310" y1="-4" y2="-4" stroke="#dc2626" stroke-width="1.2" stroke-dasharray="5 3" />
            <text x="316" y="0" font-size="10.5" fill="#475569">{{ display.cutoff }}% cut-off</text>
          }
          <text x="400" y="0" font-size="10.5" fill="#94a3b8">Total: {{ num(display.total) }}</text>
        </g>
      </svg>

      <!-- Hover card -->
      @if (hovered !== null && bars[hovered]; as b) {
        <div class="pointer-events-none absolute z-10 w-52 -translate-x-1/2 -translate-y-full rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg"
             [style.left.%]="(b.cx / width) * 100" [style.top.%]="(max(min(b.y, b.pointY) - 12, 0) / height) * 100">
          <div class="mb-1 truncate font-bold text-slate-800">{{ b.item.label }}</div>
          <dl class="grid grid-cols-2 gap-x-2 gap-y-0.5 text-slate-600">
            <dt>{{ valueName }}</dt><dd class="text-right font-semibold text-slate-800">{{ num(b.item.value) }}</dd>
            <dt>Share</dt><dd class="text-right">{{ pct(b.item.percent) }}</dd>
            <dt>Cumulative</dt><dd class="text-right">{{ pct(b.item.cumulativePercent) }}</dd>
            @if (b.item.isOthers) {
              <dt>Categories</dt><dd class="text-right">{{ b.item.members }}</dd>
            } @else if (display.highlightVitalFew) {
              <dt>Group</dt><dd class="text-right" [class.text-blue-700]="b.item.vital">{{ b.item.vital ? 'Vital few' : 'Useful many' }}</dd>
            }
          </dl>
        </div>
      }
    </div>
  `,
})
export class ParetoDiagramComponent implements OnChanges {
  @Input({ required: true }) items: ParetoItem[] = [];
  @Input({ required: true }) display!: ParetoDisplay;
  @Input() valueName = 'Count';

  @ViewChild('paretoSvg', { static: true }) private svgRef!: ElementRef<SVGSVGElement>;

  readonly colors = { bar: '#2563eb', vital: '#2563eb', trivial: '#94a3b8', others: '#cbd5e1' };
  readonly max = Math.max;
  readonly min = Math.min;
  readonly num = (v: number) => formatNumber(v);
  readonly pct = formatPercent;

  width = 900;
  height = 480;
  minWidth = 640;
  plotLeft = 78;
  plotRight = 830;
  plotTop = 48;
  plotBottom = 388;
  band = 60;
  rotateLabels = false;
  legendY = 460;
  cutoffY = 0;
  vitalRight = 0;

  valueTicks: Tick[] = [];
  percentTicks: Tick[] = [];
  bars: BarRender[] = [];
  linePoints = '';
  hovered: number | null = null;

  get svgElement(): SVGSVGElement {
    return this.svgRef.nativeElement;
  }

  ngOnChanges() {
    this.hovered = null;
    this.layout();
  }

  //********************************************** Layout Start **********************************************//
  private layout() {
    const items = this.items;
    const d = this.display;
    const count = Math.max(items.length, 1);

    const longest = items.reduce((m, it) => Math.max(m, Math.min(it.label.length, 24)), 0);
    this.plotLeft = 78;
    const rightPad = 64;
    this.width = Math.max(900, this.plotLeft + rightPad + count * 52);
    this.plotRight = this.width - rightPad;
    this.band = (this.plotRight - this.plotLeft) / count;
    this.rotateLabels = longest * 6.4 + 10 > this.band;

    const labelSpace = this.rotateLabels ? Math.min(longest * 4.2 + 16, 120) : 20;
    this.plotTop = d.title ? 52 : 26;
    const plotHeight = 330;
    this.plotBottom = this.plotTop + plotHeight;
    this.legendY = this.plotBottom + labelSpace + 26;
    this.height = this.legendY + 12 + (d.xAxisLabel ? 24 : 0);
    this.minWidth = Math.min(this.width, Math.max(640, count * 36 + 160));

    // left axis 0 → total and right axis 0 → 100 % share the same height
    const total = d.total || 1;
    const y = (v: number) => this.plotBottom - (v / total) * plotHeight;
    const { step } = niceScale(0, total, 6);
    const decimals = tickDecimals(step);
    this.valueTicks = [];
    for (let v = 0; v <= total + 1e-9; v += step) this.valueTicks.push({ y: y(v), label: formatTick(v, decimals) });
    if (total - (this.valueTicks.length - 1) * step > step * 0.35) {
      this.valueTicks.push({ y: y(total), label: formatTick(total, decimals) }); // always show the total at the top
    }
    this.percentTicks = [0, 20, 40, 60, 80, 100].map((p) => ({ y: y((p / 100) * total), label: `${p}%` }));
    this.cutoffY = y((d.cutoff / 100) * total);

    const barW = Math.min(this.band * 0.72, 90);
    this.bars = items.map((item, i) => {
      const cx = this.plotLeft + this.band * (i + 0.5);
      const top = y(item.value);
      const h = this.plotBottom - top;
      const color = item.isOthers
        ? this.colors.others
        : !d.highlightVitalFew
          ? this.colors.bar
          : item.vital
            ? this.colors.vital
            : this.colors.trivial;
      const maxChars = this.rotateLabels ? 24 : Math.max(Math.floor(this.band / 6.4), 4);
      const valueLabel = formatNumber(item.value);
      return {
        item,
        color,
        x: cx - barW / 2,
        y: top,
        w: barW,
        h,
        cx,
        pointY: y(item.cumulative),
        valueLabel,
        valueInside: h > 22 && valueLabel.length * 6.2 < barW,
        label: item.label.length > maxChars ? item.label.slice(0, maxChars - 1) + '…' : item.label,
        labelX: cx,
        labelY: this.plotBottom + 16,
      };
    });

    const lastVital = this.bars.reduce((last, b, i) => (b.item.vital ? i : last), -1);
    this.vitalRight = this.plotLeft + this.band * (lastVital + 1);
    this.linePoints = this.bars.map((b) => `${b.cx},${b.pointY}`).join(' ');
  }
  //********************************************** Layout End **********************************************//
}
