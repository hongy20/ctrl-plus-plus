import type { HubAdapter, HubProfile } from '../contracts';
import {
  encodeGoToAbsolutePosition,
  encodeStartSpeed,
} from '../lego-protocol';
import { getVehicleProfile } from '../profile';
import { saveHubCalibration } from '../storage';
import {
  SPEED_CAL_TARGET_DEG,
  STALL_HOLD_MS,
  STALL_SPEED_DEG_S,
} from './constants';
import type { PortValueListener } from './telemetry';

export interface StallDetectionOptions {
  adapter: HubAdapter;
  port: number;
  speed: number;
  stallSpeedDegS?: number;
  stallHoldMs?: number;
  addPortValueListener: (cb: PortValueListener) => () => void;
  onTick?: () => void;
  onAbortRegistered?: (abort: () => void) => void;
}

export async function detectStall(options: StallDetectionOptions): Promise<number> {
  const {
    adapter,
    port,
    speed,
    stallSpeedDegS = STALL_SPEED_DEG_S,
    stallHoldMs = STALL_HOLD_MS,
    addPortValueListener,
    onTick,
    onAbortRegistered,
  } = options;

  await adapter.send(encodeStartSpeed(port, speed, 40));

  return new Promise<number>((resolve) => {
    let lastPos: number | null = null;
    let lastSampleTime = Date.now();
    let stallStartTime: number | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let removeListener: (() => void) | null = null;

    const cleanup = () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      if (removeListener !== null) {
        removeListener();
        removeListener = null;
      }
    };

    const abort = () => {
      cleanup();
      resolve(lastPos ?? 0);
    };
    onAbortRegistered?.(abort);

    const checkStall = (now: number) => {
      if (stallStartTime !== null && now - stallStartTime >= stallHoldMs) {
        cleanup();
        resolve(lastPos ?? 0);
      }
    };

    const onPortValue: PortValueListener = (p: number, value: number, now: number) => {
      if (p !== port) return;
      if (lastPos === null) {
        lastPos = value;
        lastSampleTime = now;
        stallStartTime = now;
      } else {
        const dt = (now - lastSampleTime) / 1000;
        if (dt > 0) {
          const speedDegPerSec = Math.abs(value - lastPos) / dt;
          if (speedDegPerSec >= stallSpeedDegS) {
            stallStartTime = null;
          } else if (stallStartTime === null) {
            stallStartTime = lastSampleTime;
          }
        }
        lastPos = value;
        lastSampleTime = now;
      }
      checkStall(now);
    };

    removeListener = addPortValueListener(onPortValue);

    intervalId = setInterval(() => {
      onTick?.();
      const now = Date.now();
      if (lastPos !== null) {
        if (stallStartTime === null) {
          stallStartTime = lastSampleTime;
        }
        checkStall(now);
      }
    }, 25);
  });
}

export interface SteeringCalibrationOptions {
  adapter: HubAdapter;
  steerPort: number;
  addPortValueListener: (cb: PortValueListener) => () => void;
  onTick?: () => void;
  onAbortRegistered: (abort: () => void) => void;
  isCalibrating: () => boolean;
}

export async function executeSteeringCalibration(
  options: SteeringCalibrationOptions,
): Promise<{ leftLimit: number; rightLimit: number; centerPos: number } | null> {
  const { adapter, steerPort, addPortValueListener, onTick, onAbortRegistered, isCalibrating } =
    options;

  const leftLimit = await detectStall({
    adapter,
    port: steerPort,
    speed: -30,
    addPortValueListener,
    onTick,
    onAbortRegistered,
  });

  if (!isCalibrating()) {
    return null;
  }

  const rightLimit = await detectStall({
    adapter,
    port: steerPort,
    speed: 30,
    addPortValueListener,
    onTick,
    onAbortRegistered,
  });

  if (!isCalibrating()) {
    return null;
  }

  const centerPos = (leftLimit + rightLimit) / 2;

  await adapter.send(
    encodeGoToAbsolutePosition(steerPort, centerPos, 100, 100, 127),
  );

  return { leftLimit, rightLimit, centerPos };
}

export async function runSteeringCalibrationRoutine(
  options: SteeringCalibrationOptions & { hubId: string },
): Promise<HubProfile | null> {
  const result = await executeSteeringCalibration(options);
  if (!result || !options.isCalibrating()) {
    return null;
  }
  return saveHubCalibration(options.hubId, result);
}

export interface SpeedCalRunOptions {
  adapter: HubAdapter;
  drivePort: number;
  targetDeg?: number;
  initialAngle: number | null;
  addPortValueListener: (cb: PortValueListener) => () => void;
  onAbortRegistered?: (abort: () => void) => void;
}

export function runSpeedCalRun(options: SpeedCalRunOptions): Promise<void> {
  const {
    adapter,
    drivePort,
    targetDeg = SPEED_CAL_TARGET_DEG,
    initialAngle,
    addPortValueListener,
    onAbortRegistered,
  } = options;

  let startAngle: number | null = initialAngle;

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let removeListener: (() => void) | null = null;

    const cleanup = () => {
      if (removeListener !== null) {
        removeListener();
        removeListener = null;
      }
    };

    const finishResolve = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const finishReject = (err: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const abort = () => {
      finishResolve();
    };
    onAbortRegistered?.(abort);

    const onPortValue: PortValueListener = (p: number, value: number) => {
      if (p !== drivePort) return;
      if (startAngle === null) {
        startAngle = value;
      }
      const deltaDeg = Math.abs(value - startAngle);
      if (deltaDeg >= targetDeg) {
        cleanup();
        adapter.send(encodeStartSpeed(drivePort, 0)).then(finishResolve, finishReject);
      }
    };

    removeListener = addPortValueListener(onPortValue);
    adapter.send(encodeStartSpeed(drivePort, 40)).catch(finishReject);
  });
}

export function calculateSpeedCalKCal(
  measuredMeters: number,
  tireDiameterMm: number,
  targetDeg: number = SPEED_CAL_TARGET_DEG,
): number {
  const revolutions = targetDeg / 360;
  const circumferenceM = Math.PI * (tireDiameterMm / 1000);
  const theoreticalMeters = revolutions * circumferenceM;
  return measuredMeters / theoreticalMeters;
}

export function applySpeedCalibration(
  profile: HubProfile,
  measuredMeters: number,
): HubProfile {
  if (
    typeof measuredMeters !== 'number' ||
    measuredMeters <= 0 ||
    !Number.isFinite(measuredMeters)
  ) {
    throw new Error('Invalid measuredMeters: must be a positive finite number');
  }
  const vehicle = getVehicleProfile(profile.setId);
  const tireDiameterMm = profile.tireDiameterMm ?? vehicle.stockTireDiameterMm;
  const kCal = calculateSpeedCalKCal(measuredMeters, tireDiameterMm);
  return saveHubCalibration(profile.hubId, { kCal });
}
