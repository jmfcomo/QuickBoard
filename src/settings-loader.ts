import defaultSettings from '@econfig/appsettings.json';
import {
  deepClone,
  deepMerge,
  readStoredSettings,
} from './settings-utils';

const runtimeSettings = deepClone(defaultSettings) as Record<string, unknown>;
deepMerge(runtimeSettings, readStoredSettings());

export const appSettings = runtimeSettings as typeof defaultSettings;