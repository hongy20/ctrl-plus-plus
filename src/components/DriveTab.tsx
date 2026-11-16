import { useEffect, useMemo, useRef, useState } from 'react';
import type { DriverState, HubProfile, MotorTelemetry } from '../contracts';
import {
  BRAKE_TAP_MAX_MS,
  BRAKE_TAP_STEP_RATIO,
  HOLD_BRAKE_SPEED_MPS,
  TILT_DEADZONE_DEG,
  TILT_MAX_DEG,
  type VehicleDriver,
} from '../vehicle-driver';
import {
  calculateBrakeTapTargetMps,
  calculateMaxSpeedMps,
  calculateTelemetrySpeedMps,
  createLatestCoalescer,
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
  const vehicle = useMemo(() => getVehicleProfile(profile?.setId), [profile?.setId]);
  const maxSpeedMps = useMemo(() => (profile ? calculateMaxSpeedMps(profile, vehicle) : 0), [profile, vehicle]);
  const speedCoalescer = useMemo(() => createLatestCoalescer((mps: number) => driver.setSpeed(mps)), [driver]);
  const steerCoalescer = useMemo(() => createLatestCoalescer((norm: number) => driver.setSteering(norm)), [driver]);

  const [mode, setMode] = useState<DriveMode>('touch');
  const [throttlePct, setThrottlePct] = useState(() => {
    if (!profile) return 0;
    const max = calculateMaxSpeedMps(profile, getVehicleProfile(profile.setId));
    return max > 0 ? Math.round((driver.getTargetSpeedMps() / max) * 100) : 0;
  });
  const [steerPct, setSteerPct] = useState(0);
  const [cruiseHold, setCruiseHold] = useState(() => driver.getTargetSpeedMps() !== 0);
  const [tiltReadout, setTiltReadout] = useState<{ deltaBeta: number; deltaGamma: number } | null>(null);
  const [liveSpeedMps, setLiveSpeedMps] = useState(0);

  const baselineRef = useRef<{ beta: number; gamma: number } | null>(null);
  const brakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const brakeHoldTriggeredRef = useRef(false);

  useEffect(() => {
    let lastSpeedAt = 0;
    let speedTimer: ReturnType<typeof setTimeout> | null = null;
    const syncSpeed = () => {
      const dt = profile ? (driver.getTelemetry(vehicle.drivePort) as MotorTelemetry | undefined) : undefined;
      const raw = dt && profile ? calculateTelemetrySpeedMps(dt.speedDegPerSec, profile, vehicle) : 0;
      const clamped = driver.getTargetSpeedMps() === 0 && Math.abs(raw) < HOLD_BRAKE_SPEED_MPS ? 0 : raw;
      const nowMs = Date.now();
      const elapsed = nowMs - lastSpeedAt;
      if (clamped === 0 || lastSpeedAt === 0 || elapsed >= 200) {
        if (speedTimer) { clearTimeout(speedTimer); speedTimer = null; }
        lastSpeedAt = clamped === 0 ? 0 : nowMs;
        setLiveSpeedMps(clamped);
      } else if (!speedTimer) {
        speedTimer = setTimeout(() => { speedTimer = null; syncSpeed(); }, 200 - elapsed);
      }
    };
    syncSpeed();
    const unsub = driver.subscribe(() => {
      setTick((t) => t + 1);
      const tgt = driver.getTargetSpeedMps();
      setThrottlePct(maxSpeedMps > 0 ? Math.round((tgt / maxSpeedMps) * 100) : 0);
      syncSpeed();
    });
    return () => { unsub(); if (speedTimer) clearTimeout(speedTimer); };
  }, [driver, maxSpeedMps, profile, vehicle]);

  const isEnabled = (driverState === 'READY' || driverState === 'DRIVING') && !isLowBattery && profile !== null;
  const isDisabled = !isEnabled;

  useEffect(() => {
    if (isDisabled) { speedCoalescer.reset(); steerCoalescer.reset(); }
  }, [isDisabled, speedCoalescer, steerCoalescer]);

  useEffect(() => () => { speedCoalescer.reset(); steerCoalescer.reset(); }, [speedCoalescer, steerCoalescer]);

  const steerTelemetry = profile ? (driver.getTelemetry(vehicle.steerPort) as MotorTelemetry | undefined) : undefined;
  const steerAngleDeg = steerTelemetry?.angleDeg ?? 0;

  const handleSwitchMode = (newMode: DriveMode) => {
    if (newMode === mode) return;
    if (newMode === 'tilt') {
      const devEvent = globalThis.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
      if (typeof devEvent?.requestPermission === 'function') void devEvent.requestPermission().catch(() => {});
    }
    if (mode === 'tilt' && newMode === 'touch') {
      setThrottlePct(0);
      setSteerPct(0);
      speedCoalescer.reset();
      steerCoalescer.reset();
      void driver.brake().catch(() => {});
      void driver.setSteering(0).catch(() => {});
    }
    baselineRef.current = null;
    setTiltReadout(null);
    setMode(newMode);
  };

  useEffect(() => {
    if (mode !== 'tilt') return;
    speedCoalescer.reset();
    steerCoalescer.reset();
    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return;
      if (!baselineRef.current) {
        baselineRef.current = { beta: e.beta, gamma: e.gamma };
        setTiltReadout({ deltaBeta: 0, deltaGamma: 0 });
        return;
      }
      setTiltReadout({ deltaBeta: e.beta - baselineRef.current.beta, deltaGamma: e.gamma - baselineRef.current.gamma });
      const rawThrottle = normalizeTiltAxis(e.beta, baselineRef.current.beta, TILT_DEADZONE_DEG, TILT_MAX_DEG);
      const rawSteer = normalizeTiltAxis(e.gamma, baselineRef.current.gamma, TILT_DEADZONE_DEG, TILT_MAX_DEG);
      const throttleNorm = Math.round(rawThrottle * 100) / 100;
      const steerNorm = Math.round(rawSteer * 100) / 100;
      setThrottlePct(Math.round(throttleNorm * 100));
      setSteerPct(Math.round(steerNorm * 100));
      if (!isDisabled) {
        speedCoalescer.schedule(throttleNorm * maxSpeedMps);
        steerCoalescer.schedule(steerNorm);
      }
    };
    window.addEventListener('deviceorientation', handleOrientation);
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, [mode, isDisabled, maxSpeedMps, speedCoalescer, steerCoalescer]);

  useEffect(() => () => { if (brakeTimerRef.current) clearTimeout(brakeTimerRef.current); }, []);

  const handleThrottleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pct = Number(e.target.value);
    setThrottlePct(pct);
    speedCoalescer.schedule((pct / 100) * maxSpeedMps);
  };
  const handleThrottleRelease = () => {
    if (!cruiseHold) { setThrottlePct(0); speedCoalescer.reset(); void driver.brake().catch(() => {}); }
  };
  const handleSteerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pct = Number(e.target.value);
    setSteerPct(pct);
    steerCoalescer.schedule(pct / 100);
  };
  const handleSteerRelease = () => { setSteerPct(0); steerCoalescer.schedule(0); };

  const handleBrakeDown = () => {
    if (isDisabled) return;
    brakeHoldTriggeredRef.current = false;
    if (brakeTimerRef.current) clearTimeout(brakeTimerRef.current);
    brakeTimerRef.current = setTimeout(() => {
      brakeHoldTriggeredRef.current = true;
      setThrottlePct(0);
      speedCoalescer.reset();
      void driver.brake().catch(() => {});
    }, BRAKE_TAP_MAX_MS);
  };
  const handleBrakeUp = () => {
    if (isDisabled) return;
    if (brakeTimerRef.current) { clearTimeout(brakeTimerRef.current); brakeTimerRef.current = null; }
    if (brakeHoldTriggeredRef.current) { brakeHoldTriggeredRef.current = false; return; }
    const currentTargetMps = driver.getTargetSpeedMps() || (throttlePct / 100) * maxSpeedMps;
    const nextTargetMps = calculateBrakeTapTargetMps(currentTargetMps, maxSpeedMps, BRAKE_TAP_STEP_RATIO);
    setThrottlePct(maxSpeedMps > 0 ? Math.round((nextTargetMps / maxSpeedMps) * 100) : 0);
    speedCoalescer.reset();
    void driver.brake(undefined, nextTargetMps).catch(() => {});
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {isLowBattery && (
        <div role="alert" className="bg-red-600 text-white p-2 rounded text-center text-sm font-semibold">
          Low-Battery Cutoff Active (&lt;10%) - Drive Controls Disabled
        </div>
      )}
      {driverState === 'EMERGENCY_STOP' && (
        <div role="alert" className="flex items-center justify-between bg-amber-50 border border-amber-300 text-amber-900 px-3 py-2 rounded-lg text-sm">
          <span className="font-medium">Emergency Stop Active — Controls Locked</span>
          <button type="button" onClick={() => void driver.resetEmergencyStop().catch(() => {})} className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded text-xs">
            Resume Driving
          </button>
        </div>
      )}
      {!profile && (
        <section className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 text-center space-y-3">
          <p className="text-sm text-gray-500">Vehicle is not connected.</p>
          <button type="button" disabled={isLowBattery} onClick={() => void driver.connect().catch(() => {})} className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-semibold rounded">
            Connect
          </button>
        </section>
      )}

      {/* Cockpit Gauges (UI-09) */}
      <section className="bg-white p-3 sm:p-4 rounded-lg shadow-sm border border-gray-200 grid grid-cols-3 gap-2 text-center">
        {([['Speed', `${liveSpeedMps.toFixed(2)} m/s`], ['Throttle', `${throttlePct}%`], ['Steering', `${steerPct}% (${steerAngleDeg}°)`]] as const).map(([label, val]) => (
          <div key={label} className="p-2 bg-slate-50 rounded">
            <div className="text-xs text-gray-500 uppercase tracking-wider">{label}</div>
            <div className="text-base sm:text-lg font-bold tabular-nums text-slate-800">{val}</div>
          </div>
        ))}
      </section>

      {/* Mode & Cruise Controls */}
      <section className="flex items-center justify-between bg-white p-3 rounded-lg shadow-sm border border-gray-200">
        <div className="flex space-x-2">
          <button type="button" onClick={() => handleSwitchMode('touch')} className={`px-3 py-1.5 text-xs font-semibold rounded ${mode === 'touch' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
            Touch
          </button>
          <button type="button" onClick={() => handleSwitchMode('tilt')} className={`px-3 py-1.5 text-xs font-semibold rounded ${mode === 'tilt' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
            Tilt
          </button>
        </div>

        <label className="flex items-center space-x-2 cursor-pointer text-sm font-medium text-gray-700">
          <input type="checkbox" aria-label="Cruise Hold" checked={cruiseHold} onChange={(e) => setCruiseHold(e.target.checked)} className="rounded text-blue-600 focus:ring-blue-500" />
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
            <div className="flex justify-center py-2">
              <input
                type="range"
                aria-label="Throttle"
                min="-100"
                max="100"
                value={throttlePct}
                disabled={isDisabled}
                onChange={handleThrottleChange}
                onPointerUp={handleThrottleRelease}
                onPointerCancel={handleThrottleRelease}
                onMouseUp={handleThrottleRelease}
                onTouchEnd={handleThrottleRelease}
                onTouchCancel={handleThrottleRelease}
                className="[writing-mode:vertical-lr] [direction:rtl] h-40 w-10 cursor-pointer touch-none"
              />
            </div>
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
              onPointerCancel={handleSteerRelease}
              onMouseUp={handleSteerRelease}
              onTouchEnd={handleSteerRelease}
              onTouchCancel={handleSteerRelease}
              className="w-full h-10 cursor-pointer touch-none"
            />
          </div>

          <div className="pt-2">
            <button
              type="button"
              disabled={isDisabled}
              onPointerDown={handleBrakeDown}
              onPointerUp={handleBrakeUp}
              onPointerCancel={handleBrakeUp}
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
        <section className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 space-y-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600">Pitch = Throttle • Roll = Steering (±{TILT_DEADZONE_DEG}° deadzone)</span>
            <span className={`px-2 py-0.5 rounded font-semibold ${tiltReadout ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
              {tiltReadout ? 'Tilt Sensor Active' : 'Waiting for Tilt Sensor…'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center text-sm">
            <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
              <div className="text-xs text-gray-500">Pitch (Δβ) → Throttle</div>
              <div className="font-mono font-bold text-slate-800">{tiltReadout ? `${tiltReadout.deltaBeta.toFixed(1)}°` : '—'} ({throttlePct}%)</div>
            </div>
            <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
              <div className="text-xs text-gray-500">Roll (Δγ) → Steering</div>
              <div className="font-mono font-bold text-slate-800">{tiltReadout ? `${tiltReadout.deltaGamma.toFixed(1)}°` : '—'} ({steerPct}%)</div>
            </div>
          </div>
          <button type="button" onClick={() => { baselineRef.current = null; setTiltReadout(null); }} className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded">
            Re-Center Tilt
          </button>
        </section>
      )}
    </div>
  );
}

export default DriveTab;
