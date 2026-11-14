import type { MotorTelemetry } from '../contracts';
import { decodeLwpMessage } from '../lego-protocol';
import { LOW_BATTERY_CUTOFF_PCT } from './constants';

export type PortValueListener = (port: number, value: number, timestampMs: number) => void;

export type ProcessedLwpMessage =
  | {
      kind: 'attached_io';
      port: number;
      attached: boolean;
      ioTypeId?: number;
    }
  | {
      kind: 'hub_property';
      property: number;
      value: unknown;
    }
  | {
      kind: 'port_value';
      telemetry: MotorTelemetry;
      now: number;
    }
  | {
      kind: 'other';
    };

export function parseLwpPacket(
  packet: Uint8Array,
  prevTelemetry: Map<number, MotorTelemetry>,
  now: number = Date.now(),
): ProcessedLwpMessage {
  const msg = decodeLwpMessage(packet);

  if (msg.messageType === 0x04 && 'attached' in msg && typeof msg.port === 'number') {
    console.info('Attached I/O notification:', msg);
    return {
      kind: 'attached_io',
      port: msg.port,
      attached: Boolean(msg.attached),
      ioTypeId: typeof msg.ioTypeId === 'number' ? msg.ioTypeId : undefined,
    };
  }

  if (msg.messageType === 0x01 && 'property' in msg && typeof msg.property === 'number') {
    return {
      kind: 'hub_property',
      property: msg.property,
      value: msg.value,
    };
  }

  if (
    msg.messageType === 0x45 &&
    'port' in msg &&
    typeof msg.port === 'number' &&
    typeof msg.value === 'number'
  ) {
    const prev = prevTelemetry.get(msg.port);
    const dt = prev ? (now - prev.timestampMs) / 1000 : 0;
    const speedDegPerSec = prev && dt > 0 ? (msg.value - prev.angleDeg) / dt : 0;
    return {
      kind: 'port_value',
      telemetry: {
        port: msg.port,
        angleDeg: msg.value,
        speedDegPerSec,
        timestampMs: now,
      },
      now,
    };
  }

  return { kind: 'other' };
}

export class TelemetryManager {
  private telemetry = new Map<number, MotorTelemetry>();
  private attachedPorts = new Map<number, { attached: boolean; ioTypeId?: number }>();
  private hubProperties = new Map<number, unknown>();
  private portValueListeners = new Set<PortValueListener>();

  getTelemetry(port?: number): MotorTelemetry | Map<number, MotorTelemetry> | undefined {
    if (port !== undefined) {
      return this.telemetry.get(port);
    }
    return new Map(this.telemetry);
  }

  getAttachedPorts(): Map<number, { attached: boolean; ioTypeId?: number }> {
    return new Map(this.attachedPorts);
  }

  getHubProperties(): Map<number, unknown> {
    return new Map(this.hubProperties);
  }

  getBatteryLevel(): number | null {
    const batt = this.hubProperties.get(0x06);
    return typeof batt === 'number' ? batt : null;
  }

  isLowBatteryCutoff(): boolean {
    const batt = this.getBatteryLevel();
    return batt !== null && batt < LOW_BATTERY_CUTOFF_PCT;
  }

  addPortValueListener(cb: PortValueListener): () => void {
    this.portValueListeners.add(cb);
    return () => {
      this.portValueListeners.delete(cb);
    };
  }

  handlePacket(
    packet: Uint8Array,
    onResetWatchdog: () => void,
    onLowBatteryCutoff: () => void,
  ): boolean {
    const res = parseLwpPacket(packet, this.telemetry);
    if (res.kind === 'attached_io') {
      this.attachedPorts.set(res.port, {
        attached: res.attached,
        ioTypeId: res.ioTypeId,
      });
      return true;
    }
    if (res.kind === 'hub_property') {
      this.hubProperties.set(res.property, res.value);
      if (
        res.property === 0x06 &&
        typeof res.value === 'number' &&
        res.value < LOW_BATTERY_CUTOFF_PCT
      ) {
        onLowBatteryCutoff();
      }
      return true;
    }
    if (res.kind === 'port_value') {
      onResetWatchdog();
      this.telemetry.set(res.telemetry.port, res.telemetry);
      for (const listener of Array.from(this.portValueListeners)) {
        listener(res.telemetry.port, res.telemetry.angleDeg, res.now);
      }
      return true;
    }
    return false;
  }

  clear(): void {
    this.portValueListeners.clear();
  }
}
