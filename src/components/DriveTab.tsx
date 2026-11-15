import { useEffect, useMemo, useRef, useState } from 'react';
import type { DriverState, HubProfile, MotorTelemetry } from '../contracts';
import {
  BRAKE_TAP_MAX_MS,
  BRAKE_TAP_STEP_RATIO,
  TILT_DEADZONE_DEG,
  TILT_MAX_DEG,
  type VehicleDriver,
} from '../vehicle-driver';
import {
  calculateBrakeTapTargetMps,
  calculateMaxSpeedMps,
  calculateTelemetrySpeedMps,
  normalizeTiltAxis,
} from '../driver/control';
import { getVehicleProfile } from '../profile';

export interface DriveTabProps {
  driver: VehicleDriver;
  profile: HubProfile | null;
  driverState: DriverState;
  isLowBattery: boolean;
}

type DriveMode = 'touch' | 'tilt';

export function DriveTab({ driver, profile, driverState, isLowBattery }: DriveTabProps): React.JSX.Element {
  const [, setTick] = useState(0);
  const [mode, setMode] = useState<DriveMode>('touch');
  const [throttlePct, setThrottlePct] = useState(0);
  const [steerPct, setSteerPct] = useState(0);
  const [cruiseHold, setCruiseHold] = useState(false);

  const baselineRef = useRef<{ beta: number; gamma: number } | null>(null);
  const brakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const brakeHoldTriggeredRef = useRef(false);

  useEffect(() => driver.subscribe(() => setTick((t) => t + 1)), [driver]);

  const vehicle = useMemo(() => getVehicleProfile(profile?.setId), [profile?.setId]);
  const maxSpeedMps = useMemo(() => (profile ? calculateMaxSpeedMps(profile, vehicle) : 0), [profile, vehicle]);

  const isEnabled = (driverState === 'READY' || driverState === 'DRIVING') && !isLowBattery && profile !== null;
  const isDisabled = !isEnabled;

  const driveTelemetry = profile ? (driver.getTelemetry(vehicle.drivePort) as MotorTelemetry | undefined) : undefined;
  const steerTelemetry = profile ? (driver.getTelemetry(vehicle.steerPort) as MotorTelemetry | undefined) : undefined;
  const liveSpeedMps = driveTelemetry && profile
    ? calculateTelemetrySpeedMps(driveTelemetry.speedDegPerSec, profile, vehicle)
    : 0;
  const steerAngleDeg = steerTelemetry?.angleDeg ?? 0;

  const handleSwitchMode = (newMode: DriveMode) => {
    if (newMode === mode) return;
    if (mode === 'tilt' && newMode === 'touch') {
      setThrottlePct(0);
      setSteerPct(0);
      void driver.brake().catch(() => {});
      void driver.setSteering(0).catch(() => {});
    }
    baselineRef.current = null;
    setMode(newMode);
  };

  useEffect(() => {
    if (mode !== 'tilt' || isDisabled) return;
    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return;
      if (!baselineRef.current) {
        baselineRef.current = { beta: e.beta, gamma: e.gamma };
        return;
      }
      const throttleNorm = normalizeTiltAxis(e.beta, baselineRef.current.beta, TILT_DEADZONE_DEG, TILT_MAX_DEG);
      const steerNorm = normalizeTiltAxis(e.gamma, baselineRef.current.gamma, TILT_DEADZONE_DEG, TILT_MAX_DEG);
      const nextThrottle = Math.round(throttleNorm * 100);
      const nextSteer = Math.round(steerNorm * 100);
      setThrottlePct(nextThrottle);
      setSteerPct(nextSteer);
      void driver.setSpeed(throttleNorm * maxSpeedMps).catch(() => {});
      void driver.setSteering(steerNorm).catch(() => {});
    };
    window.addEventListener('deviceorientation', handleOrientation);
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [mode, isDisabled, driver, maxSpeedMps]);

  useEffect(() => {
    return () => {
      if (brakeTimerRef.current) clearTimeout(brakeTimerRef.current);
    };
  }, []);

  const handleThrottleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pct = Number(e.target.value);
    setThrottlePct(pct);
    void driver.setSpeed((pct / 100) * maxSpeedMps).catch(() => {});
  };

  const handleThrottleRelease = () => {
    if (!cruiseHold) {
      setThrottlePct(0);
      void driver.brake().catch(() => {});
    }
  };

  const handleSteerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pct = Number(e.target.value);
    setSteerPct(pct);
    void driver.setSteering(pct / 100).catch(() => {});
  };

  const handleSteerRelease = () => {
    setSteerPct(0);
    void driver.setSteering(0).catch(() => {});
  };

  const handleBrakeDown = () => {
    if (isDisabled) return;
    brakeHoldTriggeredRef.current = false;
    if (brakeTimerRef.current) clearTimeout(brakeTimerRef.current);
    brakeTimerRef.current = setTimeout(() => {
      brakeHoldTriggeredRef.current = true;
      setThrottlePct(0);
      void driver.brake().catch(() => {});
    }, BRAKE_TAP_MAX_MS);
  };

  const handleBrakeUp = () => {
    if (isDisabled) return;
    if (brakeTimerRef.current) {
      clearTimeout(brakeTimerRef.current);
      brakeTimerRef.current = null;
    }
    if (brakeHoldTriggeredRef.current) {
      brakeHoldTriggeredRef.current = false;
      return;
    }
    const currentTargetMps = (throttlePct / 100) * maxSpeedMps;
    const nextTargetMps = calculateBrakeTapTargetMps(currentTargetMps, maxSpeedMps, BRAKE_TAP_STEP_RATIO);
    const nextPct = maxSpeedMps > 0 ? Math.round((nextTargetMps / maxSpeedMps) * 100) : 0;
    setThrottlePct(nextPct);
    void driver.brake(undefined, nextTargetMps).catch(() => {});
  };

  return (
    <div className="space-y-6">
      {isLowBattery && (
        <div role="alert" className="bg-red-600 text-white p-2 rounded text-center text-sm font-semibold">
          Low-Battery Cutoff Active (&lt;10%) - Drive Controls Disabled
        </div>
      )}

      {!profile && (
        <section className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 text-center space-y-3">
          <p className="text-sm text-gray-500">Vehicle is not connected.</p>
          <button
            type="button"
            disabled={isLowBattery}
            onClick={() => void driver.connect().catch(() => {})}
            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-semibold rounded"
          >
            Connect
          </button>
        </section>
      )}

      {/* Cockpit Gauges (UI-09) */}
      <section className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 grid grid-cols-3 gap-2 text-center">
        <div className="p-2 bg-slate-50 rounded">
          <div className="text-xs text-gray-500 uppercase tracking-wider">Speed</div>
          <div className="text-lg font-bold text-slate-800">{liveSpeedMps.toFixed(2)} m/s</div>
        </div>
        <div className="p-2 bg-slate-50 rounded">
          <div className="text-xs text-gray-500 uppercase tracking-wider">Throttle</div>
          <div className="text-lg font-bold text-slate-800">{throttlePct}%</div>
        </div>
        <div className="p-2 bg-slate-50 rounded">
          <div className="text-xs text-gray-500 uppercase tracking-wider">Steering</div>
          <div className="text-lg font-bold text-slate-800">{steerPct}% ({steerAngleDeg}°)</div>
        </div>
      </section>

      {/* Mode & Cruise Controls */}
      <section className="flex items-center justify-between bg-white p-3 rounded-lg shadow-sm border border-gray-200">
        <div className="flex space-x-2">
          <button
            type="button"
            onClick={() => handleSwitchMode('touch')}
            className={`px-3 py-1.5 text-xs font-semibold rounded ${mode === 'touch' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            Touch
          </button>
          <button
            type="button"
            onClick={() => handleSwitchMode('tilt')}
            className={`px-3 py-1.5 text-xs font-semibold rounded ${mode === 'tilt' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            Tilt
          </button>
        </div>

        <label className="flex items-center space-x-2 cursor-pointer text-sm font-medium text-gray-700">
          <input
            type="checkbox"
            aria-label="Cruise Hold"
            checked={cruiseHold}
            onChange={(e) => setCruiseHold(e.target.checked)}
            className="rounded text-blue-600 focus:ring-blue-500"
          />
          <span>Cruise Hold</span>
        </label>
      </section>

      {/* Touch Mode Controls (UI-10, UI-11, UI-13) */}
      {mode === 'touch' && (
        <section className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 space-y-6">
          <div>
            <div className="flex justify-between text-sm font-medium text-gray-700 mb-1">
              <span>Throttle</span>
              <span>{throttlePct}%</span>
            </div>
            <input
              type="range"
              aria-label="Throttle"
              min="-100"
              max="100"
              value={throttlePct}
              disabled={isDisabled}
              onChange={handleThrottleChange}
              onPointerUp={handleThrottleRelease}
              onMouseUp={handleThrottleRelease}
              onTouchEnd={handleThrottleRelease}
              className="w-full h-8"
            />
          </div>

          <div>
            <div className="flex justify-between text-sm font-medium text-gray-700 mb-1">
              <span>Steering</span>
              <span>{steerPct}%</span>
            </div>
            <input
              type="range"
              aria-label="Steering"
              min="-100"
              max="100"
              value={steerPct}
              disabled={isDisabled}
              onChange={handleSteerChange}
              onPointerUp={handleSteerRelease}
              onMouseUp={handleSteerRelease}
              onTouchEnd={handleSteerRelease}
              className="w-full h-8"
            />
          </div>

          <div className="pt-2">
            <button
              type="button"
              disabled={isDisabled}
              onPointerDown={handleBrakeDown}
              onPointerUp={handleBrakeUp}
              onMouseDown={handleBrakeDown}
              onMouseUp={handleBrakeUp}
              className="w-full py-4 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 disabled:bg-gray-300 text-white font-bold text-lg rounded-xl shadow-md select-none touch-none"
            >
              Brake
            </button>
            <p className="text-xs text-center text-gray-400 mt-1">Tap: step down 20% • Hold: full progressive stop</p>
          </div>
        </section>
      )}

      {/* Tilt Mode Status & Re-Center (UI-12) */}
      {mode === 'tilt' && (
        <section className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 text-center space-y-4">
          <p className="text-sm text-gray-600">Tilt device pitch for throttle, roll for steering.</p>
          <button
            type="button"
            onClick={() => { baselineRef.current = null; }}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded"
          >
            Re-Center Tilt
          </button>
        </section>
      )}
    </div>
  );
}

export default DriveTab;
