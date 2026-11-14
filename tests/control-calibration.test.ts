import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockHubAdapter } from '../src/mock-hub-adapter';
import { decodeLwpMessage } from '../src/lego-protocol';
import { listRememberedHubs, saveHubCalibration, updateHubParameters } from '../src/storage';
import {
  BRAKE_TICK_HZ,
  HOLD_BRAKE_SPEED_MPS,
  STALL_HOLD_MS,
  STALL_SPEED_DEG_S,
  TELEMETRY_MIN_HZ,
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

    // Port Input Format Setup (0x41) subscriptions for drive (0x00), steer (0x01), Hub Temp (0x3D)
    const subPackets = adapter.sentPackets.filter((p) => p.length >= 10 && p[2] === 0x41);
    for (const port of [0x00, 0x01, 0x3d]) {
      const sub = subPackets.find((p) => p[3] === port && p[9] === 0x01);
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
    expect(driveStartCmds.some((c) => c.speed !== 0)).toBe(true);

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
      await vi.advanceTimersByTimeAsync(tickMs);
    }
    await brakePromise;

    const cmds = getStartSpeedPackets(adapter.sentPackets, 0x00);
    expect(cmds.length).toBeGreaterThanOrEqual(2);

    // Hold-brake (127) must be engaged at the end, and NOT before deceleration completes
    const holdIdx = cmds.findIndex((c) => c.speed === 127);
    expect(holdIdx).toBeGreaterThan(0);
    expect(holdIdx).toBe(cmds.length - 1);

    // Prior to hold-brake, magnitudes should ramp down monotonically
    const rampMagnitudes = cmds.slice(0, holdIdx).map((c) => Math.abs(c.speed));
    for (let i = 1; i < rampMagnitudes.length; i++) {
      expect(rampMagnitudes[i]!).toBeLessThanOrEqual(rampMagnitudes[i - 1]!);
    }

    expect(driver.getState()).toBe('READY');
  });
});
