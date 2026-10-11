/* ============================================================
   Front-end behaviour tests — app.js executed against a mini DOM

   Covers the three deliverables of the TTS re-architecture:
     1. previews POST to /api/tts and play the returned Blob
     2. exactly one toast is visible and it auto-dismisses after 3s
     3. minimalist persona cards with gender theming
   ============================================================ */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { loadApp } = require("./helpers/mini-dom");

const ROOT = path.resolve(__dirname, "..");
const appSource = () => fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const cssSource = () => fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");

test("app.js boots without touching the DOM incorrectly", { timeout: 20000 }, () => {
  const app = loadApp();
  assert.equal(app.toastWrap().children.length, 0);
  assert.equal(app.grid().children.length, 10, "ten persona cards must be rendered");
  assert.equal(app.recapGrid().children.length, 10, "the Auto Recap page uses the same cards");
});

test("persona cards are minimalist: initial badge, name, gender, ▶ Preview", { timeout: 20000 }, () => {
  const app = loadApp();
  const cards = app.grid().children;

  const male = cards[0];
  assert.equal(male.dataset.code, "BB");
  assert.equal(male.dataset.gender, "male");
  assert.equal(male.querySelector(".vc-code").textContent, "BB");
  assert.equal(male.querySelector(".vc-name").textContent, "Bobo");
  assert.match(male.querySelector(".vc-gender").textContent, /Male/);
  assert.equal(male.querySelector(".vc-preview").textContent, "▶ Preview");

  /* no long Burmese description left inside the card body */
  const innerText = male.children.map((child) => child.textContent).join(" ");
  assert.doesNotMatch(innerText, /အသံနမူနာ|Parentheses|\(/, "card body must stay minimal");

  const female = cards[1];
  assert.equal(female.dataset.code, "NL");
  assert.equal(female.dataset.gender, "female");
  assert.match(female.querySelector(".vc-gender").textContent, /Female/);
});

test("male cards are blue (#2563eb) and female cards pink (#ec4899)", { timeout: 20000 }, () => {
  const app = loadApp();
  const cards = app.grid().children;

  for (const card of cards) {
    const accent = card.style.getPropertyValue("--voice-accent");
    if (card.dataset.gender === "female") assert.equal(accent, "#ec4899", card.dataset.code);
    else assert.equal(accent, "#2563eb", card.dataset.code);
  }

  const css = cssSource();
  assert.match(css, /\.voice-card\.gender-male\s*\{[^}]*#2563eb/s);
  assert.match(css, /\.voice-card\.gender-female\s*\{[^}]*#ec4899/s);
  assert.match(css, /\.voice-avatar\s*\{[^}]*var\(--voice-accent\)/s);
});

test("preview taps POST { text, voice, pitch } to /api/tts and play the Blob", { timeout: 20000 }, async () => {
  const app = loadApp();
  const button = app.grid().children[1].querySelector(".vc-preview"); /* NL */

  button.dispatch("click");
  assert.equal(button.textContent.trim().startsWith("▶"), false, "button shows a loading state");
  await app.flush();

  assert.equal(app.fetchCalls.length, 1);
  const [call] = app.fetchCalls;
  assert.equal(call.url, "/api/tts", "the browser must only talk to our own route");
  assert.equal(call.init.method, "POST");
  assert.equal(call.init.headers["Content-Type"], "application/json");
  const payload = JSON.parse(call.init.body);
  assert.equal(payload.voice, "NL");
  assert.equal(payload.pitch, 0);
  assert.match(payload.text, /မင်္ဂလာပါ/);

  /* Blob → object URL → HTML5 Audio */
  assert.equal(app.objectUrls.length, 1);
  assert.equal(app.audioInstances.length, 1);
  assert.equal(app.audioInstances[0].src, app.objectUrls[0].url);
  assert.equal(app.audioInstances[0].paused, false, "playback must start");
  assert.equal(button.textContent, "▶ Preview", "the button resets after playback starts");
});

test("no browser-side request ever leaves the origin", { timeout: 20000 }, async () => {
  const app = loadApp();
  for (const card of app.grid().children.slice(0, 4)) {
    card.querySelector(".vc-preview").dispatch("click");
    await app.flush();
  }
  assert.ok(app.fetchCalls.length >= 4);
  for (const call of app.fetchCalls) {
    assert.match(call.url, /^\/api\/tts$/, `${call.url} must be same-origin`);
    assert.doesNotMatch(call.url, /translate\.google|bing\.com|corsproxy|allorigins/);
  }
  /* the pitch slider offset travels with the request */
  app.grid().children[0].querySelector(".vc-preview").dispatch("click");
  await app.flush();
  const last = JSON.parse(app.fetchCalls[app.fetchCalls.length - 1].init.body);
  assert.equal(typeof last.pitch, "number");
  assert.equal(last.voice, "BB");
});

test("a failing TTS route resets the button and reports the server message", { timeout: 20000 }, async () => {
  const app = loadApp({
    fetch: async () => ({
      ok: false,
      status: 502,
      headers: { get: () => "application/json" },
      json: async () => ({ ok: false, error: "tts_unavailable", message: "All TTS providers failed" }),
    }),
  });

  const button = app.grid().children[0].querySelector(".vc-preview");
  button.dispatch("click");
  await app.flush();

  assert.equal(button.textContent, "▶ Preview");
  assert.equal(button.disabled, false);
  const toasts = app.toasts();
  assert.equal(toasts.length, 1, "one toast, never a stack");
  assert.match(toasts[0].textContent, /All TTS providers failed/);
  assert.equal(toasts[0].classList.contains("err"), true);
});

test("only one toast is ever active and it dismisses after 3 seconds", { timeout: 20000 }, async () => {
  const app = loadApp();

  /* every click on the history refresh fires a toast */
  const btn = app.document.getElementById("btnHistoryRefresh");
  btn.dispatch("click");
  btn.dispatch("click");
  btn.dispatch("click");
  assert.equal(app.toasts().length, 1, "repeated toasts must not stack");

  const first = app.toasts()[0];
  btn.dispatch("click");
  assert.equal(app.toasts().length, 1);
  assert.equal(app.toasts()[0], first, "the same node is reused");

  /* two distinct messages still reuse the single node */
  app.clock.tick(1000);
  btn.dispatch("click");
  assert.equal(app.toasts().length, 1);

  /* auto-dismiss: 3s fade-out, then the node is removed */
  app.clock.tick(2900);
  assert.equal(app.toasts().length, 1, "still visible just before the deadline");
  app.clock.tick(200);
  assert.equal(app.toasts()[0].classList.contains("out"), true, "fades out at 3s");
  app.clock.tick(400);
  assert.equal(app.toasts().length, 0, "removed from the DOM afterwards");
});

test("static audit: no direct upstream TTS calls remain in the client", () => {
  const app = appSource();
  assert.doesNotMatch(app, /translate\.google\.com/);
  assert.doesNotMatch(app, /translate_tts/);
  assert.doesNotMatch(app, /speech\.platform\.bing\.com/);
  assert.doesNotMatch(app, /edge\/v1/);
  assert.match(app, /const TTS_ROUTE = "\/api\/tts"/);
  assert.match(app, /URL\.createObjectURL\(/);
  assert.doesNotMatch(app, /toastWrap\.appendChild/, "toasts must not be appended as duplicates");
  assert.match(app, /const TOAST_DURATION = 3000/);

  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.doesNotMatch(html, /translate_tts/);
});

test("Generate synthesizes every script line through /api/tts", { timeout: 25000 }, async () => {
  const app = loadApp({
    fetch: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "audio/mpeg" },
      blob: async () => ({ size: 640, type: "audio/mpeg" }),
      json: async () => ({}),
    }),
  });

  /* two clean Burmese lines in Step 3 */
  app.document.getElementById("burmeseText").value = "ပထမဆုံး စာကြောင်း\nဒုတိယ စာကြောင်း";
  app.grid().children[0].dispatch("click"); /* select BB */

  app.document.getElementById("btnGenerate").dispatch("click");
  /* let the render progress + synthesis promises settle */
  for (let i = 0; i < 60; i++) {
    app.clock.tick(200);
    await app.flush(2);
  }

  const calls = app.fetchCalls.filter((call) => call.url === "/api/tts");
  assert.equal(calls.length, 2, "one POST per script line");
  const bodies = calls.map((call) => JSON.parse(call.init.body));
  assert.deepEqual(bodies.map((b) => b.text), ["ပထမဆုံး စာကြောင်း", "ဒုတိယ စာကြောင်း"]);
  assert.ok(bodies.every((b) => b.voice === "BB" && b.pitch === 0));

  /* joined MP3 blob is attached to the Step 4 player */
  assert.equal(app.objectUrls.length >= 1, true);
  assert.equal(app.audioInstances.length >= 1, true);
  const duration = app.document.getElementById("resDuration").textContent;
  assert.match(duration, /^~ \d{2}:\d{2}$/);

  /* the play button drives real audio playback */
  const play = app.document.getElementById("amPlay");
  const player = app.audioInstances[app.audioInstances.length - 1];
  play.dispatch("click");
  await app.flush();
  assert.equal(player.paused, false);
  assert.equal(app.document.getElementById("amWave").classList.contains("playing"), true);
  play.dispatch("click");
  assert.equal(player.paused, true);
  assert.equal(app.document.getElementById("amWave").classList.contains("playing"), false);
});

test("Generate stays usable when the TTS route is down", { timeout: 25000 }, async () => {
  const app = loadApp({
    fetch: async () => ({ ok: false, status: 502, headers: { get: () => "application/json" }, json: async () => ({ message: "All TTS providers failed" }) }),
  });

  app.document.getElementById("burmeseText").value = "စမ်းသပ် စာကြောင်း";

  /* Collect toasts while the flow runs — each lives 3s then self-dismisses. */
  const seen = [];
  app.document.getElementById("btnGenerate").dispatch("click");
  for (let i = 0; i < 60; i++) {
    app.clock.tick(200);
    await app.flush(2);
    for (const node of app.toasts()) if (!seen.includes(node.textContent)) seen.push(node.textContent);
    assert.ok(app.toasts().length <= 1, "never more than one toast on screen");
  }

  assert.ok(
    seen.some((message) => /TTS providers failed|အသံ ဖန်တီးမရပါ/.test(message)),
    `expected a synthesis failure toast, saw: ${JSON.stringify(seen)}`
  );
  assert.equal(app.document.getElementById("btnGenerate").disabled, false, "the button is re-enabled");
  assert.equal(app.document.getElementById("btnGenerate").textContent.includes("spinner"), false);
});
