import type {
  DriverState,
  HubAdapter,
  HubProfile,
  MotorTelemetry,
} from './contracts';
import {
  calculateSpeedCalKCal,
  executeSteeringCalibration,
  runSpeedCalRun,
} from './driver/calibration';
import {
  BRAKE_TICK_HZ,
  HOLD_BRAKE_SPEED_MPS,
  LOW_BATTERY_CUTOFF_PCT,
  STALL_HOLD_MS,
  STALL_SPEED_DEG_S,
  TELEMETRY_MIN_HZ,
  WATCHDOG_TIMEOUT_MS,
} from './driver/constants';
import {
  calculateMotorSpeed,
  calculateTargetSteerPos,
  executeProgressiveBrake,
} from './driver/control';
import { sendHubInitHandshake } from './driver/handshake';
import {
  TelemetryManager,
} from './driver/telemetry';
import {
  AbortRegistry,
  WatchdogTimer,
} from './driver/watchdog';
import {
  encodeGoToAbsolutePosition,
  encodeStartSpeed,
} from './lego-protocol';
import { getVehicleProfile } from './profile';
import {
  getOrCreateHubProfile,
  listRememberedHubs,
  saveHubCalibration,
} from './storage';

export {
  BRAKE_TICK_HZ,
  HOLD_BRAKE_SPEED_MPS,
  LOW_BATTERY_CUTOFF_PCT,
  STALL_HOLD_MS,
  STALL_SPEED_DEG_S,
  TELEMETRY_MIN_HZ,
  WATCHDOG_TIMEOUT_MS,
} from './driver/constants';

export class VehicleDriver {
  private adapter: HubAdapter;
  private state: DriverState = 'DISCONNECTED';
  private hubProfile: HubProfile | null = null;
  private telemetryMgr = new TelemetryManager();
  private aborts = new AbortRegistry();
  private watchdog: WatchdogTimer;
  private updateListeners = new Set<() => void>();
  private currentSpeedMps = 0;
  private cleanupListeners: Array<() => void> = [];

  constructor(adapter: HubAdapter) {
    this.adapter = adapter;
    this.watchdog = new WatchdogTimer(this.triggerWatchdog);
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
    return this.telemetryMgr.getTelemetry(port);
  }

  getAttachedPorts(): Map<number, { attached: boolean; ioTypeId?: number }> {
    return this.telemetryMgr.getAttachedPorts();
  }

  getHubProperties(): Map<number, unknown> {
    return this.telemetryMgr.getHubProperties();
  }

  getBatteryLevel(): number | null {
    return this.telemetryMgr.getBatteryLevel();
  }

  isLowBatteryCutoff(): boolean {
    return this.telemetryMgr.isLowBatteryCutoff();
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

      await sendHubInitHandshake(this.adapter, this.hubProfile);

      this.state = 'READY';
      this.notify();
    } catch (error) {
      this.state = 'DISCONNECTED';
      this.notify();
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.watchdog.clear();
    this.aborts.abortAll();
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
    this.ensureOperational('calibrateSteering');
    const profile = this.requireProfile();

    this.state = 'CALIBRATING';
    this.notify();
    this.watchdog.arm();
    const vehicle = getVehicleProfile(profile.setId);

    try {
      const result = await executeSteeringCalibration({
        adapter: this.adapter,
        steerPort: vehicle.steerPort,
        addPortValueListener: (cb) => this.telemetryMgr.addPortValueListener(cb),
        onTick: () => this.resetWatchdog(),
        onAbortRegistered: (abort) => this.aborts.setStallAbort(abort),
        isCalibrating: () => this.state === 'CALIBRATING',
      });
      if (result) {
        this.hubProfile = saveHubCalibration(profile.hubId, result);
      }
      this.watchdog.clear();
      this.state = 'READY';
      this.notify();
    } catch (error) {
      this.watchdog.clear();
      if (this.state === 'CALIBRATING') {
        this.state = 'READY';
        this.notify();
      }
      throw error;
    }
  }

  async startSpeedCalRun(): Promise<void> {
    this.ensureOperational('startSpeedCalRun');
    const profile = this.requireProfile();

    this.state = 'CALIBRATING';
    this.notify();
    this.watchdog.arm();
    const vehicle = getVehicleProfile(profile.setId);
    const drivePort = vehicle.drivePort;

    const angle = (this.telemetryMgr.getTelemetry(drivePort) as MotorTelemetry | undefined)?.angleDeg ?? null;
    return runSpeedCalRun({
      adapter: this.adapter,
      drivePort,
      initialAngle: angle,
      addPortValueListener: (cb) => this.telemetryMgr.addPortValueListener(cb),
      onAbortRegistered: (abort) => this.aborts.setSpeedCalAbort(abort),
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
    const profile = this.requireProfile();

    const vehicle = getVehicleProfile(profile.setId);
    const tireDiameterMm = profile.tireDiameterMm ?? vehicle.stockTireDiameterMm;
    const kCal = calculateSpeedCalKCal(measuredMeters, tireDiameterMm);

    this.hubProfile = saveHubCalibration(profile.hubId, { kCal });
    this.watchdog.clear();
    this.state = 'READY';
    this.notify();
  }

  async setSteering(angleNorm: number): Promise<void> {
    this.ensureOperational('setSteering');
    const profile = this.requireProfile();

    const vehicle = getVehicleProfile(profile.setId);
    const absPos = calculateTargetSteerPos(angleNorm, profile, vehicle);

    await this.adapter.send(
      encodeGoToAbsolutePosition(vehicle.steerPort, absPos, 100, 100, 127),
    );
  }

  async setSpeed(targetMps: number): Promise<void> {
    this.ensureOperational('setSpeed');
    const profile = this.requireProfile();

    const vehicle = getVehicleProfile(profile.setId);
    const motorSpeed = calculateMotorSpeed(targetMps, profile, vehicle);

    await this.adapter.send(encodeStartSpeed(vehicle.drivePort, motorSpeed));

    this.currentSpeedMps = targetMps;
    this.state = 'DRIVING';
    this.notify();
    this.watchdog.arm();
  }

  async brake(intensity?: number): Promise<void> {
    this.ensureOperational('brake');
    const profile = this.requireProfile();

    const vehicle = getVehicleProfile(profile.setId);
    const actualIntensity =
      intensity ?? profile.defaultBrakeIntensity ?? vehicle.defaultBrakeIntensity;

    return executeProgressiveBrake(
      this.adapter,
      vehicle,
      () => this.getHubProfile() ?? profile,
      this.currentSpeedMps,
      actualIntensity,
      {
        isDriving: () => this.state === 'DRIVING',
        onTick: () => this.resetWatchdog(),
        onSpeedStep: (speed) => {
          this.currentSpeedMps = speed;
        },
        onHoldBrake: async () => {
          this.watchdog.clear();
          this.currentSpeedMps = 0;
          this.state = 'READY';
          this.notify();
          await this.adapter.send(encodeStartSpeed(vehicle.drivePort, 127));
        },
        onAbortRegistered: (abort) => this.aborts.setBrakeAbort(abort),
      },
    );
  }

  async emergencyStop(): Promise<void> {
    this.watchdog.clear();
    this.aborts.abortAll();
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
    this.watchdog.clear();
    this.aborts.abortAll();
    for (const off of this.cleanupListeners) {
      off();
    }
    this.cleanupListeners = [];
    this.telemetryMgr.clear();
    this.updateListeners.clear();
  }

  private resetWatchdog(): void {
    if (this.state === 'DRIVING' || this.state === 'CALIBRATING') {
      this.watchdog.arm();
    }
  }

  private triggerWatchdog = (): void => {
    if (this.state === 'DRIVING' || this.state === 'CALIBRATING') {
      void this.emergencyStop();
    }
  };

  private ensureOperational(
    action: 'calibrateSteering' | 'startSpeedCalRun' | 'setSteering' | 'setSpeed' | 'brake',
  ): void {
    if (action !== 'brake' && this.isLowBatteryCutoff()) {
      throw new Error(`Cannot ${action}: hub battery below ${LOW_BATTERY_CUTOFF_PCT}%`);
    }
    if (this.state === 'CALIBRATING') {
      const tag = action === 'setSteering' || action === 'setSpeed' || action === 'brake' ? ' (CTL-03)' : '';
      throw new Error(`Cannot ${action} while in CALIBRATING state${tag}`);
    }
    if (this.state !== 'READY' && this.state !== 'DRIVING') {
      throw new Error(`Cannot ${action} in state ${this.state}`);
    }
  }

  private requireProfile(): HubProfile {
    const profile = this.getHubProfile();
    if (!profile) {
      throw new Error('No active hub profile');
    }
    return profile;
  }

  private handleMessage = (packet: Uint8Array): void => {
    const changed = this.telemetryMgr.handlePacket(
      packet,
      () => this.resetWatchdog(),
      () => {
        if (this.state === 'DRIVING' || this.state === 'CALIBRATING') {
          void this.emergencyStop();
        }
      },
    );
    if (changed) {
      this.notify();
    }
  };

  private handleDisconnect = (): void => {
    this.watchdog.clear();
    this.aborts.abortAll();
    if (this.state === 'DRIVING' || this.state === 'CALIBRATING') {
      this.state = 'EMERGENCY_STOP';
    } else {
      this.state = 'DISCONNECTED';
    }
    this.notify();
  };
}
