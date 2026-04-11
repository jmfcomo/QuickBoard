import defaultSettings from '@econfig/appsettings.json';

const SETTINGS_STORAGE_KEY = 'qb-user-settings';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(override)) {
    const baseValue = base[key];
    if (isRecord(baseValue) && isRecord(value)) {
      deepMerge(baseValue, value);
      continue;
    }
    base[key] = value;
  }
}

function readStoredSettings(): Record<string, unknown> {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

const runtimeSettings = deepClone(defaultSettings) as Record<string, unknown>;
deepMerge(runtimeSettings, readStoredSettings());

export const appSettings = runtimeSettings as typeof defaultSettings;