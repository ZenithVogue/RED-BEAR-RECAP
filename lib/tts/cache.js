/* ============================================================
   Red Bear — Tiny in-memory LRU cache for synthesized previews
   ============================================================ */
"use strict";

class AudioCache {
  constructor({ maxEntries = 96, maxBytes = 16 * 1024 * 1024, ttlMs = 30 * 60 * 1000 } = {}) {
    this.maxEntries = maxEntries;
    this.maxBytes = maxBytes;
    this.ttlMs = ttlMs;
    this._map = new Map();
    this._bytes = 0;
  }

  static key({ text, voice, pitch, provider }) {
    return `${provider || "auto"}|${voice}|${pitch}|${text}`;
  }

  get(key) {
    const hit = this._map.get(key);
    if (!hit) return null;
    if (Date.now() - hit.storedAt > this.ttlMs) {
      this._map.delete(key);
      this._bytes -= hit.entry.audio.length;
      return null;
    }
    /* refresh recency */
    this._map.delete(key);
    this._map.set(key, hit);
    return hit.entry;
  }

  set(key, entry) {
    if (!entry || !entry.audio || !entry.audio.length) return entry;
    const existing = this._map.get(key);
    if (existing) {
      this._map.delete(key);
      this._bytes -= existing.entry.audio.length;
    }
    this._map.set(key, { entry, storedAt: Date.now() });
    this._bytes += entry.audio.length;
    this._evict();
    return entry;
  }

  _evict() {
    while (this._map.size > this.maxEntries || this._bytes > this.maxBytes) {
      const oldestKey = this._map.keys().next().value;
      if (oldestKey === undefined) break;
      const oldest = this._map.get(oldestKey);
      this._map.delete(oldestKey);
      this._bytes -= oldest.entry.audio.length;
    }
  }

  stats() {
    return { entries: this._map.size, bytes: this._bytes, maxEntries: this.maxEntries, maxBytes: this.maxBytes };
  }

  clear() {
    this._map.clear();
    this._bytes = 0;
  }
}

module.exports = { AudioCache };
