import type { DriverState, HubAdapter, HubProfile, MotorTelemetry } from './contracts';
import { applySpeedCalibration, runSpeedCalRun, runSteeringCalibrationRoutine } from './driver/calibration';
import { initializeHubConnection, stopAllMotors, terminateHubConnection } from './driver/connection';
import { assertOperational, executeDrive, executeSteer, runBrakeRoutine } from './driver/control';
import { TelemetryManager } from './driver/telemetry';
import { AbortRegistry, TelemetryPoller, WatchdogTimer } from './driver/watchdog';
import { encodePortValueRequest } from './lego-protocol';
import { getVehicleProfile } from './profile';
import { listRememberedHubs } from './storage';

export {
  BRAKE_TAP_MAX_MS, BRAKE_TAP_STEP_RATIO, BRAKE_TICK_HZ, HOLD_BRAKE_SPEED_MPS, LOW_BATTERY_CUTOFF_PCT,
  STALL_HOLD_MS, STALL_SPEED_DEG_S, TELEMETRY_MIN_HZ, TILT_DEADZONE_DEG, TILT_MAX_DEG, WATCHDOG_TIMEOUT_MS,
} from './driver/constants';

export class VehicleDriver {
  private adapter: HubAdapter;
  private state: DriverState = 'DISCONNECTED';
  private hubProfile: HubProfile | null = null;
  private telemetryMgr = new TelemetryManager();
  private aborts = new AbortRegistry();
  private watchdog: WatchdogTimer;
  private updateListeners = new Set<() => void>();
  private currentSpeedMps = 0; private targetSpeedMps = 0;
  private cleanupListeners: Array<() => void> = [];
  private poller = new TelemetryPoller();
  private opGeneration = 0;
  private activeWatchdogPort: number | null = null;
  private speedCalCompleted = false;

  constructor(adapter: HubAdapter) {
    this.adapter = adapter;
    this.watchdog = new WatchdogTimer(this.triggerWatchdog);
    this.attach();
  }

  attach(): void {
    if (this.cleanupListeners.length > 0) return;
    this.cleanupListeners.push(this.adapter.onMessage(this.handleMessage), this.adapter.onDisconnect(this.handleDisconnect));
  }

  getState(): DriverState { return this.state; }
  getCurrentSpeedMps(): number { return this.currentSpeedMps; }
  getTargetSpeedMps(): number { return this.targetSpeedMps; }

  getHubProfile(): HubProfile | null {
    if (!this.hubProfile) return null;
    const current = listRememberedHubs().find((h) => h.hubId === this.hubProfile?.hubId);
    this.hubProfile = current ?? null;
    return this.hubProfile;
  }

  getTelemetry(port?: number): MotorTelemetry | Map<number, MotorTelemetry> | undefined { return this.telemetryMgr.getTelemetry(port); }
  getAttachedPorts(): Map<number, { attached: boolean; ioTypeId?: number }> { return this.telemetryMgr.getAttachedPorts(); }
  getHubProperties(): Map<number, unknown> { return this.telemetryMgr.getHubProperties(); }
  getBatteryLevel(): number | null { return this.telemetryMgr.getBatteryLevel(); }
  isLowBatteryCutoff(): boolean { return this.telemetryMgr.isLowBatteryCutoff(); }

  subscribe(listener: () => void): () => void {
    this.updateListeners.add(listener);
    return () => this.updateListeners.delete(listener);
  }

  private transitionState(next: DriverState): void {
    this.state = next;
    for (const listener of Array.from(this.updateListeners)) listener();
  }

  async connect(): Promise<void> {
    if (this.state !== 'DISCONNECTED' && !(this.state === 'EMERGENCY_STOP' && !this.adapter.isConnected())) {
      throw new Error(`Cannot connect in state ${this.state}`);
    }
    this.telemetryMgr.resetSession();
    this.speedCalCompleted = false;
    this.activeWatchdogPort = null;
    this.currentSpeedMps = 0; this.targetSpeedMps = 0;
    const gen = ++this.opGeneration;
    this.state = 'CONNECTING';
    try {
      const profile = await initializeHubConnection(this.adapter);
      const currentState = this.getState();
      if (this.opGeneration !== gen || currentState !== 'CONNECTING') {
        if (currentState === 'EMERGENCY_STOP') await stopAllMotors(this.adapter, profile);
        return;
      }
      this.hubProfile = profile;
      this.transitionState('READY');
    } catch (error) {
      if (this.opGeneration === gen && this.state === 'CONNECTING') this.transitionState('DISCONNECTED');
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.resetActiveOperations();
    const profile = this.hubProfile;
    this.currentSpeedMps = 0; this.targetSpeedMps = 0;
    this.hubProfile = null;
    this.transitionState('DISCONNECTED');
    await terminateHubConnection(this.adapter, profile);
  }

  async calibrateSteering(): Promise<void> {
    assertOperational('calibrateSteering', this.state, this.isLowBatteryCutoff());
    const profile = this.requireProfile();
    const vehicle = getVehicleProfile(profile.setId);
    const gen = ++this.opGeneration;
    this.transitionState('CALIBRATING');
    this.armSafety(vehicle.steerPort);
    try {
      const result = await runSteeringCalibrationRoutine({
        adapter: this.adapter,
        hubId: profile.hubId,
        steerPort: vehicle.steerPort,
        addPortValueListener: (cb) => this.telemetryMgr.addPortValueListener(cb),
        onAbortRegistered: (abort) => this.aborts.setStallAbort(abort),
        isCalibrating: () => this.opGeneration === gen && this.state === 'CALIBRATING',
      });
      if (this.opGeneration === gen) {
        if (result) this.hubProfile = result;
        if (this.state === 'CALIBRATING') this.transitionState('READY');
      }
    } catch (error) {
      if (this.opGeneration === gen && this.state === 'CALIBRATING') this.transitionState('READY');
      throw error;
    } finally {
      if (this.opGeneration === gen) this.clearSafety();
    }
  }

  async startSpeedCalRun(): Promise<void> {
    assertOperational('startSpeedCalRun', this.state, this.isLowBatteryCutoff());
    const profile = this.requireProfile();
    this.speedCalCompleted = false;
    const vehicle = getVehicleProfile(profile.setId);
    const drivePort = vehicle.drivePort;
    const gen = ++this.opGeneration;
    this.transitionState('CALIBRATING');
    this.armSafety(drivePort);
    const angle = (this.telemetryMgr.getTelemetry(drivePort) as MotorTelemetry | undefined)?.angleDeg ?? null;

    try {
      await runSpeedCalRun({
        adapter: this.adapter,
        drivePort,
        drivePolarity: vehicle.drivePolarity,
        initialAngle: angle,
        addPortValueListener: (cb) => this.telemetryMgr.addPortValueListener(cb),
        onAbortRegistered: (abort) => this.aborts.setSpeedCalAbort(abort),
      });
      if (this.opGeneration === gen && this.state === 'CALIBRATING') this.speedCalCompleted = true;
    } catch (error) {
      if (this.opGeneration === gen) await this.emergencyStop();
      throw error;
    }
  }

  async saveSpeedCal(measuredMeters: number): Promise<void> {
    if (this.state !== 'CALIBRATING') throw new Error(`Cannot saveSpeedCal in state ${this.state}`);
    if (!this.speedCalCompleted) throw new Error('Speed calibration run has not completed');
    this.hubProfile = applySpeedCalibration(this.requireProfile(), measuredMeters);
    this.speedCalCompleted = false;
    this.clearSafety();
    this.transitionState('READY');
  }

  async setSteering(angleNorm: number): Promise<void> {
    assertOperational('setSteering', this.state, this.isLowBatteryCutoff());
    await executeSteer(this.adapter, this.requireProfile(), angleNorm);
  }

  async setSpeed(targetMps: number): Promise<void> {
    assertOperational('setSpeed', this.state, this.isLowBatteryCutoff());
    const profile = this.requireProfile();
    const drivePort = getVehicleProfile(profile.setId).drivePort;
    const gen = ++this.opGeneration;
    this.targetSpeedMps = targetMps;
    this.currentSpeedMps = targetMps;
    if (this.activeWatchdogPort !== drivePort) this.armSafety(drivePort);
    this.transitionState('DRIVING');
    try {
      await executeDrive(this.adapter, profile, targetMps);
    } catch (error) {
      if (this.opGeneration === gen) await this.emergencyStop();
      throw error;
    }
    if (this.state !== 'READY' && this.state !== 'DRIVING') throw new Error('Speed command aborted');
    if (this.opGeneration !== gen) return;
    this.aborts.abortAll();
    for (const l of Array.from(this.updateListeners)) l();
  }

  async brake(intensity?: number, targetSpeedMps = 0): Promise<void> {
    assertOperational('brake', this.state, this.isLowBatteryCutoff(), targetSpeedMps);
    this.aborts.abortAll();
    const profile = this.requireProfile();
    const drivePort = getVehicleProfile(profile.setId).drivePort;
    const gen = ++this.opGeneration;
    this.targetSpeedMps = targetSpeedMps;
    for (const l of Array.from(this.updateListeners)) l();
    if (this.state === 'READY' && (this.currentSpeedMps !== 0 || targetSpeedMps !== 0)) {
      if (this.activeWatchdogPort !== drivePort) this.armSafety(drivePort);
      this.transitionState('DRIVING');
    }
    try {
      await runBrakeRoutine({
        adapter: this.adapter,
        profile,
        currentSpeedMps: this.currentSpeedMps,
        intensity,
        targetSpeedMps,
        isDriving: () => this.opGeneration === gen && this.state === 'DRIVING',
        isCancelled: () => this.opGeneration !== gen,
        onSpeedStep: (speed) => {
          this.currentSpeedMps = speed;
          for (const l of Array.from(this.updateListeners)) l();
        },
        onHoldBrake: async () => {
          if (this.opGeneration !== gen) return;
          this.clearSafety();
          this.currentSpeedMps = 0; this.targetSpeedMps = 0;
          this.transitionState('READY');
        },
        onAbortRegistered: (abort) => this.aborts.setBrakeAbort(abort),
      });
    } catch (error) {
      if (this.opGeneration === gen) await this.emergencyStop();
      throw error;
    }
  }

  async emergencyStop(): Promise<void> {
    this.resetActiveOperations();
    this.currentSpeedMps = 0; this.targetSpeedMps = 0;
    this.transitionState('EMERGENCY_STOP');
    await stopAllMotors(this.adapter, this.hubProfile);
  }

  async resetEmergencyStop(): Promise<void> {
    if (this.state !== 'EMERGENCY_STOP') return;
    if (!this.adapter.isConnected()) throw new Error('Cannot resetEmergencyStop: BLE disconnected');
    this.transitionState('READY');
  }

  destroy(): void {
    this.resetActiveOperations();
    for (const off of this.cleanupListeners) off();
    this.cleanupListeners = [];
    this.telemetryMgr.clear();
    this.updateListeners.clear();
  }

  private armSafety(port: number): void {
    this.activeWatchdogPort = port;
    this.watchdog.arm();
    this.poller.start(() => {
      if ((this.state === 'DRIVING' || this.state === 'CALIBRATING') && this.adapter.isConnected()) {
        void this.adapter.send(encodePortValueRequest(port)).catch(() => {});
      }
    });
  }

  private clearSafety(): void { this.activeWatchdogPort = null; this.poller.stop(); this.watchdog.clear(); }
  private resetActiveOperations(): void { this.opGeneration += 1; this.speedCalCompleted = false; this.clearSafety(); this.aborts.abortAll(); }

  private resetWatchdog(): void { if (this.state === 'DRIVING' || this.state === 'CALIBRATING') this.watchdog.arm(); }
  private triggerWatchdog = (): void => { if (this.state === 'DRIVING' || this.state === 'CALIBRATING') void this.emergencyStop(); };

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
        if (this.state === 'READY' || this.state === 'DRIVING' || this.state === 'CALIBRATING') {
          void this.emergencyStop();
        }
      },
      this.activeWatchdogPort,
    );
    if (changed) {
      for (const listener of Array.from(this.updateListeners)) listener();
    }
  };

  private handleDisconnect = (): void => {
    this.resetActiveOperations();
    this.transitionState(this.state === 'DRIVING' || this.state === 'CALIBRATING' ? 'EMERGENCY_STOP' : 'DISCONNECTED');
  };
}
