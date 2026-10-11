/* ============================================================
   Red Bear — Minimal WebSocket client (zero deps)

   Built on node:http / node:https so we can send arbitrary headers
   (`Origin`, `User-Agent`, `Cookie`, `Pragma` …) that the Edge TTS
   endpoint expects from the Edge read-aloud extension.
   ============================================================ */
"use strict";

const crypto = require("crypto");
const http = require("http");
const https = require("https");
const { EventEmitter } = require("events");

const { OPCODE, FrameParser, computeAccept, encodeFrame } = require("./frames");

const CLOSE_CODES = {
  1000: "normal closure",
  1001: "going away",
  1002: "protocol error",
  1006: "abnormal closure",
  1008: "policy violation",
  1009: "message too big",
  1011: "internal error",
  1015: "TLS handshake failure",
};

class WsError extends Error {
  constructor(message, extra = {}) {
    super(message);
    this.name = "WsError";
    Object.assign(this, extra);
  }
}

class WebSocketConnection extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this.readyState = "open";
    this._parser = new FrameParser({
      onMessage: ({ opcode, payload }) => {
        if (opcode === OPCODE.TEXT) this.emit("message", payload.toString("utf8"));
        else this.emit("binary", payload);
      },
      onControl: ({ opcode, payload }) => this._handleControl(opcode, payload),
    });
    socket.on("data", (chunk) => {
      try {
        this._parser.push(chunk);
      } catch (error) {
        this.emit("error", error);
        this.destroy();
      }
    });
    socket.on("error", (error) => {
      if (this.readyState !== "closed") this.emit("error", error);
    });
    socket.on("close", () => this._finish(1006, "socket closed"));
    socket.on("end", () => this._finish(1006, "socket ended"));
  }

  _handleControl(opcode, payload) {
    if (opcode === OPCODE.PING) {
      this._write(encodeFrame({ opcode: OPCODE.PONG, payload, mask: true }));
      this.emit("ping", payload);
      return;
    }
    if (opcode === OPCODE.PONG) {
      this.emit("pong", payload);
      return;
    }
    if (opcode === OPCODE.CLOSE) {
      const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1005;
      const reason = payload.length > 2 ? payload.subarray(2).toString("utf8") : "";
      if (this.readyState === "open") {
        this._write(encodeFrame({ opcode: OPCODE.CLOSE, payload: payload.subarray(0, 2), mask: true }));
      }
      this._finish(code, reason || CLOSE_CODES[code] || "closed");
    }
  }

  _write(frame) {
    if (this.socket.destroyed) return false;
    return this.socket.write(frame);
  }

  _finish(code, reason) {
    if (this.readyState === "closed") return;
    this.readyState = "closed";
    this._parser.destroy();
    this.emit("close", { code, reason });
  }

  /** Send a UTF-8 text frame (masked, as required for clients). */
  sendText(text) {
    return this._write(encodeFrame({ opcode: OPCODE.TEXT, payload: text, mask: true }));
  }

  /** Send a binary frame (masked). */
  sendBinary(data) {
    return this._write(encodeFrame({ opcode: OPCODE.BINARY, payload: data, mask: true }));
  }

  ping() {
    return this._write(encodeFrame({ opcode: OPCODE.PING, payload: Buffer.alloc(0), mask: true }));
  }

  /** Graceful close handshake. */
  close(code = 1000, reason = "") {
    if (this.readyState !== "open") return;
    this.readyState = "closing";
    const payload = Buffer.alloc(2 + Buffer.byteLength(reason, "utf8"));
    payload.writeUInt16BE(code, 0);
    payload.write(reason, 2, "utf8");
    this._write(encodeFrame({ opcode: OPCODE.CLOSE, payload, mask: true }));
    setTimeout(() => this.destroy(), 250).unref?.();
  }

  destroy() {
    this._parser.destroy();
    if (!this.socket.destroyed) this.socket.destroy();
    this._finish(1006, "destroyed");
  }
}

/**
 * Open a WebSocket connection.
 *
 * @param {string} url  ws:// or wss:// URL
 * @param {{ headers?: Record<string,string>, connectTimeoutMs?: number }} [options]
 * @returns {Promise<WebSocketConnection>}
 */
function connect(url, options = {}) {
  const { headers = {}, connectTimeoutMs = 10000 } = options;

  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (error) {
      reject(new WsError(`Invalid WebSocket URL: ${url}`, { cause: error }));
      return;
    }
    if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
      reject(new WsError(`Unsupported WebSocket protocol: ${parsed.protocol}`));
      return;
    }

    const secure = parsed.protocol === "wss:";
    const transport = secure ? https : http;
    const key = crypto.randomBytes(16).toString("base64");
    const expectedAccept = computeAccept(key);

    const requestHeaders = {
      Connection: "Upgrade",
      Upgrade: "websocket",
      "Sec-WebSocket-Version": "13",
      "Sec-WebSocket-Key": key,
      Host: parsed.host,
      ...headers,
    };

    const request = transport.request(
      {
        protocol: parsed.protocol === "wss:" ? "https:" : "http:",
        hostname: parsed.hostname,
        port: parsed.port || (secure ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: "GET",
        headers: requestHeaders,
        servername: secure ? parsed.hostname : undefined,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8").slice(0, 400);
          reject(
            new WsError(`WebSocket handshake rejected with HTTP ${response.statusCode}`, {
              status: response.statusCode,
              statusCode: response.statusCode,
              headers: response.headers,
              date: response.headers && response.headers.date,
              body,
            })
          );
        });
      }
    );

    const timer = setTimeout(() => {
      request.destroy();
      reject(new WsError(`WebSocket handshake timed out after ${connectTimeoutMs}ms`, { code: "ETIMEDOUT" }));
    }, connectTimeoutMs);
    if (timer.unref) timer.unref();

    request.on("error", (error) => {
      clearTimeout(timer);
      reject(new WsError(`WebSocket connection failed: ${error.message}`, { cause: error, code: error.code }));
    });

    request.on("upgrade", (response, socket) => {
      clearTimeout(timer);
      const accept = response.headers["sec-websocket-accept"];
      if (String(response.statusCode) !== "101" || accept !== expectedAccept) {
        socket.destroy();
        reject(new WsError("Invalid WebSocket handshake response", { status: response.statusCode }));
        return;
      }
      socket.setNoDelay(true);
      resolve(new WebSocketConnection(socket));
    });

    request.end();
  });
}

module.exports = { connect, WebSocketConnection, WsError };
