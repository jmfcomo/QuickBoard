import { Component, EventEmitter, Input, Output } from '@angular/core';

export interface VersionInfo {
  quickboardVersion: string;
  appVersion: string;
  chromeVersion: string;
  nodeVersion: string;
}

@Component({
  selector: 'app-version-dialog',
  standalone: true,
  templateUrl: './version-dialog.component.html',
  styleUrl: './version-dialog.component.css',
})
export class VersionDialogComponent {
  @Input() info!: VersionInfo;
  @Output() close = new EventEmitter<void>();
}
