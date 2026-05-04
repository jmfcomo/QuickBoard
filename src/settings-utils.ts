export const SETTINGS_STORAGE_KEY = 'qb-user-settings';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function deepClone<T>(value: T): T {
  // Use native structuredClone if available (much faster than JSON.parse/stringify)
  // Fallback to JSON for older environments
  if (typeof structuredClone === 'function') {
    return structuredClone(value) as T;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(override)) {
    const baseValue = base[key];
    if (isRecord(baseValue) && isRecord(value)) {
      deepMerge(baseValue, value);
      continue;
    }
    base[key] = value;
  }
}

export function readStoredSettings(): Record<string, unknown> {
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
