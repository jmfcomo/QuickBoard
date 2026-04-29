import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface Hsv {
  h: number;
  s: number;
  v: number;
}

const HUE_GRADIENT =
  'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)';
const ALPHA_GRADIENT =
  'linear-gradient(to right, rgba(0, 0, 0, 0), rgba(0, 0, 0, 1))';
let colorPickerId = 0;

@Component({
  selector: 'app-color-picker',
  templateUrl: './color-picker.component.html',
  styleUrls: ['./color-picker.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'color-picker-host',
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown)': 'onDocumentKeydown($event)',
  },
})
export class ColorPickerComponent {
  readonly label = input.required<string>();
  readonly color = input.required<string>();
  readonly colorChange = output<string>();

  readonly isOpen = signal(false);
  readonly hue = signal(0);
  readonly saturation = signal(1);
  readonly value = signal(1);
  readonly alpha = signal(1);
  readonly hexText = signal('');
  readonly alphaText = signal('');

  readonly hueId = `color-picker-hue-${++colorPickerId}`;
  readonly alphaId = `color-picker-alpha-${colorPickerId}`;
  readonly panelId = `color-picker-panel-${colorPickerId}`;
  readonly hexId = `color-picker-hex-${colorPickerId}`;

  readonly svArea = viewChild<ElementRef<HTMLElement>>('svArea');

  private readonly isDragging = signal(false);
  private readonly activePointerId = signal<number | null>(null);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly isEditingHex = signal(false);
  private readonly isEditingAlpha = signal(false);

  readonly hueGradient = computed(() => HUE_GRADIENT);
  readonly svBackground = computed(() => {
    const hueColor = `hsl(${Math.round(this.hue())}, 100%, 50%)`;
    return `linear-gradient(to bottom, rgba(0, 0, 0, 0) 0%, #000000 100%), linear-gradient(to right, #ffffff 0%, ${hueColor} 100%)`;
  });

  readonly displayColor = computed(() => {
    const rgb = hsvToRgb(this.hue(), this.saturation(), this.value());
    return formatRgba(rgb, this.alpha());
  });

  readonly alphaGradient = computed(() => ALPHA_GRADIENT);
  readonly hexValue = computed(() => {
    const rgb = hsvToRgb(this.hue(), this.saturation(), this.value());
    return rgbToHex(rgb);
  });

  readonly alphaPercentValue = computed(() => Math.round(this.alpha() * 100));
  readonly isTransparent = computed(() => this.alpha() <= 0);
  readonly saturationPercentValue = computed(() => Math.round(this.saturation() * 100));
  readonly brightnessPercentValue = computed(() => Math.round(this.value() * 100));
  readonly svValueText = computed(() => {
    return `Saturation ${this.saturationPercentValue()} percent, Brightness ${this.brightnessPercentValue()} percent`;
  });

  constructor() {
    effect(() => {
      const incoming = this.color();
      const parsed = parseColor(incoming);
      if (!parsed) return;
      const hsv = rgbToHsv(parsed);
      const nextHue = hsv.s === 0 ? untracked(() => this.hue()) : hsv.h;
      this.hue.set(nextHue);
      this.saturation.set(hsv.s);
      this.value.set(hsv.v);
      this.alpha.set(parsed.a);
    });

    effect(() => {
      const hexValue = this.hexValue();
      const alphaValue = this.alphaPercentValue();
      const editingHex = this.isEditingHex();
      const editingAlpha = this.isEditingAlpha();
      untracked(() => {
        if (!editingHex) this.hexText.set(hexValue);
        if (!editingAlpha) this.alphaText.set(String(alphaValue));
      });
    });
  }

  toggleOpen(): void {
    this.isOpen.set(!this.isOpen());
  }

  onDocumentClick(event: MouseEvent): void {
    if (!this.isOpen()) return;
    const target = event.target as Node | null;
    if (!target) return;
    if (!this.host.nativeElement.contains(target)) {
      this.isOpen.set(false);
      this.isDragging.set(false);
      this.activePointerId.set(null);
    }
  }

  onDocumentKeydown(event: KeyboardEvent): void {
    if (!this.isOpen()) return;
    if (event.key === 'Escape') {
      this.isOpen.set(false);
      this.isDragging.set(false);
      this.activePointerId.set(null);
      event.stopPropagation();
    }
  }

  startSvDrag(event: PointerEvent): void {
    event.preventDefault();
    const target = event.currentTarget as HTMLElement | null;
    if (!target) return;
    target.setPointerCapture(event.pointerId);
    this.isDragging.set(true);
    this.activePointerId.set(event.pointerId);
    this.updateSvFromEvent(event);
  }

  onSvPointerMove(event: PointerEvent): void {
    if (!this.isDragging()) return;
    if (this.activePointerId() !== event.pointerId) return;
    this.updateSvFromEvent(event);
  }

  endSvDrag(event: PointerEvent): void {
    if (this.activePointerId() !== event.pointerId) return;
    this.isDragging.set(false);
    this.activePointerId.set(null);
  }

  onSvKeydown(event: KeyboardEvent): void {
    const step = event.shiftKey ? 0.1 : 0.02;
    let s = this.saturation();
    let v = this.value();

    if (event.key === 'ArrowLeft') s -= step;
    if (event.key === 'ArrowRight') s += step;
    if (event.key === 'ArrowUp') v += step;
    if (event.key === 'ArrowDown') v -= step;

    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      this.saturation.set(clamp01(s));
      this.value.set(clamp01(v));
      this.emitColor();
    }
  }

  onHueInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    if (!target) return;
    this.hue.set(clamp(target.valueAsNumber, 0, 360));
    this.emitColor();
  }

  onAlphaInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    if (!target) return;
    this.alpha.set(clamp(target.valueAsNumber / 100, 0, 1));
    this.emitColor();
  }

  onHexFocus(): void {
    this.isEditingHex.set(true);
  }

  onHexBlur(): void {
    this.isEditingHex.set(false);
    const normalized = normalizeHexInput(this.hexText());
    if (!normalized) {
      this.hexText.set(this.hexValue());
      return;
    }
    const parsed = parseColor(normalized);
    if (parsed) {
      this.applyParsedColor(parsed);
    }
  }

  onHexInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    if (!target) return;
    const value = target.value;
    this.hexText.set(value);
    const normalized = normalizeHexInput(value);
    if (!normalized) return;
    const parsed = parseColor(normalized);
    if (!parsed) return;
    this.applyParsedColor(parsed);
  }

  onAlphaFocus(): void {
    this.isEditingAlpha.set(true);
  }

  onAlphaBlur(): void {
    this.isEditingAlpha.set(false);
    const parsed = parseInt(this.alphaText(), 10);
    if (Number.isNaN(parsed)) {
      this.alphaText.set(String(this.alphaPercentValue()));
      return;
    }
    const clamped = clamp(parsed, 0, 100);
    this.alpha.set(clamped / 100);
    this.emitColor();
  }

  onAlphaTextInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    if (!target) return;
    const value = target.value;
    this.alphaText.set(value);
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed)) return;
    const clamped = clamp(parsed, 0, 100);
    this.alpha.set(clamped / 100);
    this.emitColor();
  }

  private updateSvFromEvent(event: PointerEvent): void {
    const areaRef = this.svArea();
    if (!areaRef) return;
    const area = areaRef.nativeElement;
    const rect = area.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    this.saturation.set(x);
    this.value.set(1 - y);
    this.emitColor();
  }

  private emitColor(): void {
    const rgb = hsvToRgb(this.hue(), this.saturation(), this.value());
    this.colorChange.emit(formatRgba(rgb, this.alpha()));
  }

  private applyParsedColor(parsed: Rgba): void {
    const hsv = rgbToHsv(parsed);
    const nextHue = hsv.s === 0 ? this.hue() : hsv.h;
    this.hue.set(nextHue);
    this.saturation.set(hsv.s);
    this.value.set(hsv.v);
    this.alpha.set(parsed.a);
    this.emitColor();
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function parseColor(value: string): Rgba | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'transparent') {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  const hexMatch = /^#([0-9a-f]{3,8})$/i.exec(normalized);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return { r, g, b, a: 1 };
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      return { r, g, b, a };
    }
  }

  const rgbMatch = /^rgba?\((.+)\)$/i.exec(normalized);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(',').map((part) => part.trim());
    if (parts.length < 3) return null;
    const r = parseRgbChannel(parts[0]);
    const g = parseRgbChannel(parts[1]);
    const b = parseRgbChannel(parts[2]);
    const a = parts.length > 3 ? parseAlphaChannel(parts[3]) : 1;
    return { r, g, b, a };
  }

  return null;
}

function normalizeHexInput(value: string): string | null {
  const cleaned = value.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$|^[0-9a-fA-F]{8}$/.test(cleaned)) {
    return null;
  }
  return `#${cleaned}`;
}

function parseRgbChannel(value: string): number {
  if (value.endsWith('%')) {
    const percent = parseFloat(value);
    return clamp(Math.round((percent / 100) * 255), 0, 255);
  }
  return clamp(Math.round(parseFloat(value)), 0, 255);
}

function parseAlphaChannel(value: string): number {
  if (value.endsWith('%')) {
    return clamp(parseFloat(value) / 100, 0, 1);
  }
  return clamp(parseFloat(value), 0, 1);
}

function rgbToHsv(rgba: Rgba): Hsv {
  const r = rgba.r / 255;
  const g = rgba.g / 255;
  const b = rgba.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === r) {
      h = ((g - b) / delta) % 6;
    } else if (max === g) {
      h = (b - r) / delta + 2;
    } else {
      h = (r - g) / delta + 4;
    }
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : delta / max;
  const v = max;
  return { h, s, v };
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const hue = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - c;

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (hue < 60) {
    r1 = c;
    g1 = x;
  } else if (hue < 120) {
    r1 = x;
    g1 = c;
  } else if (hue < 180) {
    g1 = c;
    b1 = x;
  } else if (hue < 240) {
    g1 = x;
    b1 = c;
  } else if (hue < 300) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }

  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

function formatRgba(rgb: { r: number; g: number; b: number }, alpha: number): string {
  const a = clamp01(alpha);
  if (a <= 0) return 'transparent';
  const roundedAlpha = Math.round(a * 1000) / 1000;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${roundedAlpha})`;
}

function rgbToHex(rgb: { r: number; g: number; b: number }): string {
  const toHex = (value: number) => value.toString(16).padStart(2, '0');
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`.toUpperCase();
}
