import { inject } from '@angular/core';
import { CanDeactivateFn, Routes } from '@angular/router';
import { ConfirmationService } from '../../services/confirmation.service';

export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

/** Asks before leaving a page with unsaved edits (report builder, dataset editor). */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (component) => {
  if (!component?.hasUnsavedChanges?.()) return true;
  return inject(ConfirmationService).confirm(
    'Leave without saving?',
    'You have unsaved changes on this page. They will be lost if you leave.',
    'Leave',
    'Stay'
  );
};

export const ReportRoutes: Routes = [
  { path: '', redirectTo: 'myreports', pathMatch: 'full' },
  {
    path: 'myreports',
    loadComponent: () => import('./report-list/report-list.component').then((m) => m.ReportListComponent),
  },
  {
    path: 'datasets',
    loadComponent: () => import('./datasets/dataset-list.component').then((m) => m.DatasetListComponent),
  },
  {
    path: 'datasets/new',
    loadComponent: () => import('./datasets/dataset-editor.component').then((m) => m.DatasetEditorComponent),
    canDeactivate: [unsavedChangesGuard],
  },
  {
    path: 'datasets/:id',
    loadComponent: () => import('./datasets/dataset-editor.component').then((m) => m.DatasetEditorComponent),
    canDeactivate: [unsavedChangesGuard],
  },
  {
    path: 'view/:id',
    loadComponent: () => import('./report-builder/report-builder.component').then((m) => m.ReportBuilderComponent),
    canDeactivate: [unsavedChangesGuard],
  },
  // chart shortcuts from the menu: reports/fishbone, reports/boxplot, reports/histogram ...
  {
    path: ':chartSlug',
    loadComponent: () => import('./report-list/report-list.component').then((m) => m.ReportListComponent),
  },
];
