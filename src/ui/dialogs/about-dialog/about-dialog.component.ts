import { Component, EventEmitter, Input, Output } from '@angular/core';

export interface AboutInfo {
  description: string;
}

@Component({
  selector: 'app-about-dialog',
  standalone: true,
  templateUrl: './about-dialog.component.html',
  styleUrl: './about-dialog.component.css',
})
export class AboutDialogComponent {
  @Input() info!: AboutInfo;
  @Output() close = new EventEmitter<void>();

  readonly githubUrl = 'https://github.com/jmfcomo/QuickBoard';
}
