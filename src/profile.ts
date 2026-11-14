import type { VehicleProfile } from './contracts';

export const OFFICIAL_VEHICLE_CATALOG: readonly VehicleProfile[] = Object.freeze([
  Object.freeze({
    setId: '42124',
    displayName: 'Off-Road Buggy',
    hubType: 'TechnicHub 88012',
    drivePort: 0x00,
    drivePolarity: -1,
    steerPort: 0x01,
    stockTireDiameterMm: 71.6,
    defaultSteeringClampRatio: 0.9,
    defaultBrakeIntensity: 0.6,
  }),
]);

export function listVehicleProfiles(): readonly VehicleProfile[] {
  return OFFICIAL_VEHICLE_CATALOG;
}

export function getVehicleProfile(setId?: string): VehicleProfile {
  if (!setId) {
    return OFFICIAL_VEHICLE_CATALOG[0]!;
  }
  const match = OFFICIAL_VEHICLE_CATALOG.find((profile) => profile.setId === setId);
  return match ?? OFFICIAL_VEHICLE_CATALOG[0]!;
}
