import type { DriverState, HubAdapter, HubProfile, MotorTelemetry } from './contracts';
import {
  applySpeedCalibration,
  runSpeedCalRun,
  runSteeringCalibrationRoutine,
} from './driver/calibration';
import {
  initializeHubConnection,
  stopAllMotors,
  terminateHubConnection,
} from './driver/connection';
import {
  assertOperational,
  executeDrive,
  executeSteer,
  runBrakeRoutine,
} from './driver/control';
import { TelemetryManager } from './driver/telemetry';
import { AbortRegistry, WatchdogTimer } from './driver/watchdog';
import { getVehicleProfile } from './profile';
import { listRememberedHubs } from './storage';

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
    if (!this.hubProfile) return null;
    const current = listRememberedHubs().find((h) => h.hubId === this.hubProfile?.hubId);
    if (current) this.hubProfile = current;
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

  private transitionState(next: DriverState): void {
    this.state = next;
    for (const listener of Array.from(this.updateListeners)) listener();
  }

  async connect(): Promise<void> {
    if (this.state !== 'DISCONNECTED') throw new Error(`Cannot connect in state ${this.state}`);
    this.state = 'CONNECTING';
    try {
      this.hubProfile = await initializeHubConnection(this.adapter);
      this.transitionState('READY');
    } catch (error) {
      this.transitionState('DISCONNECTED');
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.watchdog.clear();
    this.aborts.abortAll();
    await terminateHubConnection(this.adapter, this.getHubProfile());
    this.transitionState('DISCONNECTED');
  }

  async calibrateSteering(): Promise<void> {
    assertOperational('calibrateSteering', this.state, this.isLowBatteryCutoff());
    const profile = this.requireProfile();
    this.transitionState('CALIBRATING');
    this.watchdog.arm();
    const vehicle = getVehicleProfile(profile.setId);

    try {
      const result = await runSteeringCalibrationRoutine({
        adapter: this.adapter,
        hubId: profile.hubId,
        steerPort: vehicle.steerPort,
        addPortValueListener: (cb) => this.telemetryMgr.addPortValueListener(cb),
        onTick: () => this.resetWatchdog(),
        onAbortRegistered: (abort) => this.aborts.setStallAbort(abort),
        isCalibrating: () => this.state === 'CALIBRATING',
      });
      if (result) this.hubProfile = result;
      this.transitionState('READY');
    } catch (error) {
      if (this.state === 'CALIBRATING') this.transitionState('READY');
      throw error;
    } finally {
      this.watchdog.clear();
    }
  }

  async startSpeedCalRun(): Promise<void> {
    assertOperational('startSpeedCalRun', this.state, this.isLowBatteryCutoff());
    const profile = this.requireProfile();
    this.transitionState('CALIBRATING');
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
    if (this.state !== 'CALIBRATING') throw new Error(`Cannot saveSpeedCal in state ${this.state}`);
    this.hubProfile = applySpeedCalibration(this.requireProfile(), measuredMeters);
    this.watchdog.clear();
    this.transitionState('READY');
  }

  async setSteering(angleNorm: number): Promise<void> {
    assertOperational('setSteering', this.state, this.isLowBatteryCutoff());
    await executeSteer(this.adapter, this.requireProfile(), angleNorm);
  }

  async setSpeed(targetMps: number): Promise<void> {
    assertOperational('setSpeed', this.state, this.isLowBatteryCutoff());
    await executeDrive(this.adapter, this.requireProfile(), targetMps);
    this.currentSpeedMps = targetMps;
    this.transitionState('DRIVING');
    this.watchdog.arm();
  }

  async brake(intensity?: number): Promise<void> {
    assertOperational('brake', this.state, this.isLowBatteryCutoff());
    return runBrakeRoutine({
      adapter: this.adapter,
      profile: this.requireProfile(),
      currentSpeedMps: this.currentSpeedMps,
      intensity,
      isDriving: () => this.state === 'DRIVING',
      onTick: () => this.resetWatchdog(),
      onSpeedStep: (speed) => {
        this.currentSpeedMps = speed;
      },
      onHoldBrake: async () => {
        this.watchdog.clear();
        this.currentSpeedMps = 0;
        this.transitionState('READY');
      },
      onAbortRegistered: (abort) => this.aborts.setBrakeAbort(abort),
    });
  }

  async emergencyStop(): Promise<void> {
    this.watchdog.clear();
    this.aborts.abortAll();
    this.currentSpeedMps = 0;
    this.transitionState('EMERGENCY_STOP');
    await stopAllMotors(this.adapter, this.getHubProfile());
  }

  async resetEmergencyStop(): Promise<void> {
    if (this.state !== 'EMERGENCY_STOP') return;
    if (!this.adapter.isConnected()) throw new Error('Cannot resetEmergencyStop: BLE disconnected');
    this.transitionState('READY');
  }

  destroy(): void {
    this.watchdog.clear();
    this.aborts.abortAll();
    for (const off of this.cleanupListeners) off();
    this.cleanupListeners = [];
    this.telemetryMgr.clear();
    this.updateListeners.clear();
  }

  private resetWatchdog(): void {
    if (this.state === 'DRIVING' || this.state === 'CALIBRATING') this.watchdog.arm();
  }

  private triggerWatchdog = (): void => {
    if (this.state === 'DRIVING' || this.state === 'CALIBRATING') void this.emergencyStop();
  };

  private requireProfile(): HubProfile {
    const profile = this.getHubProfile();
    if (!profile) throw new Error('No active hub profile');
    return profile;
  }

  private handleMessage = (packet: Uint8Array): void => {
    const changed = this.telemetryMgr.handlePacket(
      packet,
      () => this.resetWatchdog(),
      () => {
        if (this.state === 'DRIVING' || this.state === 'CALIBRATING') void this.emergencyStop();
      },
    );
    if (changed) {
      for (const listener of Array.from(this.updateListeners)) listener();
    }
  };

  private handleDisconnect = (): void => {
    this.watchdog.clear();
    this.aborts.abortAll();
    this.transitionState(
      this.state === 'DRIVING' || this.state === 'CALIBRATING' ? 'EMERGENCY_STOP' : 'DISCONNECTED',
    );
  };
}
