import { describe, it, expect } from 'vitest';
import {
  DRIVER_STATES,
  DriverState,
  VehicleProfile,
  HubProfile,
  MotorTelemetry,
  HubAdapter,
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

  it('satisfies the HubAdapter contract', async () => {
    let connected = false;
    let messageListener: ((packet: Uint8Array) => void) | null = null;
    let disconnectListener: (() => void) | null = null;
    const sentPackets: Uint8Array[] = [];

    const mockAdapter: HubAdapter = {
      async connect() {
        connected = true;
      },
      async disconnect() {
        connected = false;
        disconnectListener?.();
      },
      isConnected() {
        return connected;
      },
      getHubId() {
        return 'mock-hub-1';
      },
      getHubName() {
        return 'Mock Technic Hub';
      },
      async send(packet: Uint8Array) {
        sentPackets.push(packet);
      },
      onMessage(cb: (packet: Uint8Array) => void) {
        messageListener = cb;
        return () => {
          messageListener = null;
        };
      },
      onDisconnect(cb: () => void) {
        disconnectListener = cb;
        return () => {
          disconnectListener = null;
        };
      },
    };

    expect(mockAdapter.isConnected()).toBe(false);
    await mockAdapter.connect();
    expect(mockAdapter.isConnected()).toBe(true);
    expect(mockAdapter.getHubId()).toBe('mock-hub-1');
    expect(mockAdapter.getHubName()).toBe('Mock Technic Hub');

    const testPacket = new Uint8Array([0x01, 0x02, 0x03]);
    await mockAdapter.send(testPacket);
    expect(sentPackets).toEqual([testPacket]);

    let received: Uint8Array | null = null;
    const unsubscribeMsg = mockAdapter.onMessage((pkt) => {
      received = pkt;
    });
    const dispatchMessage = messageListener as ((pkt: Uint8Array) => void) | null;
    dispatchMessage?.(testPacket);
    expect(received).toEqual(testPacket);
    unsubscribeMsg();

    let disconnectedCalled = false;
    const unsubscribeDisc = mockAdapter.onDisconnect(() => {
      disconnectedCalled = true;
    });
    await mockAdapter.disconnect();
    expect(mockAdapter.isConnected()).toBe(false);
    expect(disconnectedCalled).toBe(true);
    unsubscribeDisc();
  });
});
