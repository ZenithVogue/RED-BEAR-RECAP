/* ============================================================
   Red Bear — Google Translate TTS provider · SERVER SIDE (fallback)

   Browsers get HTTP 403 from translate.google.com/translate_tts
   because the endpoint rejects cross-origin, header-less requests.
   Server-side we can send a real Referer + User-Agent, so the same
   endpoint answers normally. No CORS involvement at all.
   ============================================================ */
"use strict";

const https = require("https");
const http = require("http");
const { chunkText } = require("./text");

const MAX_CHUNK_CHARS = 180;
const DEFAULT_BASE = "https://translate.google.com/translate_tts";

function baseUrl() {
  return (process.env.GOOGLE_TTS_BASE || DEFAULT_BASE).replace(/\/+$/, "");
}

function googleHeaders() {
  return {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
      + "Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0",
    Referer: "https://translate.google.com/",
    Origin: "https://translate.google.com",
    Accept: "audio/mpeg,audio/*;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-Mode": "no-cors",
    "Sec-Fetch-Dest": "audio",
    "Accept-Encoding": "identity",
  };
}

class GoogleTtsError extends Error {
  constructor(message, extra = {}) {
    super(message);
    this.name = "GoogleTtsError";
    this.provider = "google";
    Object.assign(this, extra);
  }
}

function clampSpeed(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 1;
  return Math.min(1.5, Math.max(0.7, num));
}

function buildGoogleUrl({ text, speed = 1, locale = "my", index = 0, total = 1 }) {
  const params = new URLSearchParams({
    ie: "UTF-8",
    q: text,
    tl: locale,
    client: "tw-ob",
    ttsspeed: clampSpeed(speed).toFixed(2),
    idx: String(index),
    total: String(total),
    textlen: String(String(text).length),
  });
  return `${baseUrl()}?${params.toString()}`;
}

function requestOnce(url, { timeoutMs = 15000, redirects = 2 } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const transport = target.protocol === "http:" ? http : https;
    const req = transport.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (target.protocol === "http:" ? 80 : 443),
        path: `${target.pathname}${target.search}`,
        method: "GET",
        headers: googleHeaders(),
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
          const next = new URL(res.headers.location, target).toString();
          res.resume();
          requestOnce(next, { timeoutMs, redirects: redirects - 1 }).then(resolve, reject);
          return;
        }
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks);
          const type = String(res.headers["content-type"] || "").toLowerCase();
          if (res.statusCode !== 200) {
            reject(new GoogleTtsError(`Google Translate TTS responded with HTTP ${res.statusCode}`, {
              status: res.statusCode,
              contentType: type,
              body: body.subarray(0, 200).toString("utf8"),
            }));
            return;
          }
          if (type.includes("text/html") || !body.length) {
            reject(new GoogleTtsError("Google Translate TTS returned a non-audio response", {
              status: res.statusCode,
              contentType: type,
            }));
            return;
          }
          resolve({ body, contentType: type || "audio/mpeg" });
        });
      }
    );

    const timer = setTimeout(() => {
      req.destroy(new GoogleTtsError(`Google Translate TTS timed out after ${timeoutMs}ms`, { code: "ETIMEDOUT" }));
    }, timeoutMs);
    if (timer.unref) timer.unref();

    req.on("error", (error) => {
      clearTimeout(timer);
      if (error instanceof GoogleTtsError) reject(error);
      else reject(new GoogleTtsError(`Google Translate TTS request failed: ${error.message}`, { code: error.code }));
    });
    req.end();
  });
}

async function fetchChunk(url, { attempts = 2, timeoutMs = 15000 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await requestOnce(url, { timeoutMs });
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
    }
  }
  throw lastError || new GoogleTtsError("Google Translate TTS request failed");
}

/**
 * Synthesize text through Google Translate TTS.
 * Pitch is not supported by this endpoint — callers receive
 * `pitchApplied: false` so the UI can say so honestly.
 */
async function synthesizeGoogle({ text, voice, pitchOffsetHz = 0, locale = "my", timeoutMs = 15000 }) {
  const speed = clampSpeed(voice && voice.rate ? voice.rate : 1);
  const chunks = chunkText(text, MAX_CHUNK_CHARS);
  if (!chunks.length) throw new GoogleTtsError("No speakable text supplied", { code: "EMPTY_TEXT" });

  const buffers = [];
  for (let i = 0; i < chunks.length; i++) {
    const url = buildGoogleUrl({ text: chunks[i], speed, locale, index: i, total: chunks.length });
    const { body } = await fetchChunk(url, { timeoutMs });
    buffers.push(body);
  }
  const merged = Buffer.concat(buffers);
  if (!merged.length) throw new GoogleTtsError("Google Translate TTS produced an empty stream", { code: "NO_AUDIO" });
  return {
    audio: merged,
    contentType: "audio/mpeg",
    provider: "google",
    voice: `google-translate:${locale}`,
    chunks: chunks.length,
    pitchApplied: false,
    pitchOffsetHz: Number(pitchOffsetHz) || 0,
  };
}

module.exports = {
  GoogleTtsError,
  buildGoogleUrl,
  clampSpeed,
  googleHeaders,
  synthesizeGoogle,
};
