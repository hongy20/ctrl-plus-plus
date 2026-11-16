import type { DriverState, HubAdapter, HubProfile, VehicleProfile } from '../contracts';
import { encodeGoToAbsolutePosition, encodeStartPower, encodeStartSpeed } from '../lego-protocol';
import { getVehicleProfile } from '../profile';
import {
  BRAKE_TAP_STEP_RATIO,
  BRAKE_TICK_HZ,
  HOLD_BRAKE_SPEED_MPS,
  LOW_BATTERY_CUTOFF_PCT,
  TILT_DEADZONE_DEG,
  TILT_MAX_DEG,
} from './constants';

export function calculateMaxSpeedMps(profile: HubProfile, vehicle: VehicleProfile): number {
  const tireDiameterMm = profile.tireDiameterMm || vehicle.stockTireDiameterMm;
  const kCal = profile.calibration.kCal || 1.0;
  return 12 * Math.PI * (tireDiameterMm / 1000) * kCal;
}

export function calculateTelemetrySpeedMps(
  speedDegPerSec: number,
  profile: HubProfile,
  vehicle: VehicleProfile,
): number {
  const tireDiameterMm = profile.tireDiameterMm || vehicle.stockTireDiameterMm;
  const kCal = profile.calibration.kCal || 1.0;
  return (speedDegPerSec / 360) * Math.PI * (tireDiameterMm / 1000) * kCal * vehicle.drivePolarity;
}

export function calculateBrakeTapTargetMps(
  currentSpeedMps: number,
  maxSpeedMps: number,
  stepRatio = BRAKE_TAP_STEP_RATIO,
): number {
  const step = Math.abs(maxSpeedMps) * stepRatio;
  if (currentSpeedMps > 0) return Math.max(0, currentSpeedMps - step);
  if (currentSpeedMps < 0) return Math.min(0, currentSpeedMps + step);
  return 0;
}

export function normalizeTiltAxis(
  angleDeg: number,
  baselineDeg: number,
  deadzoneDeg = TILT_DEADZONE_DEG,
  maxDeg = TILT_MAX_DEG,
): number {
  const delta = angleDeg - baselineDeg;
  const absDelta = Math.abs(delta);
  if (absDelta <= deadzoneDeg || maxDeg <= deadzoneDeg) return 0;
  const clamped = Math.min(1.0, Math.max(0, (absDelta - deadzoneDeg) / (maxDeg - deadzoneDeg)));
  return delta >= 0 ? clamped : -clamped;
}

export function calculateTargetSteerPos(angleNorm: number, profile: HubProfile, vehicle: VehicleProfile): number {
  const clampedNorm = Math.max(-1.0, Math.min(1.0, angleNorm));
  const leftLimit = profile.calibration.leftLimit ?? -100;
  const rightLimit = profile.calibration.rightLimit ?? 100;
  const centerPos = profile.calibration.centerPos ?? (leftLimit + rightLimit) / 2;
  const clampRatio = profile.steeringClampRatio ?? vehicle.defaultSteeringClampRatio;
  const targetPos = clampedNorm >= 0
    ? centerPos + clampedNorm * (rightLimit - centerPos) * clampRatio
    : centerPos + clampedNorm * (centerPos - leftLimit) * clampRatio;
  return Math.round(targetPos);
}

export function calculateMotorSpeed(targetMps: number, profile: HubProfile, vehicle: VehicleProfile): number {
  const maxSpeedMps = calculateMaxSpeedMps(profile, vehicle);
  const dutyPercent = (targetMps / maxSpeedMps) * 100;
  return Math.max(-100, Math.min(100, Math.round(dutyPercent * vehicle.drivePolarity)));
}

export function calculateBrakeStep(
  speedMps: number,
  intensity: number,
  tickHz: number,
  holdThresholdMps: number = HOLD_BRAKE_SPEED_MPS,
  targetSpeedMps: number = 0,
): { nextSpeedMps: number; shouldHold: boolean } {
  const deltaMps = Math.max(0.01, Math.min(1.0, intensity)) * 2.0 * (1 / tickHz);
  if (targetSpeedMps === 0) {
    if (Math.abs(speedMps) < holdThresholdMps) return { nextSpeedMps: 0, shouldHold: true };
    const nextSpeedMps = speedMps > 0 ? Math.max(0, speedMps - deltaMps) : Math.min(0, speedMps + deltaMps);
    const shouldHold = Math.abs(nextSpeedMps) < holdThresholdMps;
    return { nextSpeedMps: shouldHold ? 0 : nextSpeedMps, shouldHold };
  }
  if (speedMps === targetSpeedMps) return { nextSpeedMps: targetSpeedMps, shouldHold: false };
  const nextSpeedMps = speedMps > targetSpeedMps
    ? Math.max(targetSpeedMps, speedMps - deltaMps)
    : Math.min(targetSpeedMps, speedMps + deltaMps);
  return { nextSpeedMps, shouldHold: false };
}

export interface ProgressiveBrakeCallbacks {
  isDriving: () => boolean;
  onTick?: () => void;
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
  targetSpeedMps: number = 0,
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

    callbacks.onAbortRegistered(() => {
      cleanup();
      resolve();
    });

    if (targetSpeedMps === 0) {
      if (Math.abs(speedMps) < HOLD_BRAKE_SPEED_MPS) {
        cleanup();
        callbacks.onHoldBrake().then(resolve).catch(reject);
        return;
      }
    } else if (speedMps === targetSpeedMps) {
      cleanup();
      const motorSpeed = calculateMotorSpeed(targetSpeedMps, getProfile(), vehicle);
      callbacks.onSpeedStep(targetSpeedMps);
      adapter.send(encodeStartSpeed(vehicle.drivePort, motorSpeed)).then(resolve).catch(reject);
      return;
    }

    timer = setInterval(() => {
      if (!callbacks.isDriving()) {
        cleanup();
        resolve();
        return;
      }

      callbacks.onTick?.();
      const step = calculateBrakeStep(speedMps, intensity, BRAKE_TICK_HZ, HOLD_BRAKE_SPEED_MPS, targetSpeedMps);
      speedMps = step.nextSpeedMps;

      if (targetSpeedMps === 0 && step.shouldHold) {
        cleanup();
        callbacks.onHoldBrake().then(resolve).catch(reject);
        return;
      }

      const motorSpeed = calculateMotorSpeed(speedMps, getProfile(), vehicle);
      callbacks.onSpeedStep(speedMps);

      if (targetSpeedMps !== 0 && speedMps === targetSpeedMps) {
        cleanup();
        adapter
          .send(encodeStartSpeed(vehicle.drivePort, motorSpeed))
          .then(resolve)
          .catch((err) => {
            cleanup();
            reject(err);
          });
        return;
      }

      adapter.send(encodeStartSpeed(vehicle.drivePort, motorSpeed)).catch((err) => {
        cleanup();
        reject(err);
      });
    }, tickMs);
  });
}

export function assertOperational(
  action: 'calibrateSteering' | 'startSpeedCalRun' | 'setSteering' | 'setSpeed' | 'brake',
  state: DriverState,
  isLowBattery: boolean,
  targetSpeedMps = 0,
): void {
  if (isLowBattery && (action !== 'brake' || targetSpeedMps !== 0)) {
    throw new Error(`Cannot ${action}: hub battery below ${LOW_BATTERY_CUTOFF_PCT}%`);
  }
  if (state === 'CALIBRATING') {
    const tag = action === 'setSteering' || action === 'setSpeed' || action === 'brake' ? ' (CTL-03)' : '';
    throw new Error(`Cannot ${action} while in CALIBRATING state${tag}`);
  }
  if (state !== 'READY' && state !== 'DRIVING') {
    throw new Error(`Cannot ${action} in state ${state}`);
  }
}

export async function executeSteer(adapter: HubAdapter, profile: HubProfile, angleNorm: number): Promise<void> {
  const vehicle = getVehicleProfile(profile.setId);
  const absPos = calculateTargetSteerPos(angleNorm, profile, vehicle);
  await adapter.send(encodeGoToAbsolutePosition(vehicle.steerPort, absPos, 100, 100, 127));
}

export async function executeDrive(adapter: HubAdapter, profile: HubProfile, targetMps: number): Promise<void> {
  const vehicle = getVehicleProfile(profile.setId);
  const motorSpeed = calculateMotorSpeed(targetMps, profile, vehicle);
  await adapter.send(encodeStartSpeed(vehicle.drivePort, motorSpeed));
}

export interface BrakeRoutineOptions {
  adapter: HubAdapter;
  profile: HubProfile;
  currentSpeedMps: number;
  intensity?: number;
  targetSpeedMps?: number;
  isDriving: () => boolean;
  isCancelled?: () => boolean;
  onTick?: () => void;
  onSpeedStep: (speedMps: number) => void;
  onHoldBrake: () => Promise<void>;
  onAbortRegistered: (abort: () => void) => void;
}

export function runBrakeRoutine(options: BrakeRoutineOptions): Promise<void> {
  const {
    adapter,
    profile,
    currentSpeedMps,
    intensity,
    targetSpeedMps = 0,
    isDriving,
    isCancelled,
    onTick,
    onSpeedStep,
    onHoldBrake,
    onAbortRegistered,
  } = options;
  const vehicle = getVehicleProfile(profile.setId);
  const actualIntensity = intensity ?? profile.defaultBrakeIntensity ?? vehicle.defaultBrakeIntensity;

  return executeProgressiveBrake(
    adapter,
    vehicle,
    () => profile,
    currentSpeedMps,
    actualIntensity,
    {
      isDriving,
      onTick,
      onSpeedStep,
      onHoldBrake: async () => {
        if (isCancelled?.()) return;
        await onHoldBrake();
        if (isCancelled?.()) return;
        await adapter.send(encodeStartPower(vehicle.drivePort, 127));
      },
      onAbortRegistered,
    },
    targetSpeedMps,
  );
}
