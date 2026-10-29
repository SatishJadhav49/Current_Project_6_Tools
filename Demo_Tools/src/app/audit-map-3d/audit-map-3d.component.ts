import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as XLSX from 'xlsx';

//********************************************** Models Start **********************************************//
// Move these to Shared/models/audit-map-3d.model.ts in the main project
export interface AuditRow {
  [column: string]: string | number;
}

export interface AuditMarker3D {
  id: number;
  part: string;
  px: number; // marker position in 3D world coordinates — sticks to the model surface
  py: number;
  pz: number;
}

export interface AuditMap3DData {
  title: string;
  columns: string[];
  partColumn: string;
  rows: AuditRow[];
  markers: AuditMarker3D[];
  modelIsDemo: boolean; // uploaded models cannot be persisted, so their markers are dropped on reload
}

export interface PartSummary {
  part: string;
  count: number;
  mapped: boolean;
}

// transient screen-space info per marker, recomputed every camera move (never persisted)
interface OverlayPos {
  sx: number;
  sy: number;
  visible: boolean;
}
//********************************************** Models End **********************************************//

//********************************************** TEMP STATIC DATA Start **********************************************//
// TEMP STATIC DATA — replace with API data in the main project (call loadData() with the response)
const DEMO_ROWS: AuditRow[] = [
  { 'VIN No': 'MA3EJKD1S00101', 'Part': 'RH Front Door', 'Defect': 'Paint sag near handle', 'Attribution': 'Paint Shop', 'Severity': 'Major' },
  { 'VIN No': 'MA3EJKD1S00104', 'Part': 'RH Front Door', 'Defect': 'Dust particle inclusion', 'Attribution': 'Paint Shop', 'Severity': 'Minor' },
  { 'VIN No': 'MA3EJKD1S00109', 'Part': 'RH Front Door', 'Defect': 'Scratch below molding', 'Attribution': 'Assembly', 'Severity': 'Minor' },
  { 'VIN No': 'MA3EJKD1S00115', 'Part': 'RH Front Door', 'Defect': 'Orange peel on lower panel', 'Attribution': 'Paint Shop', 'Severity': 'Major' },
  { 'VIN No': 'MA3EJKD1S00102', 'Part': 'Bonnet', 'Defect': 'Crater defect', 'Attribution': 'Paint Shop', 'Severity': 'Major' },
  { 'VIN No': 'MA3EJKD1S00107', 'Part': 'Bonnet', 'Defect': 'Thin DFT patch', 'Attribution': 'Paint Shop', 'Severity': 'Minor' },
  { 'VIN No': 'MA3EJKD1S00112', 'Part': 'Bonnet', 'Defect': 'Fitment gap at hinge', 'Attribution': 'Assembly', 'Severity': 'Minor' },
  { 'VIN No': 'MA3EJKD1S00103', 'Part': 'Roof', 'Defect': 'Dent near antenna', 'Attribution': 'Body Shop', 'Severity': 'Major' },
  { 'VIN No': 'MA3EJKD1S00118', 'Part': 'Roof', 'Defect': 'Polish mark visible', 'Attribution': 'Paint Shop', 'Severity': 'Minor' },
  { 'VIN No': 'MA3EJKD1S00105', 'Part': 'Rear Bumper', 'Defect': 'Fitment gap uneven', 'Attribution': 'Assembly', 'Severity': 'Minor' },
  { 'VIN No': 'MA3EJKD1S00121', 'Part': 'Rear Bumper', 'Defect': 'Texture mismatch', 'Attribution': 'Supplier', 'Severity': 'Major' },
  { 'VIN No': 'MA3EJKD1S00108', 'Part': 'Front Wheel', 'Defect': 'Alloy scratch', 'Attribution': 'Logistics', 'Severity': 'Minor' },
];

const AUDIT_MAP_3D_STATIC_DATA: AuditMap3DData = {
  title: '3D Vehicle Audit Map — Jun 2026',
  columns: ['VIN No', 'Part', 'Defect', 'Attribution', 'Severity'],
  partColumn: 'Part',
  rows: DEMO_ROWS,
  // positions sit on the surface of the built-in demo car (see buildDemoCar)
  markers: [
    { id: 1, part: 'RH Front Door', px: 0.91, py: 0.85, pz: 0.3 },
    { id: 2, part: 'Bonnet', px: 0, py: 1.11, pz: 1.55 },
  ],
  modelIsDemo: true,
};
//********************************************** TEMP STATIC DATA End **********************************************//

@Component({
  selector: 'app-audit-map-3d',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './audit-map-3d.component.html',
  styleUrl: './audit-map-3d.component.css',
})
export class AuditMap3dComponent implements OnInit, AfterViewInit, OnDestroy {
  data: AuditMap3DData = AUDIT_MAP_3D_STATIC_DATA;

  //********************************************** Limits + Constants Start **********************************************//
  readonly MAX_ROWS = 5000;
  private readonly STORAGE_KEY = 'audit-map-3d-data';
  private readonly COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#0891b2', '#e11d48'];
  private readonly CLICK_DRAG_TOLERANCE = 6; // px — larger pointer movement counts as rotate, not click
  //********************************************** Limits + Constants End **********************************************//

  // computed from rows + markers (same logic as the 2D audit map)
  partSummary: PartSummary[] = [];
  unmappedParts: PartSummary[] = [];
  defectColumn = '';

  // interaction state
  selectedMarker: AuditMarker3D | null = null;
  selectedRows: AuditRow[] = [];
  pendingPart = '';
  titleText = '';
  modelIsDemo = true;
  overlay = new Map<number, OverlayPos>(); // marker id -> screen position
  pendingOverlay: OverlayPos | null = null;
  private pendingPoint: THREE.Vector3 | null = null;
  private storageWarned = false;

  //********************************************** Three.js Scene State Start **********************************************//
  @ViewChild('canvasHost') private canvasHost!: ElementRef<HTMLDivElement>;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private modelRoot!: THREE.Group;
  private raycaster = new THREE.Raycaster();
  private rafId = 0;
  private overlayDirty = true;
  private pointerDownAt: { x: number; y: number } | null = null;
  private resizeObserver?: ResizeObserver;
  //********************************************** Three.js Scene State End **********************************************//

  constructor(private zone: NgZone, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.loadData(this.readFromStorage() ?? AUDIT_MAP_3D_STATIC_DATA);
  }

  ngAfterViewInit() {
    this.initScene();
  }

  ngOnDestroy() {
    cancelAnimationFrame(this.rafId);
    this.resizeObserver?.disconnect();
    this.controls?.dispose();
    this.renderer?.dispose();
  }

  //********************************************** Data Load Start **********************************************//
  // Public on purpose: in the main project call this with API data after fetch
  loadData(data: AuditMap3DData) {
    // an uploaded model file cannot be saved in localStorage, so its markers are meaningless after reload
    const markers = data.modelIsDemo ? data.markers.map((m) => ({ ...m })) : [];
    this.data = {
      title: data.title,
      columns: [...data.columns],
      partColumn: data.partColumn,
      rows: data.rows.slice(0, this.MAX_ROWS),
      markers,
      modelIsDemo: true, // whatever was stored, after a reload we are back on the demo model
    };
    this.modelIsDemo = true;
    this.selectedMarker = null;
    this.pendingPoint = null;
    this.pendingOverlay = null;
    this.titleText = this.data.title;
    this.refreshSummary();
    this.overlayDirty = true;
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

  tooltipLines(part: string): string[] {
    if (!this.defectColumn) return [];
    return this.rowsFor(part)
      .map((r) => String(r[this.defectColumn]))
      .filter((t) => t && t !== 'undefined')
      .slice(0, 6);
  }

  detailColumns(): string[] {
    return this.data.columns.filter((c) => c !== this.data.partColumn);
  }
  //********************************************** Data Load End **********************************************//

  //********************************************** Scene Setup Start **********************************************//
  private initScene() {
    const host = this.canvasHost.nativeElement;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#e2e8f0');

    this.camera = new THREE.PerspectiveCamera(45, host.clientWidth / host.clientHeight, 0.1, 100);
    this.camera.position.set(5, 3, 6);

    // preserveDrawingBuffer so PNG export can read the canvas
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.HemisphereLight('#ffffff', '#94a3b8', 1.1));
    const sun = new THREE.DirectionalLight('#ffffff', 1.6);
    sun.position.set(5, 8, 4);
    this.scene.add(sun);

    const grid = new THREE.GridHelper(20, 20, '#94a3b8', '#cbd5e1');
    this.scene.add(grid);

    this.modelRoot = this.buildDemoCar();
    this.scene.add(this.modelRoot);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.8, 0);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2 + 0.1;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 25;
    this.controls.addEventListener('change', () => (this.overlayDirty = true));

    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(host);

    // render loop runs outside Angular so change detection is not triggered 60x per second
    this.zone.runOutsideAngular(() => {
      const animate = () => {
        this.rafId = requestAnimationFrame(animate);
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
        if (this.overlayDirty) {
          this.overlayDirty = false;
          this.updateOverlayPositions();
          this.cdr.detectChanges(); // refresh marker overlay bindings only when the view moved
        }
      };
      animate();
    });
  }

  private onResize() {
    const host = this.canvasHost.nativeElement;
    if (!host.clientWidth || !host.clientHeight) return;
    this.camera.aspect = host.clientWidth / host.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(host.clientWidth, host.clientHeight);
    this.overlayDirty = true;
  }

  // low-poly demo car built from primitives — no asset file needed
  private buildDemoCar(): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.7, 4.2),
      new THREE.MeshStandardMaterial({ color: '#64748b', metalness: 0.4, roughness: 0.5 })
    );
    body.position.y = 0.75;
    g.add(body);

    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.55, 2.0),
      new THREE.MeshStandardMaterial({ color: '#334155', metalness: 0.3, roughness: 0.4 })
    );
    cabin.position.set(0, 1.375, -0.2);
    g.add(cabin);

    const bumperMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.8 });
    const front = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.3, 0.25), bumperMat);
    front.position.set(0, 0.55, 2.2);
    g.add(front);
    const rear = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.3, 0.25), bumperMat);
    rear.position.set(0, 0.55, -2.2);
    g.add(rear);

    const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.25, 24);
    const wheelMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.9 });
    for (const [x, z] of [
      [0.95, 1.35],
      [-0.95, 1.35],
      [0.95, -1.35],
      [-0.95, -1.35],
    ]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.4, z);
      g.add(wheel);
    }
    return g;
  }
  //********************************************** Scene Setup End **********************************************//

  //********************************************** Overlay Projection Start **********************************************//
  // project each marker's 3D point to screen pixels; hide it when the model itself blocks the view
  private updateOverlayPositions() {
    const host = this.canvasHost.nativeElement;
    const w = host.clientWidth;
    const h = host.clientHeight;

    const project = (p: THREE.Vector3): OverlayPos => {
      const ndc = p.clone().project(this.camera);
      const sx = ((ndc.x + 1) / 2) * w;
      const sy = ((1 - ndc.y) / 2) * h;
      let visible = ndc.z < 1 && sx >= 0 && sx <= w && sy >= 0 && sy <= h;
      if (visible) {
        // occlusion: if the ray from the camera hits the model before reaching the point, it is behind the body
        const dir = p.clone().sub(this.camera.position);
        const dist = dir.length();
        this.raycaster.set(this.camera.position, dir.normalize());
        const hit = this.raycaster.intersectObject(this.modelRoot, true)[0];
        if (hit && hit.distance < dist - 0.08) visible = false;
      }
      return { sx, sy, visible };
    };

    this.overlay = new Map(this.data.markers.map((m) => [m.id, project(new THREE.Vector3(m.px, m.py, m.pz))]));
    this.pendingOverlay = this.pendingPoint ? project(this.pendingPoint) : null;
  }

  overlayFor(m: AuditMarker3D): OverlayPos {
    return this.overlay.get(m.id) ?? { sx: -100, sy: -100, visible: false };
  }
  //********************************************** Overlay Projection End **********************************************//

  //********************************************** Click / Marker Interaction Start **********************************************//
  onPointerDown(ev: PointerEvent) {
    this.pointerDownAt = { x: ev.clientX, y: ev.clientY };
  }

  // only a click (not an orbit drag) places a marker
  onPointerUp(ev: PointerEvent) {
    const down = this.pointerDownAt;
    this.pointerDownAt = null;
    if (!down) return;
    if (Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > this.CLICK_DRAG_TOLERANCE) return;
    if (!this.unmappedParts.length) return;

    const rect = this.canvasHost.nativeElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      -((ev.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObject(this.modelRoot, true)[0];
    if (!hit) {
      this.pendingPoint = null;
      this.pendingOverlay = null;
      this.overlayDirty = true;
      return;
    }
    this.pendingPoint = hit.point.clone();
    this.pendingPart = this.unmappedParts[0]?.part ?? '';
    this.selectedMarker = null;
    this.overlayDirty = true;
  }

  confirmPending() {
    if (!this.pendingPoint || !this.pendingPart) return;
    const marker: AuditMarker3D = {
      id: Date.now(),
      part: this.pendingPart,
      px: +this.pendingPoint.x.toFixed(4),
      py: +this.pendingPoint.y.toFixed(4),
      pz: +this.pendingPoint.z.toFixed(4),
    };
    this.data.markers.push(marker);
    this.pendingPoint = null;
    this.pendingOverlay = null;
    this.selectMarker(marker);
    this.applyAndSave();
  }

  cancelPending() {
    this.pendingPoint = null;
    this.pendingOverlay = null;
  }

  selectMarker(marker: AuditMarker3D, ev?: Event) {
    ev?.stopPropagation();
    this.pendingPoint = null;
    this.pendingOverlay = null;
    this.selectedMarker = marker;
    this.selectedRows = this.rowsFor(marker.part);
  }

  closePanel() {
    this.selectedMarker = null;
  }

  removeMarker(marker: AuditMarker3D) {
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

  indexOfMarker(marker: AuditMarker3D): number {
    return this.data.markers.findIndex((m) => m.id === marker.id);
  }
  //********************************************** Click / Marker Interaction End **********************************************//

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
        this.cancelPending();
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

  onPartColumnChange() {
    this.data.markers = [];
    this.selectedMarker = null;
    this.cancelPending();
    this.applyAndSave();
  }
  //********************************************** Sheet Upload End **********************************************//

  //********************************************** 3D Model Upload Start **********************************************//
  onModelSelected(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (this.data.markers.length && !confirm('Loading a new model will clear the current markers. Continue?')) return;

    const reader = new FileReader();
    reader.onload = () => {
      new GLTFLoader().parse(
        reader.result as ArrayBuffer,
        '',
        (gltf) => this.zone.run(() => this.setModel(gltf.scene)),
        () => this.zone.run(() => alert('Could not read this file. Please upload a valid .glb / .gltf model.'))
      );
    };
    reader.readAsArrayBuffer(file);
  }

  private setModel(root: THREE.Group) {
    // normalize any model: scale to a consistent size, center it, and sit it on the ground
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const scale = 4.5 / Math.max(size.x, size.y, size.z, 0.0001);
    root.scale.setScalar(scale);
    box.setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    root.position.x -= center.x;
    root.position.z -= center.z;
    root.position.y -= box.min.y;

    this.scene.remove(this.modelRoot);
    this.modelRoot = root;
    this.scene.add(root);

    this.modelIsDemo = false;
    this.data.modelIsDemo = false;
    this.data.markers = [];
    this.selectedMarker = null;
    this.cancelPending();
    this.controls.target.set(0, 1, 0);
    this.applyAndSave();
    this.overlayDirty = true;
  }
  //********************************************** 3D Model Upload End **********************************************//

  //********************************************** LocalStorage Start **********************************************//
  private readFromStorage(): AuditMap3DData | null {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      return raw ? (JSON.parse(raw) as AuditMap3DData) : null;
    } catch {
      return null;
    }
  }

  private applyAndSave() {
    this.refreshSummary();
    this.overlayDirty = true;
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
    if (!this.modelIsDemo) {
      this.scene.remove(this.modelRoot);
      this.modelRoot = this.buildDemoCar();
      this.scene.add(this.modelRoot);
      this.controls.target.set(0, 0.8, 0);
    }
    this.loadData(AUDIT_MAP_3D_STATIC_DATA);
  }
  //********************************************** LocalStorage End **********************************************//

  //********************************************** Download PNG / PDF Start **********************************************//
  // snapshot of the current 3D view with markers drawn on top
  private buildSnapshotCanvas(): HTMLCanvasElement {
    this.renderer.render(this.scene, this.camera); // make sure the buffer is fresh
    const src = this.renderer.domElement;
    const canvas = document.createElement('canvas');
    canvas.width = src.width;
    canvas.height = src.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(src, 0, 0);

    const s = src.width / src.clientWidth; // device pixel ratio
    this.updateOverlayPositions();
    this.data.markers.forEach((m, i) => {
      const pos = this.overlayFor(m);
      if (!pos.visible) return;
      const px = pos.sx * s;
      const py = pos.sy * s;
      const color = this.colorOf(i);

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
      ctx.fillText(String(this.countFor(m.part)), px, py + 0.5 * s);

      ctx.font = `700 ${Math.round(13 * s)}px ui-sans-serif, system-ui, sans-serif`;
      const tw = ctx.measureText(m.part).width;
      const bx = px - tw / 2 - 7 * s;
      const by = py + 15 * s;
      const bw = tw + 14 * s;
      const bh = 22 * s;
      this.roundedRect(ctx, bx, by, bw, bh, 6 * s);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(m.part, px, by + bh / 2 + 0.5 * s);
    });
    return canvas;
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
    this.buildSnapshotCanvas().toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'audit-map-3d.png';
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  downloadPdf() {
    const canvas = this.buildSnapshotCanvas();
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
  }
  //********************************************** Download PNG / PDF End **********************************************//
}
