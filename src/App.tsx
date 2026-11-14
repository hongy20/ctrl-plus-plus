import { useEffect, useMemo, useState } from 'react';
import type { HubAdapter, HubLedColor } from './contracts';
import { HUB_LED_COLORS } from './contracts';
import { WebBleHubAdapter } from './hub-adapter';
import { encodeSetHubLed } from './lego-protocol';
import { attachMobileLifecycleGuards } from './lifecycle';
import { getVehicleProfile, listVehicleProfiles } from './profile';
import {
  forgetHub,
  listRememberedHubs,
  resetHubCalibration,
  updateHubParameters,
} from './storage';
import { LOW_BATTERY_CUTOFF_PCT, VehicleDriver } from './vehicle-driver';

const LED_COLOR_MAP: Record<number, string> = {
  1: '#ff69b4', // Pink
  2: '#800080', // Purple
  3: '#0000ff', // Blue
  4: '#00ffff', // Cyan
  5: '#00ff00', // Green
  6: '#ffff00', // Yellow
  7: '#ffa500', // Orange
  8: '#ff0000', // Red
  9: '#ffffff', // White
  10: '#333333', // None/Dark
};

export interface AppProps {
  adapter?: HubAdapter;
}

type TabKey = 'connect' | 'calibrate' | 'debug';

export function App(props: AppProps): React.JSX.Element {
  const { adapter: propAdapter } = props;
  const adapter = useMemo(() => propAdapter ?? new WebBleHubAdapter(), [propAdapter]);
  const driver = useMemo(() => new VehicleDriver(adapter), [adapter]);

  const [, setTick] = useState(0);
  const [activeTab, setActiveTab] = useState<TabKey>('connect');
  const [isConnecting, setIsConnecting] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [tireInput, setTireInput] = useState('');
  const [clampInput, setClampInput] = useState('');
  const [brakeInput, setBrakeInput] = useState('');
  const [steeringValue, setSteeringValue] = useState(0);
  const [measuredMeters, setMeasuredMeters] = useState(1.0);

  // Attach lifecycle guards on mount and cleanup on unmount
  useEffect(() => {
    const cleanup = attachMobileLifecycleGuards({ driver });
    return () => {
      cleanup();
    };
  }, [driver]);

  // Clean up driver on unmount
  useEffect(() => {
    return () => {
      driver.destroy();
    };
  }, [driver]);

  // Subscribe to driver updates
  useEffect(() => {
    return driver.subscribe(() => {
      setTick((t) => t + 1);
    });
  }, [driver]);

  const profile = driver.getHubProfile();
  const driverState = driver.getState();
  const batteryLevel = driver.getBatteryLevel();
  const isLowBattery = batteryLevel !== null && batteryLevel < LOW_BATTERY_CUTOFF_PCT;
  const isBluetoothSupported =
    typeof navigator !== 'undefined' &&
    Boolean((navigator as unknown as { bluetooth?: unknown }).bluetooth);

  // Sync profile fields to local inputs when profile loads or updates
  useEffect(() => {
    if (profile) {
      setNicknameInput(profile.name);
      setTireInput(String(profile.tireDiameterMm));
      setClampInput(String(profile.steeringClampRatio));
      setBrakeInput(String(profile.defaultBrakeIntensity));
    }
  }, [
    profile?.hubId,
    profile?.name,
    profile?.tireDiameterMm,
    profile?.steeringClampRatio,
    profile?.defaultBrakeIntensity,
  ]);

  // Telemetry & Inspector data
  const telemetry = driver.getTelemetry() as Map<
    number,
    { angleDeg: number; speedDegPerSec: number }
  >;
  const tempTelemetry = driver.getTelemetry(0x3d) as { angleDeg: number } | undefined;
  const tempDegC =
    tempTelemetry && typeof tempTelemetry.angleDeg === 'number'
      ? (tempTelemetry.angleDeg / 10).toFixed(1)
      : null;

  const hubProps = driver.getHubProperties();
  const attachedPorts = driver.getAttachedPorts();
  const rememberedHubs = listRememberedHubs();

  // Handlers
  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      await driver.connect();
      setTick((t) => t + 1);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    await driver.disconnect();
    setTick((t) => t + 1);
  };

  const handleEmergencyStop = async () => {
    await driver.emergencyStop();
    setTick((t) => t + 1);
  };

  const handleResume = async () => {
    await driver.resetEmergencyStop();
    setTick((t) => t + 1);
  };

  const handleNicknameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNicknameInput(val);
    if (profile && val.trim().length > 0) {
      updateHubParameters(profile.hubId, { name: val });
      setTick((t) => t + 1);
    }
  };

  const handleSetLed = async (color: HubLedColor) => {
    if (profile) {
      updateHubParameters(profile.hubId, { ledColor: color });
      setTick((t) => t + 1);
    }
    await adapter.send(encodeSetHubLed(color, 0x32));
  };

  const handleResetCalibration = (hubId: string) => {
    resetHubCalibration(hubId);
    setTick((t) => t + 1);
  };

  const handleForgetHub = (hubId: string) => {
    forgetHub(hubId);
    setTick((t) => t + 1);
  };

  const handleProfileSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (profile) {
      updateHubParameters(profile.hubId, { setId: e.target.value });
      setTick((t) => t + 1);
    }
  };

  const handleTireChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTireInput(val);
    const num = Number(val);
    if (profile && !Number.isNaN(num) && num > 0) {
      updateHubParameters(profile.hubId, { tireDiameterMm: num });
      setTick((t) => t + 1);
    }
  };

  const handleClampChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setClampInput(val);
    const num = Number(val);
    if (profile && !Number.isNaN(num) && num > 0 && num <= 1) {
      updateHubParameters(profile.hubId, { steeringClampRatio: num });
      setTick((t) => t + 1);
    }
  };

  const handleBrakeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setBrakeInput(val);
    const num = Number(val);
    if (profile && !Number.isNaN(num) && num >= 0 && num <= 1) {
      updateHubParameters(profile.hubId, { defaultBrakeIntensity: num });
      setTick((t) => t + 1);
    }
  };

  const handleSteeringChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setSteeringValue(val);
    void driver.setSteering(val).catch(() => {});
  };

  const activeHubName =
    profile?.name ?? (adapter.isConnected() ? adapter.getHubName() ?? 'Technic Hub' : '');

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 text-gray-900 pb-16">
      {/* UI-01: Persistent Top Header */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-4 py-2 bg-slate-900 text-white shadow-md">
        <div className="flex items-center space-x-3">
          <span
            data-testid="led-swatch"
            className="inline-block w-4 h-4 rounded-full border border-gray-400"
            style={{ backgroundColor: LED_COLOR_MAP[profile?.ledColor ?? 9] ?? '#ffffff' }}
          />
          <span className="font-semibold">{activeHubName || 'Ctrl++'}</span>
          <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-200 uppercase tracking-wider">
            {driverState}
          </span>
        </div>

        <div className="flex items-center space-x-3 text-sm">
          {batteryLevel !== null && (
            <span
              data-battery-warning={batteryLevel < 20 ? 'true' : 'false'}
              className={batteryLevel < 20 ? 'text-red-400 font-bold' : 'text-slate-200'}
            >
              {batteryLevel}%
            </span>
          )}
          {tempDegC !== null && <span className="text-slate-200">{tempDegC}°C</span>}
          {driverState === 'EMERGENCY_STOP' ? (
            <button
              type="button"
              onClick={handleResume}
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded shadow"
            >
              Resume
            </button>
          ) : (
            <button
              type="button"
              onClick={handleEmergencyStop}
              className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white font-bold rounded shadow"
            >
              E-STOP
            </button>
          )}
        </div>
      </header>

      {/* UI-08: Low Battery Cutoff Message */}
      {isLowBattery && (
        <div
          role="alert"
          className="bg-red-600 text-white px-4 py-2 text-center font-bold text-sm shadow"
        >
          Low-Battery Cutoff Active (&lt;10%) - Motor and Calibration Controls Disabled
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 p-4 max-w-lg mx-auto w-full">
        {/* UI-07: Compatibility Warning Banner */}
        {!isBluetoothSupported && (
          <div
            role="alert"
            className="mb-4 p-3 bg-amber-100 border border-amber-300 text-amber-900 rounded text-sm"
          >
            Web Bluetooth is not supported in this browser. Please use Google Chrome on Android or
            Desktop over HTTPS.
          </div>
        )}

        {/* Tab 1: Connect View (UI-04) */}
        {activeTab === 'connect' && (
          <div className="space-y-6">
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
              <>
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
                    onClick={() => setActiveTab('calibrate')}
                    className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded"
                  >
                    Tweak / Calibrate
                  </button>
                </section>
              </>
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
        )}

        {/* Tab 2: Calibrate View (UI-05) */}
        {activeTab === 'calibrate' && (
          <div className="space-y-6">
            <section className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 space-y-4">
              <h2 className="text-lg font-bold">Vehicle Configuration</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Vehicle Profile
                </label>
                <select
                  aria-label="Vehicle Profile"
                  value={profile?.setId ?? '42124'}
                  onChange={handleProfileSelect}
                  className="w-full px-3 py-2 border rounded border-gray-300"
                >
                  {listVehicleProfiles().map((v) => (
                    <option key={v.setId} value={v.setId}>
                      {v.setId} - {v.displayName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-3 pt-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Wheel Diameter (mm)
                  </label>
                  <input
                    type="number"
                    aria-label="Wheel Diameter (mm)"
                    value={tireInput}
                    onChange={handleTireChange}
                    className="w-full px-3 py-2 border rounded border-gray-300"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Steering Clamp Ratio
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    aria-label="Steering Clamp Ratio"
                    value={clampInput}
                    onChange={handleClampChange}
                    className="w-full px-3 py-2 border rounded border-gray-300"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Default Brake Intensity
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    aria-label="Default Brake Intensity"
                    value={brakeInput}
                    onChange={handleBrakeChange}
                    className="w-full px-3 py-2 border rounded border-gray-300"
                  />
                </div>
              </div>
            </section>

            <section className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 space-y-4">
              <h2 className="text-lg font-bold">Calibration Actions</h2>
              <button
                type="button"
                disabled={isLowBattery || driverState === 'CALIBRATING'}
                onClick={() => void driver.calibrateSteering().catch(() => {})}
                className="w-full py-2 px-4 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 text-white font-semibold rounded"
              >
                Auto-Calibrate Steering
              </button>

              <div className="border-t pt-4 space-y-3">
                <h3 className="font-semibold text-sm">2-Step 1m Speed Calibration</h3>
                <button
                  type="button"
                  disabled={isLowBattery || driverState === 'CALIBRATING'}
                  onClick={() => void driver.startSpeedCalRun().catch(() => {})}
                  className="w-full py-2 px-4 bg-sky-600 hover:bg-sky-700 disabled:bg-gray-300 text-white font-semibold rounded"
                >
                  Start 1m Run
                </button>
                <div className="flex space-x-2">
                  <input
                    type="number"
                    step="0.01"
                    value={measuredMeters}
                    onChange={(e) => setMeasuredMeters(Number(e.target.value))}
                    className="w-24 px-3 py-1 border rounded border-gray-300 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => void driver.saveSpeedCal(measuredMeters).catch(() => {})}
                    className="flex-1 py-1 px-3 bg-gray-700 hover:bg-gray-800 text-white text-sm font-semibold rounded"
                  >
                    Save Measured (m)
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* Tab 3: Debug View (UI-06) */}
        {activeTab === 'debug' && (
          <div className="space-y-6">
            <section className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 space-y-4">
              <h2 className="text-lg font-bold">Drive & Steering Controls</h2>
              <div className="flex space-x-3">
                <button
                  type="button"
                  disabled={isLowBattery}
                  onClick={() => void driver.setSpeed(1.0).catch(() => {})}
                  className="flex-1 py-2 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white font-semibold rounded"
                >
                  Forward
                </button>
                <button
                  type="button"
                  disabled={isLowBattery}
                  onClick={() => void driver.setSpeed(-1.0).catch(() => {})}
                  className="flex-1 py-2 px-4 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white font-semibold rounded"
                >
                  Reverse
                </button>
                <button
                  type="button"
                  disabled={isLowBattery}
                  onClick={() => void driver.brake().catch(() => {})}
                  className="flex-1 py-2 px-4 bg-rose-600 hover:bg-rose-700 disabled:bg-gray-300 text-white font-semibold rounded"
                >
                  Brake
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Steering: {steeringValue}
                </label>
                <input
                  type="range"
                  aria-label="Steering"
                  min="-1"
                  max="1"
                  step="0.05"
                  disabled={isLowBattery}
                  value={steeringValue}
                  onChange={handleSteeringChange}
                  className="w-full disabled:opacity-50"
                />
              </div>
            </section>

            <section className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 space-y-3">
              <h2 className="text-lg font-bold">Live Telemetry</h2>
              {telemetry.size === 0 ? (
                <p className="text-sm text-gray-500">No telemetry data received yet.</p>
              ) : (
                <div className="space-y-1 font-mono text-xs">
                  {Array.from(telemetry.entries()).map(([port, t]) => (
                    <div key={port} className="p-2 bg-gray-50 rounded">
                      Port {port}: Angle {t.angleDeg}° | Speed {t.speedDegPerSec.toFixed(1)}°/s
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 space-y-3">
              <h2 className="text-lg font-bold">Hub Properties Inspector</h2>
              {hubProps.size === 0 ? (
                <p className="text-sm text-gray-500">No hub properties loaded.</p>
              ) : (
                <div className="space-y-1 font-mono text-xs">
                  {Array.from(hubProps.entries()).map(([prop, val]) => (
                    <div key={prop} className="p-2 bg-gray-50 rounded">
                      Prop 0x{prop.toString(16)}: {String(val)}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 space-y-3">
              <h2 className="text-lg font-bold">Attached I/O Inspector</h2>
              {attachedPorts.size === 0 ? (
                <p className="text-sm text-gray-500">No attached I/O detected.</p>
              ) : (
                <div className="space-y-1 font-mono text-xs">
                  {Array.from(attachedPorts.entries()).map(([port, io]) => (
                    <div key={port} className="p-2 bg-gray-50 rounded">
                      Port {port}:{' '}
                      {io.attached
                        ? `0x${(io.ioTypeId ?? 0).toString(16).padStart(4, '0')} (${io.ioTypeId})`
                        : 'detached'}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {/* UI-01: Bottom Tabs Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t bg-white shadow-lg">
        <button
          type="button"
          onClick={() => setActiveTab('connect')}
          className={`flex-1 py-3 text-center text-sm font-semibold ${
            activeTab === 'connect' ? 'text-blue-600 border-t-2 border-blue-600' : 'text-gray-600'
          }`}
        >
          Connect
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('calibrate')}
          className={`flex-1 py-3 text-center text-sm font-semibold ${
            activeTab === 'calibrate'
              ? 'text-blue-600 border-t-2 border-blue-600'
              : 'text-gray-600'
          }`}
        >
          Calibrate
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('debug')}
          className={`flex-1 py-3 text-center text-sm font-semibold ${
            activeTab === 'debug' ? 'text-blue-600 border-t-2 border-blue-600' : 'text-gray-600'
          }`}
        >
          Debug
        </button>
      </nav>
    </div>
  );
}

export default App;
