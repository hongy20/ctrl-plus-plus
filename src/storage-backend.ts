import { HUB_LED_COLORS, type HubProfile } from './contracts';

const STORAGE_KEY_PREFIX = 'ctrlpp:hub:';
const memoryStorage = new Map<string, string>();

export function getStorageKey(hubId: string): string {
  return `${STORAGE_KEY_PREFIX}${hubId}`;
}

export function safeGetItem(key: string): string | null {
  if (memoryStorage.has(key)) {
    return memoryStorage.get(key) ?? null;
  }
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {
    // Fall back to in-memory storage when localStorage is blocked
  }
  return null;
}

export function safeSetItem(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
      memoryStorage.delete(key);
      return;
    }
  } catch {
    // Fall back to in-memory storage when localStorage is blocked
  }
  memoryStorage.set(key, value);
}

export function safeRemoveItem(key: string): void {
  memoryStorage.delete(key);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage removal errors when localStorage is blocked
  }
}

export function safeListHubKeys(): string[] {
  const keys = new Set<string>();
  try {
    if (typeof localStorage !== 'undefined') {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
          keys.add(key);
        }
      }
    }
  } catch {
    // Fall back to in-memory keys when localStorage is blocked
  }
  for (const key of memoryStorage.keys()) {
    if (key.startsWith(STORAGE_KEY_PREFIX)) {
      keys.add(key);
    }
  }
  return Array.from(keys);
}

function isNullableFiniteNumber(val: unknown): val is number | null {
  return val === null || (typeof val === 'number' && Number.isFinite(val));
}

export function isValidHubProfile(val: unknown): val is HubProfile {
  if (!val || typeof val !== 'object') return false;
  const p = val as Record<string, unknown>;
  if (typeof p.hubId !== 'string' || p.hubId.length === 0) return false;
  if (typeof p.name !== 'string') return false;
  if (typeof p.setId !== 'string') return false;
  if (
    typeof p.ledColor !== 'number' ||
    !Number.isInteger(p.ledColor) ||
    !(HUB_LED_COLORS as readonly number[]).includes(p.ledColor)
  ) {
    return false;
  }
  if (typeof p.lastConnectedAt !== 'number' || !Number.isFinite(p.lastConnectedAt)) return false;
  if (typeof p.tireDiameterMm !== 'number' || !Number.isFinite(p.tireDiameterMm) || p.tireDiameterMm <= 0) {
    return false;
  }
  if (
    typeof p.steeringClampRatio !== 'number' ||
    !Number.isFinite(p.steeringClampRatio) ||
    p.steeringClampRatio <= 0 ||
    p.steeringClampRatio > 1
  ) {
    return false;
  }
  if (
    typeof p.defaultBrakeIntensity !== 'number' ||
    !Number.isFinite(p.defaultBrakeIntensity) ||
    p.defaultBrakeIntensity < 0 ||
    p.defaultBrakeIntensity > 1
  ) {
    return false;
  }
  const cal = p.calibration as Record<string, unknown> | undefined;
  if (!cal || typeof cal !== 'object') return false;
  if (
    !isNullableFiniteNumber(cal.leftLimit) ||
    !isNullableFiniteNumber(cal.rightLimit) ||
    !isNullableFiniteNumber(cal.centerPos) ||
    typeof cal.kCal !== 'number' ||
    !Number.isFinite(cal.kCal) ||
    cal.kCal <= 0
  ) {
    return false;
  }
  return true;
}
