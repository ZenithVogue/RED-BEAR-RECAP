/* ============================================================
   Red Bear — Studio Edition v2.0 · App Logic
   ============================================================ */
(function () {
  "use strict";

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  /* ---------------- State ---------------- */
  const state = {
    page: "manual",
    step: 1,
    maxStep: 1,
    file: null,
    videoUrl: null,
    audioBlob: null,
    durationSec: 0,
    transcriptReady: false,
    voice: null,        // persona code
    pitch: 0,           // -30..30 Hz
    voiceGenerated: false,
    quotaLeft: 1,
    scriptLines: [],    // Step 3 clean lines: { text, voice (override | ""), pitch (override | "") }
    voicePlan: [],      // resolved per-line plan at generation time
  };

  const PAGES = {
    manual: { crumb: "Manual Video Editor" },
    recap: { crumb: "Auto Recap" },
    history: { crumb: "Job History" },
    keys: { crumb: "API Keys" },
  };

  // Persona display is name-only: the Myanmar name is what the card shows, the
  // two-letter code stays the internal id (sample clip, saved selection, result row).
  const VOICES = [
    { code: "BB", name: "သီဟ", gender: "male", rate: 0.95, pitch: 1.0 },
    { code: "NL", name: "နီလာ", gender: "female", rate: 1.0, pitch: 1.25 },
    { code: "PW", name: "ပိုင်ဝင်း", gender: "male", rate: 1.15, pitch: 1.1 },
    { code: "KM", name: "ကျော်မင်း", gender: "male", rate: 0.85, pitch: 0.75 },
    { code: "ZK", name: "ဇော်ကလိုင်း", gender: "male", rate: 0.9, pitch: 0.9 },
    { code: "HS", name: "ဟေမာန်ဆု", gender: "female", rate: 0.95, pitch: 1.35 },
    { code: "SL", name: "စိုးလင်း", gender: "male", rate: 1.3, pitch: 1.0 },
    { code: "YS", name: "ယမုံရှင်း", gender: "female", rate: 1.0, pitch: 1.2 },
    { code: "EC", name: "ဧကရာဇ်", gender: "male", rate: 1.05, pitch: 0.95 },
    { code: "TS", name: "သီရိစိုး", gender: "female", rate: 1.2, pitch: 1.3 },
  ];

  const voiceGenderClass = (v) => (v && v.gender === "female" ? "female" : "male");
  const voiceName = (code) => {
    const hit = VOICES.find((x) => x.code === code);
    return hit ? hit.name : "";
  };

  // Preview button labels live next to the persona table: the voice grids are built
  // further down but read these at render time.
  const PREVIEW_LABEL_IDLE = "▶ အသံနမူနာ နားထောင်ရန်";
  const PREVIEW_LABEL_PLAYING = "🔊 ဖွင့်နေသည်...";

  /* ---------------- Toasts ---------------- */
  const toastWrap = $("#toastWrap");
  function toast(msg, type = "") {
    const el = document.createElement("div");
    el.className = "toast" + (type ? " " + type : "");
    el.textContent = msg;
    toastWrap.appendChild(el);
    setTimeout(() => {
      el.classList.add("out");
      setTimeout(() => el.remove(), 320);
    }, 3200);
  }

  /* ---------------- Quota & Plan (SidebarQuota equivalent) ---------------- */
  const FREE_LIMIT = 1; /* daily free limit: 1 per day */

  function renderQuota() {
    const pro = !!(auth.user && auth.user.plan === "pro");
    const tag = $("#planTag");
    if (pro) {
      tag.textContent = "Pro Plan";
      tag.classList.add("pro");
      $("#quotaText").textContent = "Pro Access Active";
      $("#quotaFill").style.width = "100%";
    } else {
      tag.textContent = "Free";
      tag.classList.remove("pro");
      $("#quotaText").textContent = `ယနေ့အတွက် အခမဲ့ ${state.quotaLeft} / ${FREE_LIMIT} ကျန်ရှိပါသည်`;
      $("#quotaFill").style.width = (state.quotaLeft / FREE_LIMIT) * 100 + "%";
    }
    $("#btnUpgrade").hidden = pro; /* Pro: hide Upgrade · Free: show */
    try { localStorage.setItem("rb_quota", String(state.quotaLeft)); } catch (_) {}
  }

  function useQuota() {
    if (state.quotaLeft > 0) state.quotaLeft -= 1;
    renderQuota();
  }

  /* ---------------- Navigation: pages ---------------- */
  function setPage(page) {
    state.page = page;
    $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.page === page));
    $$(".page").forEach((p) => p.classList.toggle("active", p.id === "page-" + page));
    $("#crumbCurrent").textContent = PAGES[page].crumb;
    if (page === "history") renderHistory();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  $$(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => setPage(btn.dataset.page));
  });

  /* ---------------- Steps bar ---------------- */
  function updateStepsUI() {
    $$(".step-item").forEach((item) => {
      const n = Number(item.dataset.step);
      item.classList.toggle("current", n === state.step);
      item.classList.toggle("done", n < state.step || (n === 4 && state.voiceGenerated && state.step !== 4));
      const circle = $(".step-circle", item);
      circle.textContent = n < state.step ? "✓" : String(n);
    });
    $$(".step-line").forEach((line, i) => {
      line.classList.toggle("filled", state.step > i + 1);
    });
  }

  function canOpenStep(n) {
    if (n <= 1) return { ok: true };
    if (n === 2 || n === 3) {
      return state.transcriptReady ? { ok: true } : { ok: false, msg: "အရင်ဦးစွာ ဗီဒီယို တင်ပြီး စာသား ထုတ်ယူပါ။" };
    }
    if (n === 4) {
      return state.voiceGenerated
        ? { ok: true }
        : { ok: false, warn: true, msg: "⚠️ ကျေးဇူးပြု၍ Generate Voice Over ကို အရင်နှိပ်ပါ။" };
    }
    return { ok: false, msg: "ဤအဆင့်သို့ မသွားနိုင်သေးပါ။" };
  }

  function goToStep(n) {
    const gate = canOpenStep(n);
    if (!gate.ok) {
      if (gate.warn) {
        showDanger(gate.msg);
        const item = $(`.step-item[data-step="${n}"]`);
        item.classList.remove("shake");
        void item.offsetWidth;
        item.classList.add("shake");
      }
      toast(gate.msg, gate.warn ? "" : "info");
      return;
    }
    hideDanger();
    state.step = n;
    state.maxStep = Math.max(state.maxStep, n);
    $$(".step-panel").forEach((p, i) => p.classList.toggle("active", i + 1 === n));
    updateStepsUI();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  $$(".step-item").forEach((item) => {
    item.addEventListener("click", () => goToStep(Number(item.dataset.step)));
  });

  $$("[data-back]").forEach((b) => b.addEventListener("click", () => goToStep(Number(b.dataset.back))));
  $$("[data-next]").forEach((b) => b.addEventListener("click", () => goToStep(Number(b.dataset.next))));

  /* ---------------- Danger alert ---------------- */
  function showDanger(msg) {
    const a = $("#alertDanger");
    $(".alert-text", a).textContent = msg;
    a.hidden = false;
  }
  function hideDanger() {
    $("#alertDanger").hidden = true;
  }
  $("#alertClose").addEventListener("click", hideDanger);

  /* ---------------- Help modal ---------------- */
  const helpModal = $("#helpModal");
  function openHelp() {
    helpModal.hidden = false;
    document.body.style.overflow = "hidden";
    $("#helpClose").focus();
  }
  function closeHelp() {
    helpModal.hidden = true;
    document.body.style.overflow = "";
    $("#btnHelp").focus();
  }
  $("#btnHelp").addEventListener("click", openHelp);
  $("#helpClose").addEventListener("click", closeHelp);
  $("#helpOk").addEventListener("click", closeHelp);
  helpModal.addEventListener("click", (e) => {
    if (e.target === helpModal) closeHelp();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !helpModal.hidden) closeHelp();
  });

  /* ---------------- Step 1: Dropzone ---------------- */
  const dropzone = $("#dropzone");
  const fileInput = $("#fileInput");
  const uploadView = $("#uploadDropZone");
  const videoPreviewCard = $("#videoPreviewCard");
  const step1Player = $("#step1Player");
  const extractBtn = $("#btnExtractScript");
  const sourceTextInput = $("#sourceTextInput");
  const processingBanner = $("#step1ProcessingBanner");
  const DEV_MODE = (() => {
    try {
      return new URLSearchParams(window.location.search).get("dev") === "1"
        || localStorage.getItem("dev_mode") === "true";
    } catch (_) {
      return false;
    }
  })();
  const DEV_SAMPLE_SOURCE = "今天的比赛有什么特别的消息？\nThis match is the biggest event in the last ten years.\nThe team must win before sunset.\n他们决定一起面对最后的挑战。";
  const VALID = ["mp4", "mov", "webm", "mkv"];

  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });

  ["dragenter", "dragover"].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    })
  );
  ["dragleave", "drop"].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
    })
  );
  dropzone.addEventListener("drop", (e) => {
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) acceptFile(f);
  });
  fileInput.addEventListener("change", () => {
    if (fileInput.files[0]) acceptFile(fileInput.files[0]);
  });

  function fmtSize(bytes) {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function acceptFile(f) {
    const ext = (f.name.split(".").pop() || "").toLowerCase();
    if (!VALID.includes(ext)) {
      toast("MP4, MOV, WEBM, MKV ဖိုင်များကိုသာ လက်ခံပါသည်။", "info");
      return;
    }
    state.file = f;
    state.audioBlob = null;
    state.transcriptReady = false;
    state.voiceGenerated = false;
    state.maxStep = 1;
    if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
    state.videoUrl = URL.createObjectURL(f);
    uploadView.hidden = true;
    videoPreviewCard.hidden = false;
    step1Player.src = state.videoUrl;
    extractBtn.disabled = false;
    hideDanger();
    toast("ဗီဒီယိုဖိုင် တင်ပြီးပါပြီ ✓", "ok");
  }

  function clearStep1Media() {
    if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
    state.videoUrl = null;
    state.file = null;
    state.audioBlob = null;
    state.durationSec = 0;
    state.transcriptReady = false;
    fileInput.value = "";
    uploadView.hidden = false;
    videoPreviewCard.hidden = true;
    processingBanner.hidden = true;
    step1Player.removeAttribute("src");
    step1Player.load();
    extractBtn.disabled = true;
  }

  $("#changeFileBtn").addEventListener("click", () => {
    clearStep1Media();
    fileInput.click();
  });

  $("#deleteFileBtn").addEventListener("click", () => {
    clearStep1Media();
    toast("ဗီဒီယိုဖိုင်ကို ဖျက်ပြီးပါပြီ။", "info");
  });

  /* ---------------- Step 1 → 2: Extract transcript ---------------- */
  // No pre-filled dummy text — Step 2 shows ONE textarea for the real raw subtitles.
  function getSavedKeys() {
    let g = "", a = "";
    try {
      g = sanitizeApiKey(($("#geminiKey") && $("#geminiKey").value) || readStoredGemini());
      a = sanitizeApiKey(($("#assemblyKey") && $("#assemblyKey").value) || readStoredAssembly());
    } catch (_) {}
    return { gemini: g, assembly: a };
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const s = String(r.result || "");
        // Gemini inline_data.data must contain raw Base64 only, never a data URL prefix.
        resolve(s.split(",")[1] || s);
      };
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  async function extractAudioFromVideo(videoFile) {
    if (!videoFile) throw new Error("missing video file");
    if (!window.MediaRecorder) throw new Error("audio extraction is not supported by this browser");

    const sourceUrl = URL.createObjectURL(videoFile);
    const media = document.createElement("video");
    media.muted = true;
    media.playsInline = true;
    media.preload = "auto";
    media.src = sourceUrl;

    const cleanup = (stream) => {
      media.pause();
      media.removeAttribute("src");
      media.load();
      if (stream) stream.getTracks().forEach((track) => track.stop());
      URL.revokeObjectURL(sourceUrl);
    };

    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("video audio load timeout")), 15000);
        media.onloadedmetadata = () => { clearTimeout(timer); resolve(); };
        media.onerror = () => { clearTimeout(timer); reject(new Error("video audio could not be loaded")); };
        media.load();
      });

      const captureStream = typeof media.captureStream === "function"
        ? media.captureStream()
        : typeof media.mozCaptureStream === "function" ? media.mozCaptureStream() : null;
      if (!captureStream) throw new Error("browser cannot capture video audio");
      const audioTracks = captureStream.getAudioTracks();
      if (!audioTracks.length) throw new Error("video has no audio track");

      const audioStream = new MediaStream(audioTracks);
      const mimeTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
      const supportsMime = typeof MediaRecorder.isTypeSupported === "function"
        ? (type) => MediaRecorder.isTypeSupported(type)
        : () => false;
      const mimeType = mimeTypes.find(supportsMime) || "";
      const recorder = mimeType ? new MediaRecorder(audioStream, { mimeType }) : new MediaRecorder(audioStream);
      const chunks = [];
      const timeoutMs = Math.min(Math.max((Number(media.duration) || 60) * 2000, 30000), 300000);

      return await new Promise(async (resolve, reject) => {
        let settled = false;
        const finish = (error, blob) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          cleanup(audioStream);
          if (error) reject(error);
          else if (!blob || !blob.size) reject(new Error("audio extraction returned no data"));
          else resolve(blob);
        };
        const timeout = setTimeout(() => {
          if (recorder.state !== "inactive") recorder.stop();
          finish(new Error("audio extraction timeout"));
        }, timeoutMs);

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size) chunks.push(event.data);
        };
        recorder.onerror = () => finish(new Error("audio recorder failed"));
        recorder.onstop = () => finish(null, new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" }));
        media.onended = () => {
          if (recorder.state !== "inactive") recorder.stop();
        };

        try {
          recorder.start(1000);
          await media.play();
        } catch (error) {
          finish(error instanceof Error ? error : new Error("audio extraction could not start"));
        }
      });
    } catch (error) {
      cleanup(null);
      throw error;
    }
  }

  function getGeminiRelayUrl() {
    try {
      const configured = String(localStorage.getItem("gemini_relay_url") || "").trim();
      if (configured && /^https:\/\//i.test(configured)) return configured;
    } catch (_) {}
    // Public fallback relay. A trusted first-party relay can be configured with
    // localStorage.setItem("gemini_relay_url", "https://your-relay.example/?url=").
    return "https://corsproxy.io/?url=";
  }

  function buildGeminiRequestUrl(apiKey) {
    return "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + encodeURIComponent(apiKey);
  }

  async function fetchGeminiJson(url, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const raw = await res.text();
      let payload = null;
      try { payload = raw ? JSON.parse(raw) : null; } catch (_) {}
      if (!res.ok) {
        const details = String((payload && payload.error && payload.error.message) || raw || "No response body").trim();
        const err = new Error("Gemini " + res.status + ": " + details);
        err.status = res.status;
        err.details = details;
        throw err;
      }
      if (!payload) throw new Error("Gemini returned an invalid JSON response");
      return payload;
    } finally {
      clearTimeout(timer);
    }
  }

  async function transcribeWithGemini(blob, apiKey) {
    const rawMime = String(blob.type || "audio/webm").toLowerCase().split(";")[0];
    const mime = rawMime === "video/mp4" ? "video/mp4"
      : rawMime === "audio/mpeg" || rawMime === "audio/mp3" ? "audio/mp3"
        : rawMime.startsWith("audio/") ? "audio/webm" : "video/mp4";
    const encoded = String(await blobToBase64(blob) || "");
    const b64 = encoded.split(",")[1] || encoded;
    if (!b64.trim()) throw new Error("Gemini payload contains no Base64 audio data");
    const directUrl = buildGeminiRequestUrl(apiKey);
    const body = {
      contents: [{
        parts: [
          { inline_data: { mime_type: mime, data: b64 } },
          { text: "Transcribe all spoken audio from this audio into clear, verbatim text." }
        ]
      }]
    };

    let data;
    let relayError;
    const relayPrefix = getGeminiRelayUrl();
    const relayUrl = relayPrefix.includes("{url}")
      ? relayPrefix.replace("{url}", encodeURIComponent(directUrl))
      : relayPrefix + encodeURIComponent(directUrl);
    try {
      data = await fetchGeminiJson(relayUrl, body);
      console.info("[Red Bear] Gemini transcription completed through relay");
    } catch (error) {
      relayError = error;
      console.warn("[Red Bear] Gemini relay failed; trying direct endpoint", error);
      // A configured relay may reject valid Gemini responses with an auth error;
      // do not hide that error behind an unnecessary second request.
      if (error && [400, 401, 403].includes(Number(error.status))) throw error;
      data = await fetchGeminiJson(directUrl, body);
      console.info("[Red Bear] Gemini transcription completed through direct endpoint", relayError);
    }
    const firstText = data && data.candidates && data.candidates[0]
      && data.candidates[0].content && data.candidates[0].content.parts
      && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
    const text = String(firstText || (((((data.candidates || [])[0] || {}).content || {}).parts || []).map((p) => p.text || "").join("\n")) || "");
    if (!String(text).trim()) throw new Error("Gemini empty");
    return String(text).trim();
  }

  async function transcribeWithAssemblyAI(blob, apiKey) {
    const up = await fetch("https://api.assemblyai.com/v2/upload", {
      method: "POST",
      headers: { authorization: apiKey },
      body: blob,
    });
    if (!up.ok) {
      const err = new Error("AssemblyAI upload " + up.status);
      err.status = up.status;
      throw err;
    }
    const { upload_url } = await up.json();
    const tr = await fetch("https://api.assemblyai.com/v2/transcript", {
      method: "POST",
      headers: { authorization: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ audio_url: upload_url, language_detection: true }),
    });
    if (!tr.ok) {
      const err = new Error("AssemblyAI " + tr.status);
      err.status = tr.status;
      throw err;
    }
    const job = await tr.json();
    for (let i = 0; i < 60; i++) {
      await wait(2500);
      const st = await fetch("https://api.assemblyai.com/v2/transcript/" + job.id, {
        headers: { authorization: apiKey },
      });
      const j = await st.json();
      if (j.status === "completed") return String(j.text || "").trim();
      if (j.status === "error") throw new Error(j.error || "AssemblyAI error");
    }
    throw new Error("AssemblyAI timeout");
  }

  async function runExtractScript() {
    if (!state.file) {
      toast("အရင် ဗီဒီယိုဖိုင် တင်ပါ။", "info");
      return;
    }
    const keys = getSavedKeys();
    // The Step 1 transcription flow explicitly uses the public LocalStorage key.
    try {
      keys.gemini = sanitizeApiKey(localStorage.getItem("gemini_api_key") || "") || keys.gemini;
    } catch (_) {}
    if (!keys.gemini && !keys.assembly) {
      toast("API Key မရှိပါ — Gemini သို့မဟုတ် AssemblyAI Key တစ်ခု ထည့်ပါ။", "info");
      setPage("keys");
      return;
    }
    const btn = $("#btnExtractScript");
    if (btn) {
      btn.disabled = true;
      btn.setAttribute("aria-busy", "true");
      btn.innerHTML = '<span class="spinner"></span> အသံထုတ်ယူနေပါသည်...';
    }
    const processingText = processingBanner ? processingBanner.querySelector("span:last-child") : null;
    if (processingText) processingText.textContent = "⚪ Video ထဲမှ အသံဖိုင်ကို စာသားအဖြစ် ပြောင်းလဲနေပါသည်...";
    processingBanner.hidden = false;
    try {
      const media = state.file;
      let text = "";
      const audioBlob = await extractAudioFromVideo(media);
      state.audioBlob = audioBlob;
      const useGemini = !!keys.gemini;
      const useAssembly = !!keys.assembly;
      async function runGemini() {
        return transcribeWithGemini(audioBlob, keys.gemini);
      }
      async function runAssembly() {
        return transcribeWithAssemblyAI(audioBlob, keys.assembly);
      }
      if (useGemini && useAssembly) {
        try { text = await runGemini(); }
        catch (e) {
          toast("Gemini failed (" + (e.status || e.message) + ") — AssemblyAI fallback...", "info");
          text = await runAssembly();
        }
      } else if (useGemini) {
        text = await runGemini();
      } else {
        text = await runAssembly();
      }
      if (!text) throw new Error("empty transcript");
      sourceTextInput.value = text;
      state.transcriptReady = true;
      toast("✓ Raw script ထုတ်ယူပြီးပါပြီ", "ok");
      goToStep(2);
    } catch (e) {
      console.error("[Red Bear] Step 1 transcription failed", e);
      const status = Number(e && e.status);
      let message = "စာသား ထုတ်ယူမရပါ။ ကျေးဇူးပြု၍ ပြန်ကြိုးစားပါ။";
      if (status === 400 || status === 401 || status === 403) {
        message = "Gemini API Error " + status + ": " + (e.details || e.message || "API Key သို့မဟုတ် request ကို စစ်ဆေးပါ။");
      } else if (status >= 400 && status < 600) {
        message = "Gemini API Error " + status + ": " + (e.details || e.message || "ပြန်ကြိုးစားပါ။");
      } else if (e && e.name === "TypeError") {
        message = "Network ပြဿနာကြောင့် စာသား ထုတ်ယူမရပါ။ Internet connection ကို စစ်ဆေးပါ။";
      } else if (e && /audio extraction|audio track|video audio|missing/i.test(e.message || "")) {
        message = "ဗီဒီယိုမှ အသံဖိုင် ထုတ်ယူမရပါ။ အသံပါသော ဗီဒီယိုဖြင့် ပြန်ကြိုးစားပါ။";
      } else if (e && /timeout/i.test(e.message || "")) {
        message = "အသံဖိုင် ထုတ်ယူရန် အချိန်ကြာနေပါသည်။ ပိုတိုသော ဗီဒီယိုဖြင့် ပြန်ကြိုးစားပါ။";
      } else if (e && /empty transcript/i.test(e.message || "")) {
        message = "ဗီဒီယိုထဲတွင် အသံစာသား မတွေ့ပါ။ အခြားဗီဒီယိုတစ်ခုဖြင့် ပြန်ကြိုးစားပါ။";
      }
      toast(message, "err");
      state.transcriptReady = false;
      processingBanner.hidden = true;
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.removeAttribute("aria-busy");
        btn.innerHTML = "▶ Step 1: အသံထုတ်မည် (Next) &gt;";
      }
      processingBanner.hidden = true;
    }
  }

  if (extractBtn) extractBtn.addEventListener("click", (e) => { e.preventDefault(); runExtractScript(); });

  function activateSourceTextTestMode() {
    sourceTextInput.value = DEV_SAMPLE_SOURCE;
    state.transcriptReady = true;
    state.maxStep = Math.max(state.maxStep, 2);
    goToStep(2);
    toast("🧪 Test Mode — Sample Source Text အသင့်ဖြစ်ပါပြီ", "ok");
  }

  $("#btnSkipVideoTest").addEventListener("click", activateSourceTextTestMode);
  if (DEV_MODE) activateSourceTextTestMode();

  /* ---------------- Step 2 actions ---------------- */

  /* STEP 2 · "Copy Full Prompt" — copies ONLY the clean raw text currently inside
     Step 2's single text box, wrapped verbatim into the dubbing system prompt:

     You are a professional video dubbing translator. Translate the given subtitles into natural spoken Burmese (Myanmar script ONLY, NO Chinese, NO English).

     STRICT RULES:

     1. Translate each line into natural spoken Burmese.

     2. Return ONLY a valid JSON inside a markdown code block using ```json ... ``` tags so it is easy to copy.

     Example Format:
     ```json
     {
       "translations": [
         "ဒီနေ့ ပွဲမှာ ဘာအထူးသတင်း ရှိလဲ။",
         "ဒီနေ့ ပွဲက လွန်ခဲ့တဲ့ ၁၀ နှစ်အတွင်း အကြီးမားဆုံးပဲ။"
       ]
     }
     ```

     Input Text:

     [CURRENT_RAW_TEXT_FROM_STEP_2_BOX]   ← live contents of the Step 2 box, nothing prepended/appended

     No previous Burmese translations, no hardcoded dummy lines — the raw box content is the only payload.
  */
  function buildFullPrompt(rawText) {
    return [
      "You are a professional video dubbing translator. Translate the given subtitles into natural spoken Burmese (Myanmar script ONLY, NO Chinese, NO English).",
      "",
      "STRICT RULES:",
      "",
      "1. Translate each line into natural spoken Burmese.",
      "",
      "2. Return ONLY a valid JSON inside a markdown code block using ```json ... ``` tags so it is easy to copy.",
      "",
      "Example Format:",
      "```json",
      "{",
      '  "translations": [',
      '    "ဒီနေ့ ပွဲမှာ ဘာအထူးသတင်း ရှိလဲ။",',
      '    "ဒီနေ့ ပွဲက လွန်ခဲ့တဲ့ ၁၀ နှစ်အတွင်း အကြီးမားဆုံးပဲ။"',
      "  ]",
      "}",
      "```",
      "",
      "Source subtitles:",
      "",
      rawText,
    ].join("\n");
  }

  // Grab exactly what is inside Step 2's single text box — clean, trimmed, untouched.
  function getStep2RawText() {
    return sourceTextInput.value.trim();
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      // Fallback for non-secure contexts
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      let copied = false;
      try { copied = document.execCommand("copy"); } catch (_) {}
      ta.remove();
      return copied;
    }
  }

  $("#btnCopyPrompt").addEventListener("click", async () => {
    const rawText = getStep2RawText();
    if (!rawText) {
      toast("Raw စာသား ဗလာ ဖြစ်နေပါသည် — အရင်စာသား ရေးပါ သို့မဟုတ် Paste လုပ်ပါ။", "info");
      return;
    }
    // Copy the FULL prompt wrapper (system rules + raw text), not the bare raw text
    const fullPrompt = buildFullPrompt(rawText);
    const copied = await copyToClipboard(fullPrompt);
    if (copied) {
      toast("✓ Full Prompt (System Prompt + Raw Text) ကို Clipboard သို့ ကူးယူပြီးပါပြီ — Gemini App တွင် Paste လုပ်ပါ!", "ok");
    } else {
      toast("Clipboard ကို အသုံးပြု၍ မရသေးပါ — Step 2 ထဲမှ စာသားကို ကိုယ်တိုင် ကူးယူပါ။", "info");
    }
  });

  /* ================================================================
     STEP 3 · AUTO JSON CLEANER & PARSER
     The user pastes Gemini's JSON response into Step 3's input box.
     We automatically:
       1. strip markdown fences (```json ... ```), commentary, `{ } [ ]`,
          the `"translations":` key, quotes and trailing commas;
       2. convert the payload into clean plain-text Burmese lines
          (one per line) and write them back into the textarea;
       3. store those lines for Generate Voice Over.
     ================================================================ */
  const burmeseInput = $("#burmeseText");

  function fmtPitch(hz) {
    const v = Number(hz) || 0;
    return (v > 0 ? "+" : "") + v + " Hz";
  }

  // Heuristic: only run the cleaner when the pasted content actually looks like a JSON payload
  function looksLikeJsonPayload(text) {
    if (!text) return false;
    const t = String(text).trim();
    if (/```/.test(t)) return true;               // fenced markdown block
    if (/"translations"/.test(t)) return true;     // the expected key
    if (/^[\[{]/.test(t) && /"/.test(t)) return true; // raw object/array
    return false;
  }

  function unescapeJsonFragment(s) {
    return String(s).replace(/\\(["\\/bfnrt])/g, (_m, c) => {
      switch (c) {
        case '"': return '"';
        case "\\": return "\\";
        case "/": return "/";
        case "b": return " ";
        case "f": return " ";
        case "n": return " ";  // keep one subtitle line per entry
        case "r": return "";
        case "t": return " ";
        default: return c;
      }
    });
  }

  // Final tidy pass: no stray JSON characters, single-spaced, one clean line
  function cleanLine(s) {
    return unescapeJsonFragment(String(s))
      .replace(/\r?\n+/g, " ")
      .replace(/\s+/g, " ")
      .replace(/^[\s"'{}\[\],:]+/, "")
      .replace(/[,:\s"'{}\[\]]+$/, "")
      .trim();
  }

  function toLineString(v) {
    if (typeof v === "string") return v;
    if (v && typeof v === "object") return v.text || v.translation || v.line || v.value || "";
    return "";
  }

  function pickTranslationArray(data) {
    if (Array.isArray(data)) return data.map(toLineString);
    if (data && typeof data === "object") {
      if (Array.isArray(data.translations)) return data.translations.map(toLineString);
      const firstArray = Object.keys(data)
        .map((k) => data[k])
        .find((v) => Array.isArray(v));
      if (firstArray) return firstArray.map(toLineString);
      if (typeof data === "object" && Object.keys(data).length && !Array.isArray(data)) {
        // e.g. { "1": "...", "2": "..." }
        const values = Object.values(data).filter((v) => typeof v === "string");
        if (values.length) return values;
      }
    }
    return null;
  }

  // Main cleaner: returns an array of clean Burmese lines, or null when it can't parse
  function extractTranslationsFromJson(raw) {
    let text = String(raw).trim().replace(/^\uFEFF/, "");

    // 1) unwrap markdown code fences (```json … ``` or plain ``` … ```)
    const fence = text.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
    if (fence) text = fence[1];
    text = text.replace(/^\s*```(?:json|JSON)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

    // 2) isolate the JSON body — drops any "Sure, here is your JSON:" chatter
    const objStart = text.indexOf("{");
    const arrStart = text.indexOf("[");
    const start = objStart !== -1 && (arrStart === -1 || objStart < arrStart) ? objStart : arrStart;
    if (start !== -1) {
      const end = text.lastIndexOf(text[start] === "{" ? "}" : "]");
      if (end > start) text = text.slice(start, end + 1);
    }

    // 3) try a real JSON.parse first
    let lines = null;
    try {
      lines = pickTranslationArray(JSON.parse(text));
    } catch (_) {
      lines = null;
    }

    // 4) malformed JSON fallback — harvest every quoted string, drop keys like "translations"
    if (!lines || !lines.length) {
      const arrOpen = text.indexOf("[");
      const arrClose = text.lastIndexOf("]");
      const body = arrOpen !== -1 && arrClose > arrOpen ? text.slice(arrOpen, arrClose + 1) : text;
      const matches = body.match(/"((?:\\.|[^"\\])*)"/g);
      if (matches && matches.length) {
        lines = matches
          .map((m) => m.slice(1, -1))
          .filter((s) => s.trim().toLowerCase() !== "translations");
      }
    }

    if (!lines || !lines.length) return null;
    const clean = lines.map(cleanLine).filter(Boolean);
    return clean.length ? clean : null;
  }

  function renderScriptPreview(lines) {
    state.scriptLines = lines.map((text, i) => {
      const prev = state.scriptLines[i] || {};
      return {
        text,
        voice: prev.voice || "",
        pitch: prev.pitch == null ? "" : prev.pitch,
      };
    });
  }

  function refreshGlobalPicks() {}

  // Preview mirrors the textarea content (plain lines, split on newlines)
  function syncScriptPreviewFromText() {
    const lines = burmeseInput.value
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
    renderScriptPreview(lines);
  }

  // Run the cleaner over the input: returns true when a JSON payload was stripped
  function autoCleanBurmeseInput(opts) {
    const notify = !!(opts && opts.notify);
    const raw = burmeseInput.value;
    if (!looksLikeJsonPayload(raw)) {
      syncScriptPreviewFromText();
      return false;
    }
    const lines = extractTranslationsFromJson(raw);
    if (!lines) {
      syncScriptPreviewFromText();
      if (notify) toast("JSON structure ကို အလိုအလျောက် ဖော်ထုတ်၍ မရပါ — စာသားကို လိုင်းလိုင်းစီ ပြန်စစ်ပါ။", "info");
      return false;
    }
    burmeseInput.value = lines.join("\n");
    renderScriptPreview(lines);
    if (state.voiceGenerated) { state.voiceGenerated = false; updateStepsUI(); }
    if (notify) {
      toast(`✓ Auto JSON Cleaner — JSON structure များ ဖယ်ရှားပြီး မြန်မာ လိုင်း ${lines.length} ခုကို သန့်စင်ပြီးပါပြီ`, "ok");
    }
    return true;
  }

  // ① Paste Gemini's JSON response → parse + clean immediately
  burmeseInput.addEventListener("paste", () => {
    // let the browser finish inserting the pasted text, then clean
    setTimeout(() => autoCleanBurmeseInput({ notify: true }), 0);
  });

  // ② Also react to typed/edited JSON (debounced) and to blur
  let step3InputTimer = null;
  burmeseInput.addEventListener("input", () => {
    clearTimeout(step3InputTimer);
    step3InputTimer = setTimeout(() => autoCleanBurmeseInput({ notify: true }), 600);
  });
  burmeseInput.addEventListener("blur", () => autoCleanBurmeseInput({ notify: false }));

  /* ---------------- Voice cards: grouped by gender ----------------
     Male personas render in an upper blue section, female personas in a lower
     pink/rose section, so the two gradients never share a row. Both the Step 3
     grid and the Auto Recap grid are built from the same VOICES data. */
  const VOICE_GROUPS = [
    { gender: "male", my: "အမျိုးသား အသံများ", en: "Male Voices", symbol: "♂" },
    { gender: "female", my: "အမျိုးသမီး အသံများ", en: "Female Voices", symbol: "♀" },
  ];

  const VOICE_FILTERS = [
    { key: "all", label: "အားလုံး" },
    { key: "male", label: "အမျိုးသား" },
    { key: "female", label: "အမျိုးသမီး" },
  ];

  function createVoiceCard(v, opts) {
    const onSelect = opts.onSelect;
    const personaClass = String(v.code || "").toLowerCase().replace(/[^a-z0-9_-]/g, "");
    const genderClass = voiceGenderClass(v);
    const card = document.createElement("div");
    card.className = `voice-card voice-card-${personaClass} voice-card-${genderClass}`;
    card.dataset.code = v.code;
    card.dataset.gender = genderClass;
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", `${v.name} (${v.code})`);
    card.innerHTML = `
      <div class="vc-code voice-avatar voice-avatar-${genderClass}">${v.code}</div>
      <div class="vc-label">${v.name}</div>
      <button class="vc-preview${opts.previewClass ? " " + opts.previewClass : ""}" type="button">${PREVIEW_LABEL_IDLE}</button>
    `;
    card.addEventListener("click", (e) => {
      if (e.target.closest(".vc-preview")) return;
      onSelect(v.code);
    });
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelect(v.code);
      }
    });
    $(".vc-preview", card).addEventListener("click", (e) => {
      e.stopPropagation();
      onSelect(v.code);
      previewVoice(v, e.currentTarget);
    });
    return card;
  }

  function buildVoiceSections(container, opts) {
    if (!container) return;
    const options = opts || {};
    container.innerHTML = "";
    container.dataset.filter = "all";

    const filterBar = document.createElement("div");
    filterBar.className = "voice-filter";
    filterBar.setAttribute("role", "group");
    filterBar.setAttribute("aria-label", "ကျား/မ အလိုက် စစ်ထုတ်ရန်");
    VOICE_FILTERS.forEach((f) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "voice-filter-chip" + (f.key === "all" ? " active" : "");
      chip.dataset.filter = f.key;
      chip.textContent = f.label;
      chip.setAttribute("aria-pressed", String(f.key === "all"));
      chip.addEventListener("click", () => {
        stopVoicePreview();
        container.dataset.filter = f.key;
        $$(".voice-filter-chip", filterBar).forEach((c) => {
          const on = c.dataset.filter === f.key;
          c.classList.toggle("active", on);
          c.setAttribute("aria-pressed", String(on));
        });
      });
      filterBar.appendChild(chip);
    });
    container.appendChild(filterBar);

    VOICE_GROUPS.forEach((group) => {
      const voices = VOICES.filter((v) => voiceGenderClass(v) === group.gender);
      if (!voices.length) return;

      const section = document.createElement("section");
      section.className = `voice-group voice-group-${group.gender}`;
      section.dataset.gender = group.gender;

      const head = document.createElement("div");
      head.className = "voice-group-head";
      head.innerHTML = `
        <span class="voice-group-icon" aria-hidden="true">${group.symbol}</span>
        <h4 class="voice-group-title">${group.my} <span class="voice-group-en">(${group.en})</span></h4>
        <span class="voice-group-count">${voices.length}</span>
      `;
      section.appendChild(head);

      const grid = document.createElement("div");
      grid.className = "voice-grid-inner";
      voices.forEach((v) => grid.appendChild(createVoiceCard(v, options)));
      section.appendChild(grid);

      container.appendChild(section);
    });
  }

  buildVoiceSections($("#voiceGrid"), { onSelect: (code) => selectVoice(code) });

  function selectVoice(code) {
    state.voice = code;
    try { localStorage.setItem("selected_voice_id", code); } catch (_) {}
    $$(".voice-card").forEach((c) => c.classList.toggle("selected", c.dataset.code === code));
    $("#voiceChip").hidden = false;
    $("#voiceChip").textContent = (voiceName(code) || code) + " ရွေးပြီး";
    // keep per-line "Global" labels current
    refreshGlobalPicks();
    // re-generation is required after a change
    if (state.voiceGenerated) {
      state.voiceGenerated = false;
      updateStepsUI();
    }
  }

  /* ---------------- Step 3: Voice preview (static bundled samples) ----------------
     Previews used to be produced at click time by calling an external TTS service
     with fetch(). Any CORS rule, offline moment, or blocked host turned that into
     "Voice Preview failed: Failed to fetch" and the card stayed stuck on loading.
     Every persona now maps to a pre-rendered clip that ships with the app, so a
     preview is just a same-origin <audio> load — no fetch(), no third-party host,
     no browser speech fallback. */
  const VOICE_SAMPLE_DIR = "assets/voice-samples/";
  const VOICE_SAMPLES = {
    BB: VOICE_SAMPLE_DIR + "bb.mp3",
    NL: VOICE_SAMPLE_DIR + "nl.mp3",
    PW: VOICE_SAMPLE_DIR + "pw.mp3",
    KM: VOICE_SAMPLE_DIR + "km.mp3",
    ZK: VOICE_SAMPLE_DIR + "zk.mp3",
    HS: VOICE_SAMPLE_DIR + "hs.mp3",
    SL: VOICE_SAMPLE_DIR + "sl.mp3",
    YS: VOICE_SAMPLE_DIR + "ys.mp3",
    EC: VOICE_SAMPLE_DIR + "ec.mp3",
    TS: VOICE_SAMPLE_DIR + "ts.mp3",
  };

  let activePreviewAudio = null;
  let activePreviewBtn = null;

  // Static lookup: persona code -> bundled sample clip (never a network request).
  function getVoiceSampleUrl(code) {
    return VOICE_SAMPLES[String(code || "").trim().toUpperCase()] || "";
  }

  function resetVoicePreviewButton(btn) {
    if (!btn) return;
    btn.classList.remove("playing");
    btn.disabled = false;
    btn.textContent = PREVIEW_LABEL_IDLE;
  }

  function markVoicePreviewPlaying(btn) {
    if (!btn) return;
    btn.classList.add("playing");
    btn.disabled = true;
    btn.textContent = PREVIEW_LABEL_PLAYING;
  }

  function stopVoicePreview() {
    const audio = activePreviewAudio;
    activePreviewAudio = null;
    activePreviewBtn = null;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch (_) {}
    }
    $$(".vc-preview").forEach(resetVoicePreviewButton);
  }

  function previewVoice(v, btn) {
    // Only one preview at a time: stop whatever is playing and reset every card.
    stopVoicePreview();

    const sampleUrl = getVoiceSampleUrl(v.code);
    if (!sampleUrl) {
      console.error(`[Red Bear] No static preview sample mapped for ${v.code}`);
      toast(`Voice Preview sample မရှိပါ (${v.code})`, "err");
      return;
    }

    const audio = new Audio(sampleUrl);
    audio.preload = "auto";
    activePreviewAudio = audio;
    activePreviewBtn = btn;
    markVoicePreviewPlaying(btn);

    const release = () => {
      if (activePreviewAudio === audio) {
        activePreviewAudio = null;
        activePreviewBtn = null;
      }
      resetVoicePreviewButton(btn);
    };

    audio.onended = release;
    audio.onerror = () => {
      console.error(`[Red Bear] Voice Preview sample could not be played for ${v.code}`, sampleUrl);
      toast(`Voice Preview failed (${v.code}): sample file မဖွင့်နိုင်ပါ`, "err");
      release();
    };

    const playback = audio.play();
    if (playback && typeof playback.catch === "function") {
      playback.catch((error) => {
        console.error(`[Red Bear] Voice Preview playback blocked for ${v.code}`, error);
        const detail = error && error.message ? error.message : "playback blocked";
        toast(`Voice Preview failed (${v.code}): ${detail}`, "err");
        release();
      });
    }
    console.info(`[Red Bear] Voice Preview playing ${v.code} -> ${sampleUrl}`);
  }

  /* ---------------- Pitch slider ---------------- */
  const pitchSlider = $("#pitchSlider");
  const pitchValue = $("#pitchValue");
  pitchSlider.addEventListener("input", () => {
    state.pitch = Number(pitchSlider.value);
    const v = state.pitch;
    pitchValue.textContent = fmtPitch(v);
    refreshGlobalPicks();
  });

  async function runRenderProgress(label) {
    const bar = $("#renderBar");
    const fill = $("#rbFill");
    const pct = $("#rbPct");
    const lab = $("#rbLabel");
    // [VIDEO-EXPORT] default was "ဗီဒီယို ဖန်တီးနေပါသည်..." before audio-only test mode.
    if (lab) lab.textContent = label || "အသံဖိုင် ဖန်တီးနေပါသည်...";
    if (bar) bar.hidden = false;
    if (fill) fill.style.width = "0%";
    if (pct) pct.textContent = "0%";
    for (let p = 0; p <= 100; p += 10) {
      if (fill) fill.style.width = p + "%";
      if (pct) pct.textContent = p + "%";
      await wait(140);
    }
    if (bar) bar.hidden = true;
  }

  /* ================================================================
     TEST MODE — AUDIO-ONLY RENDER / EXPORT
     ----------------------------------------------------------------
     While TEST_AUDIO_ONLY_EXPORT is true the final step skips the video
     side of the pipeline (canvas composition + FFmpeg video layer) and
     bounces the voice-over timeline straight to one downloadable MP3.

     TO REVERT TO FULL VIDEO EXPORT:
       1. set TEST_AUDIO_ONLY_EXPORT = false;
       2. restore every commented block tagged [VIDEO-EXPORT] (here, in
          generateVoiceOver(), in the Re-render handler and in Auto Recap);
       3. in index.html swap #btnDownloadAudio back to the video download
          button (also tagged [VIDEO-EXPORT]).

     NOTE: this build has no TTS backend, so each script line is voiced by
     the bundled sample clip of the persona assigned to that line. Point
     clipUrlForSentence() inside fetchPlanAudio() at the real per-line TTS
     endpoint when it exists — every later phase stays exactly the same.

     PIPELINE (one phase must finish before the next one starts):
       currentExportPlan()  -> one entry per subtitle line
       fetchPlanAudio()     -> Promise.all() of every clip, byte size logged,
                               any failure aborts with "Audio fetch failed for
                               sentence X" instead of exporting silence
       decodePlanAudio()    -> decode on a RESUMED AudioContext
       mixPlanAudio()       -> OfflineAudioContext mixdown (+ background music)
       peak check           -> silence is rejected, falls back to a plain
                               new Blob([...], { type: "audio/mp3" }) concat
     ================================================================ */
  const TEST_AUDIO_ONLY_EXPORT = true;
  const TEST_AUDIO_MP3_KBPS = 96;
  const TEST_AUDIO_SAMPLE_RATE = 44100;
  const TEST_AUDIO_GAP_SEC = 0.28;       // silence between two script lines
  const TEST_AUDIO_MIN_LINE_SEC = 2.2;   // shortest slice used for one line
  const TEST_AUDIO_PER_CHAR_SEC = 0.055; // line length -> slice length
  const TEST_AUDIO_BGM_GAIN = 0.16;      // background music sits under the voice
  const TEST_AUDIO_DEBUG = true;         // byte-size logging while the test build is on
  const TEST_AUDIO_ALERT_ON_FAIL = true; // hard alert instead of a silent export
  const TEST_AUDIO_SILENCE_PEAK = 0.0008; // anything quieter counts as "silent"
  const MP3_ENCODER_SRC = "assets/vendor/lamejs/lame.min.js";

  /* [VIDEO-EXPORT] original video export constants
  const VIDEO_EXPORT_MIME = "video/mp4";
  const VIDEO_EXPORT_FPS = 30;
  */

  let mp3EncoderPromise = null;
  let decodeCtx = null;
  const clipBytesCache = new Map();   // url -> ArrayBuffer (kept intact for the fallback)
  const clipBufferCache = new Map();  // url -> decoded AudioBuffer

  // The encoder is only pulled in when the user actually exports (local file,
  // no CDN), so normal page loads stay light.
  function loadMp3Encoder() {
    if (window.lamejs && window.lamejs.Mp3Encoder) return Promise.resolve(window.lamejs);
    if (mp3EncoderPromise) return mp3EncoderPromise;
    mp3EncoderPromise = new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = MP3_ENCODER_SRC;
      el.onload = () => {
        if (window.lamejs && window.lamejs.Mp3Encoder) resolve(window.lamejs);
        else reject(new Error("MP3 encoder did not initialise"));
      };
      el.onerror = () => reject(new Error("MP3 encoder could not be loaded"));
      document.head.appendChild(el);
    });
    return mp3EncoderPromise;
  }

  function getAudioCtxClass() { return window.AudioContext || window.webkitAudioContext || null; }
  function getOfflineCtxClass() { return window.OfflineAudioContext || window.webkitOfflineAudioContext || null; }

  function getDecodeContext() {
    const Ctx = getAudioCtxClass();
    if (!Ctx) throw new Error("Web Audio API is not available in this browser");
    if (!decodeCtx) decodeCtx = new Ctx();
    return decodeCtx;
  }

  // A context created outside a user gesture comes back "suspended"; decoding on
  // a suspended context is one of the ways an export ends up silent, so always
  // resume before touching audio data.
  async function getReadyDecodeContext() {
    const ctx = getDecodeContext();
    if (ctx.state === "suspended" && typeof ctx.resume === "function") {
      try {
        await ctx.resume();
        console.info("[Red Bear] AudioContext resumed →", ctx.state);
      } catch (error) {
        console.warn("[Red Bear] AudioContext could not be resumed", error);
      }
    }
    return ctx;
  }

  function decodeAudioBytes(bytes, ctx) {
    const context = ctx || getDecodeContext();
    return new Promise((resolve, reject) => {
      const maybe = context.decodeAudioData(bytes, resolve, reject);
      if (maybe && typeof maybe.then === "function") maybe.then(resolve, reject);
    });
  }

  // Loud, unmissable failure — better than handing the user a silent file.
  function notifyAudioFailure(message) {
    console.error("[Red Bear] " + message);
    try { toast(message, "err"); } catch (_) {}
    if (TEST_AUDIO_ALERT_ON_FAIL && typeof window.alert === "function") {
      try { window.alert(message); } catch (_) {}
    }
  }

  function bufferPeak(buffer) {
    let peak = 0;
    const channels = buffer.numberOfChannels || 1;
    for (let c = 0; c < channels; c++) {
      const data = buffer.getChannelData(c);
      const step = Math.max(1, Math.floor(data.length / 200000));
      for (let i = 0; i < data.length; i += step) {
        const v = Math.abs(data[i]);
        if (v > peak) peak = v;
      }
    }
    return peak;
  }

  /* ---- 1. FETCH PHASE ------------------------------------------------------
     Every sentence's audio is downloaded and resolved to an ArrayBuffer before
     any merging starts: the whole plan goes through one await Promise.all(),
     so concatenation can never begin while a request is still pending. */
  async function fetchClipBytes(url, sentence, code) {
    if (clipBytesCache.has(url)) return clipBytesCache.get(url);
    let res = null;
    try {
      res = await fetch(url);
    } catch (error) {
      throw new Error(`Audio fetch failed for sentence ${sentence} (${code}) — ${error && error.message ? error.message : "network error"}`);
    }
    if (!res || !res.ok) {
      throw new Error(`Audio fetch failed for sentence ${sentence} (${code}) — HTTP ${res ? res.status : "no response"}`);
    }
    const bytes = await res.arrayBuffer();
    if (!bytes || !bytes.byteLength) {
      throw new Error(`Audio fetch failed for sentence ${sentence} (${code}) — empty audio payload`);
    }
    clipBytesCache.set(url, bytes);
    return bytes;
  }

  async function settleAll(promises) {
    return Promise.all(promises.map((p) => p.then((value) => ({ value }), (error) => ({ error }))));
  }

  async function fetchPlanAudio(plan) {
    const jobs = plan.map(async (line, i) => {
      const sentence = i + 1;
      const code = line.voice || state.voice || VOICES[0].code;
      const url = getVoiceSampleUrl(code) || getVoiceSampleUrl(VOICES[0].code);
      if (!url) throw new Error(`Audio fetch failed for sentence ${sentence} — no audio clip mapped for voice ${code}`);
      const bytes = await fetchClipBytes(url, sentence, code);
      console.log(`[Red Bear] TTS chunk ${sentence}/${plan.length} · ${code} · ${bytes.byteLength.toLocaleString()} bytes · ${url}`);
      return { sentence, code, url, bytes, line };
    });

    const settled = await settleAll(jobs);                 // <- nothing proceeds until all are done
    const failures = settled.filter((r) => r.error);
    if (failures.length) {
      failures.forEach((f) => console.error("[Red Bear]", f.error.message));
      notifyAudioFailure(failures[0].error.message);
      throw failures[0].error;
    }

    const chunks = settled.map((r) => r.value);
    const totalBytes = chunks.reduce((n, c) => n + c.bytes.byteLength, 0);
    console.info(`[Red Bear] all ${chunks.length} TTS chunks fetched · ${totalBytes.toLocaleString()} bytes total`);
    if (TEST_AUDIO_DEBUG && typeof console.table === "function") {
      console.table(chunks.map((c) => ({ sentence: c.sentence, voice: c.code, bytes: c.bytes.byteLength, clip: c.url })));
    }
    return chunks;
  }

  /* ---- 2. DECODE PHASE (also awaited as a whole) ---- */
  async function decodePlanAudio(chunks) {
    const ctx = await getReadyDecodeContext();
    const jobs = chunks.map(async (chunk) => {
      if (clipBufferCache.has(chunk.url)) {
        chunk.buffer = clipBufferCache.get(chunk.url);
        return chunk;
      }
      let buffer = null;
      try {
        // decodeAudioData detaches the ArrayBuffer it is given, so decode a copy
        // and keep chunk.bytes intact for the blob-concat fallback.
        buffer = await decodeAudioBytes(chunk.bytes.slice(0), ctx);
      } catch (error) {
        throw new Error(`Audio decode failed for sentence ${chunk.sentence} (${chunk.code}) — ${error && error.message ? error.message : "decode error"}`);
      }
      if (!buffer || !buffer.length) {
        throw new Error(`Audio decode failed for sentence ${chunk.sentence} (${chunk.code}) — empty buffer`);
      }
      console.log(`[Red Bear] decoded sentence ${chunk.sentence} · ${chunk.code} · ${buffer.duration.toFixed(2)}s @ ${buffer.sampleRate}Hz`);
      clipBufferCache.set(chunk.url, buffer);
      chunk.buffer = buffer;
      return chunk;
    });

    const settled = await settleAll(jobs);
    const failures = settled.filter((r) => r.error);
    if (failures.length) {
      failures.forEach((f) => console.error("[Red Bear]", f.error.message));
      notifyAudioFailure(failures[0].error.message);
      throw failures[0].error;
    }
    return settled.map((r) => r.value);
  }

  // Optional background music — wired for a future picker; inert until one exists.
  function getBackgroundMusicUrl() {
    const el = document.getElementById("bgmSelect");
    if (el && el.value) return el.value;
    try { return String(localStorage.getItem("rb_bgm_url") || "").trim(); } catch (_) { return ""; }
  }

  async function loadBackgroundMusicBuffer(ctx) {
    const url = getBackgroundMusicUrl();
    if (!url) return null;
    try {
      const res = await fetch(url);
      if (!res || !res.ok) throw new Error("HTTP " + (res ? res.status : "no response"));
      const bytes = await res.arrayBuffer();
      console.log(`[Red Bear] background music · ${bytes.byteLength.toLocaleString()} bytes · ${url}`);
      return await decodeAudioBytes(bytes.slice(0), ctx);
    } catch (error) {
      console.warn("[Red Bear] background music skipped:", error);
      toast("နောက်ခံသီချင်း ထည့်၍ မရပါ — အသံသာ ထုတ်ပါမည်။", "info");
      return null;
    }
  }

  function pitchOffsetToRate(hz) {
    const v = Number(hz);
    if (!isFinite(v) || !v) return 1;
    return Math.min(1.35, Math.max(0.75, 1 + v / 200));
  }

  function currentExportPlan() {
    const plan = (state.voicePlan || []).filter((p) => p && String(p.text || "").trim());
    if (plan.length) return plan;
    return (state.scriptLines || [])
      .filter((l) => l && String(l.text || "").trim())
      .map((l, i) => ({
        n: i + 1,
        text: l.text,
        voice: l.voice || state.voice,
        pitch: l.pitch === "" || l.pitch === undefined ? state.pitch : l.pitch,
      }));
  }

  /* ---- 3. MIX PHASE: every clip is already in memory before this runs ---- */
  async function mixPlanAudio(chunks) {
    const OfflineCtx = getOfflineCtxClass();
    if (!OfflineCtx) throw new Error("OfflineAudioContext is not available in this browser");

    const segments = [];
    let cursor = 0;
    chunks.forEach((chunk) => {
      const buffer = chunk.buffer;
      const rate = pitchOffsetToRate(chunk.line && chunk.line.pitch);
      const natural = buffer.duration / rate;
      const text = String((chunk.line && chunk.line.text) || "");
      const wanted = Math.min(natural, Math.max(TEST_AUDIO_MIN_LINE_SEC,
        TEST_AUDIO_MIN_LINE_SEC + text.length * TEST_AUDIO_PER_CHAR_SEC));
      segments.push({ buffer, rate, start: cursor, duration: wanted });
      cursor += wanted + TEST_AUDIO_GAP_SEC;
    });

    const ctx = await getReadyDecodeContext();
    const bgm = await loadBackgroundMusicBuffer(ctx);
    const total = Math.max(0.5, cursor - TEST_AUDIO_GAP_SEC + 0.35);
    const offline = new OfflineCtx(1, Math.ceil(total * TEST_AUDIO_SAMPLE_RATE), TEST_AUDIO_SAMPLE_RATE);

    segments.forEach((seg) => {
      const src = offline.createBufferSource();
      src.buffer = seg.buffer;
      src.playbackRate.value = seg.rate;
      const gain = offline.createGain();
      const fade = Math.min(0.06, seg.duration / 4);
      gain.gain.setValueAtTime(0.0001, seg.start);
      gain.gain.linearRampToValueAtTime(1, seg.start + fade);
      gain.gain.setValueAtTime(1, seg.start + seg.duration - fade);
      gain.gain.linearRampToValueAtTime(0.0001, seg.start + seg.duration);
      src.connect(gain);
      gain.connect(offline.destination);
      // offset/duration are in buffer time, so scale by the playback rate.
      src.start(seg.start, 0, seg.duration * seg.rate);
    });

    if (bgm) {
      const music = offline.createBufferSource();
      music.buffer = bgm;
      music.loop = true;
      const musicGain = offline.createGain();
      musicGain.gain.setValueAtTime(TEST_AUDIO_BGM_GAIN, 0);
      musicGain.gain.setValueAtTime(TEST_AUDIO_BGM_GAIN, Math.max(0, total - 1.2));
      musicGain.gain.linearRampToValueAtTime(0.0001, total);
      music.connect(musicGain);
      musicGain.connect(offline.destination);
      music.start(0);
      music.stop(total);
    }

    const rendered = await offline.startRendering();
    if (!rendered || !rendered.length) throw new Error("mixdown returned an empty buffer");
    return { buffer: rendered, lines: chunks.length, withMusic: !!bgm };
  }

  // Fallback used when Web Audio cannot produce a usable mixdown: the fetched
  // MP3 chunks are already same-format (44.1 kHz mono CBR), so a straight blob
  // concatenation plays fine and still contains every sentence.
  /**
   * Strip the ID3v2 tag, the ID3v1 trailer and the Xing/Info header frame from a
   * standalone MP3 so several clips can be glued together into one clean stream.
   * Without this the concatenated file carries metadata blocks in the middle of
   * the audio and the leading Xing frame misreports the total duration.
   * Anything unexpected falls through and returns the untouched bytes.
   */
  function stripMp3Container(bytes) {
    try {
      const view = new Uint8Array(bytes);
      let start = 0;
      let end = view.length;

      // ID3v2 header: "ID3" + ver(2) + flags(1) + syncsafe size(4)
      if (view.length > 10 && view[0] === 0x49 && view[1] === 0x44 && view[2] === 0x33) {
        const size =
          ((view[6] & 0x7f) << 21) | ((view[7] & 0x7f) << 14) | ((view[8] & 0x7f) << 7) | (view[9] & 0x7f);
        start = 10 + size + (view[5] & 0x10 ? 10 : 0); // optional footer
      }
      // ID3v1 trailer: "TAG" in the last 128 bytes
      if (end - start > 128 && view[end - 128] === 0x54 && view[end - 127] === 0x41 && view[end - 126] === 0x47) {
        end -= 128;
      }
      // Re-sync in case the tag size was slightly off.
      let guard = 0;
      while (start < end - 4 && !(view[start] === 0xff && (view[start + 1] & 0xe0) === 0xe0) && guard++ < 8192) start++;
      if (start >= end - 4) return bytes;

      // Drop the Xing/Info (or VBRI) header frame — it is a silent frame that only carries metadata.
      const frame = readMp3FrameSize(view, start);
      if (frame > 0 && start + frame <= end) {
        const tail = Math.min(start + frame, start + 200);
        for (let i = start + 4; i < tail - 3; i++) {
          const tag = String.fromCharCode(view[i], view[i + 1], view[i + 2], view[i + 3]);
          if (tag === "Xing" || tag === "Info" || tag === "VBRI") {
            start += frame;
            break;
          }
        }
      }
      return start === 0 && end === view.length ? bytes : view.subarray(start, end).slice().buffer;
    } catch (_) {
      return bytes;
    }
  }

  const MP3_BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
  const MP3_BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
  const MP3_RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

  function readMp3FrameSize(view, at) {
    const b1 = view[at + 1];
    const b2 = view[at + 2];
    const versionBits = (b1 >> 3) & 0x03; // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
    const layerBits = (b1 >> 1) & 0x03; // 1 = Layer III
    const rates = MP3_RATES[versionBits];
    if (layerBits !== 1 || !rates) return 0;
    const bitrate = (versionBits === 3 ? MP3_BITRATES_V1_L3 : MP3_BITRATES_V2_L3)[(b2 >> 4) & 0x0f];
    const sampleRate = rates[(b2 >> 2) & 0x03];
    if (!bitrate || !sampleRate) return 0;
    const padding = (b2 >> 1) & 0x01;
    const samplesPerFrame = versionBits === 3 ? 1152 : 576;
    return Math.floor((samplesPerFrame / 8) * bitrate * 1000 / sampleRate) + padding;
  }

  function concatenateClipsBlob(chunks) {
    const parts = chunks.map((c) => stripMp3Container(c.bytes));
    const raw = chunks.reduce((n, c) => n + c.bytes.byteLength, 0);
    const bytes = parts.reduce((n, b) => n + b.byteLength, 0);
    console.info(
      `[Red Bear] blob concatenation fallback · ${parts.length} chunks · ${bytes.toLocaleString()} bytes ` +
        `(${(raw - bytes).toLocaleString()} bytes of container metadata stripped)`
    );
    return new Blob(parts, { type: "audio/mp3" });
  }

  function floatToPcm16(input) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }

  function audioBufferToMp3Blob(buffer, kbps) {
    const lame = window.lamejs;
    if (!lame || !lame.Mp3Encoder) throw new Error("MP3 encoder is not ready");
    const channels = Math.min(2, buffer.numberOfChannels || 1);
    const encoder = new lame.Mp3Encoder(channels, buffer.sampleRate, kbps || TEST_AUDIO_MP3_KBPS);
    const left = floatToPcm16(buffer.getChannelData(0));
    const right = channels > 1 ? floatToPcm16(buffer.getChannelData(1)) : null;
    const blockSize = 1152;
    const chunks = [];
    for (let i = 0; i < left.length; i += blockSize) {
      const l = left.subarray(i, i + blockSize);
      const encoded = right
        ? encoder.encodeBuffer(l, right.subarray(i, i + blockSize))
        : encoder.encodeBuffer(l);
      if (encoded && encoded.length) chunks.push(new Uint8Array(encoded));
    }
    const tail = encoder.flush();
    if (tail && tail.length) chunks.push(new Uint8Array(tail));
    return new Blob(chunks, { type: "audio/mpeg" });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function exportBaseName() {
    const raw = state.file && state.file.name ? state.file.name : "red-bear-recap";
    return String(raw).replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 60) || "red-bear-recap";
  }

  function setRenderBar(label, pct) {
    const bar = $("#renderBar");
    const fill = $("#rbFill");
    const p = $("#rbPct");
    const lab = $("#rbLabel");
    if (bar) bar.hidden = false;
    if (lab && label) lab.textContent = label;
    if (fill) fill.style.width = pct + "%";
    if (p) p.textContent = Math.round(pct) + "%";
  }

  function hideRenderBar() {
    const bar = $("#renderBar");
    if (bar) bar.hidden = true;
  }

  async function exportTestAudio() {
    const btn = $("#btnDownloadAudio");
    const plan = currentExportPlan();
    if (!plan.length) {
      toast("စာမူ မရှိသေးပါ — Step 3 တွင် အသံ အရင်ဖန်တီးပါ။", "info");
      return;
    }
    const label = btn ? btn.innerHTML : "";
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> အသံဖိုင် ပြင်ဆင်နေပါသည်...';
    }
    console.group ? console.group(`[Red Bear] Test Audio export · ${plan.length} sentences`) : console.info("[Red Bear] Test Audio export");
    try {
      const lamePromise = loadMp3Encoder();

      // (1) fetch everything first — no merging while a request is pending
      setRenderBar("အသံဖိုင်များ ဆွဲယူနေပါသည်...", 20);
      const chunks = await fetchPlanAudio(plan);

      let blob = null;
      let seconds = 0;
      let withMusic = false;
      let mode = "mixdown";

      try {
        // (2) decode + merge sequentially on one Web Audio timeline
        setRenderBar("အသံလိုင်း ပေါင်းစပ်နေပါသည်...", 50);
        const decoded = await decodePlanAudio(chunks);
        const mix = await mixPlanAudio(decoded);
        const peak = bufferPeak(mix.buffer);
        console.info(`[Red Bear] mixdown ${mix.buffer.duration.toFixed(2)}s · peak ${peak.toFixed(4)}`);
        // (3) never ship a silent file
        if (peak < TEST_AUDIO_SILENCE_PEAK) throw new Error(`mixdown is silent (peak ${peak.toFixed(5)})`);
        setRenderBar("MP3 အဖြစ် ပြောင်းနေပါသည်...", 78);
        await lamePromise;
        blob = audioBufferToMp3Blob(mix.buffer, TEST_AUDIO_MP3_KBPS);
        seconds = Math.round(mix.buffer.duration);
        withMusic = mix.withMusic;
      } catch (mixError) {
        console.warn("[Red Bear] Web Audio mixdown unusable → blob concatenation fallback:", mixError);
        toast("Web Audio mixdown မရပါ — MP3 chunk များ တိုက်ရိုက် ပေါင်းစပ်ပါမည်။", "info");
        setRenderBar("MP3 chunk များ ပေါင်းစပ်နေပါသည်...", 78);
        blob = concatenateClipsBlob(chunks);
        mode = "concat";
      }

      if (!blob || blob.size < 1024) {
        throw new Error(`exported audio is empty (${blob ? blob.size : 0} bytes)`);
      }
      console.info(`[Red Bear] export ready · mode=${mode} · ${blob.size.toLocaleString()} bytes · type=${blob.type}`);

      setRenderBar("ဒေါင်းလုဒ် စတင်နေပါသည်...", 100);
      downloadBlob(blob, exportBaseName() + ".test-audio.mp3");
      const sizeKb = Math.round(blob.size / 1024);
      toast(`🎵 Test Audio MP3 ရပါပြီ — ${plan.length} lines${seconds ? " · " + seconds + "s" : ""} · ${sizeKb} KB${withMusic ? " · +music" : ""}`, "ok");
    } catch (error) {
      console.error("[Red Bear] Test audio export failed", error);
      const message = error && error.message ? error.message : "unknown error";
      // Fetch/decode problems already alerted with the per-sentence message.
      if (!/^Audio (fetch|decode) failed/.test(message)) notifyAudioFailure("Audio export failed — " + message);
    } finally {
      if (console.groupEnd) console.groupEnd();
      hideRenderBar();
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = label || "🎵 ဒေါင်းလုဒ်လုပ်ရန် (Test Audio MP3)";
      }
    }
  }

  const btnDownloadAudio = $("#btnDownloadAudio");
  if (btnDownloadAudio) btnDownloadAudio.addEventListener("click", exportTestAudio);

  /* [VIDEO-EXPORT] original MP4 download handler
  $("#btnDownloadVideo").addEventListener("click", async () => {
    // canvas composition + FFmpeg mux produced state.renderedVideoBlob here
    downloadBlob(state.renderedVideoBlob, exportBaseName() + ".mp4");
  });
  */

  /* ---------------- Generate voice over ---------------- */
  async function generateVoiceOver() {
    const btn = $("#btnGenerate");
    const box = $("#burmeseText");
    let text = box ? String(box.value || "").trim() : "";
    // Clean JSON only when it still looks like a payload — never wipe already-clean Burmese.
    if (text && looksLikeJsonPayload(text) && !/[\u1000-\u109F]/.test(text)) {
      try { autoCleanBurmeseInput({ notify: false }); } catch (_) {}
      text = box ? String(box.value || "").trim() : text;
    }
    if (!text) {
      generating = false;
      toast("မြန်မာဘာသာပြန် စာမူ ဗလာ ဖြစ်နေပါသည် — Step 3 တွင် မြန်မာစာသား Paste လုပ်ပါ။", "info");
      return;
    }
    if (!state.voice) selectVoice(VOICES[0].code);
    const lines = text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    state.scriptLines = lines.map((line) => ({ text: line, voice: "", pitch: "" }));
    state.voicePlan = state.scriptLines.map((ln, i) => ({
      n: i + 1,
      text: ln.text,
      voice: state.voice,
      pitch: state.pitch,
    }));
    const prevLabel = btn ? btn.innerHTML : "";
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> အသံ ဖန်တီးနေပါသည်...';
    }
    try {
      state.voiceGenerated = true;
      state.transcriptReady = true;
      hideDanger();
      useQuota();
      renderResult();
      // Bypass step-gate so the result page always opens from this button.
      state.step = 4;
      state.maxStep = Math.max(state.maxStep, 4);
      $$(".step-panel").forEach((p) => p.classList.toggle("active", p.id === "stepPanel4"));
      updateStepsUI();
      window.scrollTo({ top: 0, behavior: "smooth" });
      /* [VIDEO-EXPORT] full render: HTML5 canvas composition + FFmpeg video layer
      await runRenderProgress("ဗီဒီယို ဖန်တီးနေပါသည်...");
      toast("အသံနှင့် ဗီဒီယို ဖန်တီးပြီးပါပြီ ✓", "ok");
      */
      // TEST MODE: audio only — nothing is drawn to a canvas and no video is muxed.
      await runRenderProgress("အသံဖိုင် ဖန်တီးနေပါသည်... (Audio Only Test)");
      toast("အသံဖိုင် ဖန်တီးပြီးပါပြီ ✓ — 🎵 Test Audio MP3 ဖြင့် ဒေါင်းလုဒ်ဆွဲပါ။", "ok");
    } catch (err) {
      toast("Generate မအောင်မြင်ပါ — ပြန်ကြိုးစားပါ။", "err");
    } finally {
      generating = false;
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = prevLabel || "🔊 အသံဖန်တီးပေးမည် (Generate Voice Over)";
      }
    }
  }

  document.addEventListener("click", (e) => {
    const hit = e.target && e.target.closest && e.target.closest("#btnGenerate");
    if (!hit) return;
    e.preventDefault();
    generateVoiceOver();
  });

  /* ---------------- Step 4: Result ---------------- */
  function renderResult() {
    $("#resFileName").textContent = state.file ? state.file.name : "—";
    const vp = $("#step1Player");
    if (state.videoUrl && vp && !vp.src) vp.src = state.videoUrl;
    const v = VOICES.find((x) => x.code === state.voice);
    $("#resVoice").textContent = v ? v.code + " · " + v.name : "—";
    $("#resPitch").textContent = fmtPitch(state.pitch);
    const plan = state.voicePlan || [];
    if (plan.length) {
      const overrides = plan.filter((p) => p.voice !== state.voice || p.pitch !== state.pitch).length;
      $("#resLines").textContent = plan.length + " lines" + (overrides ? " · " + overrides + " per-line override" + (overrides > 1 ? "s" : "") : " · Global voice");
    } else {
      $("#resLines").textContent = "—";
    }
  }

  // fake video progress playback
  let vpTimer = null;
  $("#vpPlay").addEventListener("click", () => {
    const fill = $("#vpProgressFill");
    if (vpTimer) {
      clearInterval(vpTimer);
      vpTimer = null;
      return;
    }
    if (parseFloat(fill.style.width || "0") >= 100) fill.style.width = "0%";
    vpTimer = setInterval(() => {
      const w = Math.min(100, parseFloat(fill.style.width || "0") + 1.2);
      fill.style.width = w + "%";
      if (w >= 100) {
        clearInterval(vpTimer);
        vpTimer = null;
      }
    }, 120);
  });

  let amTimer = null;
  $("#amPlay").addEventListener("click", () => {
    const wave = $("#amWave");
    const btn = $("#amPlay");
    if (amTimer) {
      clearInterval(amTimer);
      amTimer = null;
      wave.classList.remove("playing");
      btn.classList.remove("playing");
      btn.textContent = "▶";
      return;
    }
    wave.classList.add("playing");
    btn.classList.add("playing");
    btn.textContent = "❚❚";
    amTimer = setTimeout(() => {
      wave.classList.remove("playing");
      btn.classList.remove("playing");
      btn.textContent = "▶";
      amTimer = null;
    }, 3000);
  });

  /* ---------------- Re-render ---------------- */
  $("#btnRerender").addEventListener("click", async () => {
    const btn = $("#btnRerender");
    const bar = $("#renderBar");
    const fill = $("#rbFill");
    const pct = $("#rbPct");
    const lab = $("#rbLabel");
    /* [VIDEO-EXPORT] original label
    if (lab) lab.textContent = "ဗီဒီယို ဖန်တီးနေပါသည်...";
    */
    // TEST MODE: the re-render only rebuilds the audio mix.
    if (lab) lab.textContent = "အသံဖိုင် ပြန်လည် ဖန်တီးနေပါသည်... (Audio Only Test)";
    btn.disabled = true;
    bar.hidden = false;
    fill.style.width = "0%";
    for (let p = 0; p <= 100; p += 10) {
      fill.style.width = p + "%";
      pct.textContent = p + "%";
      await wait(140);
    }
    bar.hidden = true;
    btn.disabled = false;
    renderResult();
    toast("အသံဖိုင် ပြန်လည် ဖန်တီးပြီးပါပြီ ✓ (Audio Only Test)", "ok");
  });

  /* ---------------- SRT download ---------------- */
  // Builds one 7s-timed cue per clean Burmese line actually present in Step 3
  // (no hardcoded dummy text). 00:01–00:07, 00:08–00:14, …
  function srtTimestamp(totalSeconds) {
    const p = (n) => String(n).padStart(2, "0");
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor(totalSeconds / 60) % 60;
    const s = totalSeconds % 60;
    return `${p(h)}:${p(m)}:${p(s)},000`;
  }

  $("#btnDownloadSrt").addEventListener("click", () => {
    const lines = $("#burmeseText").value.trim().split(/\n+/).map((s) => s.trim()).filter(Boolean);
    if (!lines.length) {
      toast("SRT ထုတ်ရန် Step 3 တွင် မြန်မာ စာသား အရင်ရှိရပါမည်။", "info");
      return;
    }
    const body = lines
      .map((text, i) => {
        const start = i * 7 + 1;
        const end = i * 7 + 7;
        return `${i + 1}\n${srtTimestamp(start)} --> ${srtTimestamp(end)}\n${text}\n`;
      })
      .join("\n");
    const blob = new Blob(["\uFEFF" + body], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    const base = state.file ? state.file.name.replace(/\.[^.]+$/, "") : "red-bear";
    a.href = URL.createObjectURL(blob);
    a.download = base + ".my.srt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast("စာတန်းထိုး (.srt) ဒေါင်းလုဒ်ဆွဲပြီးပါပြီ ✓", "ok");
  });

  /* ---------------- New job ---------------- */
  $("#btnNewJob").addEventListener("click", () => {
    clearStep1Media();
    state.transcriptReady = false;
    state.voice = null;
    state.voiceGenerated = false;
    state.pitch = 0;
    pitchSlider.value = 0;
    pitchValue.textContent = "0 Hz";
    sourceTextInput.value = "";
    $("#burmeseText").value = "";
    state.scriptLines = [];
    state.voicePlan = [];
    renderScriptPreview([]);
    $("#voiceChip").hidden = true;
    $$(".voice-card").forEach((c) => c.classList.remove("selected"));
    state.step = 1;
    state.maxStep = 1;
    $$(".step-panel").forEach((p, i) => p.classList.toggle("active", i === 0));
    updateStepsUI();
    toast("အလုပ်အသစ် စတင်ပါပြီ 🆕", "info");
  });

  function isProUser() {
    return !!(auth.user && auth.user.plan === "pro");
  }

  /* ---------------- Auto Recap page ---------------- */
  const recapDropzone = $("#recapDropzone");
  const recapFileInput = $("#recapFileInput");
  recapDropzone.addEventListener("click", () => recapFileInput.click());
  recapDropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); recapFileInput.click(); }
  });
  ["dragenter", "dragover"].forEach((ev) =>
    recapDropzone.addEventListener(ev, (e) => { e.preventDefault(); recapDropzone.classList.add("dragover"); })
  );
  ["dragleave", "drop"].forEach((ev) =>
    recapDropzone.addEventListener(ev, (e) => { e.preventDefault(); recapDropzone.classList.remove("dragover"); })
  );
  recapDropzone.addEventListener("drop", (e) => {
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) acceptRecapFile(f);
  });
  recapFileInput.addEventListener("change", () => {
    if (recapFileInput.files[0]) acceptRecapFile(recapFileInput.files[0]);
  });

  function showRecapWorkspace(on) {
    $("#recapUploadWrap").hidden = !!on;
    $("#recapWorkspace").hidden = !on;
  }

  function acceptRecapFile(f) {
    const ext = (f.name.split(".").pop() || "").toLowerCase();
    if (!VALID.includes(ext)) {
      toast("MP4, MOV, WEBM, MKV ဖိုင်များကိုသာ လက်ခံပါသည်။", "info");
      return;
    }
    state.file = f;
    $("#recapFileName").textContent = f.name;
    $("#recapFileMeta").textContent = `${ext.toUpperCase()} · ${fmtSize(f.size)} · အများဆုံး ၁၀ မိနစ်`;
    showRecapWorkspace(true);
    toast("ဗီဒီယိုဖိုင် တင်ပြီးပါပြီ ✓", "ok");
  }

  $("#recapFileRemove").addEventListener("click", () => {
    recapFileInput.value = "";
    showRecapWorkspace(false);
  });

  buildVoiceSections($("#recapVoiceGrid"), {
    previewClass: "recap-vc-preview",
    onSelect: (code) => selectRecapVoice(code),
  });

  function selectRecapVoice(code) {
    state.voice = code;
    $$("#recapVoiceGrid .voice-card").forEach((c) => c.classList.toggle("selected", c.dataset.code === code));
    $("#recapVoiceChip").hidden = false;
    $("#recapVoiceChip").textContent = (voiceName(code) || code) + " ရွေးပြီး";
  }

  $("#recapPitchSlider").addEventListener("input", () => {
    state.pitch = Number($("#recapPitchSlider").value);
    $("#recapPitchValue").textContent = fmtPitch(state.pitch);
  });

  $("#btnStartAutoTranslate").addEventListener("click", async () => {
    if (!$("#recapFileName").textContent || $("#recapFileName").textContent === "—") {
      toast("အရင် ဗီဒီယိုဖိုင် တင်ပါ။", "info");
      return;
    }
    if (!isProUser()) {
      openPlanModal();
      toast("Auto Recap သည် Pro Feature ဖြစ်ပါသည် — Upgrade to Pro ပြုလုပ်ပါ။", "info");
      return;
    }
    if (!state.voice) selectRecapVoice(VOICES[0].code);
    const btn = $("#btnStartAutoTranslate");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> 1-Click Pipeline လုပ်ဆောင်နေပါသည်...';
    /* [VIDEO-EXPORT] toast("Transcript → Gemini ဘာသာပြန် → TTS → Video Muxing…", "ok"); */
    toast("Transcript → Gemini ဘာသာပြန် → TTS → Audio Mixdown… (Audio Only Test)", "ok");
    await wait(900);
    toast("မြန်မာဘာသာပြန် ပြီးပါပြီ — အသံ ဖန်တီးနေပါသည်…", "ok");
    await wait(900);
    /* [VIDEO-EXPORT] toast("ဗီဒီယို Muxing လုပ်နေပါသည်…", "ok"); */
    toast("အသံဖိုင် ပေါင်းစပ်နေပါသည်…", "ok");
    await wait(900);
    state.transcriptReady = true;
    state.voiceGenerated = true;
    const sample = "ဤသည်မှာ Auto Recap မှ အလိုအလျောက် ဖန်တီးထားသော မြန်မာ ဇာတ်ကြောင်း ဖြစ်ပါသည်။";
    $("#burmeseText").value = sample;
    state.scriptLines = [{ text: sample, voice: "", pitch: "" }];
    state.voicePlan = [{ n: 1, text: sample, voice: state.voice, pitch: state.pitch }];
    renderResult();
    setPage("manual");
    state.step = 4;
    state.maxStep = 4;
    $$(".step-panel").forEach((p) => p.classList.toggle("active", p.id === "stepPanel4"));
    updateStepsUI();
    /* [VIDEO-EXPORT] await runRenderProgress("ဗီဒီယို ဖန်တီးနေပါသည်..."); */
    await runRenderProgress("အသံဖိုင် ဖန်တီးနေပါသည်... (Audio Only Test)");
    btn.disabled = false;
    btn.innerHTML = "⚡ Start Auto Translate";
    toast("Auto Recap ပြီးစီးပါပြီ ✓", "ok");
  });

  /* ---------------- Job history ---------------- */
  function renderHistory() {
    const pro = isProUser();
    $("#historyLocked").hidden = pro;
    $("#historyPro").hidden = !pro;
  }

  $("#btnHistoryRefresh").addEventListener("click", () => {
    renderHistory();
    toast(isProUser() ? "Job History ကို ပြန်လည် ရယူပြီးပါပြီ ✓" : "Pro Feature — Upgrade လုပ်မှ Cloud History ကြည့်နိုင်ပါသည်။", isProUser() ? "ok" : "info");
  });
  $("#btnHistoryNewVideo").addEventListener("click", () => setPage("recap"));
  $("#btnHistoryUpgrade").addEventListener("click", () => openPlanModal());
  $("#btnHistoryToManual").addEventListener("click", () => setPage("manual"));

  $$("#jobsBody .mini-btn").forEach((b) =>
    b.addEventListener("click", () => toast("ဖိုင် ဒေါင်းလုဒ် ဆွဲနေပါပြီ 📥", "ok"))
  );

  /* ---------------- API keys ---------------- */
  $$("[data-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const inp = $("#" + btn.dataset.toggle);
      const show = inp.type === "password";
      inp.type = show ? "text" : "password";
      btn.textContent = show ? "ဝှက်ရန်" : "ပြရန်";
    });
  });

  function isPlaceholderKey(v) {
    const s = String(v || "").trim();
    if (!s) return true;
    if (/^x{6,}$/i.test(s)) return true;
    if (/^•+$/.test(s) || /^•+$/.test(s)) return true;
    if (/^(your[-_ ]?key|placeholder|xxxxxxxxxxxxxxxx)$/i.test(s)) return true;
    return false;
  }

  function sanitizeApiKey(v) {
    const s = String(v || "").trim();
    return isPlaceholderKey(s) ? "" : s;
  }

  function readStoredGemini() {
    return sanitizeApiKey(
      localStorage.getItem("rb_gemini") || localStorage.getItem("gemini_api_key") || ""
    );
  }
  function readStoredAssembly() {
    return sanitizeApiKey(
      localStorage.getItem("rb_assembly") || localStorage.getItem("assembly_api_key") || ""
    );
  }

  function refreshKeyStatus() {
    const g = readStoredGemini();
    const a = readStoredAssembly();
    const gs = $("#geminiStatus");
    const as = $("#assemblyStatus");
    if (gs) {
      gs.textContent = g ? "Active" : "Not set";
      gs.classList.toggle("on", !!g);
    }
    if (as) {
      as.textContent = a ? "Active" : "Not set";
      as.classList.toggle("on", !!a);
    }
  }

  function loadKeys() {
    try {
      const g = readStoredGemini();
      const a = readStoredAssembly();
      $("#geminiKey").value = g;
      $("#assemblyKey").value = a;
      refreshKeyStatus();
      /* Badge 2 ("Active") is a static green chip per spec; engine badge stays dynamic. */
      const q = localStorage.getItem("rb_quota");
      const day = localStorage.getItem("rb_quota_day");
      const today = new Date().toISOString().slice(0, 10);
      if (day !== today) {
        /* new day → free quota resets to 1 */
        state.quotaLeft = FREE_LIMIT;
        try { localStorage.setItem("rb_quota_day", today); } catch (_) {}
      } else if (q !== null) {
        state.quotaLeft = Math.max(0, Math.min(FREE_LIMIT, Number(q)));
      }
    } catch (_) {}
  }

  /* ---- save with validation ---- */
  function showKeyMsg(type, msg) {
    const el = $("#keyMsg");
    el.className = "key-msg " + type;
    el.textContent = msg;
    el.hidden = false;
  }

  ["geminiKey", "assemblyKey"].forEach((id) =>
    $("#" + id).addEventListener("input", () => { $("#keyMsg").hidden = true; })
  );

  function updateApiKeyStatusUI() {
    refreshKeyStatus();
  }

  function saveKeys() {
    const geminiEl = document.getElementById("geminiKey");
    const assemblyEl = document.getElementById("assemblyKey");
    const geminiKey = sanitizeApiKey(geminiEl ? geminiEl.value : "");
    const assemblyKey = sanitizeApiKey(assemblyEl ? assemblyEl.value : "");
    if (geminiEl) geminiEl.value = geminiKey;
    if (assemblyEl) assemblyEl.value = assemblyKey;

    if (!geminiKey && !assemblyKey) {
      showKeyMsg("error", "⚠️ API Key များ မသိမ်းဆည်းရသေးပါ");
      toast("ကျေးဇူးပြု၍ API Key အနည်းဆုံး တစ်ခု ရိုက်ထည့်ပါ (Please enter at least one API key)", "info");
      return;
    }

    try {
      if (geminiKey) {
        localStorage.setItem("rb_gemini", geminiKey);
        localStorage.setItem("gemini_api_key", geminiKey);
      } else {
        localStorage.removeItem("rb_gemini");
        localStorage.removeItem("gemini_api_key");
      }
      if (assemblyKey) {
        localStorage.setItem("rb_assembly", assemblyKey);
        localStorage.setItem("assembly_api_key", assemblyKey);
      } else {
        localStorage.removeItem("rb_assembly");
        localStorage.removeItem("assembly_api_key");
      }
    } catch (_) {}

    updateApiKeyStatusUI();
    const ok = geminiKey && !assemblyKey
      ? "✅ Gemini Key Active!"
      : !geminiKey && assemblyKey
        ? "✅ AssemblyAI Key Active!"
        : "✅ API Keys Saved Successfully!";
    showKeyMsg("ok", ok);
    toast(ok, "ok");
  }

  $("#btnSaveKeys").addEventListener("click", saveKeys);
  $("#btnSaveTop").addEventListener("click", saveKeys);

  /* ---- Device Video Engine (FFmpeg WASM) ---- */
  function loadEngine() {
    let cached = false;
    try { cached = localStorage.getItem("rb_engine_cached") === "1"; } catch (_) {}
    const el = $("#engineBadge");
    el.textContent = cached ? "Cached" : "Not Cached";
    el.classList.toggle("on", cached);
  }

  $("#btnDownloadEngine").addEventListener("click", () => {
    try { localStorage.setItem("rb_engine_cached", "1"); } catch (_) {}
    loadEngine();
    toast("✓ Video Engine ဒေါင်းလုဒ် ပြီးစီးပါသည်!", "ok");
  });

  /* ---------------- Upgrade → Subscription Plan ---------------- */
  $("#btnUpgrade").addEventListener("click", () => {
    openPlanModal();
  });

  /* ---------------- Util ---------------- */
  function wait(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /* ================================================================
     AUTH · PROFILE · SETTINGS
     ================================================================ */
  const auth = { user: null };

  function loadAccounts() {
    try { return JSON.parse(localStorage.getItem("rb_accounts") || "{}"); } catch (_) { return {}; }
  }
  function saveAccounts(map) {
    try { localStorage.setItem("rb_accounts", JSON.stringify(map)); } catch (_) {}
  }
  function loadUser() {
    try { auth.user = JSON.parse(localStorage.getItem("rb_user") || "null"); } catch (_) { auth.user = null; }
  }
  function saveUser() {
    try {
      if (auth.user) localStorage.setItem("rb_user", JSON.stringify(auth.user));
      else localStorage.removeItem("rb_user");
    } catch (_) {}
  }

  function initials(name) {
    const parts = String(name || "?").trim().split(/\s+/);
    return ((parts[0] || "?")[0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
  }

  function nameFromEmail(email) {
    const local = (email.split("@")[0] || "user").replace(/[._-]+/g, " ").trim();
    return local.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") || "User";
  }

  function renderAuth() {
    const signedIn = !!auth.user;
    $("#signinCard").hidden = signedIn;
    $("#profileCard").hidden = !signedIn;
    closeSettingsMenu();
    if (signedIn) {
      $("#userAvatar").textContent = initials(auth.user.name);
      $("#profileName").textContent = auth.user.name;
      $("#profileEmail").textContent = auth.user.email;
    }
    renderPlan();
    renderHistory();
  }

  /* ---- generic modal helpers ---- */
  function openOverlay(el) { el.hidden = false; document.body.style.overflow = "hidden"; }
  function closeOverlay(el) { el.hidden = true; document.body.style.overflow = ""; }

  const authModal = $("#authModal");
  const accountModal = $("#accountModal");
  const planModal = $("#planModal");
  const payModal = $("#payModal");
  const settingsMenu = $("#settingsMenu");

  function openAuthModal(tab) {
    switchAuthTab(tab || "signin");
    openOverlay(authModal);
    $("#authClose").focus();
  }

  function switchAuthTab(tab) {
    $$(".auth-tab").forEach((t) => t.classList.toggle("active", t.dataset.atab === tab));
    $("#pane-signin").hidden = tab !== "signin";
    $("#pane-signup").hidden = tab !== "signup";
  }

  $$(".auth-tab").forEach((t) => t.addEventListener("click", () => switchAuthTab(t.dataset.atab)));
  $("#btnSignIn").addEventListener("click", () => openAuthModal("signin"));
  $("#authClose").addEventListener("click", () => closeOverlay(authModal));
  $("#accountClose").addEventListener("click", () => closeOverlay(accountModal));
  $("#accountCancel").addEventListener("click", () => closeOverlay(accountModal));
  $("#planClose").addEventListener("click", () => closeOverlay(planModal));

  [authModal, accountModal, planModal, payModal].forEach((m) => {
    m.addEventListener("click", (e) => { if (e.target === m) closeOverlay(m); });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    [authModal, accountModal, planModal, payModal].forEach((m) => { if (!m.hidden) closeOverlay(m); });
    closeSettingsMenu();
    closeDrawer();
  });

  function doSignIn(name, email) {
    const accounts = loadAccounts();
    accounts[email.toLowerCase()] = { name };
    saveAccounts(accounts);
    auth.user = { name, email, plan: auth.user && auth.user.email === email ? auth.user.plan : "free" };
    saveUser();
    renderAuth();
    closeOverlay(authModal);
    toast("✓ အကောင့်ဝင်ရောက်ခြင်း အောင်မြင်ပါသည်!", "ok");
  }

  $("#pane-signin").addEventListener("submit", (e) => {
    e.preventDefault();
    const email = $("#siEmail").value.trim();
    const pw = $("#siPassword").value;
    if (!email || !pw) { toast("Email နှင့် စကားဝှက် ထည့်ပါ။", "info"); return; }
    const rec = loadAccounts()[email.toLowerCase()];
    doSignIn(rec ? rec.name : nameFromEmail(email), email);
  });

  $("#pane-signup").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("#suName").value.trim();
    const email = $("#suEmail").value.trim();
    const pw = $("#suPassword").value;
    if (!name) { toast("အမည် ထည့်ပါ။", "info"); return; }
    if (!email || !pw) { toast("Email နှင့် စကားဝှက် ထည့်ပါ။", "info"); return; }
    doSignIn(name, email);
  });

  $("#btnGoogle").addEventListener("click", () => {
    doSignIn("Legal Pu", "legalpu@gmail.com");
  });

  $("#btnForgot").addEventListener("click", () => {
    toast("စကားဝှက် ပြန်လည် သတ်မှတ်ရန် Admin ကို ဆက်သွယ်ပါ။", "info");
  });

  /* ---- help-modal link cards: click listeners on the container boxes ---- */
  $$(".link-card").forEach((card) => {
    const url = card.dataset.url; /* https://aistudio.google.com/app/apikey | https://www.assemblyai.com/dashboard */
    card.addEventListener("click", (e) => {
      /* Anchor clicks use normal link behavior — we never preventDefault/stopPropagation */
      if (e.target.closest("a")) return;
      window.open(url, "_blank");
    });
  });

  /* ---- settings dropdown ---- */
  function openSettingsMenu() {
    settingsMenu.hidden = false;
    $("#btnSettings").classList.add("open");
  }
  function closeSettingsMenu() {
    settingsMenu.hidden = true;
    const g = $("#btnSettings");
    if (g) g.classList.remove("open");
  }

  $("#btnSettings").addEventListener("click", (e) => {
    e.stopPropagation();
    settingsMenu.hidden ? openSettingsMenu() : closeSettingsMenu();
  });

  document.addEventListener("click", (e) => {
    if (!settingsMenu.hidden && !$("#authArea").contains(e.target)) closeSettingsMenu();
  });

  $("#smAccount").addEventListener("click", () => {
    closeSettingsMenu();
    if (!auth.user) return;
    $("#acName").value = auth.user.name;
    $("#acEmail").value = auth.user.email;
    $("#acPassword").value = "";
    openOverlay(accountModal);
    $("#acName").focus();
  });

  $("#accountForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("#acName").value.trim();
    const email = $("#acEmail").value.trim();
    const pw = $("#acPassword").value;
    if (!name || !email) { toast("အမည် နှင့် Email ထည့်ပါ။", "info"); return; }
    const accounts = loadAccounts();
    delete accounts[auth.user.email.toLowerCase()];
    accounts[email.toLowerCase()] = { name };
    saveAccounts(accounts);
    auth.user.name = name;
    auth.user.email = email;
    saveUser();
    renderAuth();
    closeOverlay(accountModal);
    if (pw) toast("စကားဝှက် ပြောင်းပြီးပါပြီ ✓", "ok");
    else toast("ပရိုဖိုင် ပြင်ဆင်ပြီးပါပြီ ✓", "ok");
  });

  $("#smApi").addEventListener("click", () => {
    closeSettingsMenu();
    setPage("keys");
    toast("API Keys စာမျက်နှာသို့ သွားပါပြီ", "info");
  });

  /* ================================================================
     PRICING · CURRENCY · PAYMENT (spec 2026-09)
     ================================================================ */
  const PRICING = {
    p1: { title: "Package 1", videos: "10 Videos", mmk: "7,000 MMK", thb: "100 THB" },
    p2: { title: "Package 2", videos: "30 Videos", mmk: "15,000 MMK", thb: "220 THB" },
    p3: { title: "Package 3", videos: "50 Videos", mmk: "25,000 MMK", thb: "360 THB" },
  };

  const PAY_METHODS = {
    kbz:    { label: "KBZPay",    phone: "09xxxxxxxx",   instr: "KBZPay Application ဖြင့် အထက်ပါ QR code သို့မဟုတ် ဖုန်းနံပါတ်သို့ ငွေလွှဲပေးပါ။" },
    wave:   { label: "WavePay",   phone: "09xxxxxxxx",   instr: "WavePay Application ဖြင့် အထက်ပါ QR code သို့မဟုတ် ဖုန်းနံပါတ်သို့ ငွေလွှဲပေးပါ။" },
    prompt: { label: "PromptPay", phone: "0xx-xxx-xxxx", instr: "PromptPay Application ဖြင့် အထက်ပါ QR code သို့မဟုတ် ဖုန်းနံပါတ်သို့ ငွေလွှဲပေးပါ။" },
  };

  let curCurrency = "mmk";
  let curPkg = null;
  let curMethod = "kbz";
  let slipFile = null;

  /* ---- mobile drawer (sidebar < 1024px) ---- */
  const sidebarEl = $("#sidebar");
  const navBackdrop = $("#navBackdrop");
  function openDrawer() {
    sidebarEl.classList.add("open");
    navBackdrop.hidden = false;
  }
  function closeDrawer() {
    sidebarEl.classList.remove("open");
    navBackdrop.hidden = true;
  }
  $("#btnHamburger").addEventListener("click", openDrawer);
  navBackdrop.addEventListener("click", closeDrawer);
  $$("[data-page]").forEach((b) => b.addEventListener("click", closeDrawer));
  $$("[data-step]").forEach((b) => b.addEventListener("click", closeDrawer));

  /* ---- pricing grid ---- */
  function renderPricing() {
    $$("#planModal .price, #planModal .price-per").forEach((el) => {
      el.textContent = el.dataset[curCurrency];
    });
  }

  function renderUserBadges() {
    const quotaTxt = "ကျန် " + state.quotaLeft + " ခု";
    $("#priceUserBadge").textContent = auth.user
      ? "(" + auth.user.email + " - " + quotaTxt + ")"
      : "အကောင့် မဝင်ရသေးပါ";
    $("#payMetaEmail").textContent = auth.user ? auth.user.email : "—";
    $("#payMetaQuota").textContent = quotaTxt;
    $("#payAcName").textContent = auth.user ? auth.user.name : "—";
    $("#payAcEmail").textContent = auth.user ? auth.user.email : "—";
  }

  function renderPlan() {
    renderUserBadges();
    renderPricing();
    renderQuota(); /* plan badge · quota text · upgrade button visibility */
  }

  function openPlanModal() {
    closeSettingsMenu();
    renderPlan();
    openOverlay(planModal);
    $("#planClose").focus();
  }

  /* ---- payment ---- */
  function makeQrSvg(seedText) {
    /* Deterministic demo QR-style SVG (placeholder for a real payment QR). */
    let h = 2166136261;
    for (const ch of seedText) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return (h >>> 0) / 4294967296; };
    const N = 21, cell = 8, pad = 2, sz = (N + pad * 2) * cell;
    let rects = "";
    const finder = (x, y) => {
      rects += `<rect x="${(x + pad) * cell}" y="${(y + pad) * cell}" width="${7 * cell}" height="${7 * cell}" fill="#111"/>`;
      rects += `<rect x="${(x + 1 + pad) * cell}" y="${(y + 1 + pad) * cell}" width="${5 * cell}" height="${5 * cell}" fill="#fff"/>`;
      rects += `<rect x="${(x + 2 + pad) * cell}" y="${(y + 2 + pad) * cell}" width="${3 * cell}" height="${3 * cell}" fill="#111"/>`;
    };
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const inFinder = (x < 8 && y < 8) || (x > N - 9 && y < 8) || (x < 8 && y > N - 9);
        if (inFinder) continue;
        if (rnd() > 0.52) rects += `<rect x="${(x + pad) * cell}" y="${(y + pad) * cell}" width="${cell}" height="${cell}" fill="#111"/>`;
      }
    }
    finder(0, 0); finder(N - 7, 0); finder(0, N - 7);
    return `<svg viewBox="0 0 ${sz} ${sz}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Payment QR"><rect width="${sz}" height="${sz}" fill="#fff"/>${rects}</svg>`;
  }

  function renderMethod() {
    const m = PAY_METHODS[curMethod];
    $$(".method-card").forEach((c) => c.classList.toggle("active", c.dataset.method === curMethod));
    $("#payQrPhone").textContent = m.phone;
    $("#payQrInstr").textContent = m.instr;
    $("#payQr").innerHTML = makeQrSvg(curMethod + "-redbear-demo");
  }

  function resetSlip() {
    slipFile = null;
    $("#paySlipInput").value = "";
    $("#paySlipPreview").hidden = true;
    $("#paySlipZone").hidden = false;
    $("#paySubmit").classList.add("is-disabled");
  }

  function setSlip(file) {
    const okTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!file || !okTypes.includes(file.type)) {
      toast("⚠️ JPG, PNG, WEBP ဖိုင်များသာ တင်နိုင်ပါသည်။", "err");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast("⚠️ ဖိုင်အရွယ်အစား 10MB ထက် မကျော်ရပါ။", "err");
      return;
    }
    slipFile = file;
    $("#paySlipThumb").src = URL.createObjectURL(file);
    $("#paySlipName").textContent = file.name;
    $("#paySlipPreview").hidden = false;
    $("#paySlipZone").hidden = true;
    $("#paySubmit").classList.remove("is-disabled");
  }

  function openPayment(pkgId) {
    if (!auth.user) {
      closeOverlay(planModal);
      openAuthModal("signin");
      toast("ငွေပေးချေမှု အတွက် အကောင့် အရင် ဝင်ပါ။", "info");
      return;
    }
    curPkg = PRICING[pkgId];
    curMethod = "kbz";
    resetSlip();
    closeOverlay(planModal);
    $("#payTitle").textContent = "Confirm & Pay - " + curPkg.title;
    $("#paySumBadge").textContent = curPkg.videos;
    $("#paySumTitle").textContent = curPkg.title;
    const alt = curCurrency === "mmk" ? "thb" : "mmk";
    $("#payTotal").textContent = curPkg[curCurrency];
    $("#payTotalAlt").textContent = "(" + curPkg[alt] + ")";
    renderUserBadges();
    renderMethod();
    openOverlay(payModal);
  }

  /* ---- wiring: pricing modal ---- */
  $("#planClose").addEventListener("click", () => closeOverlay(planModal));
  $$(".ct-btn").forEach((b) =>
    b.addEventListener("click", () => {
      curCurrency = b.dataset.cur;
      $$(".ct-btn").forEach((x) => x.classList.toggle("active", x === b));
      renderPricing();
    })
  );
  $$("[data-choose]").forEach((b) =>
    b.addEventListener("click", () => openPayment(b.dataset.choose))
  );

  /* ---- wiring: payment modal ---- */
  $("#payBack").addEventListener("click", () => {
    closeOverlay(payModal);
    openPlanModal();
  });
  $("#payClose").addEventListener("click", () => closeOverlay(payModal));
  $$(".method-card").forEach((c) =>
    c.addEventListener("click", () => {
      curMethod = c.dataset.method;
      renderMethod();
    })
  );

  const paySlipZone = $("#paySlipZone");
  const paySlipInput = $("#paySlipInput");
  paySlipZone.addEventListener("click", () => paySlipInput.click());
  paySlipZone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); paySlipInput.click(); }
  });
  paySlipZone.addEventListener("dragover", (e) => { e.preventDefault(); paySlipZone.classList.add("dragover"); });
  paySlipZone.addEventListener("dragleave", () => paySlipZone.classList.remove("dragover"));
  paySlipZone.addEventListener("drop", (e) => {
    e.preventDefault();
    paySlipZone.classList.remove("dragover");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) setSlip(e.dataTransfer.files[0]);
  });
  paySlipInput.addEventListener("change", () => {
    if (paySlipInput.files[0]) setSlip(paySlipInput.files[0]);
  });
  $("#paySlipRemove").addEventListener("click", resetSlip);

  $("#paySubmit").addEventListener("click", () => {
    if (!slipFile) {
      toast("⚠️ ငွေလွှဲပြေစာ (Payment Slip) ကို အရင် တင်ပါ။", "err");
      return;
    }
    if (auth.user) {
      auth.user.plan = "pro";
      saveUser();
      renderAuth();
    }
    toast("✓ ငွေလွှဲပြေစာ အောင်မြင်စွာ ပေးပို့ပြီးပါပြီ။ Admin မကြာမီ စစ်ဆေးအတည်ပြုပေးပါမည်။", "ok");
    resetSlip();
    closeOverlay(payModal);
  });

  $("#smPlan").addEventListener("click", () => {
    closeSettingsMenu();
    openPlanModal();
  });

  /* ---- log out ---- */
  $("#smLogout").addEventListener("click", () => {
    closeSettingsMenu();
    auth.user = null;
    saveUser();
    renderAuth();
    toast("အကောင့် ထွက်ပြီးပါပြီ", "info");
  });

  /* ---------------- Init ---------------- */
  loadUser();
  renderAuth();
  loadKeys();
  loadEngine();
  renderQuota();
  updateStepsUI();
  renderHistory();
})();
