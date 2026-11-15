import { useEffect, useState } from 'react';
import type { HubAdapter, HubLedColor, HubProfile } from '../contracts';
import { HUB_LED_COLORS } from '../contracts';
import { encodeSetHubLed } from '../lego-protocol';
import { getVehicleProfile } from '../profile';
import {
  forgetHub,
  listRememberedHubs,
  resetHubCalibration,
  updateHubParameters,
} from '../storage';
import type { VehicleDriver } from '../vehicle-driver';
import { LED_COLOR_MAP } from './TopBar';

export interface ConnectTabProps {
  adapter: HubAdapter;
  driver: VehicleDriver;
  profile: HubProfile | null;
  onNavigateToCalibrate: () => void;
  onUpdate: () => void;
}

export function ConnectTab({
  adapter,
  driver,
  profile,
  onNavigateToCalibrate,
  onUpdate,
}: ConnectTabProps): React.JSX.Element {
  const [isConnecting, setIsConnecting] = useState(false);
  const [nicknameInput, setNicknameInput] = useState(profile?.name ?? '');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setNicknameInput(profile.name);
    }
  }, [profile?.hubId, profile?.name]);

  const isBluetoothSupported =
    typeof navigator !== 'undefined' &&
    Boolean((navigator as unknown as { bluetooth?: unknown }).bluetooth);

  const handleConnect = async () => {
    setErrorMsg(null);
    setIsConnecting(true);
    try {
      await driver.connect();
      onUpdate();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to connect to hub');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setErrorMsg(null);
    try {
      await driver.disconnect();
      onUpdate();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to disconnect from hub');
    }
  };

  const handleNicknameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNicknameInput(val);
    if (profile && val.trim().length > 0) {
      try {
        setErrorMsg(null);
        updateHubParameters(profile.hubId, { name: val });
        onUpdate();
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to update nickname');
      }
    }
  };

  const handleSetLed = async (color: HubLedColor) => {
    setErrorMsg(null);
    try {
      if (profile) {
        updateHubParameters(profile.hubId, { ledColor: color });
        onUpdate();
      }
      await adapter.send(encodeSetHubLed(color, 0x32));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update hub LED');
    }
  };

  const handleResetCalibration = (hubId: string) => {
    setErrorMsg(null);
    try {
      resetHubCalibration(hubId);
      onUpdate();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to reset calibration');
    }
  };

  const handleForgetHub = (hubId: string) => {
    setErrorMsg(null);
    try {
      forgetHub(hubId);
      onUpdate();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to forget hub');
    }
  };

  const rememberedHubs = listRememberedHubs();

  return (
    <div className="space-y-6">
      {errorMsg && (
        <div
          role="alert"
          className="p-3 bg-red-100 border border-red-300 text-red-900 rounded text-sm"
        >
          {errorMsg}
        </div>
      )}
      {/* UI-07: Compatibility Warning Banner */}
      {!isBluetoothSupported && (
        <div
          role="alert"
          className="p-3 bg-amber-100 border border-amber-300 text-amber-900 rounded text-sm"
        >
          Web Bluetooth is not supported in this browser. Please use Google Chrome on Android or
          Desktop over HTTPS.
        </div>
      )}

      <section className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-lg font-bold mb-3">WebBLE Connection</h2>
        {!adapter.isConnected() ? (
          <button
            type="button"
            disabled={!isBluetoothSupported || isConnecting}
            onClick={handleConnect}
            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-semibold rounded"
          >
            {isConnecting ? 'Connecting...' : 'Connect'}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleDisconnect}
            className="w-full py-2 px-4 bg-slate-600 hover:bg-slate-700 text-white font-semibold rounded"
          >
            Disconnect
          </button>
        )}
      </section>

      {profile && (
        <section className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 space-y-4">
          <h2 className="text-lg font-bold">Active Hub Profile</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Hub Nickname
            </label>
            <input
              type="text"
              aria-label="Hub Nickname"
              value={nicknameInput}
              onChange={handleNicknameChange}
              className="w-full px-3 py-2 border rounded border-gray-300"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              LED Color
            </label>
            <div className="flex flex-wrap gap-2">
              {HUB_LED_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`LED Color ${color}`}
                  onClick={() => void handleSetLed(color)}
                  className="w-8 h-8 rounded-full border border-gray-300 font-bold text-xs"
                  style={{
                    backgroundColor: LED_COLOR_MAP[color],
                    color: color === 9 || color === 6 || color === 4 ? '#000' : '#fff',
                  }}
                >
                  {color}
                </button>
              ))}
            </div>
          </div>

          <div className="p-3 bg-gray-50 rounded border text-sm space-y-1">
            <p>
              <strong>LEGO Set:</strong> {profile.setId} -{' '}
              {getVehicleProfile(profile.setId).displayName}
            </p>
            <p>
              <strong>Wheel Diameter:</strong> {profile.tireDiameterMm} mm
            </p>
            <p>
              <strong>Brake Intensity:</strong> {profile.defaultBrakeIntensity}
            </p>
            <p>
              <strong>Steering Limits:</strong>{' '}
              {profile.calibration.leftLimit !== null &&
              profile.calibration.rightLimit !== null
                ? `[${profile.calibration.leftLimit}, ${profile.calibration.rightLimit}]`
                : 'Uncalibrated'}
            </p>
          </div>

          <button
            type="button"
            onClick={onNavigateToCalibrate}
            className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded"
          >
            Tweak / Calibrate
          </button>
        </section>
      )}

      <section className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-lg font-bold mb-3">Remembered Hubs</h2>
        {rememberedHubs.length === 0 ? (
          <p className="text-sm text-gray-500">No remembered hubs found.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {rememberedHubs.map((hub) => (
              <div key={hub.hubId} className="py-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-sm">{hub.name}</div>
                  <div className="text-xs text-gray-400">
                    {hub.hubId} • kCal: {hub.calibration.kCal.toFixed(2)}
                  </div>
                </div>
                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => handleResetCalibration(hub.hubId)}
                    className="px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 text-xs rounded hover:bg-amber-100"
                  >
                    Reset Calibration
                  </button>
                  <button
                    type="button"
                    onClick={() => handleForgetHub(hub.hubId)}
                    className="px-2 py-1 bg-red-50 text-red-700 border border-red-200 text-xs rounded hover:bg-red-100"
                  >
                    Forget
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
