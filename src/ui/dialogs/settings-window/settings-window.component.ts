import { Component, signal } from '@angular/core';
import { NgFor } from '@angular/common';
import { appSettings } from 'src/settings-loader';

@Component({
  selector: 'app-settings-window',
  standalone: true,
  imports: [NgFor],
  templateUrl: './settings-window.component.html',
  styleUrl: './settings-window.component.css',
})
export class SettingsWindowComponent {
  protected readonly warning = signal<boolean>(appSettings.export.showClearCanvasWarning);

  protected readonly strokeColor = signal<string>(appSettings.canvas.defaultStrokeColor ?? '#000000');
  protected readonly fillColor = signal<string>(appSettings.canvas.defaultFillColor ?? '#ffffff');
  protected readonly defaultTool = signal<'pencil' | 'brush'>(
    appSettings.canvas.defaultTool === 'pencil' ? 'pencil' : 'brush',
  );

  protected readonly boardWidth = signal<number>(appSettings.board.width);
  protected readonly boardHeight = signal<number>(appSettings.board.height);
  protected readonly backgroundColor = signal<string>(appSettings.board.defaultBackgroundColor);
  protected readonly boardDuration = signal<number>(appSettings.board.defaultDuration);
  protected readonly boardFps = signal<number>(appSettings.board.defaultFps);
  protected readonly snapPrecision = signal<number>(appSettings.board.defaultSnapPrecision);

  protected readonly exportResolutions = appSettings.export.resolutions ?? [];
  protected readonly exportResolutionIndex = signal<number>(
    Math.max(
      0,
      Math.min(2, this.exportResolutions.length - 1),
    ),
  );

  protected onWarningChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.warning.set(checked);
    window.dispatchEvent(
      new CustomEvent('quickboard-settings-warning-change', {
        detail: { showClearCanvasWarning: checked },
      }),
    );
  }

  protected onStrokeColorChange(event: Event): void {
    this.strokeColor.set((event.target as HTMLInputElement).value);
  }

  protected onFillColorChange(event: Event): void {
    this.fillColor.set((event.target as HTMLInputElement).value);
  }

  protected onDefaultToolChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === 'brush' || value === 'pencil') {
      this.defaultTool.set(value);
    }
  }

  protected onBoardWidthChange(event: Event): void {
    const parsed = parseInt((event.target as HTMLInputElement).value, 10);
    if (!Number.isNaN(parsed)) {
      this.boardWidth.set(Math.max(1, parsed));
    }
  }

  protected onBoardHeightChange(event: Event): void {
    const parsed = parseInt((event.target as HTMLInputElement).value, 10);
    if (!Number.isNaN(parsed)) {
      this.boardHeight.set(Math.max(1, parsed));
    }
  }

  protected onBackgroundColorChange(event: Event): void {
    this.backgroundColor.set((event.target as HTMLInputElement).value);
  }

  protected onBoardDurationChange(event: Event): void {
    const parsed = parseFloat((event.target as HTMLInputElement).value);
    if (!Number.isNaN(parsed)) {
      this.boardDuration.set(Math.max(0.1, parsed));
    }
  }

  protected onBoardFpsChange(event: Event): void {
    const parsed = parseInt((event.target as HTMLInputElement).value, 10);
    if (!Number.isNaN(parsed)) {
      this.boardFps.set(Math.max(1, parsed));
    }
  }

  protected onSnapPrecisionChange(event: Event): void {
    const parsed = parseFloat((event.target as HTMLInputElement).value);
    if (!Number.isNaN(parsed)) {
      this.snapPrecision.set(Math.max(0, parsed));
    }
  }

  protected onExportResolutionChange(event: Event): void {
    const parsed = parseInt((event.target as HTMLSelectElement).value, 10);
    if (!Number.isNaN(parsed)) {
      this.exportResolutionIndex.set(
        Math.max(0, Math.min(parsed, this.exportResolutions.length - 1)),
      );
    }
  }

  protected async applyChanges(): Promise<void> {
    const nextSettings = {
      ...appSettings,
      audio: {
        ...appSettings.audio,
      },
      canvas: {
        ...appSettings.canvas,
        defaultStrokeColor: this.strokeColor(),
        defaultFillColor: this.fillColor(),
        defaultTool: this.defaultTool(),
      },
      board: {
        ...appSettings.board,
        width: this.boardWidth(),
        height: this.boardHeight(),
        defaultBackgroundColor: this.backgroundColor(),
        defaultDuration: this.boardDuration(),
        defaultFps: this.boardFps(),
        defaultSnapPrecision: this.snapPrecision(),
      },
      export: {
        ...appSettings.export,
        defaultFramerate: Number(this.boardFps()),
        showClearCanvasWarning: this.warning(),
        defaultResolutionIndex: this.exportResolutionIndex(),
      },
    };

    if (!window.quickboard?.saveAppSettings) {
      window.alert('Unable to save appsettings.json from this environment.');
      return;
    }

    const result = await window.quickboard.saveAppSettings(nextSettings);
    if (!result?.success) {
      window.alert(`Failed to save settings: ${result?.message ?? 'Unknown error'}`);
      return;
    }

    window.alert('Saved settings to appsettings.json. Restart the app to apply the config changes.');
  }
}
