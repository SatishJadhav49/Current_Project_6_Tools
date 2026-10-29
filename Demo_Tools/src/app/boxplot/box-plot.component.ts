import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import * as XLSX from 'xlsx';
// modular ECharts import — only the pieces the box plot needs, keeps the bundle small
import * as echarts from 'echarts/core';
import { BoxplotChart, ScatterChart } from 'echarts/charts';
import { DataZoomComponent, GridComponent, TitleComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsOption } from 'echarts';

echarts.use([BoxplotChart, ScatterChart, DataZoomComponent, GridComponent, TitleComponent, TooltipComponent, CanvasRenderer]);

//********************************************** Models Start **********************************************//
export interface BoxPlotRow {
  label: string; // category name or date string
  value: number;
}

export type GroupMode = 'auto' | 'category' | 'month' | 'quarter' | 'year';

export interface BoxPlotState {
  title: string;
  mode: GroupMode;
  rows: BoxPlotRow[];
}

export interface GroupStats {
  name: string;
  n: number;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  mean: number;
  whiskerLow: number;
  whiskerHigh: number;
  outliers: number[];
}
//********************************************** Models End **********************************************//

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

@Component({
  selector: 'app-box-plot',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './box-plot.component.html',
  styleUrl: './box-plot.component.css',
})
export class BoxPlotComponent implements OnInit, AfterViewInit, OnDestroy {
  //********************************************** Constants Start **********************************************//
  readonly MAX_ROWS = 10000;
  readonly MAX_GROUPS = 30;
  private readonly STORAGE_KEY = 'boxplot-analysis-data';
  private readonly COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#0891b2', '#e11d48'];
  //********************************************** Constants End **********************************************//

  @ViewChild('chartEl') private chartEl!: ElementRef<HTMLDivElement>;
  private chart: echarts.EChartsType | null = null;
  private onResize = () => this.chart?.resize();

  state: BoxPlotState = this.buildDemoData();
  groupStats: GroupStats[] = [];
  effectiveGrouping = '';
  truncatedGroups = 0;
  notice = '';

  // modal state
  showModal = false;
  modalTab: 'manual' | 'upload' = 'manual';
  editTitle = '';
  editRows: { label: string; value: string }[] = [];
  uploadPreview: { rows: BoxPlotRow[]; skipped: number; fileName: string } | null = null;
  uploadMode: 'replace' | 'append' = 'replace';

  ngOnInit() {
    const saved = this.readFromStorage();
    if (saved) this.state = saved;
    this.rebuild();
  }

  ngAfterViewInit() {
    this.chart = echarts.init(this.chartEl.nativeElement);
    this.renderChart();
    window.addEventListener('resize', this.onResize);
  }

  ngOnDestroy() {
    window.removeEventListener('resize', this.onResize);
    this.chart?.dispose();
  }

  colorOf(i: number): string {
    return this.COLORS[i % this.COLORS.length];
  }

  //********************************************** Grouping + Stats Start **********************************************//
  private rebuild() {
    const rows = this.state.rows;
    const dated: { date: Date; value: number }[] = [];
    for (const r of rows) {
      const d = this.parseLabelDate(r.label);
      if (d) dated.push({ date: d, value: r.value });
    }
    const isDateData = rows.length > 0 && dated.length / rows.length >= 0.8;

    let effective: 'category' | 'month' | 'quarter' | 'year';
    if (this.state.mode === 'auto') {
      effective = isDateData ? this.autoUnit(dated.map((d) => d.date)) : 'category';
    } else if (this.state.mode !== 'category' && !isDateData) {
      effective = 'category'; // date grouping requested but labels are not dates
    } else {
      effective = this.state.mode as 'category' | 'month' | 'quarter' | 'year';
    }
    const names = { category: 'By Category', month: 'Monthly', quarter: 'Quarterly', year: 'Yearly' };
    this.effectiveGrouping = names[effective] + (this.state.mode === 'auto' ? ' (auto)' : '');

    const map = new Map<string, { sort: number; values: number[] }>();
    if (effective === 'category') {
      for (const r of rows) {
        const key = r.label.trim() || '(blank)';
        if (!map.has(key)) map.set(key, { sort: map.size, values: [] });
        map.get(key)!.values.push(r.value);
      }
    } else {
      for (const { date, value } of dated) {
        const y = date.getFullYear();
        const m = date.getMonth();
        let key: string;
        let sort: number;
        if (effective === 'month') {
          key = `${MONTH_NAMES[m]} ${y}`;
          sort = y * 12 + m;
        } else if (effective === 'quarter') {
          const q = Math.floor(m / 3) + 1;
          key = `Q${q} ${y}`;
          sort = y * 4 + q;
        } else {
          key = String(y);
          sort = y;
        }
        if (!map.has(key)) map.set(key, { sort, values: [] });
        map.get(key)!.values.push(value);
      }
    }

    let entries = [...map.entries()].sort((a, b) => a[1].sort - b[1].sort);
    this.truncatedGroups = Math.max(entries.length - this.MAX_GROUPS, 0);
    entries = entries.slice(0, this.MAX_GROUPS);
    this.groupStats = entries.map(([name, g]) => this.computeStats(name, g.values));
    this.renderChart();
  }

  // if readings are >= ~monthly apart (or span > 3 years) box per year, else box per month
  private autoUnit(dates: Date[]): 'month' | 'year' {
    const times = [...new Set(dates.map((d) => d.getTime()))].sort((a, b) => a - b);
    if (times.length < 2) return 'month';
    const gaps: number[] = [];
    for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);
    gaps.sort((a, b) => a - b);
    const medianGapDays = gaps[Math.floor(gaps.length / 2)] / 86400000;
    const spanDays = (times[times.length - 1] - times[0]) / 86400000;
    return medianGapDays >= 26 || spanDays > 1100 ? 'year' : 'month';
  }

  // same result as Excel QUARTILE.INC (linear interpolation)
  private quantileInc(sorted: number[], p: number): number {
    const n = sorted.length;
    if (n === 1) return sorted[0];
    const h = (n - 1) * p;
    const lo = Math.floor(h);
    const hi = Math.ceil(h);
    return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
  }

  private computeStats(name: string, values: number[]): GroupStats {
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    const q1 = this.quantileInc(sorted, 0.25);
    const median = this.quantileInc(sorted, 0.5);
    const q3 = this.quantileInc(sorted, 0.75);
    const iqr = q3 - q1;
    const lowFence = q1 - 1.5 * iqr;
    const highFence = q3 + 1.5 * iqr;
    const inliers = sorted.filter((v) => v >= lowFence && v <= highFence);
    return {
      name,
      n,
      min: sorted[0],
      q1,
      median,
      q3,
      max: sorted[n - 1],
      mean: sorted.reduce((s, v) => s + v, 0) / n,
      whiskerLow: inliers.length ? inliers[0] : sorted[0],
      whiskerHigh: inliers.length ? inliers[inliers.length - 1] : sorted[n - 1],
      outliers: sorted.filter((v) => v < lowFence || v > highFence),
    };
  }

  fmtNum(v: number): string {
    if (!isFinite(v)) return '-';
    return String(Math.abs(v) >= 1000 ? +v.toFixed(1) : +v.toFixed(2));
  }
  //********************************************** Grouping + Stats End **********************************************//

  //********************************************** ECharts Render Start **********************************************//
  private rgba(hex: string, a: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  private renderChart() {
    if (!this.chart) return;
    const stats = this.groupStats;
    const fmt = (v: number) => this.fmtNum(v);
    const rotate = stats.some((s) => s.name.length > 9) ? 30 : 0;
    const showZoom = stats.length > 12;
    const outlierData: [number, number][] = [];
    stats.forEach((s, i) => s.outliers.forEach((v) => outlierData.push([i, v])));

    // value labels beside each box: lower whisker, Q1, median, Q3, upper whisker
    const valueLabelData: object[] = [];
    stats.forEach((s, i) => {
      for (const p of [s.whiskerLow, s.q1, s.median, s.q3, s.whiskerHigh]) {
        valueLabelData.push({
          value: [i, p],
          label: p === s.median ? { fontWeight: 700, color: '#334155' } : {},
        });
      }
    });

    const option: EChartsOption = {
      animationDuration: 500,
      title: {
        text: this.state.title,
        left: 'center',
        top: 6,
        textStyle: { fontSize: 15, fontWeight: 700, color: '#334155' },
      },
      grid: { left: 70, right: 28, top: 56, bottom: showZoom ? 92 : 66 },
      tooltip: {
        trigger: 'item',
        borderColor: '#e2e8f0',
        textStyle: { fontSize: 12, color: '#334155' },
      },
      xAxis: {
        type: 'category',
        data: stats.map((s) => s.name),
        axisLabel: { rotate, color: '#475569', fontWeight: 600, fontSize: 12 },
        axisTick: { alignWithLabel: true },
        axisLine: { lineStyle: { color: '#94a3b8' } },
      },
      yAxis: {
        type: 'value',
        scale: true, // don't force zero — boxes use the full plot height
        axisLabel: { color: '#64748b', fontSize: 11 },
        splitLine: { lineStyle: { color: '#e2e8f0' } },
      },
      dataZoom: showZoom
        ? [
            { type: 'slider', height: 18, bottom: 10, borderColor: '#e2e8f0' },
            { type: 'inside' },
          ]
        : undefined,
      series: [
        {
          name: 'Box',
          type: 'boxplot',
          boxWidth: [20, 56],
          z: 2,
          data: stats.map((s, i) => ({
            value: [s.whiskerLow, s.q1, s.median, s.q3, s.whiskerHigh],
            itemStyle: {
              color: this.rgba(this.colorOf(i), 0.15),
              borderColor: this.colorOf(i),
              borderWidth: 2,
            },
          })),
          tooltip: {
            formatter: (p: any) => {
              const s = stats[p.dataIndex];
              return (
                `<b>${s.name}</b> &nbsp;(N=${s.n})<br/>` +
                `Max: ${fmt(s.max)}<br/>Q3: ${fmt(s.q3)}<br/>` +
                `<b>Median: ${fmt(s.median)}</b><br/>` +
                `Q1: ${fmt(s.q1)}<br/>Min: ${fmt(s.min)}<br/>` +
                `Mean: ${fmt(s.mean)}<br/>Outliers: ${s.outliers.length || 'none'}`
              );
            },
          },
        },
        {
          name: 'Values',
          type: 'scatter',
          symbolSize: 0.1, // invisible points — only their labels are shown
          silent: true,
          z: 5,
          data: valueLabelData,
          label: {
            show: true,
            position: 'right',
            offset: [30, 0],
            fontSize: 10,
            color: '#64748b',
            formatter: (p: any) => fmt(p.value[1]),
          },
          labelLayout: { hideOverlap: true },
        },
        {
          name: 'Outliers',
          type: 'scatter',
          symbolSize: 9,
          z: 3,
          itemStyle: { color: '#ffffff', borderColor: '#dc2626', borderWidth: 1.6 },
          data: outlierData,
          tooltip: {
            formatter: (p: any) => `<b>Outlier</b><br/>${stats[p.value[0]].name}: <b>${fmt(p.value[1])}</b>`,
          },
        },
        {
          name: 'Mean',
          type: 'scatter',
          symbol: 'diamond',
          symbolSize: 10,
          z: 4,
          itemStyle: { color: '#334155' },
          data: stats.map((s, i) => [i, s.mean]),
          tooltip: {
            formatter: (p: any) => `<b>Mean</b><br/>${stats[p.value[0]].name}: <b>${fmt(p.value[1])}</b>`,
          },
        },
      ],
    };
    this.chart.setOption(option, true);
  }
  //********************************************** ECharts Render End **********************************************//

  //********************************************** Date Parsing Start **********************************************//
  private parseLabelDate(label: string): Date | null {
    const s = label.trim();
    let m = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/); // 2026-01-15 or 2026-01
    if (m) return this.validDate(+m[1], +m[2] - 1, +(m[3] ?? 1));
    m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/); // dd/mm/yyyy (Indian format)
    if (m) return this.validDate(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1]);
    m = s.match(/^([A-Za-z]{3,9})[\s\/-](\d{2,4})$/); // Jan-2026, January 2026
    if (m) {
      const mi = MONTH_NAMES.findIndex((x) => m![1].toLowerCase().startsWith(x.toLowerCase()));
      if (mi >= 0) return this.validDate(+m[2] < 100 ? 2000 + +m[2] : +m[2], mi, 1);
    }
    m = s.match(/^(\d{1,2})[\s\/-]([A-Za-z]{3,9})[\s\/-](\d{2,4})$/); // 15-Jan-2026
    if (m) {
      const mi = MONTH_NAMES.findIndex((x) => m![2].toLowerCase().startsWith(x.toLowerCase()));
      if (mi >= 0) return this.validDate(+m[3] < 100 ? 2000 + +m[3] : +m[3], mi, +m[1]);
    }
    return null;
  }

  private validDate(y: number, m: number, d: number): Date | null {
    if (m < 0 || m > 11 || d < 1 || d > 31) return null;
    const date = new Date(y, m, d);
    return isNaN(date.getTime()) ? null : date;
  }

  private dateToLabel(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  //********************************************** Date Parsing End **********************************************//

  //********************************************** Storage Start **********************************************//
  private readFromStorage(): BoxPlotState | null {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      return raw ? (JSON.parse(raw) as BoxPlotState) : null;
    } catch {
      return null;
    }
  }

  private saveAndRebuild() {
    this.state.rows = this.state.rows.slice(0, this.MAX_ROWS);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.state));
    this.rebuild();
  }

  onModeChange() {
    this.saveAndRebuild();
  }

  resetToDemo() {
    localStorage.removeItem(this.STORAGE_KEY);
    this.state = this.buildDemoData();
    this.notice = '';
    this.rebuild();
  }

  // TEMP DEMO DATA — deterministic pseudo-random daily readings over 6 months with planted outliers
  private buildDemoData(): BoxPlotState {
    const rows: BoxPlotRow[] = [];
    let seed = 42;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (let m = 0; m < 6; m++) {
      for (let i = 0; i < 14; i++) {
        const day = 1 + Math.floor(rand() * 27);
        let v = +(420 + m * 18 + (rand() + rand() + rand() - 1.5) * 90).toFixed(1);
        if (rand() < 0.07) v = +(v + 260).toFixed(1); // planted outliers
        rows.push({ label: `2026-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`, value: v });
      }
    }
    return { title: 'Rejection PPM — Daily Readings (Demo)', mode: 'auto', rows };
  }
  //********************************************** Storage End **********************************************//

  //********************************************** Modal / Manual Entry Start **********************************************//
  openModal() {
    this.editTitle = this.state.title;
    this.editRows = this.state.rows.map((r) => ({ label: r.label, value: String(r.value) }));
    if (!this.editRows.length) this.addEditRow();
    this.uploadPreview = null;
    this.uploadMode = 'replace';
    this.modalTab = 'manual';
    this.showModal = true;
  }

  addEditRow() {
    this.editRows.push({ label: '', value: '' });
  }

  removeEditRow(i: number) {
    this.editRows.splice(i, 1);
  }

  clearEditRows() {
    this.editRows = [{ label: '', value: '' }];
  }

  // paste 2 columns straight from Excel/Sheets into the grid
  onGridPaste(ev: ClipboardEvent) {
    const text = ev.clipboardData?.getData('text') ?? '';
    if (!text.includes('\n') && !text.includes('\t')) return; // single-cell paste behaves normally
    ev.preventDefault();
    const rows = this.parseDelimitedText(text);
    if (!rows.length) return;
    this.editRows = this.editRows.filter((r) => r.label.trim() || r.value.trim());
    this.editRows.push(...rows.map((r) => ({ label: r.label, value: String(r.value) })));
  }

  private parseDelimitedText(text: string): BoxPlotRow[] {
    const out: BoxPlotRow[] = [];
    for (const line of text.split(/\r?\n/)) {
      const cells = line.split(/[\t,;]/).map((c) => c.trim());
      if (cells.length < 2) continue;
      const value = Number(cells[1]);
      if (!cells[0] || !isFinite(value) || cells[1] === '') continue;
      out.push({ label: cells[0], value });
    }
    return out;
  }

  applyManual() {
    const valid: BoxPlotRow[] = [];
    let skipped = 0;
    for (const r of this.editRows) {
      const label = r.label.trim();
      const value = Number(r.value);
      if (!label && !r.value.trim()) continue; // fully empty row, ignore silently
      if (!label || r.value.trim() === '' || !isFinite(value)) {
        skipped++;
        continue;
      }
      valid.push({ label, value });
    }
    this.state.title = this.editTitle.trim() || this.state.title;
    this.state.rows = valid;
    this.notice = skipped ? `${skipped} invalid row(s) were ignored.` : '';
    this.saveAndRebuild();
    this.showModal = false;
  }
  //********************************************** Modal / Manual Entry End **********************************************//

  //********************************************** File Upload Start **********************************************//
  async onFileSelected(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][];
      const rows: BoxPlotRow[] = [];
      let skipped = 0;
      raw.forEach((cells, idx) => {
        if (!cells || cells.length < 2 || (cells[0] == null && cells[1] == null)) return;
        const labelCell = cells[0];
        const valueCell = cells[1];
        const value = typeof valueCell === 'number' ? valueCell : Number(String(valueCell ?? '').trim());
        if (!isFinite(value) || String(valueCell ?? '').trim() === '') {
          if (idx > 0) skipped++; // first row is allowed to be a header
          return;
        }
        const label =
          labelCell instanceof Date ? this.dateToLabel(labelCell) : String(labelCell ?? '').trim();
        if (!label) {
          skipped++;
          return;
        }
        rows.push({ label, value });
      });
      this.uploadPreview = { rows: rows.slice(0, this.MAX_ROWS), skipped, fileName: file.name };
    } catch {
      this.uploadPreview = null;
      this.notice = 'Could not read the file. Use a 2-column CSV or Excel file.';
    }
    input.value = ''; // allow re-selecting the same file
  }

  applyUpload() {
    if (!this.uploadPreview?.rows.length) return;
    this.state.rows =
      this.uploadMode === 'append' ? [...this.state.rows, ...this.uploadPreview.rows] : this.uploadPreview.rows;
    this.notice = this.uploadPreview.skipped ? `${this.uploadPreview.skipped} invalid row(s) were skipped.` : '';
    this.saveAndRebuild();
    this.showModal = false;
  }
  //********************************************** File Upload End **********************************************//

  //********************************************** Download Start **********************************************//
  private chartDataUrl(): string | null {
    return this.chart ? this.chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' }) : null;
  }

  downloadPng() {
    const url = this.chartDataUrl();
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = 'box-plot.png';
    a.click();
  }

  downloadPdf() {
    const url = this.chartDataUrl();
    if (!url) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(
      `<!DOCTYPE html><html><head><title>Box Plot</title>` +
        `<style>@page { size: A4 landscape; margin: 8mm; } body { margin: 0; } img { width: 100%; }</style>` +
        `</head><body><img src="${url}" /></body></html>`
    );
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  }
  //********************************************** Download End **********************************************//
}
