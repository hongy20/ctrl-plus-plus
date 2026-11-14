import type { HubAdapter, HubProfile, VehicleProfile } from '../contracts';
import { encodeStartSpeed } from '../lego-protocol';
import { getVehicleProfile } from '../profile';
import { getOrCreateHubProfile } from '../storage';
import { sendHubInitHandshake } from './handshake';

export async function initializeHubConnection(adapter: HubAdapter): Promise<HubProfile> {
  await adapter.connect();
  const hubId = adapter.getHubId() ?? 'technic-hub';
  const hubName = adapter.getHubName() ?? 'Technic Hub';
  const profile = getOrCreateHubProfile(hubId, hubName);
  await sendHubInitHandshake(adapter, profile);
  return profile;
}

export async function terminateHubConnection(
  adapter: HubAdapter,
  profile: HubProfile | null,
): Promise<void> {
  if (profile && adapter.isConnected()) {
    try {
      const vehicle = getVehicleProfile(profile.setId);
      await adapter.send(encodeStartSpeed(vehicle.drivePort, 0));
    } catch {
      // ignore send error on disconnect
    }
  }
  await adapter.disconnect();
}

export async function stopAllMotors(
  adapter: HubAdapter,
  vehicleOrProfile?: VehicleProfile | HubProfile | null,
): Promise<void> {
  const vehicle =
    vehicleOrProfile && 'drivePort' in vehicleOrProfile
      ? vehicleOrProfile
      : getVehicleProfile(vehicleOrProfile?.setId);
  try {
    await Promise.all([
      adapter.send(encodeStartSpeed(vehicle.drivePort, 0)),
      adapter.send(encodeStartSpeed(vehicle.steerPort, 0)),
    ]);
  } catch {
    // ignore send error during emergency stop
  }
}
