import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockHubAdapter } from './mock-hub-adapter';
import { decodeLwpMessage } from '../src/lego-protocol';
import { getVehicleProfile } from '../src/profile';
import { getOrCreateHubProfile, listRememberedHubs, saveHubCalibration, updateHubParameters } from '../src/storage';
import {
  calculateBrakeTapTargetMps,
  calculateMaxSpeedMps,
  calculateMotorSpeed,
  calculateTelemetrySpeedMps,
  normalizeTiltAxis,
} from '../src/driver/control';
import {
  BRAKE_TAP_MAX_MS,
  BRAKE_TAP_STEP_RATIO,
  BRAKE_TICK_HZ,
  HOLD_BRAKE_SPEED_MPS,
  STALL_HOLD_MS,
  STALL_SPEED_DEG_S,
  TELEMETRY_MIN_HZ,
  TILT_DEADZONE_DEG,
  TILT_MAX_DEG,
  VehicleDriver,
} from '../src/vehicle-driver';

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

function makePortValuePacket(port: number, value: number): Uint8Array {
  const buf = new Uint8Array(8);
  buf[0] = 0x08;
  buf[1] = 0x00;
  buf[2] = 0x45;
  buf[3] = port;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  view.setInt32(4, value, true);
  return buf;
}

function makeAttachedIoPacket(port: number, ioTypeId = 0x002e): Uint8Array {
  return new Uint8Array([
    0x07,
    0x00,
    0x04,
    port,
    0x01,
    ioTypeId & 0xff,
    (ioTypeId >> 8) & 0xff,
  ]);
}

function getStartSpeedPackets(packets: Uint8Array[], port: number): Array<{ speed: number; maxPower: number }> {
  return packets
    .filter((p) => p.length >= 9 && p[2] === 0x81 && p[3] === port && p[5] === 0x07)
    .map((p) => {
      const view = new DataView(p.buffer, p.byteOffset, p.byteLength);
      return {
        speed: view.getInt8(6),
        maxPower: p[7]!,
      };
    });
}

function getGoToAbsolutePositionPackets(
  packets: Uint8Array[],
  port: number,
): Array<{ absPosition: number; speed: number; maxPower: number; endState: number }> {
  return packets
    .filter((p) => p.length >= 14 && p[2] === 0x81 && p[3] === port && p[5] === 0x0d)
    .map((p) => {
      const view = new DataView(p.buffer, p.byteOffset, p.byteLength);
      return {
        absPosition: view.getInt32(6, true),
        speed: p[10]!,
        maxPower: p[11]!,
        endState: p[12]!,
      };
    });
}

describe('VehicleDriver Control & Calibration (CTL-02..CTL-06, CAL-01..CAL-03)', () => {
  let adapter: MockHubAdapter;
  let driver: VehicleDriver;

  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage());
    adapter = new MockHubAdapter({ hubId: 'hub-42124', hubName: 'Technic Hub' });
    driver = new VehicleDriver(adapter);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('CTL-02: connect() queries Hub Properties 0x01..0x0D read-only, loads profile, sets LED, subscribes telemetry >= TELEMETRY_MIN_HZ, logs Attached I/O, and enters READY', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(TELEMETRY_MIN_HZ).toBeGreaterThan(0);
    await driver.connect();

    expect(adapter.isConnected()).toBe(true);
    expect(driver.getState()).toBe('READY');

    const decoded = adapter.sentPackets.map((p) => decodeLwpMessage(p));

    const propMessages = decoded.filter(
      (m): m is Extract<ReturnType<typeof decodeLwpMessage>, { messageType: 0x01 }> =>
        m.messageType === 0x01,
    );

    // Never issue Set (0x01) or Reset (0x04) on Hub Properties (CTL-09 / CTL-02)
    for (const msg of propMessages) {
      expect(msg.operation).not.toBe(0x01);
      expect(msg.operation).not.toBe(0x04);
    }

    // All Hub Properties 0x01..0x0D queried via Request Update (0x05)
    for (let prop = 0x01; prop <= 0x0d; prop++) {
      const hasRequestUpdate = propMessages.some(
        (m) => m.property === prop && m.operation === 0x05,
      );
      expect(hasRequestUpdate).toBe(true);
    }

    // Battery Level (0x06) subscribed (Enable Updates 0x02 or Request Update 0x05)
    expect(propMessages.some((m) => m.property === 0x06)).toBe(true);

    // HubProfile created/loaded in storage and Hub LED (port 0x32) set to profile.ledColor
    const hubs = listRememberedHubs();
    expect(hubs).toHaveLength(1);
    const profile = hubs[0]!;
    const ledPacket = adapter.sentPackets.find(
      (p) => p.length >= 8 && p[2] === 0x81 && p[3] === 0x32 && p[5] === 0x51,
    );
    expect(ledPacket).toBeDefined();
    expect(ledPacket![7]).toBe(profile.ledColor);

    // Port Input Format Setup (0x41) subscriptions for drive (0x00, mode 0x02 POS), steer (0x01, mode 0x02 POS), Hub Temp (0x3D, mode 0x00)
    const subPackets = adapter.sentPackets.filter((p) => p.length >= 10 && p[2] === 0x41);
    for (const [port, expectedMode] of [
      [0x00, 0x02],
      [0x01, 0x02],
      [0x3d, 0x00],
    ] as const) {
      const sub = subPackets.find((p) => p[3] === port && p[4] === expectedMode && p[9] === 0x01);
      expect(sub).toBeDefined();
    }

    // Attached I/O (0x04) notification is logged
    adapter.emitMessage(makeAttachedIoPacket(0x00, 0x002e));
    expect(infoSpy.mock.calls.length + logSpy.mock.calls.length).toBeGreaterThan(0);
  });

  it('CTL-03: rejects setSpeed() and setSteering() while in CALIBRATING without sending motor packets', async () => {
    vi.useFakeTimers();
    await driver.connect();

    const calPromise = driver.calibrateSteering();
    expect(driver.getState()).toBe('CALIBRATING');

    const packetsBefore = adapter.sentPackets.length;

    await expect(Promise.resolve().then(() => driver.setSpeed(1.0))).rejects.toThrow();
    await expect(Promise.resolve().then(() => driver.setSteering(0.5))).rejects.toThrow();

    const newPackets = adapter.sentPackets.slice(packetsBefore);
    const motorPackets = newPackets.filter((p) => p[2] === 0x81 && (p[3] === 0x00 || p[3] === 0x01));
    expect(motorPackets).toHaveLength(0);

    // Complete calibration cleanly so no timers leak
    adapter.emitMessage(makePortValuePacket(0x01, -90));
    await vi.advanceTimersByTimeAsync(STALL_HOLD_MS + 50);
    adapter.emitMessage(makePortValuePacket(0x01, 90));
    await vi.advanceTimersByTimeAsync(STALL_HOLD_MS + 50);
    await calPromise;
  });

  it('CAL-01: calibrateSteering() enters CALIBRATING, drives steer port left then right until |deg/s| < STALL_SPEED_DEG_S for STALL_HOLD_MS, recording leftLimit and rightLimit', async () => {
    vi.useFakeTimers();
    await driver.connect();
    adapter.sentPackets.length = 0;

    expect(STALL_SPEED_DEG_S).toBeGreaterThan(0);
    expect(STALL_HOLD_MS).toBeGreaterThan(0);

    const calPromise = driver.calibrateSteering();
    expect(driver.getState()).toBe('CALIBRATING');

    // Should command steer port (0x01) at low power in first direction
    const initialSteerCmds = getStartSpeedPackets(adapter.sentPackets, 0x01);
    expect(initialSteerCmds.length).toBeGreaterThanOrEqual(1);
    const firstDirSpeed = initialSteerCmds[0]!.speed;
    expect(firstDirSpeed).not.toBe(0);

    // Move steer encoder toward left limit (-80), then stall for STALL_HOLD_MS
    adapter.emitMessage(makePortValuePacket(0x01, -20));
    await vi.advanceTimersByTimeAsync(50);
    adapter.emitMessage(makePortValuePacket(0x01, -80));

    // Hold below STALL_SPEED_DEG_S for STALL_HOLD_MS
    const stepMs = 50;
    for (let elapsed = 0; elapsed <= STALL_HOLD_MS; elapsed += stepMs) {
      await vi.advanceTimersByTimeAsync(stepMs);
      adapter.emitMessage(makePortValuePacket(0x01, -80));
    }

    // Should now drive steer port in the opposite direction
    const allSteerCmds = getStartSpeedPackets(adapter.sentPackets, 0x01);
    const hasOppositeDir = allSteerCmds.some(
      (cmd) => cmd.speed !== 0 && Math.sign(cmd.speed) !== Math.sign(firstDirSpeed),
    );
    expect(hasOppositeDir).toBe(true);

    // Move steer encoder toward right limit (+100), then stall for STALL_HOLD_MS
    adapter.emitMessage(makePortValuePacket(0x01, 20));
    await vi.advanceTimersByTimeAsync(50);
    adapter.emitMessage(makePortValuePacket(0x01, 100));

    for (let elapsed = 0; elapsed <= STALL_HOLD_MS; elapsed += stepMs) {
      await vi.advanceTimersByTimeAsync(stepMs);
      adapter.emitMessage(makePortValuePacket(0x01, 100));
    }

    await calPromise;

    const profile = listRememberedHubs()[0]!;
    expect(profile.calibration.leftLimit).toBe(-80);
    expect(profile.calibration.rightLimit).toBe(100);
  });

  it('CAL-02: computes centerPos = (leftLimit + rightLimit) / 2, commands GoToAbsolutePosition 0x0D to centerPos, persists calibration, and returns to READY', async () => {
    vi.useFakeTimers();
    await driver.connect();
    adapter.sentPackets.length = 0;

    const calPromise = driver.calibrateSteering();

    // Left stall at -80
    adapter.emitMessage(makePortValuePacket(0x01, -80));
    for (let elapsed = 0; elapsed <= STALL_HOLD_MS + 50; elapsed += 50) {
      await vi.advanceTimersByTimeAsync(50);
      adapter.emitMessage(makePortValuePacket(0x01, -80));
    }

    // Right stall at +100
    adapter.emitMessage(makePortValuePacket(0x01, 100));
    for (let elapsed = 0; elapsed <= STALL_HOLD_MS + 50; elapsed += 50) {
      await vi.advanceTimersByTimeAsync(50);
      adapter.emitMessage(makePortValuePacket(0x01, 100));
    }

    await calPromise;

    const expectedCenter = (-80 + 100) / 2;
    const absCmds = getGoToAbsolutePositionPackets(adapter.sentPackets, 0x01);
    expect(absCmds.some((cmd) => cmd.absPosition === expectedCenter)).toBe(true);

    const profile = listRememberedHubs()[0]!;
    expect(profile.calibration.leftLimit).toBe(-80);
    expect(profile.calibration.rightLimit).toBe(100);
    expect(profile.calibration.centerPos).toBe(expectedCenter);
    expect(driver.getState()).toBe('READY');
  });

  it('CAL-03: startSpeedCalRun() enters CALIBRATING, drives fixed encoder target and stops; saveSpeedCal(measuredMeters) computes and persists kCal and returns to READY', async () => {
    await driver.connect();
    adapter.sentPackets.length = 0;

    const runPromise = driver.startSpeedCalRun();
    expect(driver.getState()).toBe('CALIBRATING');

    const driveStartCmds = getStartSpeedPackets(adapter.sentPackets, 0x00);
    expect(driveStartCmds.some((c) => c.speed === -40)).toBe(true);

    // Feed drive encoder (port 0x00) progress until fixed target is reached
    for (let deg = 0; deg <= 3600; deg += 200) {
      adapter.emitMessage(makePortValuePacket(0x00, deg));
    }

    await runPromise;

    const driveStopCmds = getStartSpeedPackets(adapter.sentPackets, 0x00);
    expect(driveStopCmds[driveStopCmds.length - 1]?.speed).toBe(0);

    await driver.saveSpeedCal(1.0);
    expect(driver.getState()).toBe('READY');
    const kCal1 = listRememberedHubs()[0]!.calibration.kCal;
    expect(kCal1).toBeGreaterThan(0);

    // Second run with 2.0m should yield 2x kCal (kCal = measuredMeters / theoreticalMeters)
    const runPromise2 = driver.startSpeedCalRun();
    for (let deg = 3600; deg <= 7200; deg += 200) {
      adapter.emitMessage(makePortValuePacket(0x00, deg));
    }
    await runPromise2;
    await driver.saveSpeedCal(2.0);
    const kCal2 = listRememberedHubs()[0]!.calibration.kCal;
    expect(kCal2).toBeCloseTo(kCal1 * 2, 5);
  });

  it('CTL-04: setSteering(angleNorm) clamps to [-1, +1], maps to [leftLimit, rightLimit] scaled by steeringClampRatio around centerPos, and sends GoToAbsolutePosition 0x0D', async () => {
    await driver.connect();
    const hubId = adapter.getHubId()!;
    saveHubCalibration(hubId, { leftLimit: -100, rightLimit: 100, centerPos: 0 });
    updateHubParameters(hubId, { steeringClampRatio: 0.9 });
    adapter.sentPackets.length = 0;

    await driver.setSteering(0);
    await driver.setSteering(1.5); // clamps to +1.0 -> +90
    await driver.setSteering(-2.0); // clamps to -1.0 -> -90

    const absCmds = getGoToAbsolutePositionPackets(adapter.sentPackets, 0x01);
    expect(absCmds.map((c) => c.absPosition)).toEqual([0, 90, -90]);
  });

  it('CTL-05: setSpeed(targetMps) maps m/s to drive port speed [-100, +100] using tireDiameterMm, kCal, and drivePolarity (-1 for 42124), and transitions READY -> DRIVING', async () => {
    await driver.connect();
    const hubId = adapter.getHubId()!;
    adapter.sentPackets.length = 0;

    await driver.setSpeed(1.0);
    expect(driver.getState()).toBe('DRIVING');

    const forwardCmds = getStartSpeedPackets(adapter.sentPackets, 0x00);
    expect(forwardCmds).toHaveLength(1);
    const speedAtK1 = forwardCmds[0]!.speed;
    // 42124 has drivePolarity = -1, so positive targetMps produces negative motor speed
    expect(speedAtK1).toBeLessThan(0);
    expect(speedAtK1).toBeGreaterThanOrEqual(-100);

    // Reverse targetMps produces positive motor speed
    await driver.setSpeed(-1.0);
    const reverseCmd = getStartSpeedPackets(adapter.sentPackets, 0x00)[1]!;
    expect(reverseCmd.speed).toBeGreaterThan(0);
    expect(reverseCmd.speed).toBeLessThanOrEqual(100);

    // Excessive targetMps clamps to [-100, +100]
    await driver.setSpeed(100.0);
    const clampedCmd = getStartSpeedPackets(adapter.sentPackets, 0x00)[2]!;
    expect(clampedCmd.speed).toBe(-100);

    // Higher kCal reduces required motor speed for same targetMps
    saveHubCalibration(hubId, { kCal: 2.0 });
    await driver.setSpeed(1.0);
    const speedAtK2 = getStartSpeedPackets(adapter.sentPackets, 0x00)[3]!.speed;
    expect(Math.abs(speedAtK2)).toBeLessThan(Math.abs(speedAtK1));
  });

  it('CTL-06: brake(intensity?) ramps speed down at BRAKE_TICK_HZ and engages hold-brake (127) only when |speed| < HOLD_BRAKE_SPEED_MPS, then returns to READY', async () => {
    vi.useFakeTimers();
    await driver.connect();

    expect(BRAKE_TICK_HZ).toBeGreaterThan(0);
    expect(HOLD_BRAKE_SPEED_MPS).toBeGreaterThan(0);

    await driver.setSpeed(2.0);
    expect(driver.getState()).toBe('DRIVING');
    adapter.sentPackets.length = 0;

    const brakePromise = driver.brake();
    const tickMs = 1000 / BRAKE_TICK_HZ;

    // Advance enough ticks for full deceleration to complete
    for (let i = 0; i < 100; i++) {
      adapter.emitMessage(makePortValuePacket(0x00, i));
      await vi.advanceTimersByTimeAsync(tickMs);
    }
    await brakePromise;

    const cmds = getStartSpeedPackets(adapter.sentPackets, 0x00);
    expect(cmds.length).toBeGreaterThanOrEqual(1);

    // Hold-brake (StartPower 0x51, mode 0x00, power 127) must be engaged at the end
    const driveMotorPackets = adapter.sentPackets.filter(
      (p) => p[2] === 0x81 && p[3] === 0x00,
    );
    const lastMotorPkt = driveMotorPackets[driveMotorPackets.length - 1]!;
    expect(lastMotorPkt[5]).toBe(0x51);
    expect(lastMotorPkt[6]).toBe(0x00);
    expect(lastMotorPkt[7]).toBe(127);

    // Prior to hold-brake, StartSpeed magnitudes should ramp down monotonically
    const rampMagnitudes = cmds.map((c) => Math.abs(c.speed));
    for (let i = 1; i < rampMagnitudes.length; i++) {
      expect(rampMagnitudes[i]!).toBeLessThanOrEqual(rampMagnitudes[i - 1]!);
    }

    expect(driver.getState()).toBe('READY');
  });

  it('CTL-06: brake(intensity, targetSpeedMps) ramps smoothly to a non-zero targetSpeedMps and remains in DRIVING without sending hold-brake 127', async () => {
    vi.useFakeTimers();
    await driver.connect();

    await driver.setSpeed(2.0);
    expect(driver.getState()).toBe('DRIVING');
    adapter.sentPackets.length = 0;

    const p = driver.brake(1.0, 1.0);
    const tickMs = 1000 / BRAKE_TICK_HZ;

    for (let i = 0; i < 40; i++) {
      adapter.emitMessage(makePortValuePacket(0x00, i));
      await vi.advanceTimersByTimeAsync(tickMs);
    }
    await p;

    const cmds = getStartSpeedPackets(adapter.sentPackets, 0x00);
    expect(cmds.length).toBeGreaterThanOrEqual(2);
    const magnitudes = cmds.map((c) => Math.abs(c.speed));
    for (let i = 1; i < magnitudes.length; i++) {
      expect(magnitudes[i]!).toBeLessThanOrEqual(magnitudes[i - 1]!);
    }
    expect(magnitudes[magnitudes.length - 1]!).toBe(
      Math.abs(calculateMotorSpeed(1.0, driver.getHubProfile()!, getVehicleProfile('42124'))),
    );

    const holdBrakePacket = adapter.sentPackets.find(
      (pkt) => pkt[2] === 0x81 && pkt[3] === 0x00 && pkt[5] === 0x51 && pkt[7] === 127,
    );
    expect(holdBrakePacket).toBeUndefined();
    expect(driver.getState()).toBe('DRIVING');
  });

  it('CTL-06: calling brake() or setSpeed() while a brake ramp is in progress aborts the previous brake timer cleanly', async () => {
    vi.useFakeTimers();
    await driver.connect();

    await driver.setSpeed(2.0);
    adapter.sentPackets.length = 0;

    const firstBrake = driver.brake(1.0, 1.0);
    const tickMs = 1000 / BRAKE_TICK_HZ;

    for (let i = 0; i < 2; i++) {
      adapter.emitMessage(makePortValuePacket(0x00, i));
      await vi.advanceTimersByTimeAsync(tickMs);
    }

    const secondBrake = driver.brake(1.0, 0);
    for (let i = 2; i < 60; i++) {
      adapter.emitMessage(makePortValuePacket(0x00, i));
      await vi.advanceTimersByTimeAsync(tickMs);
    }

    await Promise.all([firstBrake, secondBrake]);

    const driveMotorPackets = adapter.sentPackets.filter(
      (pkt) => pkt[2] === 0x81 && pkt[3] === 0x00,
    );
    const lastMotorPkt = driveMotorPackets[driveMotorPackets.length - 1]!;
    expect(lastMotorPkt[5]).toBe(0x51);
    expect(lastMotorPkt[6]).toBe(0x00);
    expect(lastMotorPkt[7]).toBe(127);
    expect(driver.getState()).toBe('READY');
  });

  it('UI-09 / UI-12 / UI-13: exports M2 tuning constants and pure helpers (calculateMaxSpeedMps, calculateTelemetrySpeedMps, calculateBrakeTapTargetMps, normalizeTiltAxis)', () => {
    expect(BRAKE_TAP_MAX_MS).toBeGreaterThan(0);
    expect(BRAKE_TAP_STEP_RATIO).toBeGreaterThan(0);
    expect(TILT_DEADZONE_DEG).toBeGreaterThan(0);
    expect(TILT_MAX_DEG).toBeGreaterThan(TILT_DEADZONE_DEG);

    const vehicle = getVehicleProfile('42124');
    const profile = getOrCreateHubProfile('hub-m2-helpers', 'M2 Hub', '42124');
    const expectedCircumferenceM = Math.PI * (profile.tireDiameterMm / 1000);
    const expectedMaxSpeedMps = 12 * expectedCircumferenceM * profile.calibration.kCal;

    expect(calculateMaxSpeedMps(profile, vehicle)).toBeCloseTo(expectedMaxSpeedMps, 6);

    // 42124 has drivePolarity = -1; negative encoder deg/s corresponds to positive forward m/s
    const forwardMps = calculateTelemetrySpeedMps(-360, profile, vehicle);
    expect(forwardMps).toBeCloseTo(expectedCircumferenceM * profile.calibration.kCal, 6);
    const reverseMps = calculateTelemetrySpeedMps(360, profile, vehicle);
    expect(reverseMps).toBeCloseTo(-expectedCircumferenceM * profile.calibration.kCal, 6);

    // calculateBrakeTapTargetMps steps toward 0 by maxSpeedMps * BRAKE_TAP_STEP_RATIO without crossing 0
    const maxMps = 2.0;
    const step = maxMps * BRAKE_TAP_STEP_RATIO;
    expect(calculateBrakeTapTargetMps(1.5, maxMps, BRAKE_TAP_STEP_RATIO)).toBeCloseTo(1.5 - step, 6);
    expect(calculateBrakeTapTargetMps(0.1, maxMps, BRAKE_TAP_STEP_RATIO)).toBe(0);
    expect(calculateBrakeTapTargetMps(-1.5, maxMps, BRAKE_TAP_STEP_RATIO)).toBeCloseTo(-1.5 + step, 6);
    expect(calculateBrakeTapTargetMps(-0.1, maxMps, BRAKE_TAP_STEP_RATIO)).toBe(0);

    // normalizeTiltAxis: 0 within ±TILT_DEADZONE_DEG, linear to ±TILT_MAX_DEG, clamped to [-1, 1]
    expect(normalizeTiltAxis(10, 10, TILT_DEADZONE_DEG, TILT_MAX_DEG)).toBe(0);
    expect(normalizeTiltAxis(10 + TILT_DEADZONE_DEG, 10, TILT_DEADZONE_DEG, TILT_MAX_DEG)).toBe(0);
    expect(normalizeTiltAxis(10 - TILT_DEADZONE_DEG, 10, TILT_DEADZONE_DEG, TILT_MAX_DEG)).toBe(0);

    const midDeg = (TILT_DEADZONE_DEG + TILT_MAX_DEG) / 2;
    expect(normalizeTiltAxis(10 + midDeg, 10, TILT_DEADZONE_DEG, TILT_MAX_DEG)).toBeCloseTo(0.5, 6);
    expect(normalizeTiltAxis(10 - midDeg, 10, TILT_DEADZONE_DEG, TILT_MAX_DEG)).toBeCloseTo(-0.5, 6);

    expect(normalizeTiltAxis(10 + TILT_MAX_DEG + 15, 10, TILT_DEADZONE_DEG, TILT_MAX_DEG)).toBe(1);
    expect(normalizeTiltAxis(10 - TILT_MAX_DEG - 15, 10, TILT_DEADZONE_DEG, TILT_MAX_DEG)).toBe(-1);
  });
});
