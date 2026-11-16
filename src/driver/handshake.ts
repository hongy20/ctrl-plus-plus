import type { HubAdapter, HubProfile } from '../contracts';
import {
  encodeHubProperty,
  encodePortInputFormatSetup,
  encodeSetHubLed,
} from '../lego-protocol';
import { getVehicleProfile } from '../profile';

export async function sendHubInitHandshake(
  adapter: HubAdapter,
  hubProfile: HubProfile,
): Promise<void> {
  for (let prop = 0x01; prop <= 0x0d; prop++) {
    await adapter.send(encodeHubProperty(prop, 0x05));
  }

  await adapter.send(encodeHubProperty(0x06, 0x02));
  await adapter.send(encodeSetHubLed(hubProfile.ledColor, 0x32));

  const vehicle = getVehicleProfile(hubProfile.setId);
  for (const port of [vehicle.drivePort, vehicle.steerPort]) {
    await adapter.send(encodePortInputFormatSetup(port, 0x02, 1, true));
  }
  await adapter.send(encodePortInputFormatSetup(0x3d, 0x00, 5, true));
}
