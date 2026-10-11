import { type AppConfig, config, SETTING_KEYS, SETTING_TYPES } from '@/lib/config';
import { getSettings } from '@/lib/settings';

/** Set a value on a nested object using a dot-separated key path. */
function setNested(obj: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]!] = value;
}

const validKeys = new Set<string>(SETTING_KEYS);

/** Validate that a DB override has a known key and matching type. */
function validateOverride(key: string, value: unknown): boolean {
  if (!validKeys.has(key)) {
    console.warn(`[config] Skipping unknown setting key: ${key}`);
    return false;
  }
  const expectedType = SETTING_TYPES[key as (typeof SETTING_KEYS)[number]];
  if (typeof value !== expectedType) {
    console.warn(`[config] Skipping "${key}": expected ${expectedType}, got ${typeof value}`);
    return false;
  }
  return true;
}

/**
 * Load config with DB overrides merged on top of static defaults.
 * Use in request-time code (API routes, server components) for fresh values.
 */
export async function loadConfig(): Promise<AppConfig> {
  const merged = structuredClone(config) as Record<string, unknown>;

  try {
    const dbSettings = await getSettings();
    for (const [key, value] of Object.entries(dbSettings)) {
      if (validateOverride(key, value)) {
        setNested(merged, key, value);
      }
    }
  } catch {
    // DB unavailable — fall through to static defaults
  }

  return merged as AppConfig;
}
