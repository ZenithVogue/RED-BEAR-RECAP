/* ============================================================
   Red Bear — Edge (Microsoft) neural TTS provider · SERVER SIDE

   Browser clients cannot call this service directly: the WebSocket
   handshake requires an `Origin: chrome-extension://…` header and a
   DRM `Sec-MS-GEC` token, and the HTTP entry points reject requests
   with a browser Origin / missing Edge fingerprint (HTTP 403).
   Running it here means the upstream call carries the Edge client
   fingerprint, so CORS never enters the picture.
   ============================================================ */
"use strict";

const crypto = require("crypto");
const { connect } = require("../ws/client");
const { chunkText, escapeXml, toPitchString, toRateString } = require("./text");

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const CHROMIUM_FULL_VERSION = "143.0.3650.75";
const CHROMIUM_MAJOR_VERSION = CHROMIUM_FULL_VERSION.split(".")[0];
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;
const WIN_EPOCH = 11644473600;
const OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
const MAX_CHUNK_CHARS = 1200;

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Override only used by the local test-suite. */
function wssBase() {
  return (process.env.EDGE_TTS_WSS_BASE || "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1").replace(/\/+$/, "");
}

let clockSkewSeconds = 0;

/** Windows file time / 100ns ticks, rounded to 5 minutes, sha256'd. */
function generateSecMsGec(nowSeconds = Date.now() / 1000 + clockSkewSeconds) {
  let ticks = nowSeconds + WIN_EPOCH;
  ticks -= ticks % 300;
  ticks *= 1e7;
  const toHash = `${Math.round(ticks)}${TRUSTED_CLIENT_TOKEN}`;
  return crypto.createHash("sha256").update(toHash, "ascii").digest("hex").toUpperCase();
}

function edgeTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${DAYS[date.getUTCDay()]} ${MONTHS[date.getUTCMonth()]} ${pad(date.getUTCDate())} ${date.getUTCFullYear()} `
    + `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} GMT+0000 (Coordinated Universal Time)`;
}

/** The exact header fingerprint the Edge read-aloud client sends. */
function edgeHeaders() {
  return {
    "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) `
      + `Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`,
    "Accept-Language": "en-US,en;q=0.9",
    Pragma: "no-cache",
    "Cache-Control": "no-cache",
    Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
    Cookie: `muid=${crypto.randomBytes(16).toString("hex").toUpperCase()};`,
  };
}

function buildWssUrl() {
  return `${wssBase()}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`
    + `&ConnectionId=${crypto.randomBytes(16).toString("hex")}`
    + `&Sec-MS-GEC=${generateSecMsGec()}`
    + `&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`;
}

function adjustClockSkew(dateHeader) {
  if (!dateHeader) return false;
  const parsed = Date.parse(dateHeader);
  if (!Number.isFinite(parsed)) return false;
  clockSkewSeconds += parsed / 1000 - Date.now() / 1000;
  return true;
}

function getClockSkewSeconds() {
  return clockSkewSeconds;
}

function buildSsml(text, { edgeVoice, rate, pitchHz }) {
  return "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='my-MM'>"
    + `<voice name='${edgeVoice}'>`
    + `<prosody pitch='${toPitchString(pitchHz)}' rate='${toRateString(rate)}' volume='+0%'>`
    + escapeXml(text)
    + "</prosody></voice></speak>";
}

function parseHeaderLines(text) {
  const headers = {};
  for (const line of String(text).split("\r\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
  }
  return headers;
}

function parseTextMessage(raw) {
  const text = String(raw);
  const split = text.indexOf("\r\n\r\n");
  const headerBlock = split >= 0 ? text.slice(0, split) : text;
  const body = split >= 0 ? text.slice(split + 4) : "";
  return { headers: parseHeaderLines(headerBlock), body };
}

/** MPEG audio sync word (0xFF Ex) — used to sanity-check the audio offset. */
function hasMp3Sync(buffer, offset) {
  if (!buffer || offset < 0 || offset + 1 >= buffer.length) return false;
  return buffer[offset] === 0xff && (buffer[offset + 1] & 0xe0) === 0xe0;
}

/**
 * Binary "Path:audio" frames are laid out as:
 *
 *     [2-byte size][headers…][\r\n][mp3 bytes…]
 *
 * The service historically reports `size` as the header block *including*
 * the 2 length bytes (Edge read-aloud layout). Some deployments report the
 * header text length only, so both interpretations are scored — whichever
 * yields a `Path:audio` header plus an MPEG sync word wins.
 */
function parseBinaryMessage(buffer) {
  const empty = { headers: {}, audio: Buffer.alloc(0) };
  if (!buffer || buffer.length < 2) return empty;

  const sizeField = buffer.readUInt16BE(0);
  const candidates = [];

  if (sizeField >= 2 && sizeField <= buffer.length) {
    /* Layout A — Edge read-aloud: size covers the length field itself. */
    candidates.push({ block: buffer.subarray(2, sizeField), audioStart: sizeField + 2 });
  }
  if (sizeField + 2 <= buffer.length) {
    /* Layout B — size is the header text length. */
    candidates.push({ block: buffer.subarray(2, sizeField + 2), audioStart: sizeField + 4 });
  }

  let best = null;
  for (const candidate of candidates) {
    const text = candidate.block.toString("utf8");
    let score = 0;
    if (/path:\s*audio/i.test(text)) score += 4;
    if (/content-type:/i.test(text)) score += 1;
    if (hasMp3Sync(buffer, candidate.audioStart)) score += 2;
    if (!best || score > best.score) {
      best = {
        score,
        headers: parseHeaderLines(text),
        audio: buffer.subarray(Math.min(candidate.audioStart, buffer.length)),
      };
    }
  }

  return best ? { headers: best.headers, audio: best.audio } : empty;
}

class EdgeTtsError extends Error {
  constructor(message, extra = {}) {
    super(message);
    this.name = "EdgeTtsError";
    this.provider = "edge";
    Object.assign(this, extra);
  }
}

/**
 * One WebSocket round-trip: speech.config → SSML → audio frames → turn.end.
 * @returns {Promise<Buffer>} MP3 bytes
 */
function synthesizeChunk(text, { edgeVoice, rate, pitchHz, timeoutMs = 25000, attempt = 0 }) {
  return new Promise((resolve, reject) => {
    let ws = null;
    let settled = false;
    const audioFrames = [];
    let totalBytes = 0;

    const cleanupTimers = () => {
      clearTimeout(timer);
      clearTimeout(idleTimer);
    };

    const finish = (error, audio) => {
      if (settled) return;
      settled = true;
      cleanupTimers();
      try {
        if (ws) ws.destroy();
      } catch (_) {}
      if (error) reject(error);
      else resolve(audio);
    };

    const timer = setTimeout(() => {
      finish(new EdgeTtsError(`Edge TTS timed out after ${timeoutMs}ms`, { code: "ETIMEDOUT", attempt }));
    }, timeoutMs);

    const idleTimer = setTimeout(() => {
      if (!totalBytes) finish(new EdgeTtsError("Edge TTS returned no audio before the idle deadline", { code: "ETIMEDOUT" }));
    }, Math.min(timeoutMs, 14000));

    connect(buildWssUrl(), { headers: edgeHeaders(), connectTimeoutMs: Math.min(timeoutMs, 10000) })
      .then((socket) => {
        if (settled) {
          socket.destroy();
          return;
        }
        ws = socket;

        socket.on("message", (raw) => {
          const { headers } = parseTextMessage(raw);
          const path = (headers.path || "").toLowerCase();
          if (path === "turn.end") {
            if (!totalBytes) {
              finish(new EdgeTtsError("Edge TTS completed the turn without returning audio", { code: "NO_AUDIO" }));
              return;
            }
            const audio = Buffer.concat(audioFrames, totalBytes);
            finish(null, audio);
            try {
              socket.close(1000, "done");
            } catch (_) {}
          }
        });

        socket.on("binary", (buffer) => {
          const { headers, audio } = parseBinaryMessage(buffer);
          if ((headers.path || "").toLowerCase() !== "audio") return;
          if (!audio || !audio.length) return;
          audioFrames.push(audio);
          totalBytes += audio.length;
        });

        socket.on("error", (error) => finish(new EdgeTtsError(`Edge TTS socket error: ${error.message}`, {
          status: error.status,
          date: error.date,
          code: error.code,
        })));

        socket.on("close", ({ code, reason }) => {
          if (!totalBytes) {
            finish(new EdgeTtsError(`Edge TTS connection closed (${code}${reason ? " " + reason : ""}) before audio arrived`, {
              code: "CLOSED",
              closeCode: code,
            }));
          } else {
            finish(null, Buffer.concat(audioFrames, totalBytes));
          }
        });

        const now = edgeTimestamp();
        socket.sendText(
          `X-Timestamp:${now}\r\n`
          + "Content-Type:application/json; charset=utf-8\r\n"
          + "Path:speech.config\r\n\r\n"
          + `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},`
          + `"outputFormat":"${OUTPUT_FORMAT}"}}}}\r\n`
        );
        socket.sendText(
          `X-RequestId:${crypto.randomBytes(16).toString("hex")}\r\n`
          + "Content-Type:application/ssml+xml\r\n"
          + `X-Timestamp:${now}Z\r\n`
          + "Path:ssml\r\n\r\n"
          + buildSsml(text, { edgeVoice, rate, pitchHz })
        );
      })
      .catch((error) => {
        /* A 403 usually means our clock drifted outside the token window;
           Microsoft returns the authoritative Date header so we can fix it.
           (No socket exists on this path, so the promise stays pending.) */
        if (error && Number(error.status) === 403 && attempt === 0 && adjustClockSkew(error.date)) {
          cleanupTimers();
          synthesizeChunk(text, { edgeVoice, rate, pitchHz, timeoutMs, attempt: 1 }).then(resolve, reject);
          return;
        }
        finish(new EdgeTtsError(`Edge TTS handshake failed: ${error.message}`, {
          status: error.status,
          date: error.date,
          code: error.code,
        }));
      });
  });
}

/**
 * Synthesize text with Edge neural voices.
 * Long text is split into chunks that are synthesized sequentially and
 * concatenated (the output is a constant-bitrate 24kHz mono MP3, so the
 * concatenation stays a single playable stream).
 */
async function synthesizeEdge({ text, voice, pitchOffsetHz = 0, rateMultiplier, timeoutMs = 28000 }) {
  const edgeVoice = voice.edgeVoice;
  const rate = Number.isFinite(rateMultiplier) ? rateMultiplier : voice.rate || 1;
  const pitchHz = Number(voice.pitch || 0) + Number(pitchOffsetHz || 0);
  const chunks = chunkText(text, MAX_CHUNK_CHARS);
  if (!chunks.length) throw new EdgeTtsError("No speakable text supplied", { code: "EMPTY_TEXT" });

  const buffers = [];
  for (const chunk of chunks) {
    const audio = await synthesizeChunk(chunk, { edgeVoice, rate, pitchHz, timeoutMs });
    if (audio && audio.length) buffers.push(audio);
  }
  const merged = Buffer.concat(buffers);
  if (!merged.length) throw new EdgeTtsError("Edge TTS produced an empty stream", { code: "NO_AUDIO" });
  return { audio: merged, contentType: "audio/mpeg", provider: "edge", voice: edgeVoice, chunks: chunks.length };
}

module.exports = {
  EdgeTtsError,
  CHROMIUM_FULL_VERSION,
  SEC_MS_GEC_VERSION,
  TRUSTED_CLIENT_TOKEN,
  OUTPUT_FORMAT,
  adjustClockSkew,
  buildSsml,
  buildWssUrl,
  edgeHeaders,
  edgeTimestamp,
  generateSecMsGec,
  getClockSkewSeconds,
  parseBinaryMessage,
  parseHeaderLines,
  parseTextMessage,
  synthesizeEdge,
};
