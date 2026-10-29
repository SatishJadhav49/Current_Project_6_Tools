import { DatasetColumn, DatasetRow } from './report.models';
import { ExportTable } from './chart-registry';
import { formatCell } from './data.util';

export interface ReportExportInput {
  title: string;
  subtitle: string; // chart type · dataset · filters
  fileName: string; // without extension
  svg: SVGSVGElement | null;
  columns: DatasetColumn[];
  rows: DatasetRow[];
  tables: ExportTable[]; // chart specific summary tables
}

const BRAND = '#e31837';
const PDF_MAX_DATA_ROWS = 1000; // pdfmake gets slow beyond this; Excel / CSV always have everything

//********************************************** Common Start **********************************************//
export function safeFileName(name: string): string {
  return (name || 'report').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_').slice(0, 80);
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function svgSize(svg: SVGSVGElement): { width: number; height: number } {
  const vb = svg.viewBox?.baseVal;
  if (vb && vb.width && vb.height) return { width: vb.width, height: vb.height };
  const rect = svg.getBoundingClientRect();
  return { width: rect.width || 1200, height: rect.height || 600 };
}

/** The diagrams are pure SVG, so exports are exact copies of what is on screen. */
function serializeSvg(svg: SVGSVGElement): string {
  const { width, height } = svgSize(svg);
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.removeAttribute('class');
  clone.style.fontFamily = "ui-sans-serif, system-ui, 'Segoe UI', Arial, sans-serif";
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', '100%');
  bg.setAttribute('height', '100%');
  bg.setAttribute('fill', '#ffffff');
  clone.insertBefore(bg, clone.firstChild);
  return new XMLSerializer().serializeToString(clone);
}

export function svgToPngDataUrl(svg: SVGSVGElement, scale = 2): Promise<{ dataUrl: string; width: number; height: number }> {
  const { width, height } = svgSize(svg);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas not supported'));
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, width, height);
      resolve({ dataUrl: canvas.toDataURL('image/png'), width, height });
    };
    img.onerror = () => reject(new Error('Could not render the chart image'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(serializeSvg(svg));
  });
}
//********************************************** Common End **********************************************//

//********************************************** PNG / CSV Start **********************************************//
export async function exportPng(input: ReportExportInput): Promise<void> {
  if (!input.svg) throw new Error('Nothing to export yet.');
  const { dataUrl } = await svgToPngDataUrl(input.svg);
  const blob = await (await fetch(dataUrl)).blob();
  downloadBlob(blob, `${input.fileName}.png`);
}

export function exportCsv(input: Pick<ReportExportInput, 'columns' | 'rows' | 'fileName'>): void {
  const escape = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [
    input.columns.map((c) => escape(c.name)).join(','),
    ...input.rows.map((r) => input.columns.map((c) => escape(formatCell(r[c.key]))).join(',')),
  ];
  // BOM so Excel opens UTF-8 (₹, accents, Hindi) correctly
  downloadBlob(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `${input.fileName}.csv`);
}
//********************************************** PNG / CSV End **********************************************//

//********************************************** Excel Start **********************************************//
export async function exportExcel(input: ReportExportInput): Promise<void> {
  const mod: any = await import('exceljs');
  const ExcelJS = mod.default ?? mod;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Quality Tools';
  workbook.created = new Date();

  // 1. Chart image
  if (input.svg) {
    const sheet = workbook.addWorksheet('Chart');
    sheet.getCell('A1').value = input.title;
    sheet.getCell('A1').font = { bold: true, size: 14 };
    sheet.getCell('A2').value = input.subtitle;
    sheet.getCell('A2').font = { color: { argb: 'FF64748B' } };
    const { dataUrl, width, height } = await svgToPngDataUrl(input.svg);
    const imageId = workbook.addImage({ base64: dataUrl, extension: 'png' });
    const targetWidth = Math.min(width, 1400);
    sheet.addImage(imageId, { tl: { col: 0, row: 3 }, ext: { width: targetWidth, height: (height * targetWidth) / width } });
  }

  // 2. Chart summary tables
  for (const table of input.tables) {
    addTableSheet(workbook, table.title, table.headers, table.rows);
  }

  // 3. Filtered data
  addTableSheet(
    workbook,
    'Data',
    input.columns.map((c) => c.name),
    input.rows.map((r) => input.columns.map((c) => r[c.key] ?? null))
  );

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${input.fileName}.xlsx`
  );
}

function addTableSheet(workbook: any, title: string, headers: string[], rows: (string | number | null)[][]): void {
  const sheet = workbook.addWorksheet(title.replace(/[\\/?*[\]:]/g, '').slice(0, 31) || 'Sheet');
  const headerRow = sheet.addRow(headers);
  headerRow.eachCell((cell: any) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
  });
  headerRow.height = 24;
  rows.forEach((r) => sheet.addRow(r));
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: Math.max(headers.length, 1) } };
  headers.forEach((h, i) => {
    const longest = rows.slice(0, 500).reduce((m, r) => Math.max(m, `${r[i] ?? ''}`.length), h.length);
    sheet.getColumn(i + 1).width = Math.min(Math.max(longest + 2, 10), 60);
  });
}
//********************************************** Excel End **********************************************//

//********************************************** PDF Start **********************************************//
async function loadPdfMake(): Promise<any> {
  const pdfMakeModule: any = await import('pdfmake/build/pdfmake');
  const pdfMake = pdfMakeModule.default ?? pdfMakeModule;
  const fontsModule: any = await import('pdfmake/build/vfs_fonts');
  const fonts = fontsModule.default ?? fontsModule;
  // 0.2.x exports the vfs object directly; older builds nest it under pdfMake.vfs
  pdfMake.vfs = fonts?.pdfMake?.vfs ?? fonts?.vfs ?? fonts;
  return pdfMake;
}

export async function exportPdf(input: ReportExportInput): Promise<void> {
  const pdfMake = await loadPdfMake();
  const content: any[] = [
    { text: input.title, style: 'title' },
    { text: input.subtitle, style: 'subtitle' },
    {
      canvas: [{ type: 'line', x1: 0, y1: 0, x2: 770, y2: 0, lineWidth: 1.5, lineColor: BRAND }],
      margin: [0, 4, 0, 10],
    },
  ];

  if (input.svg) {
    const { dataUrl } = await svgToPngDataUrl(input.svg);
    content.push({ image: dataUrl, fit: [770, 440], alignment: 'center' });
  }

  for (const table of input.tables) {
    content.push({ text: table.title, style: 'section', pageBreak: 'before' });
    content.push(pdfTable(table.headers, table.rows));
  }

  if (input.columns.length) {
    const rows = input.rows.slice(0, PDF_MAX_DATA_ROWS);
    content.push({ text: `Data (${input.rows.length} rows)`, style: 'section', pageBreak: 'before' });
    if (input.rows.length > rows.length) {
      content.push({
        text: `Showing first ${rows.length} rows — use the Excel or CSV export for the full data.`,
        style: 'note',
      });
    }
    // more than ~12 columns do not fit A4 landscape; keep the first 12
    const columns = input.columns.slice(0, 12);
    content.push(
      pdfTable(
        columns.map((c) => c.name),
        rows.map((r) => columns.map((c) => r[c.key] ?? ''))
      )
    );
  }

  const generatedOn = new Date().toLocaleString();
  pdfMake
    .createPdf({
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [36, 36, 36, 40],
      info: { title: input.title },
      content,
      footer: (current: number, total: number) => ({
        columns: [
          { text: `Generated on ${generatedOn}`, style: 'footer' },
          { text: `Page ${current} of ${total}`, alignment: 'right', style: 'footer' },
        ],
        margin: [36, 10, 36, 0],
      }),
      styles: {
        title: { fontSize: 16, bold: true, color: '#0f172a' },
        subtitle: { fontSize: 9, color: '#64748b', margin: [0, 2, 0, 0] },
        section: { fontSize: 12, bold: true, color: '#0f172a', margin: [0, 0, 0, 8] },
        note: { fontSize: 8, italics: true, color: '#64748b', margin: [0, 0, 0, 6] },
        tableHeader: { bold: true, fontSize: 8, color: '#ffffff', fillColor: '#334155' },
        tableCell: { fontSize: 7.5, color: '#1e293b' },
        footer: { fontSize: 7, color: '#94a3b8' },
      },
      defaultStyle: { fontSize: 9 },
    })
    .download(`${input.fileName}.pdf`);
}

function pdfTable(headers: string[], rows: (string | number | null)[][]): any {
  return {
    table: {
      headerRows: 1,
      widths: headers.map(() => '*'),
      body: [
        headers.map((h) => ({ text: h, style: 'tableHeader' })),
        ...rows.map((r) => headers.map((_, i) => ({ text: `${r[i] ?? ''}`, style: 'tableCell' }))),
      ],
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0,
      hLineColor: () => '#e2e8f0',
      fillColor: (rowIndex: number) => (rowIndex > 0 && rowIndex % 2 === 0 ? '#f8fafc' : null),
      paddingTop: () => 3,
      paddingBottom: () => 3,
    },
  };
}
//********************************************** PDF End **********************************************//
