import type {
  DriverState,
  HubAdapter,
  HubProfile,
  MotorTelemetry,
} from './contracts';
import {
  decodeLwpMessage,
  encodeGoToAbsolutePosition,
  encodeHubProperty,
  encodePortInputFormatSetup,
  encodeSetHubLed,
  encodeStartSpeed,
} from './lego-protocol';
import { getVehicleProfile } from './profile';
import {
  getOrCreateHubProfile,
  listRememberedHubs,
  saveHubCalibration,
} from './storage';

export const STALL_SPEED_DEG_S = 5;
export const STALL_HOLD_MS = 250;
export const TELEMETRY_MIN_HZ = 10;
export const BRAKE_TICK_HZ = 20;
export const HOLD_BRAKE_SPEED_MPS = 0.05;
export const WATCHDOG_TIMEOUT_MS = 200;

const SPEED_CAL_TARGET_DEG = 3600;

export class VehicleDriver {
  private adapter: HubAdapter;
  private state: DriverState = 'DISCONNECTED';
  private hubProfile: HubProfile | null = null;
  private telemetry = new Map<number, MotorTelemetry>();
  private attachedPorts = new Map<number, { attached: boolean; ioTypeId?: number }>();
  private hubProperties = new Map<number, unknown>();
  private portValueListeners = new Set<
    (port: number, value: number, timestampMs: number) => void
  >();
  private currentSpeedMps = 0;
  private currentMotorSpeed = 0;
  private cleanupListeners: Array<() => void> = [];

  constructor(adapter: HubAdapter) {
    this.adapter = adapter;
    const offMessage = this.adapter.onMessage(this.handleMessage);
    const offDisconnect = this.adapter.onDisconnect(this.handleDisconnect);
    this.cleanupListeners.push(offMessage, offDisconnect);
  }

  getState(): DriverState {
    return this.state;
  }

  getHubProfile(): HubProfile | null {
    if (!this.hubProfile) {
      return null;
    }
    const hubs = listRememberedHubs();
    const current = hubs.find((h) => h.hubId === this.hubProfile?.hubId);
    if (current) {
      this.hubProfile = current;
    }
    return this.hubProfile;
  }

  getTelemetry(port?: number): MotorTelemetry | Map<number, MotorTelemetry> | undefined {
    if (port !== undefined) {
      return this.telemetry.get(port);
    }
    return new Map(this.telemetry);
  }

  getAttachedPorts(): Map<number, { attached: boolean; ioTypeId?: number }> {
    return new Map(this.attachedPorts);
  }

  getHubProperties(): Map<number, unknown> {
    return new Map(this.hubProperties);
  }

  async connect(): Promise<void> {
    if (this.state !== 'DISCONNECTED') {
      throw new Error(`Cannot connect in state ${this.state}`);
    }
    this.state = 'CONNECTING';

    try {
      await this.adapter.connect();
      const hubId = this.adapter.getHubId() ?? 'technic-hub';
      const hubName = this.adapter.getHubName() ?? 'Technic Hub';
      this.hubProfile = getOrCreateHubProfile(hubId, hubName);

      for (let prop = 0x01; prop <= 0x0d; prop++) {
        await this.adapter.send(encodeHubProperty(prop, 0x05));
      }

      await this.adapter.send(encodeHubProperty(0x06, 0x02));
      await this.adapter.send(encodeSetHubLed(this.hubProfile.ledColor, 0x32));

      const vehicle = getVehicleProfile(this.hubProfile.setId);
      for (const port of [vehicle.drivePort, vehicle.steerPort, 0x3d]) {
        await this.adapter.send(encodePortInputFormatSetup(port, 0x00, 1, true));
      }

      this.state = 'READY';
    } catch (error) {
      this.state = 'DISCONNECTED';
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      const profile = this.getHubProfile();
      if (profile && this.adapter.isConnected()) {
        const vehicle = getVehicleProfile(profile.setId);
        await this.adapter.send(encodeStartSpeed(vehicle.drivePort, 0));
      }
    } catch {
      // ignore send error on disconnect
    }
    await this.adapter.disconnect();
    this.state = 'DISCONNECTED';
  }

  async calibrateSteering(): Promise<void> {
    if (this.state === 'CALIBRATING') {
      throw new Error('Cannot calibrateSteering while in CALIBRATING state');
    }
    if (this.state !== 'READY' && this.state !== 'DRIVING') {
      throw new Error(`Cannot calibrateSteering in state ${this.state}`);
    }
    const profile = this.getHubProfile();
    if (!profile) {
      throw new Error('No active hub profile');
    }

    this.state = 'CALIBRATING';
    const vehicle = getVehicleProfile(profile.setId);
    const steerPort = vehicle.steerPort;

    try {
      const leftLimit = await this.detectStall(steerPort, -30);
      const rightLimit = await this.detectStall(steerPort, 30);
      const centerPos = (leftLimit + rightLimit) / 2;

      await this.adapter.send(
        encodeGoToAbsolutePosition(steerPort, centerPos, 100, 100, 127),
      );

      this.hubProfile = saveHubCalibration(profile.hubId, {
        leftLimit,
        rightLimit,
        centerPos,
      });

      this.state = 'READY';
    } catch (error) {
      this.state = 'READY';
      throw error;
    }
  }

  async startSpeedCalRun(): Promise<void> {
    if (this.state === 'CALIBRATING') {
      throw new Error('Cannot startSpeedCalRun while in CALIBRATING state');
    }
    if (this.state !== 'READY' && this.state !== 'DRIVING') {
      throw new Error(`Cannot startSpeedCalRun in state ${this.state}`);
    }
    const profile = this.getHubProfile();
    if (!profile) {
      throw new Error('No active hub profile');
    }

    this.state = 'CALIBRATING';
    const vehicle = getVehicleProfile(profile.setId);
    const drivePort = vehicle.drivePort;

    await this.adapter.send(encodeStartSpeed(drivePort, 40));

    return new Promise<void>((resolve) => {
      let startAngle: number | null = this.telemetry.get(drivePort)?.angleDeg ?? null;

      const onPortValue = (p: number, value: number) => {
        if (p !== drivePort) return;
        if (startAngle === null) {
          startAngle = value;
        }
        const deltaDeg = Math.abs(value - startAngle);
        if (deltaDeg >= SPEED_CAL_TARGET_DEG) {
          this.portValueListeners.delete(onPortValue);
          this.adapter.send(encodeStartSpeed(drivePort, 0)).then(() => {
            resolve();
          });
        }
      };

      this.portValueListeners.add(onPortValue);
    });
  }

  async saveSpeedCal(measuredMeters: number): Promise<void> {
    if (this.state !== 'CALIBRATING') {
      throw new Error(`Cannot saveSpeedCal in state ${this.state}`);
    }
    if (
      typeof measuredMeters !== 'number' ||
      measuredMeters <= 0 ||
      !Number.isFinite(measuredMeters)
    ) {
      throw new Error('Invalid measuredMeters: must be a positive finite number');
    }
    const profile = this.getHubProfile();
    if (!profile) {
      throw new Error('No active hub profile');
    }

    const vehicle = getVehicleProfile(profile.setId);
    const tireDiameterMm = profile.tireDiameterMm ?? vehicle.stockTireDiameterMm;
    const revolutions = SPEED_CAL_TARGET_DEG / 360;
    const circumferenceM = Math.PI * (tireDiameterMm / 1000);
    const theoreticalMeters = revolutions * circumferenceM;
    const kCal = measuredMeters / theoreticalMeters;

    this.hubProfile = saveHubCalibration(profile.hubId, { kCal });
    this.state = 'READY';
  }

  async setSteering(angleNorm: number): Promise<void> {
    if (this.state === 'CALIBRATING') {
      throw new Error('Cannot setSteering while in CALIBRATING state (CTL-03)');
    }
    if (this.state !== 'READY' && this.state !== 'DRIVING') {
      throw new Error(`Cannot setSteering in state ${this.state}`);
    }
    const profile = this.getHubProfile();
    if (!profile) {
      throw new Error('No active hub profile');
    }

    const vehicle = getVehicleProfile(profile.setId);
    const steerPort = vehicle.steerPort;
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

    const absPos = Math.round(targetPos);
    await this.adapter.send(
      encodeGoToAbsolutePosition(steerPort, absPos, 100, 100, 127),
    );
  }

  async setSpeed(targetMps: number): Promise<void> {
    if (this.state === 'CALIBRATING') {
      throw new Error('Cannot setSpeed while in CALIBRATING state (CTL-03)');
    }
    if (this.state !== 'READY' && this.state !== 'DRIVING') {
      throw new Error(`Cannot setSpeed in state ${this.state}`);
    }
    const profile = this.getHubProfile();
    if (!profile) {
      throw new Error('No active hub profile');
    }

    const vehicle = getVehicleProfile(profile.setId);
    const drivePort = vehicle.drivePort;
    const polarity = vehicle.drivePolarity;
    const kCal = profile.calibration.kCal || 1.0;
    const tireDiameterMm = profile.tireDiameterMm || vehicle.stockTireDiameterMm;

    const circumferenceM = Math.PI * (tireDiameterMm / 1000);
    const nominalMaxRps = 12;
    const maxSpeedMps = nominalMaxRps * circumferenceM * kCal;

    const dutyPercent = (targetMps / maxSpeedMps) * 100;
    let motorSpeed = Math.round(dutyPercent * polarity);
    motorSpeed = Math.max(-100, Math.min(100, motorSpeed));

    await this.adapter.send(encodeStartSpeed(drivePort, motorSpeed));

    this.currentSpeedMps = targetMps;
    this.currentMotorSpeed = motorSpeed;
    this.state = 'DRIVING';
  }

  async brake(intensity?: number): Promise<void> {
    if (this.state === 'CALIBRATING') {
      throw new Error('Cannot brake while in CALIBRATING state (CTL-03)');
    }
    if (this.state !== 'READY' && this.state !== 'DRIVING') {
      throw new Error(`Cannot brake in state ${this.state}`);
    }
    const profile = this.getHubProfile();
    if (!profile) {
      throw new Error('No active hub profile');
    }

    const vehicle = getVehicleProfile(profile.setId);
    const drivePort = vehicle.drivePort;
    const actualIntensity =
      intensity ?? profile.defaultBrakeIntensity ?? vehicle.defaultBrakeIntensity;
    const clampedIntensity = Math.max(0.01, Math.min(1.0, actualIntensity));

    const tickMs = 1000 / BRAKE_TICK_HZ;
    const aMax = 2.0;
    const a = clampedIntensity * aMax;
    const dt = 1 / BRAKE_TICK_HZ;
    const deltaMps = a * dt;

    let speedMps = this.currentSpeedMps;

    return new Promise<void>((resolve, reject) => {
      if (Math.abs(speedMps) < HOLD_BRAKE_SPEED_MPS) {
        this.currentSpeedMps = 0;
        this.currentMotorSpeed = 0;
        this.state = 'READY';
        this.adapter
          .send(encodeStartSpeed(drivePort, 127))
          .then(() => resolve())
          .catch(reject);
        return;
      }

      const timer = setInterval(() => {
        if (speedMps > 0) {
          speedMps = Math.max(0, speedMps - deltaMps);
        } else {
          speedMps = Math.min(0, speedMps + deltaMps);
        }

        if (Math.abs(speedMps) < HOLD_BRAKE_SPEED_MPS) {
          clearInterval(timer);
          this.currentSpeedMps = 0;
          this.currentMotorSpeed = 0;
          this.state = 'READY';
          this.adapter
            .send(encodeStartSpeed(drivePort, 127))
            .then(() => resolve())
            .catch(reject);
          return;
        }

        const polarity = vehicle.drivePolarity;
        const currentProfile = this.getHubProfile() ?? profile;
        const kCal = currentProfile.calibration.kCal || 1.0;
        const tireDiameterMm =
          currentProfile.tireDiameterMm || vehicle.stockTireDiameterMm;
        const circumferenceM = Math.PI * (tireDiameterMm / 1000);
        const nominalMaxRps = 12;
        const maxSpeedMps = nominalMaxRps * circumferenceM * kCal;

        const dutyPercent = (speedMps / maxSpeedMps) * 100;
        let motorSpeed = Math.round(dutyPercent * polarity);
        motorSpeed = Math.max(-100, Math.min(100, motorSpeed));

        this.currentSpeedMps = speedMps;
        this.currentMotorSpeed = motorSpeed;

        this.adapter.send(encodeStartSpeed(drivePort, motorSpeed)).catch(reject);
      }, tickMs);
    });
  }

  async emergencyStop(): Promise<void> {
    this.state = 'EMERGENCY_STOP';
    this.currentSpeedMps = 0;
    this.currentMotorSpeed = 0;
    const profile = this.getHubProfile();
    if (profile) {
      const vehicle = getVehicleProfile(profile.setId);
      try {
        await this.adapter.send(encodeStartSpeed(vehicle.drivePort, 0));
        await this.adapter.send(encodeStartSpeed(vehicle.steerPort, 0));
      } catch {
        // ignore send error during emergency stop
      }
    }
  }

  async resetEmergencyStop(): Promise<void> {
    if (this.state !== 'EMERGENCY_STOP') {
      return;
    }
    if (!this.adapter.isConnected()) {
      this.state = 'DISCONNECTED';
      return;
    }
    this.state = 'READY';
  }

  destroy(): void {
    for (const off of this.cleanupListeners) {
      off();
    }
    this.cleanupListeners = [];
    this.portValueListeners.clear();
  }

  private async detectStall(port: number, speed: number): Promise<number> {
    await this.adapter.send(encodeStartSpeed(port, speed, 40));

    return new Promise<number>((resolve) => {
      let lastPos: number | null = null;
      let lastSampleTime = Date.now();
      let stallStartTime: number | null = null;

      const cleanup = () => {
        clearInterval(intervalId);
        this.portValueListeners.delete(onPortValue);
      };

      const checkStall = (now: number) => {
        if (stallStartTime !== null && now - stallStartTime >= STALL_HOLD_MS) {
          cleanup();
          resolve(lastPos ?? 0);
        }
      };

      const onPortValue = (p: number, value: number, now: number) => {
        if (p !== port) return;
        if (lastPos === null) {
          lastPos = value;
          lastSampleTime = now;
          stallStartTime = now;
        } else {
          const dt = (now - lastSampleTime) / 1000;
          if (dt > 0) {
            const speedDegPerSec = Math.abs(value - lastPos) / dt;
            if (speedDegPerSec >= STALL_SPEED_DEG_S) {
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

      this.portValueListeners.add(onPortValue);

      const intervalId = setInterval(() => {
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

  private handleMessage = (packet: Uint8Array): void => {
    const msg = decodeLwpMessage(packet);
    if (msg.messageType === 0x04) {
      console.info('Attached I/O notification:', msg);
      this.attachedPorts.set(msg.port, {
        attached: msg.attached,
        ioTypeId: msg.ioTypeId,
      });
    } else if (msg.messageType === 0x01) {
      this.hubProperties.set(msg.property, msg.value);
    } else if (msg.messageType === 0x45) {
      const now = Date.now();
      const prev = this.telemetry.get(msg.port);
      const dt = prev ? (now - prev.timestampMs) / 1000 : 0;
      const speedDegPerSec = prev && dt > 0 ? (msg.value - prev.angleDeg) / dt : 0;
      this.telemetry.set(msg.port, {
        port: msg.port,
        angleDeg: msg.value,
        speedDegPerSec,
        timestampMs: now,
      });
      for (const listener of Array.from(this.portValueListeners)) {
        listener(msg.port, msg.value, now);
      }
    }
  };

  private handleDisconnect = (): void => {
    if (this.state === 'DRIVING' || this.state === 'CALIBRATING') {
      this.state = 'EMERGENCY_STOP';
    } else {
      this.state = 'DISCONNECTED';
    }
  };
}
