export type DriverState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'READY'
  | 'DRIVING'
  | 'CALIBRATING'
  | 'EMERGENCY_STOP';

export const DRIVER_STATES: readonly DriverState[] = [
  'DISCONNECTED',
  'CONNECTING',
  'READY',
  'DRIVING',
  'CALIBRATING',
  'EMERGENCY_STOP',
] as const;

export interface VehicleProfile {
  setId: string;
  displayName: string;
  hubType: string;
  drivePort: number;
  drivePolarity: 1 | -1;
  steerPort: number;
  stockTireDiameterMm: number;
  defaultSteeringClampRatio: number;
  defaultBrakeIntensity: number;
}

export interface HubCalibration {
  leftLimit: number | null;
  rightLimit: number | null;
  centerPos: number | null;
  kCal: number;
}

export interface HubProfile {
  hubId: string;
  name: string;
  setId: string;
  lastConnectedAt: number;
  tireDiameterMm: number;
  steeringClampRatio: number;
  defaultBrakeIntensity: number;
  calibration: HubCalibration;
}

export interface MotorTelemetry {
  port: number;
  angleDeg: number;
  speedDegPerSec: number;
  timestampMs: number;
}

export interface HubAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getHubId(): string | null;
  getHubName(): string | null;
  send(packet: Uint8Array): Promise<void>;
  onMessage(callback: (packet: Uint8Array) => void): () => void;
  onDisconnect(callback: () => void): () => void;
}
