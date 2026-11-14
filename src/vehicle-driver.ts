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
export const LOW_BATTERY_CUTOFF_PCT = 10;

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
  private updateListeners = new Set<() => void>();
  private currentSpeedMps = 0;
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private activeBrakeAbort: (() => void) | null = null;
  private activeSpeedCalAbort: (() => void) | null = null;
  private activeStallAbort: (() => void) | null = null;
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

  getBatteryLevel(): number | null {
    const batt = this.hubProperties.get(0x06);
    return typeof batt === 'number' ? batt : null;
  }

  isLowBatteryCutoff(): boolean {
    const batt = this.getBatteryLevel();
    return batt !== null && batt < LOW_BATTERY_CUTOFF_PCT;
  }

  subscribe(listener: () => void): () => void {
    this.updateListeners.add(listener);
    return () => {
      this.updateListeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of Array.from(this.updateListeners)) {
      listener();
    }
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
      this.notify();
    } catch (error) {
      this.state = 'DISCONNECTED';
      this.notify();
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.clearWatchdog();
    this.abortActiveLoops();
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
    this.notify();
  }

  async calibrateSteering(): Promise<void> {
    if (this.isLowBatteryCutoff()) {
      throw new Error(`Cannot calibrateSteering: hub battery below ${LOW_BATTERY_CUTOFF_PCT}%`);
    }
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
    this.notify();
    this.armWatchdog();
    const vehicle = getVehicleProfile(profile.setId);
    const steerPort = vehicle.steerPort;

    try {
      const leftLimit = await this.detectStall(steerPort, -30);
      if (this.state !== 'CALIBRATING') {
        return;
      }
      const rightLimit = await this.detectStall(steerPort, 30);
      if (this.state !== 'CALIBRATING') {
        return;
      }
      const centerPos = (leftLimit + rightLimit) / 2;

      await this.adapter.send(
        encodeGoToAbsolutePosition(steerPort, centerPos, 100, 100, 127),
      );

      this.hubProfile = saveHubCalibration(profile.hubId, {
        leftLimit,
        rightLimit,
        centerPos,
      });

      this.clearWatchdog();
      this.state = 'READY';
      this.notify();
    } catch (error) {
      this.clearWatchdog();
      if (this.state === 'CALIBRATING') {
        this.state = 'READY';
        this.notify();
      }
      throw error;
    }
  }

  async startSpeedCalRun(): Promise<void> {
    if (this.isLowBatteryCutoff()) {
      throw new Error(`Cannot startSpeedCalRun: hub battery below ${LOW_BATTERY_CUTOFF_PCT}%`);
    }
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
    this.notify();
    this.armWatchdog();
    const vehicle = getVehicleProfile(profile.setId);
    const drivePort = vehicle.drivePort;

    let startAngle: number | null = this.telemetry.get(drivePort)?.angleDeg ?? null;

    const promise = new Promise<void>((resolve) => {
      const cleanup = () => {
        this.portValueListeners.delete(onPortValue);
        if (this.activeSpeedCalAbort === abort) {
          this.activeSpeedCalAbort = null;
        }
      };

      const abort = () => {
        cleanup();
        resolve();
      };
      this.activeSpeedCalAbort = abort;

      const onPortValue = (p: number, value: number) => {
        if (p !== drivePort) return;
        if (startAngle === null) {
          startAngle = value;
        }
        const deltaDeg = Math.abs(value - startAngle);
        if (deltaDeg >= SPEED_CAL_TARGET_DEG) {
          cleanup();
          void this.adapter.send(encodeStartSpeed(drivePort, 0)).then(() => {
            resolve();
          });
        }
      };

      this.portValueListeners.add(onPortValue);
    });

    void this.adapter.send(encodeStartSpeed(drivePort, 40));

    return promise;
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
    this.clearWatchdog();
    this.state = 'READY';
    this.notify();
  }

  async setSteering(angleNorm: number): Promise<void> {
    if (this.isLowBatteryCutoff()) {
      throw new Error(`Cannot setSteering: hub battery below ${LOW_BATTERY_CUTOFF_PCT}%`);
    }
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
    if (this.isLowBatteryCutoff()) {
      throw new Error(`Cannot setSpeed: hub battery below ${LOW_BATTERY_CUTOFF_PCT}%`);
    }
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
    this.state = 'DRIVING';
    this.notify();
    this.armWatchdog();
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
      let timer: ReturnType<typeof setInterval> | null = null;

      const cleanup = () => {
        if (timer !== null) {
          clearInterval(timer);
          timer = null;
        }
        if (this.activeBrakeAbort === abort) {
          this.activeBrakeAbort = null;
        }
      };

      const abort = () => {
        cleanup();
        resolve();
      };
      this.activeBrakeAbort = abort;

      if (Math.abs(speedMps) < HOLD_BRAKE_SPEED_MPS) {
        cleanup();
        this.clearWatchdog();
        this.currentSpeedMps = 0;
        this.state = 'READY';
        this.notify();
        this.adapter
          .send(encodeStartSpeed(drivePort, 127))
          .then(() => resolve())
          .catch(reject);
        return;
      }

      timer = setInterval(() => {
        if (this.state !== 'DRIVING') {
          cleanup();
          resolve();
          return;
        }

        this.resetWatchdog();
        if (speedMps > 0) {
          speedMps = Math.max(0, speedMps - deltaMps);
        } else {
          speedMps = Math.min(0, speedMps + deltaMps);
        }

        if (Math.abs(speedMps) < HOLD_BRAKE_SPEED_MPS) {
          cleanup();
          this.clearWatchdog();
          this.currentSpeedMps = 0;
          this.state = 'READY';
          this.notify();
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

        this.adapter.send(encodeStartSpeed(drivePort, motorSpeed)).catch(reject);
      }, tickMs);
    });
  }

  async emergencyStop(): Promise<void> {
    this.clearWatchdog();
    this.abortActiveLoops();
    this.state = 'EMERGENCY_STOP';
    this.notify();
    this.currentSpeedMps = 0;
    const profile = this.getHubProfile();
    const vehicle = getVehicleProfile(profile?.setId);
    try {
      const p1 = this.adapter.send(encodeStartSpeed(vehicle.drivePort, 0));
      const p2 = this.adapter.send(encodeStartSpeed(vehicle.steerPort, 0));
      await Promise.all([p1, p2]);
    } catch {
      // ignore send error during emergency stop
    }
  }

  async resetEmergencyStop(): Promise<void> {
    if (this.state !== 'EMERGENCY_STOP') {
      return;
    }
    if (!this.adapter.isConnected()) {
      throw new Error('Cannot resetEmergencyStop: BLE disconnected');
    }
    this.state = 'READY';
    this.notify();
  }

  destroy(): void {
    this.clearWatchdog();
    this.abortActiveLoops();
    for (const off of this.cleanupListeners) {
      off();
    }
    this.cleanupListeners = [];
    this.portValueListeners.clear();
    this.updateListeners.clear();
  }

  private armWatchdog(): void {
    this.clearWatchdog();
    this.watchdogTimer = setTimeout(this.triggerWatchdog, WATCHDOG_TIMEOUT_MS);
  }

  private resetWatchdog(): void {
    if (this.state === 'DRIVING' || this.state === 'CALIBRATING') {
      this.armWatchdog();
    }
  }

  private clearWatchdog(): void {
    if (this.watchdogTimer !== null) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  private triggerWatchdog = (): void => {
    if (this.state === 'DRIVING' || this.state === 'CALIBRATING') {
      void this.emergencyStop();
    }
  };

  private abortActiveLoops(): void {
    if (this.activeBrakeAbort) {
      const abort = this.activeBrakeAbort;
      this.activeBrakeAbort = null;
      abort();
    }
    if (this.activeSpeedCalAbort) {
      const abort = this.activeSpeedCalAbort;
      this.activeSpeedCalAbort = null;
      abort();
    }
    if (this.activeStallAbort) {
      const abort = this.activeStallAbort;
      this.activeStallAbort = null;
      abort();
    }
  }

  private async detectStall(port: number, speed: number): Promise<number> {
    await this.adapter.send(encodeStartSpeed(port, speed, 40));

    return new Promise<number>((resolve) => {
      let lastPos: number | null = null;
      let lastSampleTime = Date.now();
      let stallStartTime: number | null = null;
      let intervalId: ReturnType<typeof setInterval> | null = null;

      const cleanup = () => {
        if (intervalId !== null) {
          clearInterval(intervalId);
          intervalId = null;
        }
        this.portValueListeners.delete(onPortValue);
        if (this.activeStallAbort === abort) {
          this.activeStallAbort = null;
        }
      };

      const abort = () => {
        cleanup();
        resolve(lastPos ?? 0);
      };
      this.activeStallAbort = abort;

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

      intervalId = setInterval(() => {
        this.resetWatchdog();
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
    if (msg.messageType === 0x04 && 'attached' in msg && typeof msg.port === 'number') {
      console.info('Attached I/O notification:', msg);
      this.attachedPorts.set(msg.port, {
        attached: Boolean(msg.attached),
        ioTypeId: typeof msg.ioTypeId === 'number' ? msg.ioTypeId : undefined,
      });
      this.notify();
    } else if (
      msg.messageType === 0x01 &&
      'property' in msg &&
      typeof msg.property === 'number'
    ) {
      this.hubProperties.set(msg.property, msg.value);
      if (
        msg.property === 0x06 &&
        typeof msg.value === 'number' &&
        msg.value < LOW_BATTERY_CUTOFF_PCT
      ) {
        if (this.state === 'DRIVING' || this.state === 'CALIBRATING') {
          void this.emergencyStop();
        }
      }
      this.notify();
    } else if (
      msg.messageType === 0x45 &&
      'port' in msg &&
      typeof msg.port === 'number' &&
      typeof msg.value === 'number'
    ) {
      this.resetWatchdog();
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
      this.notify();
    }
  };

  private handleDisconnect = (): void => {
    this.clearWatchdog();
    this.abortActiveLoops();
    if (this.state === 'DRIVING' || this.state === 'CALIBRATING') {
      this.state = 'EMERGENCY_STOP';
    } else {
      this.state = 'DISCONNECTED';
    }
    this.notify();
  };
}
