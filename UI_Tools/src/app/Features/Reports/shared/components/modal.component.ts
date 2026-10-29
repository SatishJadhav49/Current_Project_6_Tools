import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';

/** Minimal centered dialog shell used by the reports module. Content is projected. */
@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fixed inset-0 z-[9000] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div class="absolute inset-0 bg-slate-900/50" (click)="closed.emit()"></div>
      <div class="relative flex max-h-[90vh] w-full flex-col rounded-xl bg-white shadow-2xl" [ngClass]="widthClass">
        <div class="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 class="text-base font-bold text-slate-800">{{ title }}</h2>
            @if (subtitle) {
              <p class="mt-0.5 text-xs text-slate-500">{{ subtitle }}</p>
            }
          </div>
          <button type="button" (click)="closed.emit()" class="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="Close">
            <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div class="overflow-y-auto px-5 py-4">
          <ng-content></ng-content>
        </div>
        <div class="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <ng-content select="[modal-footer]"></ng-content>
        </div>
      </div>
    </div>
  `,
})
export class ModalComponent {
  @Input() title = '';
  @Input() subtitle = '';
  @Input() size: 'md' | 'lg' = 'md';
  @Output() closed = new EventEmitter<void>();

  get widthClass(): string {
    return this.size === 'lg' ? 'max-w-2xl' : 'max-w-lg';
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.closed.emit();
  }
}
