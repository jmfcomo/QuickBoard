import { appSettings } from "src/settings-loader";
import { Component, OnInit, signal } from '@angular/core';

@Component({
  selector: 'app-settings-window',
  standalone: true,
  templateUrl: './settings-window.component.html',
  styleUrl: './settings-window.component.css',
})

export class SettingsWindowComponent implements OnInit {
  protected readonly description = signal('');
  // readonly githubUrl = 'https://github.com/jmfcomo/QuickBoard';
  readonly defaultDirectory = appSettings.initialDir;

  ngOnInit() {
    const params = new URLSearchParams(window.location.search);
    this.description.set(params.get('description') ?? '');
  }
}