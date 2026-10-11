/* ============================================================
   Red Bear — Text normalisation helpers shared by TTS providers
   ============================================================ */
"use strict";

/** Characters the Edge/Azure speech service rejects outright. */
function removeIncompatibleCharacters(input) {
  const text = String(input == null ? "" : input);
  let out = "";
  for (const char of text) {
    const code = char.codePointAt(0);
    if ((code >= 0 && code <= 8) || (code >= 11 && code <= 12) || (code >= 14 && code <= 31)) {
      out += " ";
    } else if (code === 0x7f) {
      out += " ";
    } else {
      out += char;
    }
  }
  return out;
}

/** Collapse runaway whitespace while preserving intentional line breaks. */
function normalizeWhitespace(input) {
  return String(input == null ? "" : input)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** Full clean-up pipeline applied to every request body. */
function cleanText(input) {
  return normalizeWhitespace(removeIncompatibleCharacters(input));
}

function escapeXml(input) {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Split long text into provider-friendly chunks, preferring newline /
 * space boundaries so speech is never cut mid-word.
 */
function chunkText(input, limit) {
  const text = String(input || "");
  const max = Math.max(16, Number(limit) || 200);
  if (text.length <= max) return text ? [text] : [];

  const chunks = [];
  let rest = text;
  while (rest.length > max) {
    const window = rest.slice(0, max);
    let splitAt = window.lastIndexOf("\n");
    if (splitAt < max * 0.5) splitAt = window.lastIndexOf(" ");
    if (splitAt <= 0) splitAt = max;
    chunks.push(rest.slice(0, splitAt).trim());
    rest = rest.slice(splitAt).trim();
  }
  if (rest) chunks.push(rest);
  return chunks.filter(Boolean);
}

/** `+12%` / `-5%` style rate string used by SSML prosody. */
function toRateString(multiplier) {
  const value = Number(multiplier);
  if (!Number.isFinite(value) || value <= 0) return "+0%";
  const pct = Math.round((value - 1) * 100);
  const clamped = Math.max(-80, Math.min(150, pct));
  return `${clamped >= 0 ? "+" : ""}${clamped}%`;
}

/** `+18Hz` style pitch string used by SSML prosody. */
function toPitchString(hz) {
  const value = Number(hz);
  if (!Number.isFinite(value)) return "+0Hz";
  const clamped = Math.max(-60, Math.min(60, Math.round(value)));
  return `${clamped >= 0 ? "+" : ""}${clamped}Hz`;
}

/** Rough spoken-duration estimate (Burmese ≈ 4.2 chars/second at 1.0x). */
function estimateDurationMs(text, multiplier = 1) {
  const chars = String(text || "").length;
  const rate = Number(multiplier) > 0 ? Number(multiplier) : 1;
  return Math.max(400, Math.round((chars / 4.2 / rate) * 1000));
}

module.exports = {
  cleanText,
  chunkText,
  escapeXml,
  estimateDurationMs,
  normalizeWhitespace,
  removeIncompatibleCharacters,
  toPitchString,
  toRateString,
};
