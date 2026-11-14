import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockHubAdapter } from '../src/hub-adapter';
import { attachMobileLifecycleGuards } from '../src/lifecycle';
import { VehicleDriver, WATCHDOG_TIMEOUT_MS } from '../src/vehicle-driver';

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

function getStartSpeedPackets(
  packets: Uint8Array[],
  port: number,
): Array<{ speed: number; maxPower: number }> {
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

function createMockLifecycleTargets(initialVisibility: DocumentVisibilityState = 'visible') {
  const docTarget = new EventTarget();
  const winTarget = new EventTarget();

  const documentObj = {
    visibilityState: initialVisibility,
    addEventListener: docTarget.addEventListener.bind(docTarget),
    removeEventListener: docTarget.removeEventListener.bind(docTarget),
    dispatchVisibilityChange(state: DocumentVisibilityState) {
      this.visibilityState = state;
      docTarget.dispatchEvent(new Event('visibilitychange'));
    },
  };

  const windowObj = {
    addEventListener: winTarget.addEventListener.bind(winTarget),
    removeEventListener: winTarget.removeEventListener.bind(winTarget),
    dispatchPageHide() {
      winTarget.dispatchEvent(new Event('pagehide'));
    },
  };

  const sentinel = {
    released: false,
    release: vi.fn(async () => {
      sentinel.released = true;
    }),
  };

  const navigatorObj = {
    wakeLock: {
      request: vi.fn(async (_type: 'screen') => sentinel),
    },
  };

  return { documentObj, windowObj, navigatorObj, sentinel };
}

describe('Safety Watchdog, E-Stop & Mobile Lifecycle (CTL-07, CTL-08, UI-02, UI-03)', () => {
  let adapter: MockHubAdapter;
  let driver: VehicleDriver;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', createMemoryStorage());
    adapter = new MockHubAdapter();
    driver = new VehicleDriver(adapter);
  });

  afterEach(() => {
    driver.destroy();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('CTL-07: triggers EMERGENCY_STOP and cuts drive/steer power to 0 when telemetry lags > WATCHDOG_TIMEOUT_MS while DRIVING', async () => {
    await driver.connect();
    await driver.setSpeed(1.0);
    expect(driver.getState()).toBe('DRIVING');

    adapter.sentPackets = [];
    vi.advanceTimersByTime(WATCHDOG_TIMEOUT_MS + 1);

    expect(driver.getState()).toBe('EMERGENCY_STOP');
    const driveCmds = getStartSpeedPackets(adapter.sentPackets, 0x00);
    const steerCmds = getStartSpeedPackets(adapter.sentPackets, 0x01);
    expect(driveCmds.some((c) => c.speed === 0)).toBe(true);
    expect(steerCmds.some((c) => c.speed === 0)).toBe(true);
  });

  it('CTL-07: resets watchdog timer when telemetry arrives within WATCHDOG_TIMEOUT_MS and triggers after subsequent timeout', async () => {
    await driver.connect();
    await driver.setSpeed(1.0);
    expect(driver.getState()).toBe('DRIVING');

    vi.advanceTimersByTime(WATCHDOG_TIMEOUT_MS - 50);
    adapter.emitMessage(makePortValuePacket(0x00, 42));
    expect(driver.getState()).toBe('DRIVING');

    vi.advanceTimersByTime(WATCHDOG_TIMEOUT_MS - 50);
    expect(driver.getState()).toBe('DRIVING');

    vi.advanceTimersByTime(51);
    expect(driver.getState()).toBe('EMERGENCY_STOP');
  });

  it('CTL-07: triggers EMERGENCY_STOP and cuts drive/steer power to 0 when telemetry lags > WATCHDOG_TIMEOUT_MS while CALIBRATING', async () => {
    await driver.connect();
    const calPromise = driver.startSpeedCalRun();
    expect(driver.getState()).toBe('CALIBRATING');

    adapter.sentPackets = [];
    vi.advanceTimersByTime(WATCHDOG_TIMEOUT_MS + 1);

    expect(driver.getState()).toBe('EMERGENCY_STOP');
    const driveCmds = getStartSpeedPackets(adapter.sentPackets, 0x00);
    const steerCmds = getStartSpeedPackets(adapter.sentPackets, 0x01);
    expect(driveCmds.some((c) => c.speed === 0)).toBe(true);
    expect(steerCmds.some((c) => c.speed === 0)).toBe(true);

    void calPromise;
  });

  it('CTL-07: transitions to EMERGENCY_STOP when BLE disconnects while DRIVING or CALIBRATING', async () => {
    await driver.connect();
    await driver.setSpeed(1.0);
    expect(driver.getState()).toBe('DRIVING');

    adapter.simulateDisconnect();
    expect(driver.getState()).toBe('EMERGENCY_STOP');

    await driver.connect().catch(() => undefined);
    const freshAdapter = new MockHubAdapter();
    const freshDriver = new VehicleDriver(freshAdapter);
    await freshDriver.connect();
    void freshDriver.startSpeedCalRun();
    expect(freshDriver.getState()).toBe('CALIBRATING');

    freshAdapter.simulateDisconnect();
    expect(freshDriver.getState()).toBe('EMERGENCY_STOP');
    freshDriver.destroy();
  });

  it('CTL-08: emergencyStop() from READY, DRIVING, and CALIBRATING sends power 0 on drive and steer ports and enters EMERGENCY_STOP', async () => {
    await driver.connect();
    expect(driver.getState()).toBe('READY');

    adapter.sentPackets = [];
    await driver.emergencyStop();
    expect(driver.getState()).toBe('EMERGENCY_STOP');
    expect(getStartSpeedPackets(adapter.sentPackets, 0x00).some((c) => c.speed === 0)).toBe(true);
    expect(getStartSpeedPackets(adapter.sentPackets, 0x01).some((c) => c.speed === 0)).toBe(true);

    await driver.resetEmergencyStop();
    await driver.setSpeed(1.0);
    expect(driver.getState()).toBe('DRIVING');

    adapter.sentPackets = [];
    await driver.emergencyStop();
    expect(driver.getState()).toBe('EMERGENCY_STOP');
    expect(getStartSpeedPackets(adapter.sentPackets, 0x00).some((c) => c.speed === 0)).toBe(true);
    expect(getStartSpeedPackets(adapter.sentPackets, 0x01).some((c) => c.speed === 0)).toBe(true);

    await driver.resetEmergencyStop();
    void driver.startSpeedCalRun();
    expect(driver.getState()).toBe('CALIBRATING');

    adapter.sentPackets = [];
    await driver.emergencyStop();
    expect(driver.getState()).toBe('EMERGENCY_STOP');
    expect(getStartSpeedPackets(adapter.sentPackets, 0x00).some((c) => c.speed === 0)).toBe(true);
    expect(getStartSpeedPackets(adapter.sentPackets, 0x01).some((c) => c.speed === 0)).toBe(true);
  });

  it('CTL-08: resetEmergencyStop() returns to READY while BLE is connected and rejects when BLE is disconnected', async () => {
    await driver.connect();
    await driver.emergencyStop();
    expect(driver.getState()).toBe('EMERGENCY_STOP');

    await driver.resetEmergencyStop();
    expect(driver.getState()).toBe('READY');

    await driver.setSpeed(1.0);
    adapter.simulateDisconnect();
    expect(driver.getState()).toBe('EMERGENCY_STOP');
    expect(adapter.isConnected()).toBe(false);

    await expect(driver.resetEmergencyStop()).rejects.toThrow();
  });

  it('UI-02: requests screen Wake Lock on mount while visible and re-acquires it when visibilityState becomes visible', async () => {
    const { documentObj, windowObj, navigatorObj } = createMockLifecycleTargets('visible');

    const cleanup = attachMobileLifecycleGuards({
      driver,
      navigatorObj,
      documentObj,
      windowObj,
    });

    await Promise.resolve();
    expect(navigatorObj.wakeLock.request).toHaveBeenCalledTimes(1);
    expect(navigatorObj.wakeLock.request).toHaveBeenCalledWith('screen');

    documentObj.dispatchVisibilityChange('hidden');
    documentObj.dispatchVisibilityChange('visible');

    await Promise.resolve();
    expect(navigatorObj.wakeLock.request).toHaveBeenCalledTimes(2);
    expect(navigatorObj.wakeLock.request).toHaveBeenLastCalledWith('screen');

    cleanup();
  });

  it('UI-03: synchronously calls emergencyStop() and disconnect() when visibilityState becomes hidden or pagehide fires', () => {
    const { documentObj, windowObj, navigatorObj } = createMockLifecycleTargets('visible');
    const emergencyStopSpy = vi.spyOn(driver, 'emergencyStop');
    const disconnectSpy = vi.spyOn(driver, 'disconnect');

    const cleanup = attachMobileLifecycleGuards({
      driver,
      navigatorObj,
      documentObj,
      windowObj,
    });

    documentObj.dispatchVisibilityChange('hidden');
    expect(emergencyStopSpy).toHaveBeenCalledTimes(1);
    expect(disconnectSpy).toHaveBeenCalledTimes(1);

    windowObj.dispatchPageHide();
    expect(emergencyStopSpy).toHaveBeenCalledTimes(2);
    expect(disconnectSpy).toHaveBeenCalledTimes(2);

    cleanup();
  });

  it('UI-03: cleanup removes event listeners and releases any held WakeLockSentinel', async () => {
    const { documentObj, windowObj, navigatorObj, sentinel } = createMockLifecycleTargets('visible');
    const emergencyStopSpy = vi.spyOn(driver, 'emergencyStop');
    const disconnectSpy = vi.spyOn(driver, 'disconnect');

    const cleanup = attachMobileLifecycleGuards({
      driver,
      navigatorObj,
      documentObj,
      windowObj,
    });

    await Promise.resolve();
    cleanup();

    expect(sentinel.release).toHaveBeenCalledTimes(1);

    documentObj.dispatchVisibilityChange('hidden');
    windowObj.dispatchPageHide();
    expect(emergencyStopSpy).not.toHaveBeenCalled();
    expect(disconnectSpy).not.toHaveBeenCalled();
  });
});
