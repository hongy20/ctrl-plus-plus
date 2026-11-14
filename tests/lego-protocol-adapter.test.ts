import { describe, it, expect, vi, afterEach } from 'vitest';
import type { HubAdapter } from '../src/contracts';
import {
  LWP_SERVICE_UUID,
  LWP_CHARACTERISTIC_UUID,
  WebBleHubAdapter,
} from '../src/hub-adapter';
import { MockHubAdapter } from '../src/mock-hub-adapter';
import {
  encodeHubProperty,
  encodePortInputFormatSetup,
  encodeStartSpeed,
  encodeGoToAbsolutePosition,
  encodeSetHubLed,
  decodeLwpMessage,
} from '../src/lego-protocol';

describe('HubAdapter & WebBLE Transport (CTL-01)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('CTL-01: WebBleHubAdapter.connect() requests device with LWP service UUID, connects GATT, starts notifications, and wires message/disconnect/send/disconnect', async () => {
    const listeners: Record<string, Array<(event: Event) => void>> = {};
    const writeValueWithResponse = vi.fn().mockResolvedValue(undefined);
    const startNotifications = vi.fn().mockResolvedValue(undefined);
    const gattDisconnect = vi.fn();

    const mockCharacteristic = {
      uuid: LWP_CHARACTERISTIC_UUID,
      startNotifications,
      writeValueWithResponse,
      addEventListener: vi.fn((type: string, cb: (event: Event) => void) => {
        listeners[type] ??= [];
        listeners[type].push(cb);
      }),
      removeEventListener: vi.fn(),
    };

    const mockService = {
      getCharacteristic: vi.fn().mockResolvedValue(mockCharacteristic),
    };

    const mockGatt = {
      connected: true,
      connect: vi.fn().mockImplementation(async () => mockGatt),
      disconnect: gattDisconnect,
      getPrimaryService: vi.fn().mockResolvedValue(mockService),
    };

    const mockDevice = {
      id: 'hub-ble-01',
      name: 'TechnicHub 88012',
      gatt: mockGatt,
      addEventListener: vi.fn((type: string, cb: (event: Event) => void) => {
        listeners[type] ??= [];
        listeners[type].push(cb);
      }),
      removeEventListener: vi.fn(),
    };

    const requestDevice = vi.fn().mockResolvedValue(mockDevice);
    vi.stubGlobal('navigator', {
      bluetooth: { requestDevice },
    });

    const adapter: HubAdapter = new WebBleHubAdapter();
    expect(adapter.isConnected()).toBe(false);

    await adapter.connect();

    expect(requestDevice).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [{ services: [LWP_SERVICE_UUID] }],
      }),
    );
    expect(mockGatt.connect).toHaveBeenCalledTimes(1);
    expect(mockGatt.getPrimaryService).toHaveBeenCalledWith(LWP_SERVICE_UUID);
    expect(mockService.getCharacteristic).toHaveBeenCalledWith(
      LWP_CHARACTERISTIC_UUID,
    );
    expect(startNotifications).toHaveBeenCalledTimes(1);
    expect(adapter.isConnected()).toBe(true);
    expect(adapter.getHubId()).toBe('hub-ble-01');
    expect(adapter.getHubName()).toBe('TechnicHub 88012');

    // Verify onMessage receives characteristicvaluechanged bytes
    const received: Uint8Array[] = [];
    const unsubMessage = adapter.onMessage((pkt) => received.push(pkt));
    const incoming = new Uint8Array([0x06, 0x00, 0x01, 0x06, 0x06, 0x55]);
    const charEvent = {
      target: {
        value: new DataView(incoming.buffer),
      },
    } as unknown as Event;
    for (const cb of listeners['characteristicvaluechanged'] ?? []) {
      cb(charEvent);
    }
    expect(received).toHaveLength(1);
    expect(Array.from(received[0])).toEqual(Array.from(incoming));
    unsubMessage();

    // Verify send writes packet to characteristic
    const outgoing = new Uint8Array([0x08, 0x00, 0x81, 0x32, 0x11, 0x51, 0x00, 0x03]);
    await adapter.send(outgoing);
    expect(writeValueWithResponse).toHaveBeenCalledWith(outgoing);

    // Verify onDisconnect fires on gattserverdisconnected
    const onDisconnectSpy = vi.fn();
    adapter.onDisconnect(onDisconnectSpy);
    mockGatt.connected = false;
    for (const cb of listeners['gattserverdisconnected'] ?? []) {
      cb(new Event('gattserverdisconnected'));
    }
    expect(onDisconnectSpy).toHaveBeenCalledTimes(1);
    expect(adapter.isConnected()).toBe(false);

    // Verify disconnect() invokes gatt.disconnect()
    await adapter.disconnect();
    expect(gattDisconnect).toHaveBeenCalledTimes(1);
  });

  it('CTL-01: MockHubAdapter implements HubAdapter, records sentPackets, emits messages, simulates disconnect, and supports unsubscribe', async () => {
    const mock = new MockHubAdapter({
      hubId: 'mock-hub-1',
      hubName: 'Mock TechnicHub',
    });
    const adapter: HubAdapter = mock;

    expect(adapter.isConnected()).toBe(false);
    await adapter.connect();
    expect(adapter.isConnected()).toBe(true);
    expect(adapter.getHubId()).toBe('mock-hub-1');
    expect(adapter.getHubName()).toBe('Mock TechnicHub');

    const pkt1 = new Uint8Array([0x05, 0x00, 0x01, 0x06, 0x05]);
    await adapter.send(pkt1);
    expect(mock.sentPackets).toHaveLength(1);
    expect(Array.from(mock.sentPackets[0])).toEqual(Array.from(pkt1));

    const msgSpy = vi.fn();
    const unsubMsg = adapter.onMessage(msgSpy);
    const rx = new Uint8Array([0x06, 0x00, 0x01, 0x06, 0x06, 0x64]);
    mock.emitMessage(rx);
    expect(msgSpy).toHaveBeenCalledWith(rx);
    unsubMsg();
    mock.emitMessage(rx);
    expect(msgSpy).toHaveBeenCalledTimes(1);

    const discSpy = vi.fn();
    const unsubDisc = adapter.onDisconnect(discSpy);
    mock.simulateDisconnect();
    expect(discSpy).toHaveBeenCalledTimes(1);
    expect(adapter.isConnected()).toBe(false);
    unsubDisc();

    await adapter.connect();
    expect(adapter.isConnected()).toBe(true);
    await adapter.disconnect();
    expect(adapter.isConnected()).toBe(false);
  });

  it('CTL-01: connect() rejects while already connected or connecting', async () => {
    let resolveRequestDevice!: (value: unknown) => void;
    const requestDevicePromise = new Promise((resolve) => {
      resolveRequestDevice = resolve;
    });

    const mockCharacteristic = {
      uuid: LWP_CHARACTERISTIC_UUID,
      startNotifications: vi.fn().mockResolvedValue(undefined),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const mockService = {
      getCharacteristic: vi.fn().mockResolvedValue(mockCharacteristic),
    };
    const mockGatt = {
      connected: true,
      connect: vi.fn().mockImplementation(async () => mockGatt),
      disconnect: vi.fn(),
      getPrimaryService: vi.fn().mockResolvedValue(mockService),
    };
    const mockDevice = {
      id: 'hub-ble-02',
      name: 'TechnicHub Reconnect',
      gatt: mockGatt,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    const requestDevice = vi.fn().mockReturnValue(requestDevicePromise);
    vi.stubGlobal('navigator', { bluetooth: { requestDevice } });

    const adapter = new WebBleHubAdapter();
    const connectPromise1 = adapter.connect();

    // While connecting, another connect() call should reject immediately
    await expect(adapter.connect()).rejects.toThrow('Already connected or connecting');

    // Finish connecting
    resolveRequestDevice(mockDevice);
    await connectPromise1;
    expect(adapter.isConnected()).toBe(true);

    // While already connected, connect() should reject
    await expect(adapter.connect()).rejects.toThrow('Already connected or connecting');
  });

  it('CTL-01: connect() rolls back GATT/listeners when startNotifications() fails', async () => {
    const gattDisconnect = vi.fn();
    const charRemoveListener = vi.fn();
    const deviceRemoveListener = vi.fn();

    const mockCharacteristic = {
      uuid: LWP_CHARACTERISTIC_UUID,
      startNotifications: vi.fn().mockRejectedValue(new Error('Notification failure')),
      addEventListener: vi.fn(),
      removeEventListener: charRemoveListener,
    };
    const mockService = {
      getCharacteristic: vi.fn().mockResolvedValue(mockCharacteristic),
    };
    const mockGatt = {
      connected: true,
      connect: vi.fn().mockImplementation(async () => mockGatt),
      disconnect: gattDisconnect,
      getPrimaryService: vi.fn().mockResolvedValue(mockService),
    };
    const mockDevice = {
      id: 'hub-ble-03',
      name: 'TechnicHub Fail',
      gatt: mockGatt,
      addEventListener: vi.fn(),
      removeEventListener: deviceRemoveListener,
    };

    const requestDevice = vi.fn().mockResolvedValue(mockDevice);
    vi.stubGlobal('navigator', { bluetooth: { requestDevice } });

    const adapter = new WebBleHubAdapter();
    await expect(adapter.connect()).rejects.toThrow('Notification failure');

    expect(charRemoveListener).toHaveBeenCalledWith(
      'characteristicvaluechanged',
      expect.any(Function),
    );
    expect(deviceRemoveListener).toHaveBeenCalledWith(
      'gattserverdisconnected',
      expect.any(Function),
    );
    expect(gattDisconnect).toHaveBeenCalledTimes(1);
    expect(adapter.isConnected()).toBe(false);
    expect(adapter.getHubId()).toBeNull();
    expect(adapter.getHubName()).toBeNull();
  });

  it('CTL-01: disconnect() during pending requestDevice() aborts connect()', async () => {
    let resolveDevice!: (val: unknown) => void;
    const pendingDevice = new Promise((resolve) => {
      resolveDevice = resolve;
    });

    const mockDevice = {
      id: 'hub-ble-04',
      name: 'TechnicHub Abort',
      gatt: {
        connected: false,
        connect: vi.fn(),
        disconnect: vi.fn(),
        getPrimaryService: vi.fn(),
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    const requestDevice = vi.fn().mockReturnValue(pendingDevice);
    vi.stubGlobal('navigator', { bluetooth: { requestDevice } });

    const adapter = new WebBleHubAdapter();
    const connectPromise = adapter.connect();

    await adapter.disconnect();

    resolveDevice(mockDevice);
    await expect(connectPromise).rejects.toThrow('Connection aborted');
    expect(adapter.isConnected()).toBe(false);
    expect(adapter.getHubId()).toBeNull();
    expect(adapter.getHubName()).toBeNull();
  });
});

describe('LEGO Wireless Protocol v3 Codec (CTL-02)', () => {
  it('CTL-02: encodeHubProperty encodes Request Update (0x05) and Enable Updates (0x02) for properties 0x01..0x0D', () => {
    for (let prop = 0x01; prop <= 0x0d; prop += 1) {
      const req = encodeHubProperty(prop, 0x05);
      expect(Array.from(req)).toEqual([0x05, 0x00, 0x01, prop, 0x05]);

      const sub = encodeHubProperty(prop, 0x02);
      expect(Array.from(sub)).toEqual([0x05, 0x00, 0x01, prop, 0x02]);
    }
  });

  it('CTL-02: decodeLwpMessage decodes Hub Property Update (0x06) for Advertising Name, Battery Level, RSSI, MAC Address, and FW/HW versions', () => {
    // 0x01 Advertising Name (UTF-8)
    const nameBytes = new TextEncoder().encode('TechnicHub');
    const namePkt = new Uint8Array([
      5 + nameBytes.length,
      0x00,
      0x01,
      0x01,
      0x06,
      ...nameBytes,
    ]);
    expect(decodeLwpMessage(namePkt)).toMatchObject({
      messageType: 0x01,
      property: 0x01,
      operation: 0x06,
      value: 'TechnicHub',
    });

    // 0x06 Battery Level (uint8 %)
    const battPkt = new Uint8Array([0x06, 0x00, 0x01, 0x06, 0x06, 87]);
    expect(decodeLwpMessage(battPkt)).toMatchObject({
      messageType: 0x01,
      property: 0x06,
      operation: 0x06,
      value: 87,
    });

    // 0x05 RSSI (int8 dBm, e.g. -55 = 0xC9)
    const rssiPkt = new Uint8Array([0x06, 0x00, 0x01, 0x05, 0x06, 0xc9]);
    expect(decodeLwpMessage(rssiPkt)).toMatchObject({
      messageType: 0x01,
      property: 0x05,
      operation: 0x06,
      value: -55,
    });

    // 0x0D Primary MAC Address (6-byte formatted hex)
    const macPkt = new Uint8Array([
      0x0b, 0x00, 0x01, 0x0d, 0x06, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
    ]);
    expect(decodeLwpMessage(macPkt)).toMatchObject({
      messageType: 0x01,
      property: 0x0d,
      operation: 0x06,
      value: 'AA:BB:CC:DD:EE:FF',
    });

    // 0x03 FW Version & 0x04 HW Version (4-byte version)
    const fwPkt = new Uint8Array([
      0x09, 0x00, 0x01, 0x03, 0x06, 0x01, 0x00, 0x02, 0x11,
    ]);
    const fwDecoded = decodeLwpMessage(fwPkt);
    expect(fwDecoded).toMatchObject({
      messageType: 0x01,
      property: 0x03,
      operation: 0x06,
    });
    expect(typeof (fwDecoded as { value: unknown }).value).toBe('string');
    expect(((fwDecoded as { value: string }).value).length).toBeGreaterThan(0);

    const hwPkt = new Uint8Array([
      0x09, 0x00, 0x01, 0x04, 0x06, 0x00, 0x00, 0x00, 0x10,
    ]);
    const hwDecoded = decodeLwpMessage(hwPkt);
    expect(hwDecoded).toMatchObject({
      messageType: 0x01,
      property: 0x04,
      operation: 0x06,
    });
    expect(typeof (hwDecoded as { value: unknown }).value).toBe('string');
    expect(((hwDecoded as { value: string }).value).length).toBeGreaterThan(0);
  });

  it('CTL-02: decodeLwpMessage decodes FW/HW versions using LWP v3 BCD decimal digits', () => {
    const bcdPkt = new Uint8Array([
      0x09, 0x00, 0x01, 0x03, 0x06, 0x10, 0x15, 0x37, 0x17,
    ]);
    const decoded = decodeLwpMessage(bcdPkt);
    expect(decoded).toMatchObject({
      messageType: 0x01,
      property: 0x03,
      operation: 0x06,
      value: '1.7.37.1510',
    });
  });

  it('CTL-02: decodeLwpMessage decodes Attached I/O (0x04) for attached and detached ports', () => {
    const detachedPkt = new Uint8Array([0x05, 0x00, 0x04, 0x01, 0x00]);
    expect(decodeLwpMessage(detachedPkt)).toMatchObject({
      messageType: 0x04,
      port: 0x01,
      event: 0x00,
      attached: false,
    });

    const attachedPkt = new Uint8Array([
      0x0f, 0x00, 0x04, 0x00, 0x01, 0x2e, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00,
      0x00, 0x00, 0x01,
    ]);
    expect(decodeLwpMessage(attachedPkt)).toMatchObject({
      messageType: 0x04,
      port: 0x00,
      event: 0x01,
      attached: true,
      ioTypeId: 0x002e,
    });
  });

  it('CTL-02: encodePortInputFormatSetup encodes 0x41 with port, mode, little-endian uint32 deltaInterval, and notificationEnabled', () => {
    const pkt1 = encodePortInputFormatSetup(0x00, 0x02, 5, true);
    expect(Array.from(pkt1)).toEqual([
      0x0a, 0x00, 0x41, 0x00, 0x02, 0x05, 0x00, 0x00, 0x00, 0x01,
    ]);

    const pkt2 = encodePortInputFormatSetup(0x01, 0x03, 0x01020304, false);
    expect(Array.from(pkt2)).toEqual([
      0x0a, 0x00, 0x41, 0x01, 0x03, 0x04, 0x03, 0x02, 0x01, 0x00,
    ]);
  });

  it('CTL-02: decodeLwpMessage decodes Port Value (0x45) for int8, int16, int32 little-endian and Hub Temperature Port 0x3D', () => {
    // int8: -42 (0xD6)
    const int8Pkt = new Uint8Array([0x05, 0x00, 0x45, 0x00, 0xd6]);
    expect(decodeLwpMessage(int8Pkt)).toMatchObject({
      messageType: 0x45,
      port: 0x00,
      value: -42,
    });

    // int16 LE: -300 (0xFED4 -> 0xD4, 0xFE)
    const int16Pkt = new Uint8Array([0x06, 0x00, 0x45, 0x01, 0xd4, 0xfe]);
    expect(decodeLwpMessage(int16Pkt)).toMatchObject({
      messageType: 0x45,
      port: 0x01,
      value: -300,
    });

    // int32 LE: -100000 (0xFFFE7960 -> 0x60, 0x79, 0xFE, 0xFF)
    const int32Pkt = new Uint8Array([
      0x08, 0x00, 0x45, 0x02, 0x60, 0x79, 0xfe, 0xff,
    ]);
    expect(decodeLwpMessage(int32Pkt)).toMatchObject({
      messageType: 0x45,
      port: 0x02,
      value: -100000,
    });

    // Hub Temperature Port 0x3D: 255 (25.5 C -> 0xFF, 0x00)
    const tempPkt = new Uint8Array([0x06, 0x00, 0x45, 0x3d, 0xff, 0x00]);
    expect(decodeLwpMessage(tempPkt)).toMatchObject({
      messageType: 0x45,
      port: 0x3d,
      value: 255,
    });
  });

  it('CTL-02: encodeStartSpeed, encodeGoToAbsolutePosition, and encodeSetHubLed encode 0x81 Port Output commands', () => {
    const speedPkt = encodeStartSpeed(0x00, -50, 100, 0);
    expect(Array.from(speedPkt)).toEqual([
      0x09, 0x00, 0x81, 0x00, 0x11, 0x07, 0xce, 100, 0x00,
    ]);

    const absPosPkt = encodeGoToAbsolutePosition(0x01, -90, 50, 100, 127, 0);
    expect(Array.from(absPosPkt)).toEqual([
      0x0e, 0x00, 0x81, 0x01, 0x11, 0x0d, 0xa6, 0xff, 0xff, 0xff, 50, 100,
      127, 0x00,
    ]);

    const ledPkt = encodeSetHubLed(0x03);
    expect(Array.from(ledPkt)).toEqual([
      0x08, 0x00, 0x81, 0x32, 0x11, 0x51, 0x00, 0x03,
    ]);
  });
});

describe('Non-Invasive Hardware Principle (CTL-09)', () => {
  it('CTL-09: encodeHubProperty rejects persistent or mutating operations (0x01 Set, 0x04 Reset) and allows volatile operations (0x02, 0x03, 0x05)', () => {
    expect(() => encodeHubProperty(0x01, 0x01 as never)).toThrow();
    expect(() => encodeHubProperty(0x01, 0x04 as never)).toThrow();

    expect(() => encodeHubProperty(0x01, 0x02)).not.toThrow();
    expect(() => encodeHubProperty(0x01, 0x03)).not.toThrow();
    expect(() => encodeHubProperty(0x01, 0x05)).not.toThrow();
  });
});
