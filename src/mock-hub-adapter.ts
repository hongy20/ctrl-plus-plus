import type { HubAdapter } from './contracts';

export interface MockHubAdapterOptions {
  hubId?: string;
  hubName?: string;
}

export class MockHubAdapter implements HubAdapter {
  public sentPackets: Uint8Array[] = [];
  private connected = false;
  private connecting = false;
  private hubId: string | null;
  private hubName: string | null;
  private messageListeners = new Set<(packet: Uint8Array) => void>();
  private disconnectListeners = new Set<() => void>();

  constructor(options: MockHubAdapterOptions = {}) {
    this.hubId = options.hubId ?? 'mock-hub';
    this.hubName = options.hubName ?? 'Mock Hub';
  }

  async connect(): Promise<void> {
    if (this.connected || this.connecting) {
      throw new Error('Already connected or connecting');
    }
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.connecting = false;
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
