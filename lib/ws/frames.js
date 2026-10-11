/* ============================================================
   Red Bear — Minimal RFC 6455 WebSocket frame codec (zero deps)

   The Edge TTS service requires a WebSocket handshake with custom
   `Origin` / `User-Agent` / `Cookie` headers, which the browser
   (and specs-compliant WebSocket clients) refuse to send. A tiny
   hand-rolled codec gives the server full control over headers so
   the upstream request looks like the real Edge read-aloud client.
   ============================================================ */
"use strict";

const crypto = require("crypto");

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

const OPCODE = {
  CONT: 0x0,
  TEXT: 0x1,
  BINARY: 0x2,
  CLOSE: 0x8,
  PING: 0x9,
  PONG: 0xa,
};

const DEFAULT_MAX_PAYLOAD = 32 * 1024 * 1024; /* 32 MB — plenty for audio */

/** Compute the `Sec-WebSocket-Accept` value for a handshake key. */
function computeAccept(key) {
  return crypto
    .createHash("sha1")
    .update(String(key) + GUID)
    .digest("base64");
}

function toPayloadBuffer(payload) {
  if (payload === undefined || payload === null) return Buffer.alloc(0);
  if (Buffer.isBuffer(payload)) return payload;
  if (payload instanceof Uint8Array) return Buffer.from(payload);
  return Buffer.from(String(payload), "utf8");
}

/**
 * Encode a single WebSocket frame.
 * `mask` must be true for every client -> server frame (RFC 6455 §5.3).
 */
function encodeFrame({ opcode, payload, fin = true, mask = false, rsv1 = false }) {
  const data = toPayloadBuffer(payload);
  const len = data.length;
  const maskBit = mask ? 0x80 : 0x00;

  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[1] = maskBit | len;
  } else if (len < 0x10000) {
    header = Buffer.alloc(4);
    header[1] = maskBit | 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = maskBit | 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  header[0] = (fin ? 0x80 : 0x00) | (rsv1 ? 0x40 : 0x00) | (opcode & 0x0f);

  if (!mask) return Buffer.concat([header, data]);

  const key = crypto.randomBytes(4);
  header[1] |= 0x80;
  const masked = Buffer.allocUnsafe(len);
  for (let i = 0; i < len; i++) masked[i] = data[i] ^ key[i & 3];
  return Buffer.concat([header, key, masked]);
}

class WebSocketProtocolError extends Error {
  constructor(message) {
    super(message);
    this.name = "WebSocketProtocolError";
    this.code = "WS_PROTOCOL_ERROR";
  }
}

/**
 * Incremental frame parser. Feed it raw socket chunks; it emits
 * complete messages (fragmented frames are reassembled) and control
 * frames through the supplied callbacks.
 */
class FrameParser {
  constructor({ onMessage, onControl, maxPayload = DEFAULT_MAX_PAYLOAD } = {}) {
    this._buffer = Buffer.alloc(0);
    this._fragments = [];
    this._fragmentOpcode = null;
    this._fragmentBytes = 0;
    this._closed = false;
    this.onMessage = onMessage || (() => {});
    this.onControl = onControl || (() => {});
    this.maxPayload = maxPayload;
  }

  push(chunk) {
    if (!chunk || !chunk.length) return;
    this._buffer = this._buffer.length ? Buffer.concat([this._buffer, chunk]) : Buffer.from(chunk);
    this._drain();
  }

  _drain() {
    while (!this._closed) {
      const buf = this._buffer;
      if (buf.length < 2) return;

      const b0 = buf[0];
      const b1 = buf[1];
      const fin = (b0 & 0x80) !== 0;
      const rsv = b0 & 0x70;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let length = b1 & 0x7f;
      let offset = 2;

      if (rsv) throw new WebSocketProtocolError("RSV bits set without a negotiated extension");

      if (length === 126) {
        if (buf.length < offset + 2) return;
        length = buf.readUInt16BE(offset);
        offset += 2;
      } else if (length === 127) {
        if (buf.length < offset + 8) return;
        const big = buf.readBigUInt64BE(offset);
        if (big > BigInt(Number.MAX_SAFE_INTEGER)) {
          throw new WebSocketProtocolError("Frame payload length exceeds supported range");
        }
        length = Number(big);
        offset += 8;
      }

      if (length > this.maxPayload) {
        throw new WebSocketProtocolError(`Frame payload too large (${length} bytes)`);
      }

      let maskKey = null;
      if (masked) {
        if (buf.length < offset + 4) return;
        maskKey = buf.subarray(offset, offset + 4);
        offset += 4;
      }

      const total = offset + length;
      if (buf.length < total) return;

      let payload = buf.subarray(offset, total);
      if (maskKey) {
        const copy = Buffer.allocUnsafe(length);
        for (let i = 0; i < length; i++) copy[i] = payload[i] ^ maskKey[i & 3];
        payload = copy;
      } else {
        payload = Buffer.from(payload);
      }

      this._buffer = buf.length === total ? Buffer.alloc(0) : Buffer.from(buf.subarray(total));

      if (opcode >= 0x8) {
        if (!fin) throw new WebSocketProtocolError("Control frames must not be fragmented");
        if (length > 125) throw new WebSocketProtocolError("Control frame payload must be <= 125 bytes");
        this.onControl({ opcode, payload });
        continue;
      }

      if (opcode === OPCODE.CONT) {
        if (this._fragmentOpcode === null) {
          throw new WebSocketProtocolError("Continuation frame without an initial frame");
        }
        this._fragmentBytes += payload.length;
        if (this._fragmentBytes > this.maxPayload) {
          throw new WebSocketProtocolError("Fragmented message too large");
        }
        this._fragments.push(payload);
        if (fin) {
          const complete = Buffer.concat(this._fragments);
          const firstOpcode = this._fragmentOpcode;
          this._fragments = [];
          this._fragmentOpcode = null;
          this._fragmentBytes = 0;
          this.onMessage({ opcode: firstOpcode, payload: complete });
        }
        continue;
      }

      if (opcode !== OPCODE.TEXT && opcode !== OPCODE.BINARY) {
        throw new WebSocketProtocolError(`Unsupported opcode 0x${opcode.toString(16)}`);
      }

      if (!fin) {
        this._fragmentOpcode = opcode;
        this._fragments = [payload];
        this._fragmentBytes = payload.length;
        continue;
      }

      this.onMessage({ opcode, payload });
    }
  }

  /** Abort parsing (socket gone / protocol error). */
  destroy() {
    this._closed = true;
    this._buffer = Buffer.alloc(0);
    this._fragments = [];
  }
}

module.exports = {
  GUID,
  OPCODE,
  WebSocketProtocolError,
  computeAccept,
  encodeFrame,
  FrameParser,
};
