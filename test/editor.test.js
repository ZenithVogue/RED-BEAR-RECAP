/* ============================================================
   Video editor tests — blur overlay, styled captions, watermark
   and logo controls, tabbed inspector and persistence.
   app.js runs against the mini DOM with the real index.html markup.
   ============================================================ */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { loadApp } = require("./helpers/mini-dom");

const ROOT = path.resolve(__dirname, "..");
const cssSource = () => fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");

/** Boot the studio with a video + two script lines already loaded. */
function bootEditor(options = {}) {
  const app = loadApp(options);
  const doc = app.document;
  const q = (selector) => doc.querySelector(selector);

  /* Step 1: video is on screen */
  app.window.document.getElementById("editorStage")._rect = { width: 800, height: 450 };
  doc.getElementById("step1Player").src = "blob:video";
  doc.getElementById("editorVideo").src = "blob:video";
  doc.getElementById("editorVideo").duration = 20;

  /* Step 3: two clean Burmese lines + selected persona */
  doc.getElementById("burmeseText").value = "ပထမဆုံး စာကြောင်း ဖြစ်ပါတယ်\nဒုတိယ စာကြောင်း ဖြစ်ပါတယ်";
  doc.getElementById("voiceGrid").children[0].dispatch("click");

  return { app, doc, q };
}

/* ---------------- structure ---------------- */

test("inspector exposes the four tabs and panels", { timeout: 20000 }, () => {
  const { doc } = bootEditor();
  const tabs = doc.querySelectorAll(".editor-tab");
  assert.deepEqual(tabs.map((t) => t.dataset.tab), ["video", "voice", "captions", "extras"]);
  assert.equal(tabs[0].classList.contains("active"), true, "Video tab is active by default");

  const panels = Array.from(doc.querySelectorAll(".editor-panel"));
  assert.deepEqual(panels.map((p) => p.dataset.panel), ["video", "voice", "captions", "extras"]);
  assert.equal(panels.filter((p) => p.classList.contains("active")).length, 1, "exactly one panel is shown");
});

test("clicking a tab switches the visible panel", { timeout: 20000 }, () => {
  const { doc } = bootEditor();
  const captionsTab = doc.querySelectorAll(".editor-tab").find((t) => t.dataset.tab === "captions");
  captionsTab.dispatch("click");

  assert.equal(captionsTab.classList.contains("active"), true);
  assert.equal(captionsTab.getAttribute("aria-selected"), "true");
  assert.equal(doc.querySelector('.editor-panel[data-panel="captions"]').classList.contains("active"), true);
  assert.equal(doc.querySelector('.editor-panel[data-panel="video"]').classList.contains("active"), false);
});

/* ---------------- 1. smart subtitle blur overlay ---------------- */

test("blur box starts positioned, blurred and draggable", { timeout: 20000 }, () => {
  const { doc, q } = bootEditor();
  const box = q("#ovBlur");

  assert.equal(box.hidden, false);
  assert.equal(box.style.backdropFilter, "blur(18px)");
  assert.equal(box.style.webkitBackdropFilter, "blur(18px)");
  assert.equal(box.style.left, "6%");
  assert.equal(box.style.top, "62%");
  assert.equal(box.style.width, "88%");
  assert.equal(box.style.height, "18%");
  assert.equal(doc.querySelectorAll(".ov-handle").length, 8, "all eight resize handles exist");
  assert.equal(q("#badgeBlur").textContent, "Blur 18px");
});

test("blur strength slider drives backdrop-filter between 10 and 30 px", { timeout: 20000 }, () => {
  const { doc, q } = bootEditor();
  const slider = q("#blurStrength");
  assert.equal(slider.getAttribute("min"), "10");
  assert.equal(slider.getAttribute("max"), "30");

  slider.value = "26";
  slider.dispatch("input");
  assert.equal(q("#ovBlur").style.backdropFilter, "blur(26px)");
  assert.equal(q("#blurStrengthValue").textContent, "26 px");
  assert.equal(q("#badgeBlur").textContent, "Blur 26px");

  /* out-of-range input is clamped */
  slider.value = "99";
  slider.dispatch("input");
  assert.equal(q("#ovBlur").style.backdropFilter, "blur(30px)");
});

test("dragging the box moves it in stage-relative percent and clamps to bounds", { timeout: 20000 }, () => {
  const { app, q } = bootEditor();
  const box = q("#ovBlur");

  /* drag right 32px / down 36px on an 800x450 stage → +4% x, +8% y */
  box.dispatch("pointerdown", { clientX: 100, clientY: 100, pointerId: 1 });
  assert.equal(box.classList.contains("dragging"), true);
  app.window.dispatch("pointermove", { clientX: 132, clientY: 136 });
  app.window.dispatch("pointerup", {});

  assert.equal(box.classList.contains("dragging"), false);
  assert.equal(box.style.left, "10%");
  assert.equal(box.style.top, "70%");

  /* dragging far past the edge keeps the box inside the stage */
  box.dispatch("pointerdown", { clientX: 0, clientY: 0, pointerId: 2 });
  app.window.dispatch("pointermove", { clientX: 5000, clientY: 5000 });
  app.window.dispatch("pointerup", {});
  assert.equal(box.style.left, "12%", "x clamps so the box stays fully visible");
  assert.equal(box.style.top, "82%");
});

test("resize handles change width/height and enforce a minimum", { timeout: 20000 }, () => {
  const { app, doc, q } = bootEditor();
  const box = q("#ovBlur");
  const east = Array.from(doc.querySelectorAll(".ov-handle")).find((h) => h.dataset.handle === "e");
  const south = Array.from(doc.querySelectorAll(".ov-handle")).find((h) => h.dataset.handle === "s");

  east.dispatch("pointerdown", { clientX: 0, clientY: 0, pointerId: 3 });
  app.window.dispatch("pointermove", { clientX: 80, clientY: 0 }); /* +10% → 98% */
  app.window.dispatch("pointerup", {});
  assert.equal(box.style.width, "98%");

  south.dispatch("pointerdown", { clientX: 0, clientY: 0, pointerId: 4 });
  app.window.dispatch("pointermove", { clientX: 0, clientY: 45 }); /* +10% → 28% */
  app.window.dispatch("pointerup", {});
  assert.equal(box.style.height, "28%");

  /* shrink far past zero → minimum 6% */
  south.dispatch("pointerdown", { clientX: 0, clientY: 0, pointerId: 5 });
  app.window.dispatch("pointermove", { clientX: 0, clientY: -1000 });
  app.window.dispatch("pointerup", {});
  assert.equal(box.style.height, "6%");
});

test("full-width band toggle snaps the box across the stage", { timeout: 20000 }, () => {
  const { q } = bootEditor();
  const toggle = q("#blurFullWidth");
  const box = q("#ovBlur");

  toggle.checked = true;
  toggle.dispatch("change");
  assert.equal(box.classList.contains("full-width"), true);
  assert.equal(box.style.left, "0%");
  assert.equal(box.style.width, "100%");

  toggle.checked = false;
  toggle.dispatch("change");
  assert.equal(box.classList.contains("full-width"), false);
  assert.equal(box.style.width, "100%", "width stays until the user resizes");
});

test("blur presets and reset restore known geometry", { timeout: 20000 }, () => {
  const { doc, q } = bootEditor();
  const box = q("#ovBlur");

  doc.getElementById("blurPresetBottom").dispatch("click");
  assert.equal(box.style.left, "0%");
  assert.equal(box.style.top, "70%");
  assert.equal(box.style.width, "100%");
  assert.equal(box.style.height, "24%");
  assert.equal(box.classList.contains("full-width"), true);

  doc.getElementById("blurPresetLower").dispatch("click");
  assert.equal(box.style.left, "6%");
  assert.equal(box.style.width, "88%");
  assert.equal(box.classList.contains("full-width"), false);

  doc.getElementById("blurReset").dispatch("click");
  assert.equal(box.style.top, "62%");
  assert.equal(box.style.height, "18%");
});

test("blur enable switch and layer toggle hide the overlay", { timeout: 20000 }, () => {
  const { doc, q } = bootEditor();
  const box = q("#ovBlur");
  assert.equal(q("#editorResetBox").hidden, false, "quick reset is offered while the blur box is on");

  const enabled = q("#blurEnabled");
  enabled.checked = false;
  enabled.dispatch("change");
  assert.equal(box.hidden, true);
  assert.equal(q("#badgeBlur").textContent, "Blur off");
  assert.equal(q("#editorResetBox").hidden, true);

  enabled.checked = true;
  enabled.dispatch("change");
  assert.equal(box.hidden, false);

  /* the stage badge resets the geometry in one click */
  q("#editorResetBox").dispatch("click");
  assert.equal(box.style.top, "62%");
  assert.equal(box.style.width, "88%");

  const layer = q("#layerBlur");
  layer.checked = false;
  layer.dispatch("change");
  assert.equal(box.hidden, true, "the layers list also controls the blur box");
});

/* ---------------- 2. styled captions ---------------- */

test("Myanmar fonts are selectable and applied to the caption", { timeout: 20000 }, () => {
  const { q } = bootEditor();
  const select = q("#capFont");
  const labels = Array.from(select.children).map((o) => o.textContent);

  assert.ok(labels.includes("Myanmar Black"), "Myanmar Black font option");
  assert.ok(labels.includes("Myanmar Pyidaungsu"), "Myanmar Pyidaungsu font option");
  assert.ok(labels.includes("Noto Sans Myanmar"), "Noto Sans Myanmar font option");

  const caption = q("#ovCaption");
  assert.match(caption.style.fontFamily, /Noto Sans Myanmar/, "default Noto stack");

  select.value = "myanmar-black";
  select.dispatch("change");
  assert.match(caption.style.fontFamily, /Myanmar Black/);

  select.value = "myanmar-pyidaungsu";
  select.dispatch("change");
  assert.match(caption.style.fontFamily, /Myanmar Pyidaungsu/);
});

test("font size, colour, outline colour and outline width apply live", { timeout: 20000 }, () => {
  const { q } = bootEditor();
  const caption = q("#ovCaption");

  const size = q("#capSize");
  size.value = "42";
  size.dispatch("input");
  assert.equal(caption.style.fontSize, "42px");
  assert.equal(q("#capSizeValue").textContent, "42 px");

  const color = q("#capColor");
  color.value = "#ffd400";
  color.dispatch("input");
  assert.equal(caption.style.color, "#ffd400");

  const outlineColor = q("#capOutlineColor");
  outlineColor.value = "#1b1b1b";
  outlineColor.dispatch("input");
  assert.equal(caption.style.getPropertyValue("--cap-outline"), "#1b1b1b");

  const outlineWidth = q("#capOutlineWidth");
  outlineWidth.value = "5";
  outlineWidth.dispatch("input");
  assert.equal(caption.style.getPropertyValue("--cap-outline-w"), "5px");
  assert.equal(caption.style.webkitTextStroke, "5px #1b1b1b");
  assert.equal(caption.style.textShadow, "0 0 7.5px #1b1b1b", "halo matches the outline colour");
  assert.equal(q("#capOutlineWidthValue").textContent, "5 px");

  /* 0 px disables the stroke and the halo entirely */
  outlineWidth.value = "0";
  outlineWidth.dispatch("input");
  assert.equal(caption.style.webkitTextStroke, "");
  assert.equal(caption.style.textShadow, "");
});

test("background box toggle, colour and opacity produce an rgba box", { timeout: 20000 }, () => {
  const { q } = bootEditor();
  const caption = q("#ovCaption");

  assert.equal(caption.classList.contains("has-box"), true, "box is on by default");
  assert.equal(caption.style.getPropertyValue("--cap-bg"), "rgba(0, 0, 0, 0.55)");

  const boxColor = q("#capBoxColor");
  boxColor.value = "#1e293b";
  boxColor.dispatch("input");

  const opacity = q("#capBoxOpacity");
  opacity.value = "80";
  opacity.dispatch("input");
  assert.equal(caption.style.getPropertyValue("--cap-bg"), "rgba(30, 41, 59, 0.80)");
  assert.equal(q("#capBoxOpacityValue").textContent, "80 %");

  const toggle = q("#capBox");
  toggle.checked = false;
  toggle.dispatch("change");
  assert.equal(caption.classList.contains("has-box"), false);
});

test("vertical position slider and preset buttons move the caption band", { timeout: 20000 }, () => {
  const { doc, q } = bootEditor();
  const layer = q("#ovCaptionLayer");

  const slider = q("#capY");
  slider.value = "55";
  slider.dispatch("input");
  assert.equal(layer.style.top, "55%");
  assert.equal(q("#capYValue").textContent, "55 %");

  const buttons = Array.from(doc.querySelectorAll("[data-cap-pos]"));
  assert.deepEqual(buttons.map((b) => b.dataset.capPos), ["top", "middle", "bottom"]);

  buttons.find((b) => b.dataset.capPos === "middle").dispatch("click");
  assert.equal(layer.style.top, "50%");
  buttons.find((b) => b.dataset.capPos === "bottom").dispatch("click");
  assert.equal(layer.style.top, "88%");
});

test("words-per-line limit wraps the caption into multiple lines", { timeout: 20000 }, () => {
  const { doc, q } = bootEditor();

  /* render the captions from the plan so the real text is used */
  doc.getElementById("btnGenerate").dispatch("click");
  const caption = q("#ovCaption");
  assert.ok(caption.children.length >= 1);

  const words = q("#capWords");
  words.value = "2";
  words.dispatch("input");
  const lines = doc.querySelectorAll(".cap-line").map((line) => line.textContent);
  assert.ok(lines.length >= 2, `expected wrapped lines, got ${JSON.stringify(lines)}`);
  assert.ok(lines.every((line) => line.split(" ").length <= 2), `each line ≤ 2 words: ${JSON.stringify(lines)}`);

  /* 0 = Auto, no wrapping */
  words.value = "0";
  words.dispatch("input");
  assert.equal(q("#capWordsValue").textContent, "Auto");
  assert.equal(doc.querySelectorAll(".cap-line").length, 1);
});

test("captions layer toggle dims/hides the caption overlay", { timeout: 20000 }, () => {
  const { q } = bootEditor();
  const layer = q("#layerCaptions");
  const captionLayer = q("#ovCaptionLayer");

  layer.checked = false;
  layer.dispatch("change");
  assert.equal(captionLayer.hidden, true);

  layer.checked = true;
  layer.dispatch("change");
  assert.equal(captionLayer.hidden, false);
});

/* ---------------- 3. extras: watermark ---------------- */

test("watermark text, size and opacity are applied live", { timeout: 20000 }, () => {
  const { q } = bootEditor();
  const mark = q("#ovWatermark");

  assert.equal(mark.textContent, "@redbearrecap");
  assert.equal(mark.hidden, false);

  const text = q("#wmText");
  text.value = "@my.handle";
  text.dispatch("input");
  assert.equal(mark.textContent, "@my.handle");

  const size = q("#wmSize");
  size.value = "32";
  size.dispatch("input");
  assert.equal(mark.style.fontSize, "32px");
  assert.equal(q("#wmSizeValue").textContent, "32 px");

  const opacity = q("#wmOpacity");
  opacity.value = "40";
  opacity.dispatch("input");
  assert.equal(mark.style.opacity, "0.4");
  assert.equal(q("#wmOpacityValue").textContent, "40 %");

  /* clearing the text hides the watermark instead of leaving an empty pill */
  text.value = "   ";
  text.dispatch("input");
  assert.equal(mark.hidden, true);
});

test("watermark position grid offers nine positions and moves the element", { timeout: 20000 }, () => {
  const { q } = bootEditor();
  const grid = q("#wmPosGrid");
  const mark = q("#ovWatermark");

  assert.equal(grid.children.length, 9, "3x3 position grid");
  assert.equal(mark.classList.contains("pos-bottom-right"), true, "default position");

  grid.children[0].dispatch("click"); /* top-left */
  assert.equal(mark.classList.contains("pos-top-left"), true);
  assert.equal(mark.classList.contains("pos-bottom-right"), false);
  assert.equal(grid.children[0].classList.contains("active"), true);
  assert.equal(grid.children[0].getAttribute("aria-checked"), "true");

  grid.children[8].dispatch("click"); /* bottom-right */
  assert.equal(mark.classList.contains("pos-bottom-right"), true);
});

test("moves-around-screen toggle switches the watermark to the orbit animation", { timeout: 20000 }, () => {
  const { q } = bootEditor();
  const move = q("#wmMove");
  const mark = q("#ovWatermark");

  assert.equal(mark.classList.contains("is-moving"), false);
  move.checked = true;
  move.dispatch("change");
  assert.equal(mark.classList.contains("is-moving"), true);

  const css = cssSource();
  assert.match(css, /\.ov-watermark\.is-moving\s*\{[^}]*animation:\s*wmOrbit/s);
  assert.match(css, /@keyframes wmOrbit/);

  move.checked = false;
  move.dispatch("change");
  assert.equal(mark.classList.contains("is-moving"), false);
});

/* ---------------- 3. extras: image logo ---------------- */

test("logo upload sets a circle overlay with size, opacity and position", { timeout: 20000 }, () => {
  const { doc, q } = bootEditor();
  const input = q("#logoInput");
  const img = q("#ovLogo");

  assert.equal(img.hidden, true, "no logo until a file is chosen");

  input.files = [{ name: "bear.png", type: "image/png", size: 2048 }];
  input.dispatch("change");

  assert.equal(img.hidden, false);
  assert.match(img.src, /^blob:/);
  assert.equal(q("#logoName").textContent, "bear.png");
  assert.equal(q("#logoThumb").hidden, false);
  assert.equal(img.classList.contains("is-circle"), true, "circle mask on by default");

  const size = q("#logoSize");
  size.value = "120";
  size.dispatch("input");
  assert.equal(img.style.width, "120px");
  assert.equal(img.style.height, "120px");
  assert.equal(q("#logoSizeValue").textContent, "120 px");

  const opacity = q("#logoOpacity");
  opacity.value = "50";
  opacity.dispatch("input");
  assert.equal(img.style.opacity, "0.5");

  const grid = q("#logoPosGrid");
  assert.equal(grid.children.length, 9);
  grid.children[4].dispatch("click"); /* centre */
  assert.equal(img.classList.contains("pos-middle-center"), true);

  const circle = q("#logoCircle");
  circle.checked = false;
  circle.dispatch("change");
  assert.equal(img.classList.contains("is-circle"), false);
});

test("non-image logo files are rejected and the overlay layer can hide the logo", { timeout: 20000 }, () => {
  const { q } = bootEditor();
  const input = q("#logoInput");

  input.files = [{ name: "notes.txt", type: "text/plain", size: 12 }];
  input.dispatch("change");
  assert.equal(q("#ovLogo").hidden, true, "rejected file must not become a logo");

  input.files = [{ name: "bear.png", type: "image/png", size: 2048 }];
  input.dispatch("change");
  assert.equal(q("#ovLogo").hidden, false);

  const layer = q("#layerLogo");
  layer.checked = false;
  layer.dispatch("change");
  assert.equal(q("#ovLogo").hidden, true);

  /* removing the logo revokes the blob URL */
  q("#logoRemove").dispatch("click");
  assert.equal(q("#ovLogo").hidden, true);
  assert.equal(q("#logoName").textContent, "Logo မရွေးရသေးပါ");
});

/* ---------------- voice tab + persistence + regressions ---------------- */

test("voice tab mirrors the persona and pitch controls", { timeout: 20000 }, () => {
  const { doc, q } = bootEditor();
  const select = q("#edVoiceSelect");
  assert.equal(select.children.length, 10, "all personas listed");

  select.value = "NL";
  select.dispatch("change");
  assert.equal(doc.querySelectorAll(".voice-card.selected")[0].dataset.code, "NL", "step-3 card follows");

  const pitch = q("#edPitch");
  pitch.value = "-12";
  pitch.dispatch("input");
  assert.equal(q("#edPitchValue").textContent, "-12 Hz");
  assert.equal(q("#pitchSlider").value, "-12", "step-3 slider stays in sync");
  assert.equal(q("#pitchValue").textContent, "-12 Hz");
});

test("original-audio volume and mute controls configure the stage video", { timeout: 20000 }, () => {
  const { q } = bootEditor();
  const video = q("#editorVideo");

  const volume = q("#edVolume");
  volume.value = "35";
  volume.dispatch("input");
  assert.equal(video.volume, 0.35);
  assert.equal(q("#edVolumeValue").textContent, "35 %");

  const mute = q("#edMute");
  mute.checked = true;
  mute.dispatch("change");
  assert.equal(video.muted, true);
});

test("editor settings persist to localStorage and survive a reload", { timeout: 20000 }, () => {
  const { app, doc, q } = bootEditor();

  q("#blurStrength").value = "27";
  q("#blurStrength").dispatch("input");
  q("#capFont").value = "myanmar-black";
  q("#capFont").dispatch("change");
  q("#wmText").value = "@saved";
  q("#wmText").dispatch("input");
  doc.querySelectorAll(".editor-tab").find((t) => t.dataset.tab === "extras").dispatch("click");
  app.clock.tick(400); /* flush the debounced save */

  const saved = JSON.parse(app.localStorage.getItem("rb_editor_v1"));
  assert.equal(saved.blur.strength, 27);
  assert.equal(saved.captions.font, "myanmar-black");
  assert.equal(saved.watermark.text, "@saved");
  assert.equal(saved.activeTab, "extras");

  /* boot a fresh session with the same storage contents */
  const reloaded = loadApp({ storage: app.localStorage.raw() });
  assert.equal(reloaded.document.querySelector("#blurStrength").value, "27");
  assert.equal(reloaded.document.querySelector("#ovBlur").style.backdropFilter, "blur(27px)");
  assert.equal(reloaded.document.querySelector("#ovWatermark").textContent, "@saved");
  assert.equal(reloaded.document.querySelector('.editor-panel[data-panel="extras"]').classList.contains("active"), true);
});

test("reset-all restores defaults and keeps the active tab", { timeout: 20000 }, () => {
  const { doc, q } = bootEditor();
  q("#blurStrength").value = "30";
  q("#blurStrength").dispatch("input");
  doc.querySelectorAll(".editor-tab").find((t) => t.dataset.tab === "captions").dispatch("click");

  doc.getElementById("editorResetAll").dispatch("click");
  assert.equal(q("#blurStrength").value, "18");
  assert.equal(q("#ovBlur").style.backdropFilter, "blur(18px)");
  assert.equal(doc.querySelector('.editor-panel[data-panel="captions"]').classList.contains("active"), true);
});

test("stage transport reflects playback state and seeking", { timeout: 20000 }, () => {
  const { doc, q } = bootEditor();
  const video = q("#editorVideo");
  const play = q("#editorPlay");

  play.dispatch("click");
  assert.equal(video.paused, false);
  assert.equal(play.textContent, "❚❚");

  video.currentTime = 5;
  video.dispatch("timeupdate");
  assert.equal(q("#editorTime").textContent, "00:05 / 00:20");
  assert.equal(Number(q("#editorScrub").value), 250, "scrubber follows playback");

  video.dispatch("pause");
  assert.equal(play.textContent, "▶");

  /* seeking with the scrubber moves the video */
  const scrub = q("#editorScrub");
  scrub.value = "500";
  scrub.dispatch("input");
  assert.equal(video.currentTime, 10);
});

test("static audit: editor wiring matches the documented behaviour", () => {
  const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert.match(app, /backdropFilter = "blur\(" \+ blur\.strength/, "blur strength drives backdrop-filter");
  assert.match(app, /setPointerCapture/, "drag uses pointer capture");
  assert.match(app, /MYANMAR_FONTS/, "Myanmar font registry");
  assert.match(app, /rb_editor_v1/, "settings persist under rb_editor_v1");

  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.match(html, /data-tab="captions"/);
  assert.match(html, /id="wmPosGrid"/);
  assert.match(html, /id="logoInput"/);
  assert.doesNotMatch(html, /translate_tts/);

  const css = cssSource();
  assert.match(css, /\.ov-blur\s*\{[^}]*backdrop-filter:\s*blur\(/s);
  assert.match(css, /\.pos-bottom-right\s*\{/);

  /* the blur band blurs the source subtitles only — its own layers stack above it */
  const zIndex = (selector) => {
    const block = css.match(new RegExp(selector.replace(".", "\\.") + "\\s*\\{([^}]*)\\}"));
    return Number(block[1].match(/z-index:\s*(\d+)/)[1]);
  };
  assert.ok(zIndex(".ov-caption-layer") > zIndex(".ov-blur"), "captions above the blur box");
  assert.ok(zIndex(".ov-watermark") > zIndex(".ov-blur"), "watermark above the blur box");
  assert.ok(zIndex(".ov-logo") > zIndex(".ov-blur"), "logo above the blur box");
  const depth = css.split("").reduce((d, ch) => (ch === "{" ? d + 1 : ch === "}" ? d - 1 : d), 0);
  assert.equal(depth, 0, "styles.css braces must balance");
});

test("uploading and clearing a video keeps the editor stage in sync", { timeout: 20000 }, () => {
  const app = loadApp();
  const doc = app.document;
  const q = (selector) => doc.querySelector(selector);

  /* Step 1 upload → the stage previews the same blob URL */
  const dropzone = doc.getElementById("dropzone");
  dropzone.dispatch("click");
  doc.getElementById("fileInput").files = [{ name: "clip.mp4", type: "video/mp4", size: 4096 }];
  doc.getElementById("fileInput").dispatch("change");

  assert.match(q("#editorVideo").src, /^blob:/);
  assert.equal(q("#editorVideo").src, doc.getElementById("step1Player").src, "same source as Step 1");
  assert.equal(q("#editorEmpty").hidden, true, "placeholder hidden once a video exists");

  /* deleting the file clears the stage again */
  doc.getElementById("deleteFileBtn").dispatch("click");
  assert.equal(q("#editorVideo").src, "", "editor video source cleared");
  assert.equal(q("#editorEmpty").hidden, false);
  assert.equal(q("#editorTime").textContent, "00:00 / 00:00");
});

test("SRT export reuses the caption words-per-line wrapping", { timeout: 20000 }, async () => {
  const { app, doc, q } = bootEditor();

  doc.getElementById("btnGenerate").dispatch("click");
  for (let i = 0; i < 40; i++) {
    app.clock.tick(200);
    await app.flush(2);
  }

  const words = q("#capWords");
  words.value = "3";
  words.dispatch("input");

  app.objectUrls.length = 0;
  doc.getElementById("btnDownloadSrt").dispatch("click");

  const saved = app.objectUrls[app.objectUrls.length - 1];
  assert.ok(saved, "the .srt blob was created");
  const text = String(saved.blob.parts.join(""));
  assert.match(text, /^https?|^\uFEFF?1\n\d{2}:/, "SRT cue structure");

  /* every cue body wraps at the same 3-word limit as the burned-in captions */
  const bodies = text.split("\n\n").map((cue) => cue.split("\n").slice(2)).filter((lines) => lines.length);
  assert.ok(bodies.length >= 2, "one cue per script line");
  for (const lines of bodies) {
    for (const line of lines) {
      assert.ok(line.trim().split(" ").length <= 3, `line ≤ 3 words: ${JSON.stringify(line)}`);
    }
  }
});
