import type { HubAdapter, HubProfile, VehicleProfile } from '../contracts';
import { encodeStartPower } from '../lego-protocol';
import { getVehicleProfile } from '../profile';
import { getOrCreateHubProfile } from '../storage';
import { sendHubInitHandshake } from './handshake';

export async function initializeHubConnection(adapter: HubAdapter): Promise<HubProfile> {
  await adapter.connect();
  try {
    const hubId = adapter.getHubId() ?? 'technic-hub';
    const hubName = adapter.getHubName() ?? 'Technic Hub';
    const profile = getOrCreateHubProfile(hubId, hubName);
    await sendHubInitHandshake(adapter, profile);
    return profile;
  } catch (error) {
    try {
      await adapter.disconnect();
    } catch {
      // ignore rollback disconnect error
    }
    throw error;
  }
}

export async function terminateHubConnection(
  adapter: HubAdapter,
  profile: HubProfile | null,
): Promise<void> {
  if (adapter.isConnected()) {
    await stopAllMotors(adapter, profile);
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
  for (const port of [vehicle.drivePort, vehicle.steerPort]) {
    try {
      await adapter.send(encodeStartPower(port, 0));
    } catch {
      // ignore send error during emergency stop so second port still executes
    }
  }
}
