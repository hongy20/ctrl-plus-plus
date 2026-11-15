// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { calculateMaxSpeedMps } from '../src/driver/control';
import { getVehicleProfile } from '../src/profile';
import { getOrCreateHubProfile } from '../src/storage';
import {
  BRAKE_TAP_MAX_MS,
  BRAKE_TAP_STEP_RATIO,
  LOW_BATTERY_CUTOFF_PCT,
  TILT_DEADZONE_DEG,
  TILT_MAX_DEG,
  VehicleDriver,
} from '../src/vehicle-driver';
import { MockHubAdapter } from './mock-hub-adapter';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

function makeBatteryPacket(pct: number): Uint8Array {
  return new Uint8Array([0x06, 0x00, 0x01, 0x06, 0x06, pct]);
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

function findButton(container: HTMLElement, pattern: RegExp): HTMLButtonElement | undefined {
  const buttons = Array.from(container.querySelectorAll('button'));
  return buttons.find((btn) => pattern.test(btn.textContent ?? ''));
}

async function clickButton(container: HTMLElement, pattern: RegExp): Promise<HTMLButtonElement> {
  const btn = findButton(container, pattern);
  if (!btn) {
    throw new Error(`Button matching ${pattern} not found`);
  }
  await act(async () => {
    btn.click();
    await Promise.resolve();
  });
  return btn;
}

async function setRangeValue(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
  });
}

async function dispatchPointer(el: Element, type: 'pointerdown' | 'pointerup'): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new Event(type, { bubbles: true }));
    await Promise.resolve();
  });
}

async function dispatchTilt(beta: number, gamma: number): Promise<void> {
  await act(async () => {
    const event = new Event('deviceorientation') as Event & { beta: number; gamma: number };
    Object.defineProperty(event, 'beta', { value: beta });
    Object.defineProperty(event, 'gamma', { value: gamma });
    window.dispatchEvent(event);
    await Promise.resolve();
  });
}

describe('Drive Cockpit HUD (UI-01, UI-09..UI-13)', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let adapter: MockHubAdapter;
  let driver: VehicleDriver;
  let originalBluetoothDescriptor: PropertyDescriptor | undefined;
  let originalWakeLockDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage());
    originalBluetoothDescriptor = Object.getOwnPropertyDescriptor(navigator, 'bluetooth');
    originalWakeLockDescriptor = Object.getOwnPropertyDescriptor(navigator, 'wakeLock');

    Object.defineProperty(navigator, 'bluetooth', {
      value: { requestDevice: vi.fn() },
      configurable: true,
    });
    Object.defineProperty(navigator, 'wakeLock', {
      value: {
        request: vi.fn(async () => ({
          released: false,
          release: vi.fn(async () => undefined),
        })),
      },
      configurable: true,
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    adapter = new MockHubAdapter({ hubId: 'hub-drive', hubName: 'Buggy Drive' });
    driver = new VehicleDriver(adapter);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
      root = null;
    }
    driver.destroy();
    container?.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();

    if (originalBluetoothDescriptor) {
      Object.defineProperty(navigator, 'bluetooth', originalBluetoothDescriptor);
    } else {
      delete (navigator as { bluetooth?: unknown }).bluetooth;
    }

    if (originalWakeLockDescriptor) {
      Object.defineProperty(navigator, 'wakeLock', originalWakeLockDescriptor);
    } else {
      delete (navigator as { wakeLock?: unknown }).wakeLock;
    }

    vi.restoreAllMocks();
  });

  it('UI-01: navigating to Drive tab in App preserves shared VehicleDriver singleton and global safety header', async () => {
    await act(async () => {
      root!.render(createElement(App, { adapter, driver }));
    });

    await clickButton(container, /^connect$/i);

    await act(async () => {
      adapter.emitMessage(makeBatteryPacket(82));
      adapter.emitMessage(makePortValuePacket(0x3d, 315));
    });

    await clickButton(container, /^drive$/i);

    const header = container.querySelector('header');
    expect(header?.textContent).toContain('Buggy Drive');
    expect(header?.textContent).toContain('82%');
    expect(header?.textContent).toContain('°C');
    expect(findButton(container, /e-stop|emergency stop/i)).toBeDefined();
    expect(driver.getState()).toBe('READY');
    expect(container.querySelector('input[aria-label="Throttle"]')).not.toBeNull();
  });

  it('UI-09: Drive tab displays live Speed (m/s), Throttle %, and Steering angle gauges and disables controls when disconnected or below LOW_BATTERY_CUTOFF_PCT', async () => {
    vi.useFakeTimers();

    await act(async () => {
      root!.render(createElement(App, { adapter, driver }));
    });

    await clickButton(container, /^drive$/i);

    const throttleSlider = container.querySelector('input[aria-label="Throttle"]') as HTMLInputElement | null;
    const steerSlider = container.querySelector('input[aria-label="Steering"]') as HTMLInputElement | null;
    const brakeBtn = findButton(container, /^brake$/i);

    expect(throttleSlider?.disabled).toBe(true);
    expect(steerSlider?.disabled).toBe(true);
    expect(brakeBtn?.disabled).toBe(true);

    await clickButton(container, /^connect$/i);
    await clickButton(container, /^drive$/i);

    expect(throttleSlider?.disabled).toBe(false);
    expect(steerSlider?.disabled).toBe(false);
    expect(brakeBtn?.disabled).toBe(false);

    await act(async () => {
      adapter.emitMessage(makePortValuePacket(0x00, 0));
      vi.advanceTimersByTime(100);
      adapter.emitMessage(makePortValuePacket(0x00, -360));
      adapter.emitMessage(makePortValuePacket(0x01, 25));
    });

    expect(container.textContent).toContain('2.25 m/s');
    expect(container.textContent).toContain('25°');

    await act(async () => {
      adapter.emitMessage(makeBatteryPacket(LOW_BATTERY_CUTOFF_PCT - 5));
    });

    expect(throttleSlider?.disabled).toBe(true);
    expect(steerSlider?.disabled).toBe(true);
    expect(brakeBtn?.disabled).toBe(true);
  });

  it('UI-10: Touch mode horizontal steering slider commands setSteering and springs back to 0 on pointer release', async () => {
    const steerSpy = vi.spyOn(driver, 'setSteering');

    await act(async () => {
      root!.render(createElement(App, { adapter, driver }));
    });

    await clickButton(container, /^connect$/i);
    await clickButton(container, /^drive$/i);

    const steerSlider = container.querySelector('input[aria-label="Steering"]') as HTMLInputElement | null;
    expect(steerSlider).not.toBeNull();

    await setRangeValue(steerSlider!, '50');
    expect(steerSpy).toHaveBeenCalledWith(0.5);

    await dispatchPointer(steerSlider!, 'pointerup');
    expect(steerSlider!.value).toBe('0');
    expect(steerSpy).toHaveBeenLastCalledWith(0);
  });

  it('UI-11: Touch mode throttle slider ramps speed to 0 via brake() on release when Cruise Hold is OFF, and maintains target speed on release when Cruise Hold is ON', async () => {
    const speedSpy = vi.spyOn(driver, 'setSpeed');
    const brakeSpy = vi.spyOn(driver, 'brake');

    await act(async () => {
      root!.render(createElement(App, { adapter, driver }));
    });

    await clickButton(container, /^connect$/i);
    await clickButton(container, /^drive$/i);

    const throttleSlider = container.querySelector('input[aria-label="Throttle"]') as HTMLInputElement | null;
    expect(throttleSlider).not.toBeNull();

    // Cruise Hold OFF (default)
    await setRangeValue(throttleSlider!, '50');
    expect(speedSpy).toHaveBeenCalled();
    expect(speedSpy.mock.calls[0]![0]).toBeGreaterThan(0);

    await dispatchPointer(throttleSlider!, 'pointerup');
    expect(throttleSlider!.value).toBe('0');
    expect(brakeSpy).toHaveBeenCalledTimes(1);
    expect(brakeSpy.mock.calls[0]![1]).toBeUndefined();

    brakeSpy.mockClear();
    speedSpy.mockClear();

    // Toggle Cruise Hold ON
    const cruiseToggle =
      (container.querySelector('input[aria-label="Cruise Hold"]') as HTMLElement | null) ??
      findButton(container, /cruise/i);
    expect(cruiseToggle).not.toBeNull();

    await act(async () => {
      cruiseToggle!.click();
      await Promise.resolve();
    });

    await setRangeValue(throttleSlider!, '50');
    await dispatchPointer(throttleSlider!, 'pointerup');
    expect(brakeSpy).not.toHaveBeenCalled();
    expect(throttleSlider!.value).toBe('50');
  });

  it('UI-12: Tilt mode captures initial device orientation (beta, gamma) as neutral baseline, maps pitch/roll outside ±TILT_DEADZONE_DEG up to ±TILT_MAX_DEG to throttle and steering, and brakes + centers steering when toggled OFF', async () => {
    const speedSpy = vi.spyOn(driver, 'setSpeed');
    const steerSpy = vi.spyOn(driver, 'setSteering');
    const brakeSpy = vi.spyOn(driver, 'brake');

    await act(async () => {
      root!.render(createElement(App, { adapter, driver }));
    });

    await clickButton(container, /^connect$/i);
    await clickButton(container, /^drive$/i);

    await clickButton(container, /tilt/i);

    // First reading establishes baseline (beta=30, gamma=0)
    await dispatchTilt(30, 0);
    expect(speedSpy).not.toHaveBeenCalled();

    // Small tilt within ±TILT_DEADZONE_DEG stays in deadzone (target speed 0)
    await dispatchTilt(30 + TILT_DEADZONE_DEG - 1, TILT_DEADZONE_DEG - 1);
    expect(speedSpy).toHaveBeenLastCalledWith(0);

    // Deflect beyond TILT_DEADZONE_DEG up to TILT_MAX_DEG
    await dispatchTilt(30 + TILT_MAX_DEG, TILT_MAX_DEG);
    expect(speedSpy).toHaveBeenCalled();
    expect(speedSpy.mock.calls[speedSpy.mock.calls.length - 1]![0]).not.toBe(0);
    expect(steerSpy).toHaveBeenCalled();
    expect(steerSpy.mock.calls[steerSpy.mock.calls.length - 1]![0]).not.toBe(0);

    // Toggle back to Touch mode (Tilt OFF)
    await clickButton(container, /touch/i);
    expect(brakeSpy).toHaveBeenCalled();
    expect(steerSpy).toHaveBeenLastCalledWith(0);
  });

  it('UI-13: tapping Brake (< BRAKE_TAP_MAX_MS) steps target speed toward 0 by BRAKE_TAP_STEP_RATIO and ramps via brake(undefined, targetMps); holding Brake (>= BRAKE_TAP_MAX_MS) ramps all the way to 0 via brake()', async () => {
    vi.useFakeTimers();
    const brakeSpy = vi.spyOn(driver, 'brake');

    await act(async () => {
      root!.render(createElement(App, { adapter, driver }));
    });

    await clickButton(container, /^connect$/i);
    await clickButton(container, /^drive$/i);

    const cruiseToggle =
      (container.querySelector('input[aria-label="Cruise Hold"]') as HTMLElement | null) ??
      findButton(container, /cruise/i);
    expect(cruiseToggle).not.toBeNull();
    await act(async () => {
      cruiseToggle!.click();
      await Promise.resolve();
    });

    const throttleSlider = container.querySelector('input[aria-label="Throttle"]') as HTMLInputElement | null;
    expect(throttleSlider).not.toBeNull();
    await setRangeValue(throttleSlider!, '100');

    const vehicle = getVehicleProfile('42124');
    const profile = getOrCreateHubProfile('hub-drive', 'Buggy Drive', '42124');
    const maxSpeedMps = calculateMaxSpeedMps(profile, vehicle);
    const expectedSteppedMps = maxSpeedMps * (1 - BRAKE_TAP_STEP_RATIO);

    const brakeBtn = findButton(container, /^brake$/i);
    expect(brakeBtn).toBeDefined();

    // Tap (< BRAKE_TAP_MAX_MS)
    await dispatchPointer(brakeBtn!, 'pointerdown');
    await act(async () => {
      vi.advanceTimersByTime(Math.max(50, BRAKE_TAP_MAX_MS - 100));
    });
    await dispatchPointer(brakeBtn!, 'pointerup');

    expect(brakeSpy).toHaveBeenCalledTimes(1);
    expect(brakeSpy.mock.calls[0]![0]).toBeUndefined();
    expect(brakeSpy.mock.calls[0]![1]).toBeCloseTo(expectedSteppedMps, 4);
    expect(container.textContent).toContain('80%');

    brakeSpy.mockClear();

    // Hold (>= BRAKE_TAP_MAX_MS)
    await dispatchPointer(brakeBtn!, 'pointerdown');
    await act(async () => {
      vi.advanceTimersByTime(BRAKE_TAP_MAX_MS);
    });

    expect(brakeSpy).toHaveBeenCalledTimes(1);
    expect(brakeSpy.mock.calls[0]![1]).toBeUndefined();
    expect(throttleSlider!.value).toBe('0');

    await dispatchPointer(brakeBtn!, 'pointerup');
  });
});
