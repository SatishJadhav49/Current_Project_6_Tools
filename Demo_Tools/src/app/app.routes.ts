import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'fishbone', pathMatch: 'full' },
  {
    path: 'fishbone',
    loadComponent: () =>
      import('./fishbone/fishbone-diagram.component').then((m) => m.FishboneDiagramComponent),
  },
  {
    path: 'boxplot',
    loadComponent: () =>
      import('./boxplot/box-plot.component').then((m) => m.BoxPlotComponent),
  },
  {
    path: 'image-map',
    loadComponent: () =>
      import('./image-map/image-map.component').then((m) => m.ImageMapComponent),
  },
  {
    path: 'audit-map',
    loadComponent: () =>
      import('./audit-map/audit-map.component').then((m) => m.AuditMapComponent),
  },
  {
    path: 'audit-map-3d',
    loadComponent: () =>
      import('./audit-map-3d/audit-map-3d.component').then((m) => m.AuditMap3dComponent),
  },
];
