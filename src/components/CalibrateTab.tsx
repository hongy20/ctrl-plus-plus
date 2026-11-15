import { useEffect, useState } from 'react';
import type { DriverState, HubProfile } from '../contracts';
import { listVehicleProfiles } from '../profile';
import { updateHubParameters } from '../storage';
import type { VehicleDriver } from '../vehicle-driver';

export interface CalibrateTabProps {
  driver: VehicleDriver;
  profile: HubProfile | null;
  driverState: DriverState;
  isLowBattery: boolean;
  onUpdate: () => void;
}

export function CalibrateTab({
  driver,
  profile,
  driverState,
  isLowBattery,
  onUpdate,
}: CalibrateTabProps): React.JSX.Element {
  const [tireInput, setTireInput] = useState(profile ? String(profile.tireDiameterMm) : '');
  const [clampInput, setClampInput] = useState(profile ? String(profile.steeringClampRatio) : '');
  const [brakeInput, setBrakeInput] = useState(profile ? String(profile.defaultBrakeIntensity) : '');
  const [measuredMeters, setMeasuredMeters] = useState(1.0);

  useEffect(() => {
    if (profile) {
      setTireInput(String(profile.tireDiameterMm));
      setClampInput(String(profile.steeringClampRatio));
      setBrakeInput(String(profile.defaultBrakeIntensity));
    }
  }, [
    profile?.hubId,
    profile?.tireDiameterMm,
    profile?.steeringClampRatio,
    profile?.defaultBrakeIntensity,
  ]);

  const handleProfileSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (profile) {
      updateHubParameters(profile.hubId, { setId: e.target.value });
      onUpdate();
    }
  };

  const handleTireChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTireInput(val);
    const num = Number(val);
    if (profile && !Number.isNaN(num) && num > 0) {
      updateHubParameters(profile.hubId, { tireDiameterMm: num });
      onUpdate();
    }
  };

  const handleClampChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setClampInput(val);
    const num = Number(val);
    if (profile && !Number.isNaN(num) && num > 0 && num <= 1) {
      updateHubParameters(profile.hubId, { steeringClampRatio: num });
      onUpdate();
    }
  };

  const handleBrakeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setBrakeInput(val);
    const num = Number(val);
    if (profile && !Number.isNaN(num) && num >= 0 && num <= 1) {
      updateHubParameters(profile.hubId, { defaultBrakeIntensity: num });
      onUpdate();
    }
  };

  return (
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
  );
}
