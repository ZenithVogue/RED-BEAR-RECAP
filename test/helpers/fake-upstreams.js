/* ============================================================
   Test helpers — local stand-ins for the Edge / Google TTS upstreams

   These let the whole `browser → /api/tts → provider` path run and be
   asserted offline (the sandbox and CI have no access to the real
   services, and the suite must not depend on them).
   ============================================================ */
"use strict";

const http = require("http");
const { FrameParser, OPCODE, computeAccept, encodeFrame } = require("../../lib/ws/frames");

/** Structurally valid, silent-ish MPEG-1 Layer III frames (for byte assertions). */
function fakeMp3(frameCount = 3, seed = 0) {
  const frames = [];
  for (let i = 0; i < frameCount; i++) {
    const frame = Buffer.alloc(417, (i + seed) % 256);
    frame[0] = 0xff;
    frame[1] = 0xfb;
    frame[2] = 0x90;
    frame[3] = 0x64;
    frames.push(frame);
  }
  return Buffer.concat(frames);
}

function parseEdgeMessage(raw) {
  const split = raw.indexOf("\r\n\r\n");
  const headerBlock = split >= 0 ? raw.slice(0, split) : raw;
  const body = split >= 0 ? raw.slice(split + 4) : "";
  const headers = {};
  for (const line of headerBlock.split("\r\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
  }
  return { headers, body };
}

function binaryAudioFrame(audio, requestId = "test") {
  const header = Buffer.from(`X-RequestId:${requestId}\r\nContent-Type:audio/mpeg\r\nPath:audio`, "utf8");
  const length = Buffer.alloc(2);
  /* Edge read-aloud reports the header block size *including* these 2 bytes. */
  length.writeUInt16BE(header.length + 2, 0);
  return Buffer.concat([length, header, Buffer.from("\r\n", "utf8"), audio]);
}

function textFrame(path, body = "{}") {
  return Buffer.from(`X-RequestId:test\r\nContent-Type:application/json; charset=utf-8\r\nPath:${path}\r\n\r\n${body}`, "utf8");
}

/**
 * A fake Edge read-aloud WebSocket endpoint.
 * @param {{ mode?: 'ok'|'no-audio'|'forbidden'|'silent', audio?: Buffer,
 *           delayMs?: number, forbidOnce?: boolean, skewSeconds?: number }} options
 */
function createFakeEdgeServer(options = {}) {
  const {
    mode = "ok",
    audio = fakeMp3(3),
    delayMs = 0,
    forbidOnce = false,
    skewSeconds = 0,
  } = options;

  const requests = [];
  const sockets = new Set();
  let upgradeCount = 0;

  const server = http.createServer((req, res) => {
    res.writeHead(426, { "Content-Type": "text/plain" });
    res.end("Upgrade Required");
  });

  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  server.on("upgrade", (req, socket) => {
    upgradeCount += 1;
    const url = new URL(req.url, "http://localhost");
    const record = {
      url: req.url,
      params: Object.fromEntries(url.searchParams.entries()),
      headers: req.headers,
      speechConfig: null,
      ssml: null,
      audioSent: 0,
    };
    requests.push(record);

    if (mode === "forbidden" || (forbidOnce && upgradeCount === 1)) {
      const date = new Date(Date.now() + skewSeconds * 1000).toUTCString();
      socket.write(`HTTP/1.1 403 Forbidden\r\nDate: ${date}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`);
      socket.end();
      return;
    }

    const accept = computeAccept(req.headers["sec-websocket-key"]);
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n"
      + "Upgrade: websocket\r\n"
      + "Connection: Upgrade\r\n"
      + `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );

    const parser = new FrameParser({
      onMessage: ({ payload }) => {
        const raw = payload.toString("utf8");
        const { headers, body } = parseEdgeMessage(raw);
        const path = (headers.path || "").toLowerCase();

        if (path === "speech.config") {
          record.speechConfig = body;
          return;
        }
        if (path !== "ssml") return;

        record.ssml = body;
        if (mode === "silent") return; /* never answer → timeout coverage */

        const send = () => {
          if (socket.destroyed) return;
          if (mode === "no-audio") {
            socket.write(encodeFrame({ opcode: OPCODE.TEXT, payload: textFrame("response") }));
            socket.write(encodeFrame({ opcode: OPCODE.TEXT, payload: textFrame("turn.end") }));
            return;
          }
          socket.write(encodeFrame({ opcode: OPCODE.TEXT, payload: textFrame("turn.start") }));
          socket.write(encodeFrame({ opcode: OPCODE.TEXT, payload: textFrame("response") }));
          socket.write(encodeFrame({ opcode: OPCODE.BINARY, payload: binaryAudioFrame(audio) }));
          socket.write(encodeFrame({ opcode: OPCODE.TEXT, payload: textFrame("turn.end") }));
          record.audioSent += audio.length;
        };

        if (delayMs > 0) setTimeout(send, delayMs);
        else send();
      },
      onControl: ({ opcode, payload }) => {
        if (opcode === OPCODE.CLOSE) {
          socket.end();
        }
        if (opcode === OPCODE.PING) {
          socket.write(encodeFrame({ opcode: OPCODE.PONG, payload, mask: false }));
        }
      },
    });

    socket.on("data", (chunk) => {
      try {
        parser.push(chunk);
      } catch (_) {
        socket.destroy();
      }
    });
    socket.on("error", () => {});
  });

  return {
    server,
    requests,
    get upgrades() {
      return upgradeCount;
    },
    listen(port = 0, host = "127.0.0.1") {
      return new Promise((resolve) => {
        server.listen(port, host, () => resolve(server.address().port));
      });
    },
    close() {
      for (const socket of sockets) socket.destroy();
      sockets.clear();
      server.closeAllConnections?.();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

/** A fake translate_tts endpoint. */
function createFakeGoogleServer(options = {}) {
  const { audio = fakeMp3(2, 7), status = 200, contentType = "audio/mpeg" } = options;
  const requests = [];

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    requests.push({
      url: req.url,
      params: Object.fromEntries(url.searchParams.entries()),
      headers: req.headers,
    });
    if (status !== 200) {
      res.writeHead(status, { "Content-Type": "text/plain" });
      res.end("blocked");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType, "Content-Length": audio.length });
    res.end(audio);
  });

  return {
    server,
    requests,
    listen(port = 0, host = "127.0.0.1") {
      return new Promise((resolve) => server.listen(port, host, () => resolve(server.address().port)));
    },
    close() {
      server.closeAllConnections?.();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

module.exports = { fakeMp3, createFakeEdgeServer, createFakeGoogleServer };
