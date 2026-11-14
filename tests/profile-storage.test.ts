import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getVehicleProfile, listVehicleProfiles } from '../src/profile';
import {
  forgetHub,
  getOrCreateHubProfile,
  listRememberedHubs,
  resetHubCalibration,
  saveHubCalibration,
  updateHubParameters,
} from '../src/storage';

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

describe('Vehicle Profile Catalog (PRF-01..PRF-02)', () => {
  it('PRF-01: listVehicleProfiles() returns read-only catalog containing 42124 Off-Road Buggy', () => {
    const profiles = listVehicleProfiles();
    expect(profiles.length).toBeGreaterThanOrEqual(1);

    const buggy = profiles.find((p) => p.setId === '42124');
    expect(buggy).toEqual({
      setId: '42124',
      displayName: 'Off-Road Buggy',
      hubType: 'TechnicHub 88012',
      drivePort: 0x00,
      drivePolarity: -1,
      steerPort: 0x01,
      stockTireDiameterMm: 71.6,
      defaultSteeringClampRatio: 0.9,
      defaultBrakeIntensity: 0.6,
    });
  });

  it('PRF-01: getVehicleProfile("42124") returns the 42124 Off-Road Buggy profile', () => {
    const profile = getVehicleProfile('42124');
    expect(profile).toEqual({
      setId: '42124',
      displayName: 'Off-Road Buggy',
      hubType: 'TechnicHub 88012',
      drivePort: 0x00,
      drivePolarity: -1,
      steerPort: 0x01,
      stockTireDiameterMm: 71.6,
      defaultSteeringClampRatio: 0.9,
      defaultBrakeIntensity: 0.6,
    });
  });

  it('PRF-02: getVehicleProfile("unknown-id") falls back to the 42124 profile', () => {
    expect(getVehicleProfile('unknown-id')).toEqual(getVehicleProfile('42124'));
  });

  it('PRF-02: getVehicleProfile() with no setId falls back to the 42124 profile', () => {
    expect(getVehicleProfile()).toEqual(getVehicleProfile('42124'));
  });
});

describe('Hub Profile Storage (STR-01..STR-04)', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: createMemoryStorage(),
      configurable: true,
      writable: true,
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('STR-01: getOrCreateHubProfile() seeds a new HubProfile with advertised name, valid ledColor (1..10), 42124 defaults, and uncalibrated state', () => {
    const profile = getOrCreateHubProfile('hub-001', 'Technic Buggy');

    expect(profile.hubId).toBe('hub-001');
    expect(profile.name).toBe('Technic Buggy');
    expect(profile.setId).toBe('42124');
    expect(Number.isInteger(profile.ledColor)).toBe(true);
    expect(profile.ledColor).toBeGreaterThanOrEqual(1);
    expect(profile.ledColor).toBeLessThanOrEqual(10);
    expect(profile.ledColor).not.toBe(0);
    expect(profile.tireDiameterMm).toBe(71.6);
    expect(profile.steeringClampRatio).toBe(0.9);
    expect(profile.defaultBrakeIntensity).toBe(0.6);
    expect(profile.calibration).toEqual({
      leftLimit: null,
      rightLimit: null,
      centerPos: null,
      kCal: 1.0,
    });
    expect(profile.lastConnectedAt).toBe(Date.now());
    expect(localStorage.length).toBeGreaterThan(0);
  });

  it('STR-01: getOrCreateHubProfile() on an existing hubId updates lastConnectedAt and preserves stored name', () => {
    const initial = getOrCreateHubProfile('hub-001', 'My Custom Buggy');
    const initialConnectedAt = initial.lastConnectedAt;

    vi.advanceTimersByTime(5000);
    const reconnected = getOrCreateHubProfile('hub-001', 'DifferentAdvertisedName');

    expect(reconnected.hubId).toBe('hub-001');
    expect(reconnected.name).toBe('My Custom Buggy');
    expect(reconnected.ledColor).toBe(initial.ledColor);
    expect(reconnected.lastConnectedAt).toBeGreaterThan(initialConnectedAt);
  });

  it('STR-02: saveHubCalibration() merges partial calibration fields into persisted HubProfile without clobbering existing fields', () => {
    const created = getOrCreateHubProfile('hub-002', 'Buggy Two');

    const afterSteer = saveHubCalibration('hub-002', {
      leftLimit: -45,
      rightLimit: 45,
      centerPos: 0,
    });
    expect(afterSteer.calibration).toEqual({
      leftLimit: -45,
      rightLimit: 45,
      centerPos: 0,
      kCal: 1.0,
    });

    const afterSpeed = saveHubCalibration('hub-002', { kCal: 1.15 });
    expect(afterSpeed.calibration).toEqual({
      leftLimit: -45,
      rightLimit: 45,
      centerPos: 0,
      kCal: 1.15,
    });
    expect(afterSpeed.name).toBe('Buggy Two');
    expect(afterSpeed.ledColor).toBe(created.ledColor);

    const reloaded = getOrCreateHubProfile('hub-002', 'Ignored');
    expect(reloaded.calibration).toEqual({
      leftLimit: -45,
      rightLimit: 45,
      centerPos: 0,
      kCal: 1.15,
    });
  });

  it('STR-02: saveHubCalibration() throws for an unknown hubId', () => {
    expect(() => saveHubCalibration('unknown-hub', { kCal: 1.1 })).toThrow();
  });

  it('STR-03: updateHubParameters() validates and persists parameter overrides to localStorage', () => {
    getOrCreateHubProfile('hub-003', 'Buggy Three');

    const updated = updateHubParameters('hub-003', {
      name: 'Desert Racer',
      ledColor: 9,
      setId: '42124',
      tireDiameterMm: 81.6,
      steeringClampRatio: 0.85,
      defaultBrakeIntensity: 0.75,
    });

    expect(updated.name).toBe('Desert Racer');
    expect(updated.ledColor).toBe(9);
    expect(updated.setId).toBe('42124');
    expect(updated.tireDiameterMm).toBe(81.6);
    expect(updated.steeringClampRatio).toBe(0.85);
    expect(updated.defaultBrakeIntensity).toBe(0.75);

    const reloaded = getOrCreateHubProfile('hub-003', 'Advertised');
    expect(reloaded.name).toBe('Desert Racer');
    expect(reloaded.ledColor).toBe(9);
    expect(reloaded.tireDiameterMm).toBe(81.6);
    expect(reloaded.steeringClampRatio).toBe(0.85);
    expect(reloaded.defaultBrakeIntensity).toBe(0.75);

    const boundary = updateHubParameters('hub-003', {
      ledColor: 1,
      steeringClampRatio: 1,
      defaultBrakeIntensity: 0,
    });
    expect(boundary.ledColor).toBe(1);
    expect(boundary.steeringClampRatio).toBe(1);
    expect(boundary.defaultBrakeIntensity).toBe(0);
  });

  it('STR-03: updateHubParameters() throws on invalid parameter values or unknown hubId', () => {
    getOrCreateHubProfile('hub-004', 'Buggy Four');

    expect(() => updateHubParameters('unknown-hub', { name: 'X' })).toThrow();
    expect(() => updateHubParameters('hub-004', { name: '' })).toThrow();
    expect(() => updateHubParameters('hub-004', { name: '   ' })).toThrow();
    expect(() => updateHubParameters('hub-004', { ledColor: 0 })).toThrow();
    expect(() => updateHubParameters('hub-004', { ledColor: 11 })).toThrow();
    expect(() => updateHubParameters('hub-004', { ledColor: 1.5 })).toThrow();
    expect(() => updateHubParameters('hub-004', { tireDiameterMm: 0 })).toThrow();
    expect(() => updateHubParameters('hub-004', { tireDiameterMm: -10 })).toThrow();
    expect(() => updateHubParameters('hub-004', { steeringClampRatio: 0 })).toThrow();
    expect(() => updateHubParameters('hub-004', { steeringClampRatio: 1.1 })).toThrow();
    expect(() => updateHubParameters('hub-004', { defaultBrakeIntensity: -0.1 })).toThrow();
    expect(() => updateHubParameters('hub-004', { defaultBrakeIntensity: 1.1 })).toThrow();
  });

  it('STR-04: listRememberedHubs() returns stored HubProfiles sorted by lastConnectedAt descending and ignores corrupt JSON', () => {
    getOrCreateHubProfile('hub-oldest', 'Oldest');
    vi.advanceTimersByTime(1000);
    getOrCreateHubProfile('hub-middle', 'Middle');
    vi.advanceTimersByTime(1000);
    getOrCreateHubProfile('hub-newest', 'Newest');
    vi.advanceTimersByTime(1000);
    // Reconnect hub-middle so it becomes the most recently connected
    getOrCreateHubProfile('hub-middle', 'Middle');

    const firstKey = localStorage.key(0);
    if (firstKey && firstKey.includes('hub-oldest')) {
      localStorage.setItem(firstKey.replace('hub-oldest', 'corrupt'), '{not-valid-json');
    } else {
      localStorage.setItem('corrupt-hub-entry', '{not-valid-json');
    }

    const hubs = listRememberedHubs();
    expect(hubs.map((h) => h.hubId)).toEqual(['hub-middle', 'hub-newest', 'hub-oldest']);
  });

  it('STR-04: resetHubCalibration() restores stock VehicleProfile defaults and clears calibration while preserving name and ledColor', () => {
    getOrCreateHubProfile('hub-005', 'Buggy Five');
    updateHubParameters('hub-005', {
      name: 'Custom Name',
      ledColor: 7,
      tireDiameterMm: 95,
      steeringClampRatio: 0.7,
      defaultBrakeIntensity: 0.9,
    });
    saveHubCalibration('hub-005', {
      leftLimit: -50,
      rightLimit: 50,
      centerPos: 2,
      kCal: 1.25,
    });

    const reset = resetHubCalibration('hub-005');
    expect(reset.name).toBe('Custom Name');
    expect(reset.ledColor).toBe(7);
    expect(reset.tireDiameterMm).toBe(71.6);
    expect(reset.steeringClampRatio).toBe(0.9);
    expect(reset.defaultBrakeIntensity).toBe(0.6);
    expect(reset.calibration).toEqual({
      leftLimit: null,
      rightLimit: null,
      centerPos: null,
      kCal: 1.0,
    });
  });

  it('STR-04: forgetHub() removes the HubProfile from localStorage and is a no-op for unknown hubId', () => {
    getOrCreateHubProfile('hub-006', 'Buggy Six');
    expect(listRememberedHubs().map((h) => h.hubId)).toEqual(['hub-006']);

    forgetHub('hub-006');
    expect(listRememberedHubs()).toEqual([]);

    expect(() => forgetHub('unknown-hub')).not.toThrow();
  });
});
