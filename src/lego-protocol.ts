export type DecodedLwpMessage =
  | {
      messageType: 0x01;
      property: number;
      operation: number;
      value: string | number | Uint8Array;
    }
  | {
      messageType: 0x04;
      port: number;
      event: number;
      attached: boolean;
      ioTypeId?: number;
    }
  | {
      messageType: 0x45;
      port: number;
      value: number;
    }
  | {
      messageType: number;
      [key: string]: unknown;
    };

export function encodeHubProperty(property: number, operation: number): Uint8Array {
  if (operation !== 0x02 && operation !== 0x03 && operation !== 0x05) {
    throw new Error(
      `Disallowed Hub Property operation 0x${operation.toString(16)}. Only volatile operations (0x02, 0x03, 0x05) are permitted (CTL-09).`,
    );
  }
  return new Uint8Array([0x05, 0x00, 0x01, property, operation]);
}

export function encodePortInputFormatSetup(
  port: number,
  mode: number,
  deltaInterval: number,
  notificationEnabled: boolean,
): Uint8Array {
  const buf = new Uint8Array(10);
  buf[0] = 0x0a;
  buf[1] = 0x00;
  buf[2] = 0x41;
  buf[3] = port;
  buf[4] = mode;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  view.setUint32(5, deltaInterval, true);
  buf[9] = notificationEnabled ? 0x01 : 0x00;
  return buf;
}

export function encodeStartSpeed(
  port: number,
  speed: number,
  maxPower = 100,
  useProfile = 0,
): Uint8Array {
  const buf = new Uint8Array(9);
  buf[0] = 0x09;
  buf[1] = 0x00;
  buf[2] = 0x81;
  buf[3] = port;
  buf[4] = 0x11;
  buf[5] = 0x07;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  view.setInt8(6, speed);
  buf[7] = maxPower;
  buf[8] = useProfile;
  return buf;
}

export function encodeGoToAbsolutePosition(
  port: number,
  absPosition: number,
  speed: number,
  maxPower = 100,
  endState = 127,
  useProfile = 0,
): Uint8Array {
  const buf = new Uint8Array(14);
  buf[0] = 0x0e;
  buf[1] = 0x00;
  buf[2] = 0x81;
  buf[3] = port;
  buf[4] = 0x11;
  buf[5] = 0x0d;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  view.setInt32(6, absPosition, true);
  buf[10] = speed;
  buf[11] = maxPower;
  buf[12] = endState;
  buf[13] = useProfile;
  return buf;
}

export function encodeSetHubLed(color: number, port = 0x32): Uint8Array {
  return new Uint8Array([0x08, 0x00, 0x81, port, 0x11, 0x51, 0x00, color]);
}

export function encodeStartPower(port: number, power = 0): Uint8Array {
  const buf = new Uint8Array([0x08, 0x00, 0x81, port, 0x11, 0x51, 0x00, 0x00]);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  view.setInt8(7, power);
  return buf;
}

export function encodePortValueRequest(port: number): Uint8Array {
  return new Uint8Array([0x05, 0x00, 0x21, port, 0x00]);
}

export function decodeLwpMessage(packet: Uint8Array): DecodedLwpMessage {
  if (packet.length < 3) {
    return { messageType: 0, raw: packet };
  }
  const isTwoByte = (packet[0] & 0x80) !== 0;
  const headerOffset = isTwoByte ? 1 : 0;
  const messageType = packet[headerOffset + 2];

  if (messageType === 0x01) {
    const property = packet[headerOffset + 3];
    const operation = packet[headerOffset + 4];
    const payloadStart = headerOffset + 5;
    let value: string | number | Uint8Array;

    if (payloadStart >= packet.length) {
      value = '';
    } else if (property === 0x01 || property === 0x08 || property === 0x09) {
      value = new TextDecoder().decode(packet.subarray(payloadStart));
    } else if (property === 0x03 || property === 0x04) {
      const b0 = packet[payloadStart];
      const b1 = packet[payloadStart + 1];
      const b2 = packet[payloadStart + 2];
      const b3 = packet[payloadStart + 3];
      const major = (b3 >> 4) & 0x0f;
      const minor = b3 & 0x0f;
      const bcd = (byte: number): number => ((byte >> 4) & 0x0f) * 10 + (byte & 0x0f);
      const bugfix = bcd(b2);
      const build = bcd(b1) * 100 + bcd(b0);
      value = `${major}.${minor}.${bugfix}.${build}`;
    } else if (property === 0x05) {
      const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
      value = view.getInt8(payloadStart);
    } else if (property === 0x06) {
      value = packet[payloadStart];
    } else if (property === 0x0d) {
      value = Array.from(packet.subarray(payloadStart, payloadStart + 6))
        .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
        .join(':');
    } else {
      value = packet.subarray(payloadStart);
    }

    return { messageType: 0x01, property, operation, value };
  }

  if (messageType === 0x04) {
    const port = packet[headerOffset + 3];
    const event = packet[headerOffset + 4];
    const attached = event === 0x01 || event === 0x02;
    if (attached && packet.length >= headerOffset + 7) {
      const ioTypeId = packet[headerOffset + 5] | (packet[headerOffset + 6] << 8);
      return { messageType: 0x04, port, event, attached, ioTypeId };
    }
    return { messageType: 0x04, port, event, attached };
  }

  if (messageType === 0x45) {
    const port = packet[headerOffset + 3];
    const payloadStart = headerOffset + 4;
    const payloadLen = packet.length - payloadStart;
    const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
    let value = 0;
    if (payloadLen === 1) {
      value = view.getInt8(payloadStart);
    } else if (payloadLen === 2) {
      value = view.getInt16(payloadStart, true);
    } else if (payloadLen >= 4) {
      value = view.getInt32(payloadStart, true);
    }
    return { messageType: 0x45, port, value };
  }

  return { messageType, raw: packet };
}
