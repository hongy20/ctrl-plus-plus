import type { HubAdapter, HubProfile, VehicleProfile } from '../contracts';
import { encodeStartSpeed } from '../lego-protocol';
import { BRAKE_TICK_HZ, HOLD_BRAKE_SPEED_MPS } from './constants';

export function calculateTargetSteerPos(
  angleNorm: number,
  profile: HubProfile,
  vehicle: VehicleProfile,
): number {
  const clampedNorm = Math.max(-1.0, Math.min(1.0, angleNorm));
  const leftLimit = profile.calibration.leftLimit ?? -100;
  const rightLimit = profile.calibration.rightLimit ?? 100;
  const centerPos = profile.calibration.centerPos ?? (leftLimit + rightLimit) / 2;
  const clampRatio = profile.steeringClampRatio ?? vehicle.defaultSteeringClampRatio;

  let targetPos: number;
  if (clampedNorm >= 0) {
    targetPos = centerPos + clampedNorm * (rightLimit - centerPos) * clampRatio;
  } else {
    targetPos = centerPos + clampedNorm * (centerPos - leftLimit) * clampRatio;
  }

  return Math.round(targetPos);
}

export function calculateMotorSpeed(
  targetMps: number,
  profile: HubProfile,
  vehicle: VehicleProfile,
): number {
  const polarity = vehicle.drivePolarity;
  const kCal = profile.calibration.kCal || 1.0;
  const tireDiameterMm = profile.tireDiameterMm || vehicle.stockTireDiameterMm;

  const circumferenceM = Math.PI * (tireDiameterMm / 1000);
  const nominalMaxRps = 12;
  const maxSpeedMps = nominalMaxRps * circumferenceM * kCal;

  const dutyPercent = (targetMps / maxSpeedMps) * 100;
  const motorSpeed = Math.round(dutyPercent * polarity);
  return Math.max(-100, Math.min(100, motorSpeed));
}

export function calculateBrakeStep(
  speedMps: number,
  intensity: number,
  tickHz: number,
  holdThresholdMps: number = HOLD_BRAKE_SPEED_MPS,
): { nextSpeedMps: number; shouldHold: boolean } {
  if (Math.abs(speedMps) < holdThresholdMps) {
    return { nextSpeedMps: 0, shouldHold: true };
  }

  const clampedIntensity = Math.max(0.01, Math.min(1.0, intensity));
  const aMax = 2.0;
  const a = clampedIntensity * aMax;
  const dt = 1 / tickHz;
  const deltaMps = a * dt;

  let nextSpeedMps: number;
  if (speedMps > 0) {
    nextSpeedMps = Math.max(0, speedMps - deltaMps);
  } else {
    nextSpeedMps = Math.min(0, speedMps + deltaMps);
  }

  const shouldHold = Math.abs(nextSpeedMps) < holdThresholdMps;
  return {
    nextSpeedMps: shouldHold ? 0 : nextSpeedMps,
    shouldHold,
  };
}

export interface ProgressiveBrakeCallbacks {
  isDriving: () => boolean;
  onTick: () => void;
  onSpeedStep: (speedMps: number) => void;
  onHoldBrake: () => Promise<void>;
  onAbortRegistered: (abort: () => void) => void;
}

export function executeProgressiveBrake(
  adapter: HubAdapter,
  vehicle: VehicleProfile,
  getProfile: () => HubProfile,
  initialSpeedMps: number,
  intensity: number,
  callbacks: ProgressiveBrakeCallbacks,
): Promise<void> {
  const tickMs = 1000 / BRAKE_TICK_HZ;
  let speedMps = initialSpeedMps;

  return new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const cleanup = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };

    const abort = () => {
      cleanup();
      resolve();
    };
    callbacks.onAbortRegistered(abort);

    if (Math.abs(speedMps) < HOLD_BRAKE_SPEED_MPS) {
      cleanup();
      callbacks.onHoldBrake().then(resolve).catch(reject);
      return;
    }

    timer = setInterval(() => {
      if (!callbacks.isDriving()) {
        cleanup();
        resolve();
        return;
      }

      callbacks.onTick();
      const step = calculateBrakeStep(speedMps, intensity, BRAKE_TICK_HZ);
      speedMps = step.nextSpeedMps;

      if (step.shouldHold) {
        cleanup();
        callbacks.onHoldBrake().then(resolve).catch(reject);
        return;
      }

      const profile = getProfile();
      const motorSpeed = calculateMotorSpeed(speedMps, profile, vehicle);
      callbacks.onSpeedStep(speedMps);
      adapter.send(encodeStartSpeed(vehicle.drivePort, motorSpeed)).catch(reject);
    }, tickMs);
  });
}
