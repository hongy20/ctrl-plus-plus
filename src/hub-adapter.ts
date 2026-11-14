import type { HubAdapter } from './contracts';

export const LWP_SERVICE_UUID = '00001623-1212-efde-1623-785feabcd123';
export const LWP_CHARACTERISTIC_UUID = '00001624-1212-efde-1623-785feabcd123';

interface BluetoothRemoteGATTCharacteristicLike extends EventTarget {
  uuid: string;
  value?: DataView;
  startNotifications(): Promise<unknown>;
  writeValueWithResponse?(value: Uint8Array | BufferSource): Promise<void>;
  writeValue?(value: Uint8Array | BufferSource): Promise<void>;
  removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null): void;
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
  removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null): void;
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
  private connecting = false;
  private connectGeneration = 0;
  private hubId: string | null = null;
  private hubName: string | null = null;
  private messageListeners = new Set<(packet: Uint8Array) => void>();
  private disconnectListeners = new Set<() => void>();

  async connect(): Promise<void> {
    if (this.connected || this.connecting) {
      throw new Error('Already connected or connecting');
    }

    const nav = typeof navigator !== 'undefined' ? (navigator as NavigatorWithBluetooth) : null;
    if (!nav?.bluetooth) {
      throw new Error('Web Bluetooth is not supported in this environment');
    }

    this.connecting = true;
    const generation = ++this.connectGeneration;

    let localDevice: BluetoothDeviceLike | null = null;
    let localGatt: BluetoothRemoteGATTServerLike | null = null;
    let localChar: BluetoothRemoteGATTCharacteristicLike | null = null;

    try {
      const device = await nav.bluetooth.requestDevice({
        filters: [{ services: [LWP_SERVICE_UUID] }],
      });

      if (this.connectGeneration !== generation) {
        throw new Error('Connection aborted');
      }

      localDevice = device;
      this.device = device;
      this.hubId = device.id;
      this.hubName = device.name ?? null;

      device.addEventListener('gattserverdisconnected', this.handleGattDisconnect);

      const gatt = await device.gatt?.connect();
      if (this.connectGeneration !== generation) {
        throw new Error('Connection aborted');
      }
      if (!gatt) {
        throw new Error('Failed to connect to GATT server');
      }
      localGatt = gatt;

      const service = await gatt.getPrimaryService(LWP_SERVICE_UUID);
      if (this.connectGeneration !== generation) {
        throw new Error('Connection aborted');
      }

      const characteristic = await service.getCharacteristic(LWP_CHARACTERISTIC_UUID);
      if (this.connectGeneration !== generation) {
        throw new Error('Connection aborted');
      }
      localChar = characteristic;
      this.characteristic = characteristic;

      characteristic.addEventListener(
        'characteristicvaluechanged',
        this.handleCharacteristicValueChanged,
      );

      await characteristic.startNotifications();
      if (this.connectGeneration !== generation) {
        throw new Error('Connection aborted');
      }

      this.connected = true;
    } catch (error) {
      if (localChar) {
        localChar.removeEventListener(
          'characteristicvaluechanged',
          this.handleCharacteristicValueChanged,
        );
      }
      if (localDevice) {
        localDevice.removeEventListener('gattserverdisconnected', this.handleGattDisconnect);
      }
      if (localGatt) {
        try {
          localGatt.disconnect();
        } catch {
          // ignore error on rollback disconnect
        }
      }
      this.device = null;
      this.characteristic = null;
      this.hubId = null;
      this.hubName = null;
      this.connected = false;
      throw error;
    } finally {
      this.connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    this.connectGeneration += 1;
    this.connecting = false;

    const device = this.device;
    const characteristic = this.characteristic;

    if (characteristic) {
      characteristic.removeEventListener(
        'characteristicvaluechanged',
        this.handleCharacteristicValueChanged,
      );
      this.characteristic = null;
    }

    if (device) {
      device.removeEventListener('gattserverdisconnected', this.handleGattDisconnect);
      if (device.gatt) {
        device.gatt.disconnect();
      }
    }

    this.device = null;
    this.hubId = null;
    this.hubName = null;

    const wasConnected = this.connected;
    this.connected = false;

    if (wasConnected) {
      for (const listener of this.disconnectListeners) {
        listener();
      }
    }
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
    if (this.characteristic) {
      this.characteristic.removeEventListener(
        'characteristicvaluechanged',
        this.handleCharacteristicValueChanged,
      );
      this.characteristic = null;
    }
    if (this.device) {
      this.device.removeEventListener('gattserverdisconnected', this.handleGattDisconnect);
    }
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

export { MockHubAdapter, type MockHubAdapterOptions } from './mock-hub-adapter';

