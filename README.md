# 🐻 Red Bear Studio — Recap Edition v2.0

Burmese video-recap studio: transcript → Gemini translation → **Myanmar neural
TTS** → video muxing. The front-end is plain HTML/CSS/JS; all speech synthesis
happens **server-side** behind `POST /api/tts`.

```
browser ──POST /api/tts { text, voice, pitch }──▶ Node route ──▶ Edge neural TTS
        ◀──────────── 200 audio/mpeg (Blob) ───────────────┘   (Google TTS fallback)
```

## Why the server route exists

Calling the public TTS endpoints straight from a page is impossible:

| Direct browser call | Result |
| --- | --- |
| `translate.google.com/translate_tts` | `403 Forbidden` / CORS blocked |
| Edge read-aloud WebSocket | handshake requires `Origin: chrome-extension://…`, `Cookie: muid=…` and a DRM `Sec-MS-GEC` token — browsers can neither send nor compute these |
| third-party CORS proxies | unreliable, rate-limited, and leak the audio through a stranger's server |

The browser only ever talks to **our own origin**. The route adds the server-side
fingerprint (`User-Agent`, `Referer`, `Origin`, `Pragma`, `Sec-MS-GEC`) so both
upstreams answer normally — no CORS, no client-IP 403.

## Quick start

```bash
npm start            # → http://localhost:4173
npm test             # 66 dependency-free tests (Node ≥ 18 built-in runner)
```

No `npm install` is required — there are **zero dependencies** (the WebSocket
client used for Edge TTS is implemented on `node:http`/`node:https`).

## API

### `POST /api/tts`

```jsonc
// request
{ "text": "မင်္ဂလာပါ", "voice": "NL", "pitch": 4 }

// response
HTTP/1.1 200 OK
Content-Type: audio/mpeg
Content-Length: 21840
X-TTS-Provider: edge
X-TTS-Voice: my-MM-NilarNeural
X-TTS-Cache: miss
```

| field | values | notes |
| --- | --- | --- |
| `text` | 1 – 6000 chars | required; whitespace is normalised, control chars stripped |
| `voice` | persona code `BB…TS`, a persona name (`Nilar`), `male`/`female`, or a raw Edge voice (`my-MM-ThihaNeural`) | optional, defaults to `BB` |
| `pitch` | `-30 … +30` Hz | optional; added on top of the persona's own pitch |

Other shapes: `GET /api/tts?text=…&voice=…&pitch=…` (direct `<audio src>` playback),
`?format=json` or `Accept: application/json` for a JSON envelope with a
`data:` URL, `?download=1` for a `Content-Disposition: attachment` response.

| route | purpose |
| --- | --- |
| `GET /api/voices` | persona catalogue (code, name, gender, accent, Edge voice) |
| `GET /api/health` | active provider chain + cache stats |
| `OPTIONS /api/tts` | CORS preflight (`204`) |

Status codes: `400` invalid body · `413` text too long · `429` rate limited
(`TTS_RATE_LIMIT`/min per IP) · `502` all providers failed — the JSON body then
carries `failures[]` and `fallback: "browser-speech-synthesis"`, which the UI
uses to fall back to the Web Speech API.

## Voice personas

Ten personas map onto the two public Burmese neural voices; identity comes from
rate + pitch. Gender drives the UI accent (`#2563eb` male / `#ec4899` female).

| code | name | gender | edge voice |
| --- | --- | --- | --- |
| BB | Bobo | male | `my-MM-ThihaNeural` |
| NL | Nilar | female | `my-MM-NilarNeural` |
| PW | Pyae Wai | male | `my-MM-ThihaNeural` |
| KM | Kaung Myat | male | `my-MM-ThihaNeural` |
| ZK | Zaw Ko | male | `my-MM-ThihaNeural` |
| HS | Hnin Si | female | `my-MM-NilarNeural` |
| SL | Soe Lwin | male | `my-MM-ThihaNeural` |
| YS | Yee Mon | female | `my-MM-NilarNeural` |
| EC | Ei Chan | male | `my-MM-ThihaNeural` |
| TS | Thuzar | female | `my-MM-NilarNeural` |

The registry lives in `lib/tts/personas.js` (server, authoritative) and is
mirrored for offline rendering in `app.js`.

## Project layout

```
server.js               static studio + /api/* router (zero deps)
api/tts.js              the TTS route (Vercel/Netlify compatible handler)
api/voices.js           GET /api/voices entrypoint
api/health.js           GET /api/health entrypoint
lib/tts/edge.js         Edge neural TTS: Sec-MS-GEC, SSML, audio assembly, clock-skew retry
lib/tts/google.js       Google Translate TTS fallback (server-side Referer/UA)
lib/tts/personas.js     voice registry  ·  lib/tts/text.js  normalisation
lib/tts/cache.js        in-memory LRU (96 entries / 16 MB / 30 min)
lib/ws/{frames,client}.js  minimal RFC 6455 codec + client (custom headers)
app.js                  front-end: one POST to /api/tts, Blob → ObjectURL → Audio
test/                   66 tests: codec, provider, HTTP route, DOM behaviour, editor
```

## Video editor (Step 4)

The result step is a real editor: a 16:9 stage with draggable overlay layers and
a tabbed inspector — **[🎬 Video] [🎙️ Voice] [💬 Captions] [⭐ Extras]**.

| Tab | Controls |
| --- | --- |
| 🎬 Video | **Smart subtitle blur box** (drag to move, 8 resize handles, keyboard nudge), blur strength `10–30px`, full-width band toggle, bottom/lower-third presets, per-layer visibility, video fit (`contain`/`cover`) |
| 🎙️ Voice | persona picker (mirrors the Step 3 cards), pitch offset, original-audio volume + mute |
| 💬 Captions | Myanmar font family (Noto Sans Myanmar · Myanmar Black · Myanmar Pyidaungsu · Padauk · Myanmar Text), size, text colour, outline colour + width, background box with colour & opacity, vertical position (slider + top/middle/bottom presets), words-per-line wrapping |
| ⭐ Extras | text watermark (text, size, opacity, 3×3 position grid, "moves around screen"), circle image logo (upload, size, opacity, position, circle mask) |

Everything is applied live over the video and persisted to `localStorage`
under `rb_editor_v1` (logo blobs stay in memory — a `blob:` URL is never
persisted). The **words-per-line** limit is reused by the `.srt` export so the
burned-in captions and the subtitle file wrap identically.

**Blur box** — the box is positioned in stage-relative percentages, so it tracks
the video at any size. It uses `backdrop-filter: blur(Npx)` over the `moz`/`webkit`
prefixes, can be dragged with the pointer (or arrow keys, `Shift` for 5% steps),
resized from any of the eight handles (6% minimum) and clamped so it can never
leave the stage. Alt-drag is not required, and the box is quick-resettable from
the badge on the stage.

**Watermark** — nine static positions (`pos-top-left` … `pos-bottom-right`); the
"moves around screen" toggle swaps the static anchor for the `wmOrbit`
keyframes animation (TikTok-style corner hopping).

## Front-end behaviour

* **One POST per clip** — `{ text, voice, pitch }` → `Blob` →
  `URL.createObjectURL` → `new Audio(url)`. No external host is ever contacted.
* **Previews** — the `▶ Preview` button synthesizes a short Burmese sample.
* **Generate** — every script line is synthesized sequentially and the MP3
  chunks are joined into one voice-over attached to the Step 4 player.
* **One toast at a time** — a single reused node, 3 s auto-dismiss, duplicate
  bursts inside 600 ms are collapsed.
* **Graceful degradation** — if the route is unreachable (e.g. the page is
  opened as a static file), previews fall back to `speechSynthesis`.
* **Editor persistence** — blur geometry, caption styling, watermark and logo
  settings survive a reload via `localStorage` (`rb_editor_v1`).

## Configuration

| variable | default | meaning |
| --- | --- | --- |
| `PORT` / `HOST` | `4173` / `0.0.0.0` | listen address |
| `TTS_PROVIDERS` | `edge,google` | provider chain order |
| `TTS_DISABLE_EDGE` / `TTS_DISABLE_GOOGLE` | — | `1` removes a provider |
| `TTS_MAX_CHARS` | `6000` | max `text` length (413 above) |
| `TTS_RATE_LIMIT` / `TTS_RATE_WINDOW_MS` | `120` / `60000` | per-IP throttle |
| `EDGE_TTS_WSS_BASE` / `GOOGLE_TTS_BASE` | vendor URLs | overrides used by the test-suite |

## Tests

`npm test` runs fully offline: local fake Edge (a real WebSocket server) and fake
Google endpoints stand in for the vendors, plus a dependency-free mini-DOM that
executes `app.js` for real (card markup, toast lifetime, preview POST, joined
voice-over). The suite needs no network and no browser.

## Roadmap

* Move the Gemini transcription relay (`corsproxy.io`) to a first-party
  `/api/transcribe` route — same CORS problem, separate fix.
* Per-line voice overrides in the Step 3 script editor.
