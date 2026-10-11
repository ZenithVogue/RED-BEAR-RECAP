/* ============================================================
   Edge TTS provider tests (against a local fake Edge endpoint)
   ============================================================ */
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createFakeEdgeServer, fakeMp3 } = require("./helpers/fake-upstreams");
const edge = require("../lib/tts/edge");
const { resolveVoice } = require("../lib/tts/personas");

function withEnv(env, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(env)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = String(value);
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
}

test("Sec-MS-GEC token is a 64-char uppercase hex digest that rotates every 5 minutes", () => {
  const now = 1750000000.5;
  const token = edge.generateSecMsGec(now);
  assert.match(token, /^[0-9A-F]{64}$/);
  assert.equal(token, edge.generateSecMsGec(now + 60));
  assert.notEqual(token, edge.generateSecMsGec(now + 400));
});

test("edge headers carry the Edge client fingerprint (Origin, UA, MUID cookie)", () => {
  const headers = edge.edgeHeaders();
  assert.equal(headers.Origin, "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold");
  assert.match(headers["User-Agent"], /Edg\/\d+/);
  assert.match(headers.Cookie, /^muid=[0-9A-F]{32};$/);
  assert.equal(headers.Pragma, "no-cache");
  /* must never advertise an extension we do not implement */
  assert.equal(headers["Sec-WebSocket-Extensions"], undefined);
  assert.equal(headers["Accept-Encoding"], undefined);
});

test("SSML carries voice, pitch and rate without breaking escaping", () => {
  const ssml = edge.buildSsml("a & b <c>", { edgeVoice: "my-MM-ThihaNeural", rate: 1.15, pitchHz: 8 });
  assert.match(ssml, /voice name='my-MM-ThihaNeural'/);
  assert.match(ssml, /pitch='\+8Hz'/);
  assert.match(ssml, /rate='\+15%'/);
  assert.match(ssml, /a &amp; b &lt;c&gt;/);
});

test("synthesizeEdge drives the full WS exchange and returns MP3 bytes", { timeout: 20000 }, async () => {
  const expected = fakeMp3(4, 11);
  const fake = createFakeEdgeServer({ audio: expected });
  const port = await fake.listen();

  try {
    await withEnv({ EDGE_TTS_WSS_BASE: `ws://127.0.0.1:${port}/edge/v1` }, async () => {
      const result = await edge.synthesizeEdge({
        text: "မင်္ဂလာပါ",
        voice: resolveVoice("BB"),
        pitchOffsetHz: 6,
      });

      assert.equal(result.provider, "edge");
      assert.equal(result.contentType, "audio/mpeg");
      assert.deepEqual(result.audio, expected);

      assert.equal(fake.requests.length, 1);
      const [request] = fake.requests;
      assert.equal(request.params.TrustedClientToken, "6A5AA1D4EAFF4E9FB37E23D68491D6F4");
      assert.match(request.params["Sec-MS-GEC"], /^[0-9A-F]{64}$/);
      assert.equal(request.params["Sec-MS-GEC-Version"], `1-${edge.CHROMIUM_FULL_VERSION}`);
      assert.match(request.params.ConnectionId, /^[0-9a-f]{32}$/);
      assert.equal(request.headers.origin, "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold");
      assert.match(request.headers.cookie, /muid=/);

      assert.match(request.speechConfig, /"outputFormat":"audio-24khz-48kbitrate-mono-mp3"/);
      assert.match(request.ssml, /voice name='my-MM-ThihaNeural'/);
      assert.match(request.ssml, /pitch='\+6Hz'/);       /* persona 0Hz + 6Hz offset */
      assert.match(request.ssml, /rate='-5%'/);          /* BB persona = 0.95     */
      assert.match(request.ssml, /မင်္ဂလာပါ/);
    });
  } finally {
    await fake.close();
  }
});

test("female personas use the female neural voice", { timeout: 20000 }, async () => {
  const fake = createFakeEdgeServer();
  const port = await fake.listen();
  try {
    await withEnv({ EDGE_TTS_WSS_BASE: `ws://127.0.0.1:${port}/edge/v1` }, async () => {
      await edge.synthesizeEdge({ text: "အသံနမူနာ", voice: resolveVoice("NL") });
      assert.match(fake.requests[0].ssml, /voice name='my-MM-NilarNeural'/);
      assert.match(fake.requests[0].ssml, /pitch='\+18Hz'/);
    });
  } finally {
    await fake.close();
  }
});

test("long text is chunked and the audio is concatenated in order", { timeout: 20000 }, async () => {
  const fake = createFakeEdgeServer({ audio: fakeMp3(1, 3) });
  const port = await fake.listen();
  try {
    await withEnv({ EDGE_TTS_WSS_BASE: `ws://127.0.0.1:${port}/edge/v1` }, async () => {
      const text = Array.from({ length: 60 }, (_, i) => `ဒါကတော့ စမ်းသပ်စာကြောင်း နံပါတ် ${i} ဖြစ်ပါတယ်`).join(" ");
      const result = await edge.synthesizeEdge({ text, voice: resolveVoice("BB") });
      assert.ok(result.chunks >= 2, `expected multiple chunks, got ${result.chunks}`);
      assert.equal(fake.requests.length, result.chunks);
      assert.equal(result.audio.length, 417 * result.chunks);
    });
  } finally {
    await fake.close();
  }
});

test("a turn ending without audio is reported as an error", { timeout: 20000 }, async () => {
  const fake = createFakeEdgeServer({ mode: "no-audio" });
  const port = await fake.listen();
  try {
    await withEnv({ EDGE_TTS_WSS_BASE: `ws://127.0.0.1:${port}/edge/v1` }, async () => {
      await assert.rejects(
        edge.synthesizeEdge({ text: "စမ်းသပ်", voice: resolveVoice("BB"), timeoutMs: 4000 }),
        /without returning audio|closed/i
      );
    });
  } finally {
    await fake.close();
  }
});

test("HTTP 403 triggers a clock-skew correction and a single retry", { timeout: 20000 }, async () => {
  edge.adjustClockSkew(new Date(Date.now() - 120000).toUTCString()); /* force a skew */
  const before = edge.getClockSkewSeconds();
  const fake = createFakeEdgeServer({ forbidOnce: true, skewSeconds: 300 });
  const port = await fake.listen();

  try {
    await withEnv({ EDGE_TTS_WSS_BASE: `ws://127.0.0.1:${port}/edge/v1` }, async () => {
      const result = await edge.synthesizeEdge({ text: "ပြန်စမ်းသပ်", voice: resolveVoice("BB") });
      assert.ok(result.audio.length > 0);
      assert.equal(fake.upgrades, 2);
      assert.notEqual(edge.getClockSkewSeconds(), before);
      /* the retried handshake must carry a freshly generated token */
      assert.notEqual(fake.requests[0].params["Sec-MS-GEC"], undefined);
    });
  } finally {
    edge.adjustClockSkew(new Date(Date.now() - Date.now()).toUTCString());
    await fake.close();
  }
});

test("binary audio frames are parsed for both known size-field layouts", () => {
  const audio = Buffer.from([0xff, 0xfb, 0x90, 0x64, 1, 2, 3, 4]);
  const header = Buffer.from("X-RequestId:abc\r\nContent-Type:audio/mpeg\r\nPath:audio", "utf8");

  /* Layout A — Edge read-aloud: size includes the 2-byte length field. */
  const a = Buffer.concat([
    Buffer.from([0x00, header.length + 2]),
    header,
    Buffer.from("\r\n", "utf8"),
    audio,
  ]);
  const parsedA = edge.parseBinaryMessage(a);
  assert.equal(parsedA.headers.path, "audio");
  assert.deepEqual(parsedA.audio, audio);

  /* Layout B — size is the header text length only. */
  const b = Buffer.concat([
    Buffer.from([0x00, header.length]),
    header,
    Buffer.from("\r\n", "utf8"),
    audio,
  ]);
  const parsedB = edge.parseBinaryMessage(b);
  assert.equal(parsedB.headers.path, "audio");
  assert.deepEqual(parsedB.audio, audio);

  /* every frame must keep the request id so streams can be interleaved */
  assert.equal(parsedA.headers["x-requestid"], "abc");
  assert.equal(parsedB.headers["x-requestid"], "abc");

  /* a terminator frame with no audio must not throw */
  const empty = edge.parseBinaryMessage(Buffer.from([0x00, 0x02]));
  assert.equal(empty.audio.length, 0);
});
