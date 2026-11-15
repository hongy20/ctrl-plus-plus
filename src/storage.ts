import {
  HUB_LED_COLORS,
  type HubCalibration,
  type HubLedColor,
  type HubProfile,
} from './contracts';
import { getVehicleProfile } from './profile';
import {
  getStorageKey,
  isValidHubProfile,
  safeGetItem,
  safeListHubKeys,
  safeRemoveItem,
  safeSetItem,
} from './storage-backend';

function getRandomLedColor(): HubLedColor {
  const index = Math.floor(Math.random() * HUB_LED_COLORS.length);
  return HUB_LED_COLORS[index]!;
}

function readHubProfile(hubId: string): HubProfile | null {
  const raw = safeGetItem(getStorageKey(hubId));
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isValidHubProfile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeHubProfile(profile: HubProfile): void {
  safeSetItem(getStorageKey(profile.hubId), JSON.stringify(profile));
}

export interface HubParametersPatch {
  name?: string;
  ledColor?: number;
  setId?: string;
  tireDiameterMm?: number;
  steeringClampRatio?: number;
  defaultBrakeIntensity?: number;
}

export function getOrCreateHubProfile(
  hubId: string,
  name: string,
  setId?: string,
): HubProfile {
  const existing = readHubProfile(hubId);
  const now = Date.now();
  if (existing) {
    existing.lastConnectedAt = now;
    writeHubProfile(existing);
    return existing;
  }

  const vehicle = getVehicleProfile(setId);
  const newProfile: HubProfile = {
    hubId,
    name,
    setId: vehicle.setId,
    ledColor: getRandomLedColor(),
    lastConnectedAt: now,
    tireDiameterMm: vehicle.stockTireDiameterMm,
    steeringClampRatio: vehicle.defaultSteeringClampRatio,
    defaultBrakeIntensity: vehicle.defaultBrakeIntensity,
    calibration: {
      leftLimit: null,
      rightLimit: null,
      centerPos: null,
      kCal: 1.0,
    },
  };

  writeHubProfile(newProfile);
  return newProfile;
}

export function saveHubCalibration(
  hubId: string,
  patch: Partial<HubCalibration>,
): HubProfile {
  const profile = readHubProfile(hubId);
  if (!profile) {
    throw new Error(`Hub not found: ${hubId}`);
  }

  profile.calibration = {
    ...profile.calibration,
    ...patch,
  };

  writeHubProfile(profile);
  return profile;
}

export function updateHubParameters(
  hubId: string,
  patch: HubParametersPatch,
): HubProfile {
  const profile = readHubProfile(hubId);
  if (!profile) {
    throw new Error(`Hub not found: ${hubId}`);
  }

  if (patch.name !== undefined) {
    if (typeof patch.name !== 'string' || patch.name.trim().length === 0) {
      throw new Error('Invalid name: must be non-empty string');
    }
  }

  if (patch.ledColor !== undefined) {
    if (
      !Number.isInteger(patch.ledColor) ||
      !(HUB_LED_COLORS as readonly number[]).includes(patch.ledColor)
    ) {
      throw new Error('Invalid ledColor: must be an integer between 1 and 10');
    }
  }

  if (patch.tireDiameterMm !== undefined) {
    if (
      typeof patch.tireDiameterMm !== 'number' ||
      !Number.isFinite(patch.tireDiameterMm) ||
      patch.tireDiameterMm <= 0
    ) {
      throw new Error('Invalid tireDiameterMm: must be > 0');
    }
  }

  if (patch.steeringClampRatio !== undefined) {
    if (
      typeof patch.steeringClampRatio !== 'number' ||
      !Number.isFinite(patch.steeringClampRatio) ||
      patch.steeringClampRatio <= 0 ||
      patch.steeringClampRatio > 1
    ) {
      throw new Error('Invalid steeringClampRatio: must be in range (0, 1]');
    }
  }

  if (patch.defaultBrakeIntensity !== undefined) {
    if (
      typeof patch.defaultBrakeIntensity !== 'number' ||
      !Number.isFinite(patch.defaultBrakeIntensity) ||
      patch.defaultBrakeIntensity < 0 ||
      patch.defaultBrakeIntensity > 1
    ) {
      throw new Error('Invalid defaultBrakeIntensity: must be in range [0, 1]');
    }
  }

  if (patch.name !== undefined) {
    profile.name = patch.name;
  }
  if (patch.ledColor !== undefined) {
    profile.ledColor = patch.ledColor as HubLedColor;
  }
  if (patch.setId !== undefined) {
    profile.setId = patch.setId;
  }
  if (patch.tireDiameterMm !== undefined) {
    profile.tireDiameterMm = patch.tireDiameterMm;
  }
  if (patch.steeringClampRatio !== undefined) {
    profile.steeringClampRatio = patch.steeringClampRatio;
  }
  if (patch.defaultBrakeIntensity !== undefined) {
    profile.defaultBrakeIntensity = patch.defaultBrakeIntensity;
  }

  writeHubProfile(profile);
  return profile;
}

export function listRememberedHubs(): HubProfile[] {
  const hubs: HubProfile[] = [];
  for (const key of safeListHubKeys()) {
    const raw = safeGetItem(key);
    if (!raw) {
      continue;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (isValidHubProfile(parsed)) {
        hubs.push(parsed);
      }
    } catch {
      // Ignore corrupt JSON per STR-04
    }
  }

  return hubs.sort((a, b) => b.lastConnectedAt - a.lastConnectedAt);
}

export function resetHubCalibration(hubId: string): HubProfile {
  const profile = readHubProfile(hubId);
  if (!profile) {
    throw new Error(`Hub not found: ${hubId}`);
  }

  const vehicle = getVehicleProfile(profile.setId);
  profile.tireDiameterMm = vehicle.stockTireDiameterMm;
  profile.steeringClampRatio = vehicle.defaultSteeringClampRatio;
  profile.defaultBrakeIntensity = vehicle.defaultBrakeIntensity;
  profile.calibration = {
    leftLimit: null,
    rightLimit: null,
    centerPos: null,
    kCal: 1.0,
  };

  writeHubProfile(profile);
  return profile;
}

export function forgetHub(hubId: string): void {
  safeRemoveItem(getStorageKey(hubId));
}
