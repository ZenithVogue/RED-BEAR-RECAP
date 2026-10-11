/* ============================================================
   /api/tts route + static server integration tests

   Boots the real `node server.js` process against local fake
   upstreams, then drives it over HTTP exactly like the browser does.
   ============================================================ */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { createFakeEdgeServer, createFakeGoogleServer, fakeMp3 } = require("./helpers/fake-upstreams");
const { startStudioServer, postJson } = require("./helpers/server");

const ROOT = path.resolve(__dirname, "..");

async function withStack(options, run) {
  const edgeFake = createFakeEdgeServer(options.edge || {});
  const googleFake = createFakeGoogleServer(options.google || {});
  const edgePort = await edgeFake.listen();
  const googlePort = await googleFake.listen();

  const server = await startStudioServer({
    EDGE_TTS_WSS_BASE: `ws://127.0.0.1:${edgePort}/edge/v1`,
    GOOGLE_TTS_BASE: `http://127.0.0.1:${googlePort}/translate_tts`,
    ...(options.env || {}),
  });

  try {
    await run({ server, edgeFake, googleFake });
  } finally {
    await server.stop();
    await edgeFake.close();
    await googleFake.close();
  }
}

test("serves the studio shell and its assets", { timeout: 25000 }, async () => {
  await withStack({}, async ({ server }) => {
    const page = await fetch(server.base + "/");
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-type"), /text\/html/);
    const html = await page.text();
    assert.match(html, /<title>/i);
    assert.match(html, /app\.js/);

    const js = await fetch(server.base + "/app.js");
    assert.equal(js.status, 200);
    assert.match(js.headers.get("content-type"), /javascript/);

    const css = await fetch(server.base + "/styles.css");
    assert.equal(css.status, 200);
    assert.match(css.headers.get("content-type"), /text\/css/);

    const font = await fetch(server.base + "/fonts/noto-sans-myanmar-500-0.woff2");
    assert.equal(font.status, 200);
    assert.match(font.headers.get("content-type"), /font\/woff2/);

    const missing = await fetch(server.base + "/nope.js");
    assert.equal(missing.status, 404);

    /* path traversal and source-file exposure must be refused */
    const traversal = await fetch(server.base + "/..%2f..%2fetc%2fpasswd");
    assert.equal(traversal.status, 403, "traversal outside the docroot must be blocked");

    /* WHATWG URL normalisation collapses %2e sequences; the request then
       resolves inside the docroot (or 404s) but must never leak the file. */
    const encodedDots = await fetch(server.base + "/%2e%2e/%2e%2e/etc/passwd");
    const encodedBody = await encodedDots.text();
    assert.doesNotMatch(encodedBody, /root:x:/, "must never serve /etc/passwd");
    assert.ok([403, 404].includes(encodedDots.status) || /<!doctype html/i.test(encodedBody));

    for (const secret of ["/package.json", "/server.js", "/lib/tts/edge.js", "/.git/config", "/api/tts.js"]) {
      const res = await fetch(server.base + secret);
      assert.ok([403, 404].includes(res.status), `${secret} must not be served (got ${res.status})`);
    }
  });
});

test("GET /api/voices exposes the persona registry with gender accents", { timeout: 25000 }, async () => {
  await withStack({}, async ({ server }) => {
    const res = await fetch(server.base + "/api/voices");
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.count, 10);
    assert.deepEqual(payload.providers, ["edge", "google"]);
    const bb = payload.voices.find((v) => v.code === "BB");
    const nl = payload.voices.find((v) => v.code === "NL");
    assert.equal(bb.genderLabel, "Male");
    assert.equal(bb.accent, "#2563eb");
    assert.equal(nl.genderLabel, "Female");
    assert.equal(nl.accent, "#ec4899");
  });
});

test("GET /api/health reports providers and cache state", { timeout: 25000 }, async () => {
  await withStack({}, async ({ server }) => {
    const payload = await (await fetch(server.base + "/api/health")).json();
    assert.equal(payload.ok, true);
    assert.ok(Array.isArray(payload.providers));
    assert.ok(payload.cache.entries >= 0);
  });
});

test("POST /api/tts returns raw audio/mpeg for the requested persona", { timeout: 25000 }, async () => {
  const expected = fakeMp3(3, 5);
  await withStack({ edge: { audio: expected } }, async ({ server, edgeFake }) => {
    const { res, buffer } = await postJson(server.base, "/api/tts", {
      text: "မင်္ဂလာပါ၊ ဒါကတော့ နမူနာ စကားပြော အသံဖိုင် ဖြစ်ပါတယ်",
      voice: "NL",
      pitch: 4,
    });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "audio/mpeg");
    assert.equal(res.headers.get("cache-control"), "public, max-age=3600");
    assert.equal(res.headers.get("x-tts-provider"), "edge");
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
    assert.equal(Number(res.headers.get("content-length")), expected.length);
    assert.deepEqual(buffer, expected);

    assert.equal(edgeFake.requests.length, 1);
    const [request] = edgeFake.requests;
    assert.match(request.ssml, /voice name='my-MM-NilarNeural'/);
    assert.match(request.ssml, /pitch='\+22Hz'/); /* persona 18Hz + slider 4Hz */
    assert.match(request.headers["user-agent"], /Edg\//);
  });
});

test("repeated identical requests are served from the server-side cache", { timeout: 25000 }, async () => {
  await withStack({}, async ({ server, edgeFake }) => {
    const body = { text: "တူညီသောစာသား", voice: "BB", pitch: 0 };
    const first = await postJson(server.base, "/api/tts", body);
    const second = await postJson(server.base, "/api/tts", body);

    assert.equal(first.res.headers.get("x-tts-cache"), "miss");
    assert.equal(second.res.headers.get("x-tts-cache"), "hit");
    assert.deepEqual(first.buffer, second.buffer);
    assert.equal(edgeFake.requests.length, 1, "the upstream must only be hit once");
  });
});

test("GET /api/tts streams audio for direct <audio src> playback", { timeout: 25000 }, async () => {
  const expected = fakeMp3(2, 9);
  await withStack({ edge: { audio: expected } }, async ({ server }) => {
    const url = `${server.base}/api/tts?text=${encodeURIComponent("မင်္ဂလာပါ")}&voice=BB&pitch=-3`;
    const res = await fetch(url);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "audio/mpeg");
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), expected);
  });
});

test("POST /api/tts can return a JSON envelope with a data URL", { timeout: 25000 }, async () => {
  const expected = fakeMp3(2, 2);
  await withStack({ edge: { audio: expected } }, async ({ server }) => {
    const { res, buffer } = await postJson(
      server.base,
      "/api/tts?format=json",
      { text: "JSON စမ်းသပ်မှု", voice: "BB", pitch: 0 },
      { Accept: "application/json" }
    );
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /application\/json/);
    const payload = JSON.parse(buffer.toString("utf8"));
    assert.equal(payload.ok, true);
    assert.equal(payload.mimeType, "audio/mpeg");
    assert.equal(payload.gender, "male");
    assert.match(payload.audioUrl, /^data:audio\/mpeg;base64,/);
    assert.deepEqual(Buffer.from(payload.audioUrl.split(",")[1], "base64"), expected);
    assert.ok(payload.durationMs > 0);
  });
});

test("falls back to Google Translate TTS when Edge fails", { timeout: 25000 }, async () => {
  const googleAudio = fakeMp3(2, 21);
  await withStack(
    { edge: { mode: "no-audio" }, google: { audio: googleAudio } },
    async ({ server, edgeFake, googleFake }) => {
      const { res, buffer } = await postJson(server.base, "/api/tts", { text: "ပြန်လည်စမ်းသပ်", voice: "BB" });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("x-tts-provider"), "google");
      assert.deepEqual(buffer, googleAudio);

      assert.equal(edgeFake.requests.length, 1);
      assert.equal(googleFake.requests.length, 1);
      const [request] = googleFake.requests;
      assert.equal(request.params.client, "tw-ob");
      assert.equal(request.params.tl, "my");
      assert.match(request.headers.referer, /translate\.google\.com/);
      assert.match(request.headers["user-agent"], /Mozilla\/5\.0/);
      assert.equal(request.params.idx, "0");
      assert.equal(request.params.total, "1");
      assert.match(request.headers.accept, /audio\/mpeg/);
    }
  );
});

test("an all-provider failure returns 502 with a client-side fallback hint", { timeout: 25000 }, async () => {
  await withStack(
    { edge: { mode: "no-audio" }, google: { status: 403 } },
    async ({ server }) => {
      const { res, buffer } = await postJson(server.base, "/api/tts", { text: "ဘယ်တော့မှ မအောင်မြင်ပါ", voice: "BB" });
      assert.equal(res.status, 502);
      const payload = JSON.parse(buffer.toString("utf8"));
      assert.equal(payload.ok, false);
      assert.equal(payload.error, "tts_unavailable");
      assert.equal(payload.fallback, "browser-speech-synthesis");
      assert.equal(payload.failures.length, 2);
      assert.ok(payload.failures.every((f) => f.provider && f.error));
    }
  );
});

test("invalid payloads are rejected with helpful status codes", { timeout: 25000 }, async () => {
  await withStack({}, async ({ server }) => {
    const noText = await postJson(server.base, "/api/tts", { voice: "BB" });
    assert.equal(noText.res.status, 400);
    assert.match(JSON.parse(noText.buffer.toString()).message, /text/);

    const badJson = await fetch(server.base + "/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    assert.equal(badJson.status, 400);

    const tooLong = await postJson(server.base, "/api/tts", { text: "က".repeat(7000), voice: "BB" });
    assert.equal(tooLong.res.status, 413);

    const wrongMethod = await fetch(server.base + "/api/tts", { method: "DELETE" });
    assert.equal(wrongMethod.status, 405);

    const cors = await fetch(server.base + "/api/tts", { method: "OPTIONS" });
    assert.equal(cors.status, 204);
    assert.equal(cors.headers.get("access-control-allow-methods"), "GET, POST, OPTIONS");
  });
});

test("unknown voice codes still produce audio through the default persona", { timeout: 25000 }, async () => {
  await withStack({}, async ({ server, edgeFake }) => {
    const { res } = await postJson(server.base, "/api/tts", { text: "အမည်မသိ အသံ", voice: "ZZ" });
    assert.equal(res.status, 200);
    assert.match(edgeFake.requests[0].ssml, /voice name='my-MM-ThihaNeural'/);
  });
});

test("a disabled provider chain is respected (edge off → google only)", { timeout: 25000 }, async () => {
  const googleAudio = fakeMp3(2, 4);
  await withStack(
    { env: { TTS_DISABLE_EDGE: "1" }, google: { audio: googleAudio } },
    async ({ server, edgeFake, googleFake }) => {
      const { res } = await postJson(server.base, "/api/tts", { text: "ဂူဂယ်သာ", voice: "NL" });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("x-tts-provider"), "google");
      assert.equal(edgeFake.requests.length, 0);
      assert.equal(googleFake.requests.length, 1);
    }
  );
});

test("the rate limiter protects the endpoint", { timeout: 25000 }, async () => {
  await withStack({ env: { TTS_RATE_LIMIT: "3", TTS_RATE_WINDOW_MS: "60000" } }, async ({ server }) => {
    const statuses = [];
    for (let i = 0; i < 4; i++) {
      const { res } = await postJson(server.base, "/api/tts", { text: `ကန့်သတ် ${i}`, voice: "BB" });
      statuses.push(res.status);
    }
    assert.deepEqual(statuses.slice(0, 3), [200, 200, 200]);
    assert.equal(statuses[3], 429);
  });
});

test("frontend never calls the upstream TTS services from the browser", { timeout: 25000 }, () => {
  const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert.doesNotMatch(app, /translate\.google\.com/, "app.js must not fetch Google TTS directly");
  assert.doesNotMatch(app, /translate_tts/, "app.js must not build Google TTS URLs");
  assert.doesNotMatch(app, /corsproxy\.io\/\?url=[^]*translate/, "app.js must not proxy TTS through CORS relays");
  assert.match(app, /\/api\/tts/, "app.js must call the server-side TTS route");
  assert.match(app, /URL\.createObjectURL\(/, "app.js must play the returned Blob via an object URL");
});
