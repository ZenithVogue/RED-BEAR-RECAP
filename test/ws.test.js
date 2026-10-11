/* ============================================================
   WebSocket codec + client tests (no network required)
   ============================================================ */
"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");

const { OPCODE, FrameParser, computeAccept, encodeFrame } = require("../lib/ws/frames");
const { connect } = require("../lib/ws/client");

function collect() {
  const messages = [];
  const controls = [];
  const parser = new FrameParser({
    onMessage: (m) => messages.push(m),
    onControl: (c) => controls.push(c),
  });
  return { messages, controls, parser };
}

test("computeAccept matches RFC 6455 example", () => {
  assert.equal(computeAccept("dGhlIHNhbXBsZSBub25jZQ=="), "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
});

test("frames round-trip across all length encodings (7-bit, 16-bit, 64-bit)", () => {
  for (const size of [0, 1, 125, 126, 300, 65535, 65536, 70000]) {
    const payload = Buffer.alloc(size, 0x5a);
    for (const mask of [false, true]) {
      const { messages, parser } = collect();
      parser.push(encodeFrame({ opcode: OPCODE.BINARY, payload, mask }));
      assert.equal(messages.length, 1, `size=${size} mask=${mask}`);
      assert.equal(messages[0].payload.length, size);
      assert.deepEqual(messages[0].payload, payload);
    }
  }
});

test("parser reassembles fragmented messages", () => {
  const { messages, parser } = collect();
  const part1 = Buffer.from("hello ", "utf8");
  const part2 = Buffer.from("world", "utf8");
  parser.push(encodeFrame({ opcode: OPCODE.TEXT, payload: part1, fin: false, mask: true }));
  parser.push(encodeFrame({ opcode: OPCODE.CONT, payload: part2, fin: true, mask: true }));
  assert.equal(messages.length, 1);
  assert.equal(messages[0].payload.toString("utf8"), "hello world");
});

test("parser handles byte-by-byte delivery and multiple frames per chunk", () => {
  const { messages, parser } = collect();
  const frame = Buffer.concat([
    encodeFrame({ opcode: OPCODE.TEXT, payload: "one", mask: true }),
    encodeFrame({ opcode: OPCODE.TEXT, payload: "two", mask: true }),
  ]);
  for (const byte of frame) parser.push(Buffer.from([byte]));
  assert.deepEqual(messages.map((m) => m.payload.toString("utf8")), ["one", "two"]);
});

test("control frames are surfaced separately", () => {
  const { controls, messages, parser } = collect();
  parser.push(encodeFrame({ opcode: OPCODE.PING, payload: Buffer.from("hi"), mask: true }));
  parser.push(encodeFrame({ opcode: OPCODE.CLOSE, payload: Buffer.from([0x03, 0xe8]), mask: true }));
  assert.equal(messages.length, 0);
  assert.deepEqual(controls.map((c) => c.opcode), [OPCODE.PING, OPCODE.CLOSE]);
});

/** Track live sockets so a failing assertion can never block teardown. */
function trackSockets(server) {
  const sockets = new Set();
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  return async () => {
    for (const socket of sockets) socket.destroy();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  };
}

test("client performs a real handshake, sends masked frames and answers pings", { timeout: 10000 }, async () => {
  const received = [];
  const server = http.createServer();
  const teardown = trackSockets(server);
  server.on("upgrade", (req, socket) => {
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
      + `Sec-WebSocket-Accept: ${computeAccept(req.headers["sec-websocket-key"])}\r\n\r\n`
    );
    received.push(req.headers);
    const parser = new FrameParser({
      onMessage: ({ payload }) => {
        received.push(payload.toString("utf8"));
        socket.write(encodeFrame({ opcode: OPCODE.TEXT, payload: `echo:${payload.toString("utf8")}` }));
        socket.write(encodeFrame({ opcode: OPCODE.PING, payload: Buffer.from("p") }));
      },
      onControl: ({ opcode, payload }) => received.push({ control: opcode, payload: payload.toString("utf8") }),
    });
    socket.on("data", (c) => parser.push(c));
  });

  const port = await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));

  try {
    const ws = await connect(`ws://127.0.0.1:${port}/edge/v1?TrustedClientToken=t`, {
      headers: { Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold", Cookie: "muid=ABC;" },
    });

    const echoed = new Promise((resolve) => ws.on("message", resolve));
    ws.sendText("hello");
    assert.equal(await echoed, "echo:hello");

    await new Promise((r) => setTimeout(r, 60));
    const pong = received.find((r) => r && r.control === OPCODE.PONG);
    assert.ok(pong, "client must answer server PING with a masked PONG");

    assert.equal(received[0].origin, "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold");
    assert.equal(received[0].upgrade.toLowerCase(), "websocket");

    const closed = new Promise((resolve) => ws.on("close", resolve));
    ws.close(1000, "done");
    const closeEvent = await closed;
    assert.ok([1000, 1005, 1006].includes(closeEvent.code));
  } finally {
    await teardown();
  }
});

test("handshake rejections bubble up the HTTP status and Date header", { timeout: 10000 }, async () => {
  const server = http.createServer();
  const teardown = trackSockets(server);
  server.on("upgrade", (req, socket) => {
    socket.end("HTTP/1.1 403 Forbidden\r\nDate: Wed, 01 Jan 2025 00:00:00 GMT\r\nContent-Length: 0\r\n\r\n");
  });
  const port = await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
  try {
    await assert.rejects(
      connect(`ws://127.0.0.1:${port}/edge`, { headers: {} }),
      (error) => {
        assert.equal(error.status, 403);
        assert.match(String(error.date), /2025/);
        return true;
      }
    );
  } finally {
    await teardown();
  }
});
