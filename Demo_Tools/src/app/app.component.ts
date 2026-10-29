import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  // future features get added here and in app.routes.ts
  menuItems = [
    { label: 'Fishbone Analysis', path: '/fishbone' },
    { label: 'Box Plot Analysis', path: '/boxplot' },
    { label: 'Image Defect Map', path: '/image-map' },
    { label: 'Audit Image Map', path: '/audit-map' },
    { label: '3D Audit Map', path: '/audit-map-3d' },
  ];
}
