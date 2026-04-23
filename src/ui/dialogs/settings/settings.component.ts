import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  type WritableSignal,
  signal,
  effect,
  inject,
  Injector,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { appSettings } from 'src/settings-loader';
import { AppSettingsService, type AppSettings } from '../../../services/app-settings.service';
import themes from '../../../shared/themes.json';

// Tool options for default tool dropdown
const AVAILABLE_TOOLS = [
  { id: 'pencil', label: 'Pencil' },
  { id: 'brush', label: 'Brush' },
  { id: 'bucket-fill', label: 'Bucket Fill' },
  { id: 'rectangle', label: 'Rectangle' },
  { id: 'circle', label: 'Circle' },
  { id: 'polygon', label: 'Polygon' },
  { id: 'eraser', label: 'Eraser' },
  { id: 'object-eraser', label: 'Object Eraser' },
  { id: 'select', label: 'Select' },
  { id: 'image', label: 'Image' },
];

// Theme options for user-selectable concrete themes (system is chosen separately)
const AVAILABLE_THEMES = themes
  .filter((theme) => theme.id !== 'system')
  .map((theme) => ({ id: theme.id, label: theme.label }));

const AVAILABLE_THEME_IDS = new Set(AVAILABLE_THEMES.map((theme) => theme.id));

interface SelectOption {
  id: string;
  label: string;
}

interface CheckboxFieldConfig {
  id: string;
  label: string;
  value: WritableSignal<boolean>;
  checkboxLabelClass?: string;
}

interface NumberFieldConfig {
  id: string;
  label: string;
  value: WritableSignal<number>;
  min?: number;
  max?: number;
  unit?: string;
  groupClass?: string;
  disabled?: () => boolean;
}

interface SelectFieldConfig {
  id: string;
  label: string;
  value: WritableSignal<string>;
  options: readonly SelectOption[];
  useNgModel?: boolean;
}

interface ColorFieldConfig {
  id: string;
  label: string;
  value: WritableSignal<string>;
  fieldClass?: string;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent implements OnInit, OnDestroy {
  private readonly appSettingsService = inject(AppSettingsService);
  private readonly injector = inject(Injector);
  private readonly settingsHydrated = signal(false);
  private static readonly MS_PER_MINUTE = 60_000;

  // Helper to safely get app settings values
  private getSafeSettingValue(path: string, defaultValue: unknown = null): unknown {
    try {
      const settings = appSettings as Partial<Record<string, unknown>>;
      const keys = path.split('.');
      let current: unknown = settings;
      for (const key of keys) {
        if (typeof current === 'object' && current !== null && key in current) {
          current = (current as Record<string, unknown>)[key];
        } else {
          return defaultValue;
        }
      }
      return current ?? defaultValue;
    } catch {
      console.error(`Failed to get setting ${path}`);
      return defaultValue;
    }
  }

  // Settings states - with safe defaults
  readonly initialDir = signal<string>(this.getSafeSettingValue('saving.initialDir', 'documents') as string);
  readonly autosave = signal<boolean>(this.getSafeSettingValue('saving.autosave', true) as boolean);
  readonly autosaveDuration = signal<number>(
    Math.round(
      ((this.getSafeSettingValue('saving.autosaveDuration', 300000) as number) || 300000) /
        SettingsComponent.MS_PER_MINUTE,
    ),
  );
  readonly savedToast = signal<boolean>(
    this.getSafeSettingValue('saving.savedToast', true) as boolean,
  );
  readonly initialSave = signal<boolean>(
    this.getSafeSettingValue('saving.initialSave', true) as boolean,
  );
  readonly defaultLaneCount = signal<number>(this.getSafeSettingValue('audio.defaultLaneCount', 1) as number);
  readonly defaultVolume = signal<number>(
    ((this.getSafeSettingValue('audio.defaultVolume', 1) as number | null | undefined) ?? 1) * 100,
  );
  readonly systemLightTheme = signal<string>(this.getSafeSettingValue('theme.systemLightTheme', 'white') as string);
  readonly systemDarkTheme = signal<string>(this.getSafeSettingValue('theme.systemDarkTheme', 'black') as string);
  readonly defaultStrokeColor = signal<string>(this.getSafeSettingValue('canvas.defaultStrokeColor', '#000000') as string);
  readonly defaultFillColor = signal<string>(this.getSafeSettingValue('canvas.defaultFillColor', '#ffffff') as string);
  readonly defaultBackgroundColor = signal<string>(this.getSafeSettingValue('canvas.defaultBackgroundColor', '#ffffff') as string);
  readonly defaultTool = signal<string>(this.getSafeSettingValue('canvas.defaultTool', 'pencil') as string);
  readonly showClearCanvasWarning = signal<boolean>(this.getSafeSettingValue('canvas.showClearCanvasWarning', true) as boolean);
  readonly minZoom = signal<number>(this.getSafeSettingValue('timeline.zoom.minZoom', 2) as number);
  readonly maxZoom = signal<number>(this.getSafeSettingValue('timeline.zoom.maxZoom', 2500) as number);
  readonly defaultZoom = signal<number>(this.getSafeSettingValue('timeline.zoom.defaultZoom', 40) as number);
  readonly zoomStep = signal<number>(this.getSafeSettingValue('timeline.zoom.zoomStep', 100) as number);

  readonly savingCheckboxFields: readonly CheckboxFieldConfig[] = [
    {
      id: 'saved-toast-checkbox',
      label: 'Save Alert',
      value: this.savedToast,
      checkboxLabelClass: 'saving-checkbox-label',
    },
    {
      id: 'initial-save-checkbox',
      label: 'Save New Projects',
      value: this.initialSave,
      checkboxLabelClass: 'saving-checkbox-label',
    },
    {
      id: 'autosave-checkbox',
      label: 'Autosave',
      value: this.autosave,
      checkboxLabelClass: 'saving-checkbox-label',
    },
  ];

  readonly savingNumberFields: readonly NumberFieldConfig[] = [
    {
      id: 'autosave-duration',
      label: 'Frequency',
      value: this.autosaveDuration,
      min: 1,
      unit: 'min',
      groupClass: 'duration-input-group',
      disabled: () => !this.autosave(),
    },
  ];

  readonly audioNumberFields: readonly NumberFieldConfig[] = [
    {
      id: 'default-lanes',
      label: 'Default Audio Tracks',
      value: this.defaultLaneCount,
      min: 1,
      max: 4,
    },
    {
      id: 'default-volume',
      label: 'Default Clip Volume',
      value: this.defaultVolume,
      min: 0,
      max: 100,
      unit: '%',
      groupClass: 'volume-input-group',
    },
  ];

  readonly themeSelectFields: readonly SelectFieldConfig[] = [
    {
      id: 'light-theme',
      label: 'System Light Theme',
      value: this.systemLightTheme,
      options: AVAILABLE_THEMES,
      useNgModel: true,
    },
    {
      id: 'dark-theme',
      label: 'System Dark Theme',
      value: this.systemDarkTheme,
      options: AVAILABLE_THEMES,
      useNgModel: true,
    },
  ];

  readonly canvasColorFields: readonly ColorFieldConfig[] = [
    {
      id: 'stroke-color',
      label: 'Stroke',
      value: this.defaultStrokeColor,
      fieldClass: 'compact-color-field',
    },
    {
      id: 'fill-color',
      label: 'Fill',
      value: this.defaultFillColor,
      fieldClass: 'compact-color-field',
    },
    {
      id: 'bg-color',
      label: 'BG',
      value: this.defaultBackgroundColor,
      fieldClass: 'compact-color-field',
    },
  ];

  readonly canvasSelectFields: readonly SelectFieldConfig[] = [
    {
      id: 'default-tool',
      label: 'Tool',
      value: this.defaultTool,
      options: AVAILABLE_TOOLS,
    },
  ];

  readonly canvasCheckboxFields: readonly CheckboxFieldConfig[] = [
    {
      id: 'clear-canvas-warning',
      label: 'Clear Canvas Warning',
      value: this.showClearCanvasWarning,
    },
  ];

  readonly timelineNumberFields: readonly NumberFieldConfig[] = [
    {
      id: 'min-zoom',
      label: 'minZoom',
      value: this.minZoom,
      min: 1,
    },
    {
      id: 'max-zoom',
      label: 'maxZoom',
      value: this.maxZoom,
      min: 1,
    },
    {
      id: 'default-zoom',
      label: 'defaultZoom',
      value: this.defaultZoom,
      min: 1,
    },
    {
      id: 'zoom-step',
      label: 'zoomStep',
      value: this.zoomStep,
      min: 1,
    },
  ];

  // UI states
  readonly showRestoreConfirm = signal(false);
  readonly saving = signal(false);
  readonly availableTools = AVAILABLE_TOOLS;
  readonly availableThemes = AVAILABLE_THEMES;

  readonly restoreConfirmTop = signal(0);
  readonly restoreConfirmRight = signal(8);

  private normalizeTheme(value: unknown, fallback: string): string {
    if (typeof value === 'string' && AVAILABLE_THEME_IDS.has(value)) {
      return value;
    }
    return fallback;
  }

  private readonly autoSaveEffect = effect(
    () => {
      if (!this.settingsHydrated()) {
        return;
      }

      void this.appSettingsService.saveAllSettings(this.buildSettingsPayload());
    },
    { injector: this.injector },
  );

  ngOnInit(): void {
    void this.initializeSettings();
  }

  ngOnDestroy(): void {
    this.autoSaveEffect.destroy();
  }

  private async initializeSettings(): Promise<void> {
    await this.loadFreshSettings();
    this.settingsHydrated.set(true);
  }

  private buildSettingsPayload(): Partial<AppSettings> {
    const autosaveDurationMs = this.autosaveDuration() * SettingsComponent.MS_PER_MINUTE;
    return {
      // Keep legacy root fields synchronized for current consumers.
      initialDir: this.initialDir(),
      autosave: this.autosave(),
      autosaveDuration: autosaveDurationMs,
      saving: {
        initialDir: this.initialDir(),
        autosave: this.autosave(),
        autosaveDuration: autosaveDurationMs,
        savedToast: this.savedToast(),
        initialSave: this.initialSave(),
      },
      audio: {
        defaultLaneCount: this.defaultLaneCount(),
        defaultVolume: this.defaultVolume() / 100,
      },
      theme: {
        systemLightTheme: this.systemLightTheme(),
        systemDarkTheme: this.systemDarkTheme(),
      },
      canvas: {
        defaultStrokeColor: this.defaultStrokeColor(),
        defaultFillColor: this.defaultFillColor(),
        defaultBackgroundColor: this.defaultBackgroundColor(),
        defaultTool: this.defaultTool(),
        showClearCanvasWarning: this.showClearCanvasWarning(),
      },
      timeline: {
        zoom: {
          minZoom: this.minZoom(),
          maxZoom: this.maxZoom(),
          defaultZoom: this.defaultZoom(),
          zoomStep: this.zoomStep(),
        },
      },
    };
  }

  private async loadFreshSettings(): Promise<void> {
    try {
      const settings = await this.appSettingsService.loadCurrentSettings();

      // Helper to safely get nested values
      const getValue = (obj: unknown, path: string, fallback: unknown): unknown => {
        const keys = path.split('.');
        let current = obj;
        for (const key of keys) {
          if (typeof current === 'object' && current !== null && key in current) {
            current = (current as Record<string, unknown>)[key];
          } else {
            return fallback;
          }
        }
        return current ?? fallback;
      };

      const resolvedInitialDir =
        (getValue(settings, 'saving.initialDir', undefined) as string | undefined) ??
        (getValue(settings, 'initialDir', 'documents') as string);
      const resolvedAutosave =
        (getValue(settings, 'saving.autosave', undefined) as boolean | undefined) ??
        (getValue(settings, 'autosave', true) as boolean);
      const resolvedAutosaveMs =
        (getValue(settings, 'saving.autosaveDuration', undefined) as number | undefined) ??
        (getValue(settings, 'autosaveDuration', 300000) as number);
      const resolvedSavedToast =
        (getValue(settings, 'saving.savedToast', undefined) as boolean | undefined) ?? true;
      const resolvedInitialSave =
        (getValue(settings, 'saving.initialSave', undefined) as boolean | undefined) ?? true;

      // Update signals with fresh values from disk
      this.initialDir.set(resolvedInitialDir);
      this.autosave.set(resolvedAutosave);
      this.autosaveDuration.set(
        Math.max(
          1,
          Math.round((resolvedAutosaveMs || 300000) / SettingsComponent.MS_PER_MINUTE),
        ),
      );
      this.savedToast.set(resolvedSavedToast);
      this.initialSave.set(resolvedInitialSave);
      this.defaultLaneCount.set(getValue(settings, 'audio.defaultLaneCount', 1) as number);
      this.defaultVolume.set(
        ((getValue(settings, 'audio.defaultVolume', 1) as number || 1) * 100),
      );
      this.systemLightTheme.set(
        this.normalizeTheme(getValue(settings, 'theme.systemLightTheme', 'white'), 'white'),
      );
      this.systemDarkTheme.set(
        this.normalizeTheme(getValue(settings, 'theme.systemDarkTheme', 'black'), 'black'),
      );
      this.defaultStrokeColor.set(
        getValue(settings, 'canvas.defaultStrokeColor', '#000000') as string,
      );
      this.defaultFillColor.set(
        getValue(settings, 'canvas.defaultFillColor', '#ffffff') as string,
      );
      this.defaultBackgroundColor.set(
        getValue(settings, 'canvas.defaultBackgroundColor', '#ffffff') as string,
      );
      this.defaultTool.set(getValue(settings, 'canvas.defaultTool', 'pencil') as string);
      this.showClearCanvasWarning.set(
        getValue(settings, 'canvas.showClearCanvasWarning', true) as boolean,
      );
      this.minZoom.set(getValue(settings, 'timeline.zoom.minZoom', 2) as number);
      this.maxZoom.set(getValue(settings, 'timeline.zoom.maxZoom', 2500) as number);
      this.defaultZoom.set(getValue(settings, 'timeline.zoom.defaultZoom', 40) as number);
      this.zoomStep.set(getValue(settings, 'timeline.zoom.zoomStep', 100) as number);
    } catch (err) {
      console.error('Failed to load fresh settings:', err);
      // Fall back to default values already set in signal initialization
    }
  }

  openBrowseDialog(): void {
    if (window.quickboard?.selectFolder) {
      window.quickboard
        .selectFolder()
        .then((path: string | undefined) => {
          if (path) {
            this.initialDir.set(path);
          }
        })
        .catch(console.error);
    }
  }

  showRestoreConfirmDialog(event: MouseEvent): void {
    this.showRestoreConfirm.set(true);
    const target = event.target as HTMLElement;
    const rect = target.getBoundingClientRect();
    this.restoreConfirmRight.set(Math.max(8, window.innerWidth - rect.right));
    this.restoreConfirmTop.set(Math.max(10, rect.top - 100));
  }

  async confirmRestore(): Promise<void> {
    this.showRestoreConfirm.set(false);
    this.saving.set(true);
    this.settingsHydrated.set(false);
    try {
      await this.appSettingsService.restoreDefaults();
      await this.loadFreshSettings();
    } catch (error) {
      console.error('Failed to restore defaults:', error);
    } finally {
      this.settingsHydrated.set(true);
      this.saving.set(false);
    }
  }

  cancelRestore(): void {
    this.showRestoreConfirm.set(false);
  }

  setBooleanSignalFromInput(event: Event, targetSignal: WritableSignal<boolean>): void {
    const input = event.target;
    if (input instanceof HTMLInputElement) {
      targetSignal.set(input.checked);
    }
  }

  setStringSignalFromInput(event: Event, targetSignal: WritableSignal<string>): void {
    const input = event.target;
    if (input instanceof HTMLInputElement || input instanceof HTMLSelectElement) {
      targetSignal.set(input.value);
    }
  }

  setStringSignalFromModel(value: unknown, targetSignal: WritableSignal<string>): void {
    if (typeof value === 'string') {
      targetSignal.set(value);
    }
  }

  setNumberSignalFromInput(
    event: Event,
    targetSignal: WritableSignal<number>,
    min?: number,
    max?: number,
  ): void {
    const input = event.target as HTMLInputElement | null;
    const rawValue = input?.valueAsNumber;
    const currentValue = targetSignal();
    const fallbackValue =
      Number.isFinite(currentValue) ? currentValue : (typeof min === 'number' ? min : 0);

    const finiteValue =
      typeof rawValue === 'number' && Number.isFinite(rawValue)
        ? rawValue
        : fallbackValue;

    const clampedMin = typeof min === 'number' ? Math.max(min, finiteValue) : finiteValue;
    const clampedValue = typeof max === 'number' ? Math.min(max, clampedMin) : clampedMin;

    targetSignal.set(clampedValue);

    // Keep the visible input value synchronized with clamped/fallback output.
    if (input) {
      input.value = String(clampedValue);
    }
  }
}
