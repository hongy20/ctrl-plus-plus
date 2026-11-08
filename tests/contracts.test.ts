import { describe, it, expect } from 'vitest';
import {
  DRIVER_STATES,
  DriverState,
  VehicleProfile,
  HubProfile,
  MotorTelemetry,
} from '../src/contracts';

describe('Contracts', () => {
  it('defines the expected DriverState enum values', () => {
    const expectedStates: DriverState[] = [
      'DISCONNECTED',
      'CONNECTING',
      'READY',
      'DRIVING',
      'CALIBRATING',
      'EMERGENCY_STOP',
    ];
    expect(DRIVER_STATES).toEqual(expectedStates);
    expect(DRIVER_STATES).toHaveLength(6);
  });

  it('conforms to the VehicleProfile interface (PRF-01)', () => {
    const sampleVehicle: VehicleProfile = {
      setId: '42124',
      displayName: 'Off-Road Buggy',
      hubType: 'TechnicHub 88012',
      drivePort: 0,
      drivePolarity: -1,
      steerPort: 1,
      stockTireDiameterMm: 71.6,
      defaultSteeringClampRatio: 0.9,
      defaultBrakeIntensity: 0.6,
    };

    expect(sampleVehicle.setId).toBe('42124');
    expect(sampleVehicle.displayName).toBe('Off-Road Buggy');
    expect(sampleVehicle.drivePolarity).toBe(-1);
    expect(sampleVehicle.stockTireDiameterMm).toBe(71.6);
  });

  it('conforms to the HubProfile interface with calibration (STR-01)', () => {
    const sampleHub: HubProfile = {
      hubId: 'hub-test-123',
      name: 'Buggy Hub',
      setId: '42124',
      lastConnectedAt: 1731000000000,
      tireDiameterMm: 71.6,
      steeringClampRatio: 0.9,
      defaultBrakeIntensity: 0.6,
      calibration: {
        leftLimit: null,
        rightLimit: null,
        centerPos: null,
        kCal: 1.0,
      },
    };

    expect(sampleHub.hubId).toBe('hub-test-123');
    expect(sampleHub.calibration.kCal).toBe(1.0);
    expect(sampleHub.calibration.leftLimit).toBeNull();
  });

  it('conforms to the MotorTelemetry interface', () => {
    const sampleTelemetry: MotorTelemetry = {
      port: 0,
      angleDeg: 180,
      speedDegPerSec: 360,
      timestampMs: 123456,
    };

    expect(sampleTelemetry.port).toBe(0);
    expect(sampleTelemetry.angleDeg).toBe(180);
    expect(sampleTelemetry.speedDegPerSec).toBe(360);
    expect(sampleTelemetry.timestampMs).toBe(123456);
  });
});
