// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { MockHubAdapter } from './mock-hub-adapter';
import { encodeSetHubLed } from '../src/lego-protocol';
import { listRememberedHubs, saveHubCalibration } from '../src/storage';
import { LOW_BATTERY_CUTOFF_PCT } from '../src/vehicle-driver';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function makeBatteryPacket(pct: number): Uint8Array {
  return new Uint8Array([0x06, 0x00, 0x01, 0x06, 0x06, pct]);
}

function makeHubNamePacket(name: string): Uint8Array {
  const nameBytes = new TextEncoder().encode(name);
  const buf = new Uint8Array(5 + nameBytes.length);
  buf[0] = buf.length;
  buf[1] = 0x00;
  buf[2] = 0x01;
  buf[3] = 0x01;
  buf[4] = 0x06;
  buf.set(nameBytes, 5);
  return buf;
}

function makeAttachedIoPacket(port: number, ioTypeId: number): Uint8Array {
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

describe('Mobile Web App Shell, Lifecycle & Views (UI-01, UI-04..UI-08)', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let adapter: MockHubAdapter;
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
    adapter = new MockHubAdapter({ hubId: 'mock-hub', hubName: 'Buggy One' });
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
      root = null;
    }
    container?.remove();
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

  it('UI-01: keeps top header pinned across Connect, Calibrate, and Debug tabs with status, nickname, LED swatch, Battery %, Temp °C, and E-STOP / Resume while preserving VehicleDriver state', async () => {
    await act(async () => {
      root!.render(createElement(App, { adapter }));
    });

    await clickButton(container, /^connect$/i);

    await act(async () => {
      adapter.emitMessage(makeBatteryPacket(18));
      adapter.emitMessage(makePortValuePacket(0x3d, 320));
    });

    const header = container.querySelector('header');
    expect(header).not.toBeNull();
    expect(header?.textContent).toContain('Buggy One');
    expect(header?.textContent).toContain('18%');
    expect(header?.textContent).toContain('°C');
    expect(header?.querySelector('[data-testid="led-swatch"]')).not.toBeNull();
    expect(header?.querySelector('[data-battery-warning="true"]')).not.toBeNull();

    await clickButton(container, /e-stop|emergency stop/i);
    expect(
      adapter.sentPackets.some(
        (p) => p[2] === 0x81 && p[3] === 0x00 && p[5] === 0x51 && p[6] === 0x00 && p[7] === 0,
      ),
    ).toBe(true);
    expect(findButton(container, /resume/i)).toBeDefined();

    await clickButton(container, /resume/i);
    expect(findButton(container, /e-stop|emergency stop/i)).toBeDefined();

    await clickButton(container, /^calibrate$/i);
    expect(container.querySelector('header')?.textContent).toContain('Buggy One');
    expect(container.querySelector('header')?.textContent).toContain('18%');
    expect(adapter.isConnected()).toBe(true);

    await clickButton(container, /^debug$/i);
    expect(container.querySelector('header')?.textContent).toContain('Buggy One');
    expect(container.querySelector('header')?.textContent).toContain('18%');
    expect(adapter.isConnected()).toBe(true);
  });

  it('UI-04: Connect tab provides WebBLE connect, inline nickname edit, LED color picker (1..10), HubProfile summary with Tweak / Calibrate CTA, and Remembered Hubs Forget / Reset Calibration', async () => {
    await act(async () => {
      root!.render(createElement(App, { adapter }));
    });

    await clickButton(container, /^connect$/i);

    expect(container.textContent).toContain('42124');
    expect(container.textContent).toContain('Off-Road Buggy');

    const nicknameInput = container.querySelector(
      'input[aria-label="Hub Nickname"]',
    ) as HTMLInputElement | null;
    expect(nicknameInput).not.toBeNull();

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(nicknameInput, 'Desert Fox');
      nicknameInput!.dispatchEvent(new Event('input', { bubbles: true }));
      nicknameInput!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(listRememberedHubs()[0]?.name).toBe('Desert Fox');
    expect(container.querySelector('header')?.textContent).toContain('Desert Fox');

    adapter.sentPackets = [];
    const ledBtn = container.querySelector('button[aria-label="LED Color 5"]') as HTMLButtonElement | null;
    expect(ledBtn).not.toBeNull();
    await act(async () => {
      ledBtn!.click();
      await Promise.resolve();
    });

    expect(listRememberedHubs()[0]?.ledColor).toBe(5);
    const expectedLedPacket = encodeSetHubLed(5, 0x32);
    expect(
      adapter.sentPackets.some(
        (p) => p.length === expectedLedPacket.length && p.every((b, i) => b === expectedLedPacket[i]),
      ),
    ).toBe(true);

    await clickButton(container, /tweak\s*\/\s*calibrate/i);
    expect(findButton(container, /auto-calibrate steering/i)).toBeDefined();

    await clickButton(container, /^connect$/i);
    saveHubCalibration('mock-hub', { leftLimit: -90, rightLimit: 90, centerPos: 0, kCal: 1.25 });

    await clickButton(container, /reset calibration/i);
    expect(listRememberedHubs()[0]?.calibration.kCal).toBe(1.0);
    expect(listRememberedHubs()[0]?.calibration.leftLimit).toBeNull();

    await clickButton(container, /forget/i);
    expect(listRememberedHubs().some((h) => h.hubId === 'mock-hub')).toBe(false);
  });

  it('UI-05: Calibrate tab provides Official Vehicle Profile selector (42124 Off-Road Buggy), Auto-Calibrate Steering, 2-Step 1m Speed Calibration, and manual parameter inputs', async () => {
    await act(async () => {
      root!.render(createElement(App, { adapter }));
    });

    await clickButton(container, /^connect$/i);
    await clickButton(container, /^calibrate$/i);

    const profileSelect = container.querySelector(
      'select[aria-label="Vehicle Profile"]',
    ) as HTMLSelectElement | null;
    expect(profileSelect).not.toBeNull();
    expect(profileSelect?.value).toBe('42124');
    expect(profileSelect?.textContent).toContain('Off-Road Buggy');

    expect(findButton(container, /auto-calibrate steering/i)).toBeDefined();
    expect(findButton(container, /start 1m/i)).toBeDefined();

    const tireInput = container.querySelector(
      'input[aria-label="Wheel Diameter (mm)"]',
    ) as HTMLInputElement | null;
    const clampInput = container.querySelector(
      'input[aria-label="Steering Clamp Ratio"]',
    ) as HTMLInputElement | null;
    const brakeInput = container.querySelector(
      'input[aria-label="Default Brake Intensity"]',
    ) as HTMLInputElement | null;

    expect(tireInput).not.toBeNull();
    expect(clampInput).not.toBeNull();
    expect(brakeInput).not.toBeNull();

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(tireInput, '80');
      tireInput!.dispatchEvent(new Event('input', { bubbles: true }));
      tireInput!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(listRememberedHubs()[0]?.tireDiameterMm).toBe(80);
  });

  it('UI-06: Debug tab provides Forward/Reverse speed presets, steering slider, Progressive Brake button, live encoder telemetry, and LWP Hub Properties / Attached I/O inspector', async () => {
    await act(async () => {
      root!.render(createElement(App, { adapter }));
    });

    await clickButton(container, /^connect$/i);
    await clickButton(container, /^debug$/i);

    adapter.sentPackets = [];
    await clickButton(container, /forward/i);
    expect(adapter.sentPackets.some((p) => p[2] === 0x81 && p[3] === 0x00 && p[5] === 0x07)).toBe(true);

    expect(findButton(container, /reverse/i)).toBeDefined();
    expect(findButton(container, /brake/i)).toBeDefined();

    const steerSlider = container.querySelector(
      'input[type="range"][aria-label="Steering"]',
    ) as HTMLInputElement | null;
    expect(steerSlider).not.toBeNull();

    adapter.sentPackets = [];
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(steerSlider, '0.5');
      steerSlider!.dispatchEvent(new Event('input', { bubbles: true }));
      steerSlider!.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });

    expect(adapter.sentPackets.some((p) => p[2] === 0x81 && p[3] === 0x01 && p[5] === 0x0d)).toBe(true);

    await act(async () => {
      adapter.emitMessage(makePortValuePacket(0x00, 1234));
      adapter.emitMessage(makeHubNamePacket('Technic88012'));
      adapter.emitMessage(makeAttachedIoPacket(0x00, 0x002e));
    });

    expect(container.textContent).toContain('1234');
    expect(container.textContent).toContain('Technic88012');
    expect(container.textContent).toMatch(/0x002e|46/i);
  });

  it('UI-07: Connect tab renders compatibility warning banner advising Chrome over HTTPS and disables Connect button when navigator.bluetooth is undefined', async () => {
    Object.defineProperty(navigator, 'bluetooth', {
      value: undefined,
      configurable: true,
    });

    await act(async () => {
      root!.render(createElement(App, { adapter }));
    });

    expect(container.textContent).toMatch(/chrome/i);
    expect(container.textContent).toMatch(/https/i);
    const connectBtn = findButton(container, /^connect$/i);
    expect(connectBtn).toBeDefined();
    expect(connectBtn?.disabled).toBe(true);
  });

  it('UI-08: renders prominent low-battery cutoff message and disables driving and calibration controls when Hub Battery < LOW_BATTERY_CUTOFF_PCT', async () => {
    await act(async () => {
      root!.render(createElement(App, { adapter }));
    });

    await clickButton(container, /^connect$/i);

    await act(async () => {
      adapter.emitMessage(makeBatteryPacket(LOW_BATTERY_CUTOFF_PCT - 1));
    });

    expect(container.textContent).toMatch(/low.?battery|battery.*cutoff/i);

    await clickButton(container, /^calibrate$/i);
    expect(findButton(container, /auto-calibrate steering/i)?.disabled).toBe(true);
    expect(findButton(container, /start 1m/i)?.disabled).toBe(true);

    await clickButton(container, /^debug$/i);
    expect(findButton(container, /forward/i)?.disabled).toBe(true);
    expect(findButton(container, /reverse/i)?.disabled).toBe(true);
    expect(findButton(container, /brake/i)?.disabled).toBe(true);
    const steerSlider = container.querySelector(
      'input[type="range"][aria-label="Steering"]',
    ) as HTMLInputElement | null;
    expect(steerSlider?.disabled).toBe(true);
  });

  it('keeps driver listeners active under React StrictMode, maps LED 9=red / 10=white, and shows connect error alert', async () => {
    await act(async () => {
      root!.render(createElement(StrictMode, null, createElement(App, { adapter })));
    });

    await clickButton(container, /^connect$/i);
    await act(async () => {
      adapter.emitMessage(makeBatteryPacket(42));
    });
    expect(container.querySelector('header')?.textContent).toContain('42%');

    const led9Btn = container.querySelector('button[aria-label="LED Color 9"]') as HTMLButtonElement | null;
    expect(led9Btn).not.toBeNull();
    await act(async () => {
      led9Btn!.click();
    });
    const swatch = container.querySelector('[data-testid="led-swatch"]') as HTMLElement | null;
    expect(swatch?.style.backgroundColor).toBe('rgb(255, 0, 0)');

    const led10Btn = container.querySelector('button[aria-label="LED Color 10"]') as HTMLButtonElement | null;
    expect(led10Btn).not.toBeNull();
    await act(async () => {
      led10Btn!.click();
    });
    expect(swatch?.style.backgroundColor).toBe('rgb(255, 255, 255)');

    await clickButton(container, /^disconnect$/i);
    vi.spyOn(adapter, 'connect').mockRejectedValueOnce(new Error('Chooser cancelled'));
    await clickButton(container, /^connect$/i);
    expect(container.textContent).toContain('Chooser cancelled');
  });
});
