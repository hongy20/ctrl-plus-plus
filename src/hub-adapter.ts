import type { HubAdapter } from './contracts';

export const LWP_SERVICE_UUID = '00001623-1212-efde-1623-785feabcd123';
export const LWP_CHARACTERISTIC_UUID = '00001624-1212-efde-1623-785feabcd123';

interface BluetoothRemoteGATTCharacteristicLike extends EventTarget {
  uuid: string;
  value?: DataView;
  startNotifications(): Promise<unknown>;
  writeValueWithResponse?(value: Uint8Array | BufferSource): Promise<void>;
  writeValue?(value: Uint8Array | BufferSource): Promise<void>;
}

interface BluetoothRemoteGATTServerLike {
  connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServerLike>;
  disconnect(): void;
  getPrimaryService(service: string | number): Promise<{
    getCharacteristic(characteristic: string | number): Promise<BluetoothRemoteGATTCharacteristicLike>;
  }>;
}

interface BluetoothDeviceLike extends EventTarget {
  id: string;
  name?: string;
  gatt?: BluetoothRemoteGATTServerLike;
}

interface NavigatorWithBluetooth {
  bluetooth?: {
    requestDevice(options: {
      filters?: Array<{ services?: Array<string | number>; name?: string; namePrefix?: string }>;
      optionalServices?: Array<string | number>;
      acceptAllDevices?: boolean;
    }): Promise<BluetoothDeviceLike>;
  };
}

export class WebBleHubAdapter implements HubAdapter {
  private device: BluetoothDeviceLike | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristicLike | null = null;
  private connected = false;
  private hubId: string | null = null;
  private hubName: string | null = null;
  private messageListeners = new Set<(packet: Uint8Array) => void>();
  private disconnectListeners = new Set<() => void>();

  async connect(): Promise<void> {
    const nav = typeof navigator !== 'undefined' ? (navigator as NavigatorWithBluetooth) : null;
    if (!nav?.bluetooth) {
      throw new Error('Web Bluetooth is not supported in this environment');
    }

    if (this.device) {
      this.device.removeEventListener('gattserverdisconnected', this.handleGattDisconnect);
    }

    const device = await nav.bluetooth.requestDevice({
      filters: [{ services: [LWP_SERVICE_UUID] }],
    });

    this.device = device;
    this.hubId = device.id;
    this.hubName = device.name ?? null;

    device.addEventListener('gattserverdisconnected', this.handleGattDisconnect);

    const gatt = await device.gatt?.connect();
    if (!gatt) {
      throw new Error('Failed to connect to GATT server');
    }

    const service = await gatt.getPrimaryService(LWP_SERVICE_UUID);
    const characteristic = await service.getCharacteristic(LWP_CHARACTERISTIC_UUID);
    this.characteristic = characteristic;

    characteristic.addEventListener(
      'characteristicvaluechanged',
      this.handleCharacteristicValueChanged,
    );
    await characteristic.startNotifications();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.device?.gatt) {
      this.device.gatt.disconnect();
    }
    this.handleGattDisconnect();
  }

  isConnected(): boolean {
    return this.connected;
  }

  getHubId(): string | null {
    return this.hubId;
  }

  getHubName(): string | null {
    return this.hubName;
  }

  async send(packet: Uint8Array): Promise<void> {
    if (!this.characteristic) {
      throw new Error('Cannot send packet: Not connected');
    }

    if (typeof this.characteristic.writeValueWithResponse === 'function') {
      await this.characteristic.writeValueWithResponse(packet);
    } else if (typeof this.characteristic.writeValue === 'function') {
      await this.characteristic.writeValue(packet);
    }
  }

  onMessage(callback: (packet: Uint8Array) => void): () => void {
    this.messageListeners.add(callback);
    return () => {
      this.messageListeners.delete(callback);
    };
  }

  onDisconnect(callback: () => void): () => void {
    this.disconnectListeners.add(callback);
    return () => {
      this.disconnectListeners.delete(callback);
    };
  }

  private handleGattDisconnect = (): void => {
    if (!this.connected) {
      return;
    }
    this.connected = false;
    for (const listener of this.disconnectListeners) {
      listener();
    }
  };

  private handleCharacteristicValueChanged = (event: Event): void => {
    const target = event.target as { value?: DataView } | null;
    if (target?.value) {
      const dv = target.value;
      const packet = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
      for (const listener of this.messageListeners) {
        listener(packet);
      }
    }
  };
}

export interface MockHubAdapterOptions {
  hubId?: string;
  hubName?: string;
}

export class MockHubAdapter implements HubAdapter {
  public sentPackets: Uint8Array[] = [];
  private connected = false;
  private hubId: string | null;
  private hubName: string | null;
  private messageListeners = new Set<(packet: Uint8Array) => void>();
  private disconnectListeners = new Set<() => void>();

  constructor(options: MockHubAdapterOptions = {}) {
    this.hubId = options.hubId ?? 'mock-hub';
    this.hubName = options.hubName ?? 'Mock Hub';
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getHubId(): string | null {
    return this.hubId;
  }

  getHubName(): string | null {
    return this.hubName;
  }

  async send(packet: Uint8Array): Promise<void> {
    this.sentPackets.push(packet);
  }

  onMessage(callback: (packet: Uint8Array) => void): () => void {
    this.messageListeners.add(callback);
    return () => {
      this.messageListeners.delete(callback);
    };
  }

  onDisconnect(callback: () => void): () => void {
    this.disconnectListeners.add(callback);
    return () => {
      this.disconnectListeners.delete(callback);
    };
  }

  emitMessage(packet: Uint8Array): void {
    for (const cb of this.messageListeners) {
      cb(packet);
    }
  }

  simulateDisconnect(): void {
    this.connected = false;
    for (const cb of this.disconnectListeners) {
      cb();
    }
  }
}
