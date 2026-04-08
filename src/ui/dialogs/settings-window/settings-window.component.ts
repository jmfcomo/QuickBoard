import { Component, OnInit, signal } from '@angular/core';

@Component({
  selector: 'app-settings-window',
  standalone: true,
  templateUrl: './settings-window.component.html',
  styleUrl: './settings-window.component.css',
})
export class SettingsWindowComponent implements OnInit {
  protected readonly dir = signal('');
  protected readonly tool = signal('pencil');
  // readonly githubUrl = 'https://github.com/jmfcomo/QuickBoard';

  ngOnInit() {
    const params = new URLSearchParams(window.location.search);
    this.dir.set(params.get('dir') ?? 'documents');
    this.tool.set(params.get('tool') ?? 'pencil');
  }

  // protected openGitHub(): void {
  //   window.quickboard?.openExternal(this.githubUrl);
  // }
}
