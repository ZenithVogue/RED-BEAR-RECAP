#!/usr/bin/env node
/* ============================================================
   Red Bear — Studio Edition v2.0 · local server

   Serves the static studio (index.html / app.js / styles.css) and
   mounts the server-side TTS routes:

       POST /api/tts      { text, voice, pitch }  ->  audio/mpeg
       GET  /api/tts      ?text=&voice=&pitch=    ->  audio/mpeg
       GET  /api/voices                           ->  voice catalogue
       GET  /api/health                           ->  provider status

   Zero dependencies: `node server.js` (or `npm start`) is enough.
   ============================================================ */
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");

const handleTts = require("./api/tts");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "0.0.0.0";
const QUIET = process.env.QUIET === "1";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

function log(...args) {
  if (!QUIET) console.log("[red-bear]", ...args);
}

/* Never expose implementation details or dotfiles over HTTP. */
const DENY_DIRS = new Set(["lib", "api", "test", "node_modules", ".git", ".github", ".arena", ".cache"]);
const DENY_FILES = new Set(["package.json", "package-lock.json", "server.js", ".gitignore"]);

function resolveStaticPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname.split("?")[0]);
  } catch (_) {
    return null;
  }

  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const segments = relative.split(/[\\/]+/).filter(Boolean);

  if (segments.some((segment) => segment.startsWith("."))) return null;   /* dotfiles / dot-dirs */
  if (segments.some((segment) => DENY_DIRS.has(segment.toLowerCase()))) return null;
  if (segments.length && DENY_FILES.has(segments[segments.length - 1].toLowerCase())) return null;

  const target = path.resolve(ROOT, relative);
  /* never serve outside the project root */
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) return null;
  return target;
}

function sendFile(req, res, filePath, statusOverride) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (_) {
    return false;
  }
  if (stat.isDirectory()) return sendFile(req, res, path.join(filePath, "index.html"), statusOverride);

  const ext = path.extname(filePath).toLowerCase();
  const etag = `W/"${stat.size}-${Math.round(stat.mtimeMs)}"`;
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, { ETag: etag, "Cache-Control": "no-cache" });
    res.end();
    return true;
  }

  const headers = {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Content-Length": stat.size,
    ETag: etag,
    "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=60",
    "Access-Control-Allow-Origin": "*",
    "X-Content-Type-Options": "nosniff",
  };

  if (req.method === "HEAD") {
    res.writeHead(statusOverride || 200, headers);
    res.end();
    return true;
  }

  res.writeHead(statusOverride || 200, headers);
  fs.createReadStream(filePath).pipe(res);
  return true;
}

const server = http.createServer((req, res) => {
  const started = Date.now();
  let url;
  try {
    url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  } catch (_) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Bad request");
    return;
  }

  res.on("finish", () => {
    log(`${req.method} ${url.pathname} -> ${res.statusCode} (${Date.now() - started}ms)`);
  });

  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  if (pathname === "/api/tts") {
    Promise.resolve(handleTts(req, res)).catch((error) => {
      log("TTS handler crashed:", error && error.stack ? error.stack : error);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      }
      res.end(JSON.stringify({ ok: false, error: "internal_error", message: String((error && error.message) || error) }));
    });
    return;
  }

  if (pathname === "/api/voices" || pathname === "/api/health") {
    Promise.resolve(handleTts(req, res)).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
    return;
  }

  if (pathname.startsWith("/api/")) {
    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: "not_found", message: `Unknown API route ${pathname}` }));
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8", Allow: "GET, HEAD" });
    res.end("Method not allowed");
    return;
  }

  const filePath = resolveStaticPath(url.pathname);
  if (!filePath) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  if (sendFile(req, res, filePath)) return;

  /* extension-less paths fall back to the studio shell */
  if (!path.extname(filePath) && sendFile(req, res, path.join(ROOT, "index.html"))) return;

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

server.listen(PORT, HOST, () => {
  const bound = server.address();
  const port = typeof bound === "object" && bound ? bound.port : PORT;
  const shown = HOST === "0.0.0.0" ? "localhost" : HOST;
  log("TTS API      → POST /api/tts { text, voice, pitch }");
  /* Always printed: this is the machine-readable "server is up" signal. */
  console.log(`[red-bear] ready: http://${shown}:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    log(`${signal} received — shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  });
}

module.exports = server;
