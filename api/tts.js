/* ============================================================
   Red Bear — POST /api/tts   (server-side TTS route)

   Accepts:  POST { text, voice, pitch }
   Returns:  200 audio/mpeg  (raw MP3 bytes, playable by <audio>)
             400 bad request · 413 too long · 429 rate limited
             502 upstream failure (JSON with a `fallback` hint)

   The browser never talks to Edge/Google again: this route performs the
   upstream request with the correct User-Agent / Referer / Origin /
   Sec-MS-GEC fingerprint, so neither CORS nor client-IP blocking applies.

   Deployable as-is on Vercel / Netlify / any Node host
   (`module.exports = handleTts` is a valid Node function handler), and it
   is mounted by the bundled `server.js` for local development.
   ============================================================ */
"use strict";

const { AudioCache } = require("../lib/tts/cache");
const { PERSONAS, listVoices, resolveVoice } = require("../lib/tts/personas");
const { cleanText, estimateDurationMs } = require("../lib/tts/text");
const { synthesizeEdge } = require("../lib/tts/edge");
const { synthesizeGoogle } = require("../lib/tts/google");

const MAX_TEXT_CHARS = Number(process.env.TTS_MAX_CHARS || 6000);
const MAX_BODY_BYTES = 256 * 1024;
const RATE_LIMIT = Number(process.env.TTS_RATE_LIMIT || 120);
const RATE_WINDOW_MS = Number(process.env.TTS_RATE_WINDOW_MS || 60000);

const cache = new AudioCache();

/* ---------------- helpers ---------------- */

function providerOrder() {
  const known = ["edge", "google"];
  const configured = String(process.env.TTS_PROVIDERS || "").trim();
  let order = configured
    ? configured.split(",").map((s) => s.trim().toLowerCase()).filter((s) => known.includes(s))
    : known.slice();
  if (process.env.TTS_DISABLE_EDGE === "1") order = order.filter((p) => p !== "edge");
  if (process.env.TTS_DISABLE_GOOGLE === "1") order = order.filter((p) => p !== "google");
  return order.length ? order : known;
}

const rateBuckets = new Map();
function rateLimited(key) {
  if (!RATE_LIMIT || RATE_LIMIT <= 0) return { limited: false, remaining: Infinity };
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    if (rateBuckets.size > 5000) {
      for (const [k, v] of rateBuckets) if (v.resetAt <= now) rateBuckets.delete(k);
    }
    return { limited: false, remaining: RATE_LIMIT - 1 };
  }
  bucket.count += 1;
  if (bucket.count > RATE_LIMIT) {
    return { limited: true, retryAfter: Math.ceil((bucket.resetAt - now) / 1000), remaining: 0 };
  }
  return { limited: false, remaining: RATE_LIMIT - bucket.count };
}

function clientIp(req) {
  const forwarded = req.headers && (req.headers["x-forwarded-for"] || req.headers["x-real-ip"]);
  if (forwarded) return String(forwarded).split(",")[0].trim();
  return (req.socket && req.socket.remoteAddress) || "unknown";
}

function readBody(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error("Request body too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", (error) => reject(Object.assign(error, { status: 400 })));
  });
}

function parseBody(raw, contentType) {
  const type = String(contentType || "").toLowerCase();
  if (type.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    throw Object.assign(new Error("Request body is not valid JSON"), { status: 400 });
  }
}

function clampPitch(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(-30, Math.min(30, Math.round(num)));
}

function normalizeRequest(input = {}) {
  const text = cleanText(input.text != null ? input.text : input.q);
  if (!text) throw Object.assign(new Error("Missing required field: text"), { status: 400 });
  if (text.length > MAX_TEXT_CHARS) {
    throw Object.assign(
      new Error(`Text is too long (${text.length} chars, limit ${MAX_TEXT_CHARS})`),
      { status: 413 }
    );
  }
  const voice = resolveVoice(input.voice != null ? input.voice : input.voiceId || input.persona);
  const pitch = clampPitch(input.pitch);
  return { text, voice, pitch };
}

/** Run the provider chain (Edge → Google) and merge the audio. */
async function synthesize(input) {
  const { text, voice, pitch } = input;
  const cacheKey = AudioCache.key({ text, voice: voice.edgeVoice + ":" + voice.code, pitch: `${pitch}/${voice.pitch}` });

  const cached = cache.get(cacheKey);
  if (cached) return { ...cached, cache: "hit", text };

  const failures = [];
  const order = input.providers || providerOrder();

  for (const provider of order) {
    const startedAt = Date.now();
    try {
      const result = provider === "edge"
        ? await synthesizeEdge({ text, voice, pitchOffsetHz: pitch })
        : await synthesizeGoogle({ text, voice, pitchOffsetHz: pitch });
      const entry = {
        audio: result.audio,
        contentType: result.contentType || "audio/mpeg",
        provider: result.provider,
        voice: result.voice,
        chunks: result.chunks,
        pitchApplied: result.pitchApplied !== false,
        elapsedMs: Date.now() - startedAt,
      };
      cache.set(cacheKey, entry);
      return { ...entry, cache: "miss", text };
    } catch (error) {
      failures.push({
        provider,
        error: error && error.message ? error.message : String(error),
        status: error && error.status,
      });
    }
  }

  const error = new Error("All TTS providers failed");
  error.status = 502;
  error.code = "tts_unavailable";
  error.failures = failures;
  throw error;
}

function baseHeaders(extra = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Access-Control-Max-Age": "86400",
    "X-TTS-Server": "red-bear/2.0",
    ...extra,
  };
}

function sendJson(res, status, payload, extra = {}) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  res.writeHead(status, baseHeaders({
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
    ...extra,
  }));
  res.end(body);
}

function sendAudio(res, result, { download = false } = {}) {
  const audio = result.audio;
  res.writeHead(200, baseHeaders({
    "Content-Type": result.contentType || "audio/mpeg",
    "Content-Length": audio.length,
    "Cache-Control": "public, max-age=3600",
    "X-TTS-Provider": result.provider,
    "X-TTS-Cache": result.cache || "miss",
    "X-TTS-Voice": String(result.voice || ""),
    "X-TTS-Pitch": String(result.pitchApplied === false ? "unsupported" : "applied"),
    "X-TTS-Elapsed-Ms": String(result.elapsedMs || 0),
    ...(download ? { "Content-Disposition": 'attachment; filename="red-bear-tts.mp3"' } : {}),
  }));
  res.end(audio);
}

async function handleVoices(req, res) {
  sendJson(res, 200, {
    ok: true,
    locale: "my-MM",
    providers: providerOrder(),
    voices: listVoices(),
    count: PERSONAS.length,
  });
}

/**
 * Node-style HTTP handler — works on Vercel serverless functions,
 * in `server.js`, and inside Next.js Node-runtime API routes.
 */
async function handleTts(req, res) {
  const method = String(req.method || "GET").toUpperCase();

  if (method === "OPTIONS") {
    res.writeHead(204, baseHeaders({ "Content-Length": 0 }));
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://${(req.headers && req.headers.host) || "localhost"}`);

  if (url.pathname.replace(/\/+$/, "").endsWith("/voices")) {
    await handleVoices(req, res);
    return;
  }

  if (url.pathname.replace(/\/+$/, "").endsWith("/health")) {
    sendJson(res, 200, { ok: true, providers: providerOrder(), cache: cache.stats() });
    return;
  }

  if (method !== "POST" && method !== "GET") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed", message: "Use POST or GET" }, { Allow: "POST, GET, OPTIONS" });
    return;
  }

  const limit = rateLimited(clientIp(req));
  if (limit.limited) {
    sendJson(res, 429, {
      ok: false,
      error: "rate_limited",
      message: "Too many TTS requests — please slow down.",
      retryAfterSeconds: limit.retryAfter,
    }, { "Retry-After": String(limit.retryAfter || 1) });
    return;
  }

  let payload;
  try {
    if (method === "POST") {
      const raw = await readBody(req);
      payload = parseBody(raw, req.headers && req.headers["content-type"]);
    } else {
      payload = Object.fromEntries(url.searchParams.entries());
    }
  } catch (error) {
    sendJson(res, error.status || 400, {
      ok: false,
      error: "bad_request",
      message: error.message,
    });
    return;
  }

  let request;
  try {
    request = normalizeRequest(payload);
  } catch (error) {
    sendJson(res, error.status || 400, { ok: false, error: "invalid_request", message: error.message });
    return;
  }

  /* Explicit `?format=json`, or an Accept header that asks for JSON and does
     not also accept audio. Browsers send a wildcard accept header, so they
     always receive raw MP3 bytes. */
  const accept = String((req.headers && req.headers.accept) || "");
  const wantsJson = String(url.searchParams.get("format") || "").toLowerCase() === "json"
    || (/application\/json/.test(accept) && !/audio\/|\*\/\*/.test(accept));

  try {
    const result = await synthesize(request);
    if (!wantsJson) {
      sendAudio(res, result, { download: url.searchParams.get("download") === "1" });
      return;
    }
    const voice = request.voice;
    sendJson(res, 200, {
      ok: true,
      provider: result.provider,
      voice: voice.code,
      voiceName: voice.name,
      gender: voice.gender,
      edgeVoice: result.voice,
      pitch: request.pitch,
      pitchApplied: result.pitchApplied !== false,
      mimeType: result.contentType || "audio/mpeg",
      bytes: result.audio.length,
      chunks: result.chunks || 1,
      durationMs: estimateDurationMs(request.text, voice.rate),
      cache: result.cache,
      audioUrl: `data:${result.contentType || "audio/mpeg"};base64,${result.audio.toString("base64")}`,
    });
  } catch (error) {
    sendJson(res, error.status || 502, {
      ok: false,
      error: error.code || "tts_failed",
      message: error.message,
      failures: error.failures || [],
      fallback: "browser-speech-synthesis",
      hint: "Run the bundled Node server (`npm start`) so /api/tts can reach the upstream TTS services.",
    });
  }
}

module.exports = handleTts;
module.exports.handleTts = handleTts;
module.exports.synthesize = synthesize;
module.exports.normalizeRequest = normalizeRequest;
module.exports.cache = cache;
module.exports.providerOrder = providerOrder;
module.exports.MAX_TEXT_CHARS = MAX_TEXT_CHARS;
module.exports.MAX_BODY_BYTES = MAX_BODY_BYTES;
module.exports.RATE_LIMIT = RATE_LIMIT;
