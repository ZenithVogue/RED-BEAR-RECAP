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

  const VOICES = [
    { code: "BB", label: "BB (အမျိုးသား - သဘာဝကျသော အသံ)", rate: 0.95, pitch: 1.0 },
    { code: "NL", label: "NL (အမျိုးသမီး - ရှင်းလင်းသော အသံ)", rate: 1.0, pitch: 1.25 },
    { code: "PW", label: "PW (အမျိုးသား - စိတ်လှုပ်ရှားဖွယ် အသံ)", rate: 1.15, pitch: 1.1 },
    { code: "KM", label: "KM (အမျိုးသား - လေးနက်သော အသံ)", rate: 0.85, pitch: 0.75 },
    { code: "ZK", label: "ZK (အမျိုးသား - ဇာတ်ကြောင်းပြော အသံ)", rate: 0.9, pitch: 0.9 },
    { code: "HS", label: "HS (အမျိုးသမီး - နူးညံ့သော အသံ)", rate: 0.95, pitch: 1.35 },
    { code: "SL", label: "SL (အမျိုးသား - မြန်ဆန်သော အသံ)", rate: 1.3, pitch: 1.0 },
    { code: "YS", label: "YS (အမျိုးသမီး - သဘာဝကျသော အသံ)", rate: 1.0, pitch: 1.2 },
    { code: "EC", label: "EC (အမျိုးသား - သတင်းကြေညာ အသံ)", rate: 1.05, pitch: 0.95 },
    { code: "TS", label: "TS (အမျိုးသမီး - တက်ကြွသော အသံ)", rate: 1.2, pitch: 1.3 },
  ];

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
  const VALID = ["mp4", "mov", "webm", "mkv"];

  // The preview lives inside the upload box, so interacting with its controls
  // must not reopen the file picker.
  $("#videoMetaCard").addEventListener("click", (e) => e.stopPropagation());

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

  function fmtTime(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    const minutes = Math.floor(total / 60);
    const secs = String(total % 60).padStart(2, "0");
    return `${minutes}:${secs}`;
  }

  function acceptFile(f) {
    const ext = (f.name.split(".").pop() || "").toLowerCase();
    if (!VALID.includes(ext)) {
      toast("MP4, MOV, WEBM, MKV ဖိုင်များကိုသာ လက်ခံပါသည်။", "info");
      return;
    }
    state.file = f;
    state.transcriptReady = false;
    state.voiceGenerated = false;
    state.maxStep = 1;
    if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
    state.videoUrl = URL.createObjectURL(f);
    $("#fileName").textContent = f.name;
    $("#fileMeta").textContent = `${ext.toUpperCase()} · ${fmtSize(f.size)}`;
    $("#fileChip").hidden = false;
    dropzone.classList.add("has-video");
    $("#videoMetaCard").hidden = false;
    $("#step1Player").src = state.videoUrl;
    $("#vidName").textContent = f.name;
    $("#vidSize").textContent = fmtSize(f.size);
    $("#vidDuration").textContent = "—";
    $("#step1Player").onloadedmetadata = () => {
      state.durationSec = Number.isFinite($("#step1Player").duration) ? $("#step1Player").duration : 0;
      $("#vidDuration").textContent = state.durationSec ? fmtTime(state.durationSec) : "—";
    };
    if ($("#step1Actions")) $("#step1Actions").hidden = false;
    if ($("#btnExtractScript")) $("#btnExtractScript").disabled = false;
    $("#step1Hint").textContent = "ဖိုင် အသင့်ဖြစ်ပါပြီ — Extract Raw Script ကို နှိပ်ပါ";
    hideDanger();
    toast("ဗီဒီယိုဖိုင် တင်ပြီးပါပြီ ✓", "ok");
  }

  function clearStep1Media() {
    if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
    state.videoUrl = null;
    state.file = null;
    state.durationSec = 0;
    state.transcriptReady = false;
    fileInput.value = "";
    dropzone.classList.remove("has-video");
    $("#fileChip").hidden = true;
    $("#videoMetaCard").hidden = true;
    $("#step1Player").removeAttribute("src");
    $("#step1Player").load();
    $("#step1Actions").hidden = true;
    $("#btnExtractScript").disabled = true;
    $("#extractBar").hidden = true;
    $("#step1Hint").textContent = "ဗီဒီယိုဖိုင် ရွေးချယ်ပြီးမှ Extract Raw Script ကို နှိပ်နိုင်ပါမည်";
  }

  $("#fileRemove").addEventListener("click", () => {
    clearStep1Media();
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
        resolve(s.slice(s.indexOf(",") + 1));
      };
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  async function transcribeWithGemini(blob, apiKey) {
    const mime = blob.type || "audio/wav";
    const b64 = await blobToBase64(blob);
    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + encodeURIComponent(apiKey);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mime, data: b64 } },
            { text: "Transcribe this video/audio into the original spoken language (Chinese or English). Output ONLY the raw transcript as plain text. No timestamps, no commentary." }
          ]
        }]
      }),
    });
    if (!res.ok) {
      const err = new Error("Gemini " + res.status);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    const text = ((((data.candidates || [])[0] || {}).content || {}).parts || []).map((p) => p.text || "").join("\n");
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
    if (!keys.gemini && !keys.assembly) {
      toast("API Key မရှိပါ — Gemini သို့မဟုတ် AssemblyAI Key တစ်ခု ထည့်ပါ။", "info");
      setPage("keys");
      return;
    }
    const btn = $("#btnExtractScript");
    const bar = $("#extractBar");
    if (btn) {
      btn.disabled = true;
      btn.setAttribute("aria-busy", "true");
      btn.innerHTML = '<span class="spinner"></span> Extracting Script...';
    }
    if (bar) {
      bar.hidden = false;
      $("#extractLabel").textContent = "Extracting audio & transcribing...";
      $("#extractPct").textContent = "10%";
      $("#extractFill").style.width = "10%";
    }
    try {
      const media = state.file;
      let text = "";
      const useGemini = !!keys.gemini;
      const useAssembly = !!keys.assembly;
      async function runGemini() {
        if (bar) { $("#extractLabel").textContent = "Gemini transcribing..."; $("#extractFill").style.width = "40%"; }
        return transcribeWithGemini(media, keys.gemini);
      }
      async function runAssembly() {
        if (bar) { $("#extractLabel").textContent = "AssemblyAI transcribing..."; $("#extractFill").style.width = "55%"; }
        return transcribeWithAssemblyAI(media, keys.assembly);
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
      if (bar) { $("#extractFill").style.width = "100%"; $("#extractPct").textContent = "100%"; }
      $("#step2RawText").value = text;
      state.transcriptReady = true;
      toast("✓ Raw script ထုတ်ယူပြီးပါပြီ", "ok");
      goToStep(2);
    } catch (e) {
      toast("စာသား ထုတ်ယူမရပါ — " + (e.message || "error"), "err");
      state.transcriptReady = false;
      if (bar) bar.hidden = true;
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.removeAttribute("aria-busy");
        btn.innerHTML = "🎙 Extract Raw Script";
      }
    }
  }

  const extractBtn = $("#btnExtractScript");
  if (extractBtn) extractBtn.addEventListener("click", (e) => { e.preventDefault(); runExtractScript(); });

  /* ---------------- Step 2 actions ---------------- */

  /* STEP 2 · "Copy Full Prompt" — copies ONLY the clean raw text currently inside
     Step 2's single text box, wrapped verbatim into the dubbing system prompt:

     You are a professional video dubbing translator. Translate the following subtitles into natural spoken Burmese for a movie recap narration. 

     STRICT RULES:

     - Output ONLY valid JSON with a single key "translations" containing an array of translated Burmese string lines.

     - Do not include markdown code block syntax (like ```json), commentary, or extra text.

     Input Text:

     [CURRENT_RAW_TEXT_FROM_STEP_2_BOX]   ← live contents of the Step 2 box, nothing prepended/appended

     No previous Burmese translations, no hardcoded dummy lines — the raw box content is the only payload.
  */
  function buildFullPrompt(rawText) {
    return [
      "You are a professional video dubbing translator. Translate the following subtitles into natural spoken Burmese for a movie recap narration.",
      "",
      "STRICT RULES:",
      "",
      '- Output ONLY valid JSON with a single key "translations" containing an array of translated Burmese string lines.',
      "",
      "- Do not include markdown code block syntax (like ```json), commentary, or extra text.",
      "",
      "Input Text:",
      "",
      rawText,
    ].join("\n");
  }

  // Grab exactly what is inside Step 2's single text box — clean, trimmed, untouched.
  function getStep2RawText() {
    return $("#step2RawText").value.trim();
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

  /* ---------------- Step 3: Voice cards ---------------- */
  const voiceGrid = $("#voiceGrid");
  VOICES.forEach((v) => {
    const card = document.createElement("div");
    card.className = "voice-card";
    card.dataset.code = v.code;
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.innerHTML = `
      <div class="vc-code">${v.code}</div>
      <div class="vc-label">${v.label}</div>
      <button class="vc-preview" type="button">▶ အသံနမူနာ နားထောင်ရန် (Preview)</button>
    `;
    card.addEventListener("click", (e) => {
      if (e.target.closest(".vc-preview")) return;
      selectVoice(v.code);
    });
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectVoice(v.code);
      }
    });
    $(".vc-preview", card).addEventListener("click", (e) => {
      e.stopPropagation();
      selectVoice(v.code);
      previewVoice(v, e.currentTarget);
    });
    voiceGrid.appendChild(card);
  });

  function selectVoice(code) {
    state.voice = code;
    $$(".voice-card").forEach((c) => c.classList.toggle("selected", c.dataset.code === code));
    $("#voiceChip").hidden = false;
    $("#voiceChip").textContent = code + " ရွေးပြီး";
    // keep per-line "Global" labels current
    refreshGlobalPicks();
    // re-generation is required after a change
    if (state.voiceGenerated) {
      state.voiceGenerated = false;
      updateStepsUI();
    }
  }

  let previewTimer = null;
  function previewVoice(v, btn) {
    $$(".vc-preview").forEach((b) => {
      b.classList.remove("playing");
      b.innerHTML = "▶ အသံနမူနာ နားထောင်ရန် (Preview)";
    });
    if (previewTimer) clearTimeout(previewTimer);

    btn.classList.add("playing");
    btn.innerHTML = '<span class="eq"><i></i><i></i><i></i></span> ဖွင့်နေသည်...';

    // Best-effort audible demo via Web Speech API (persona pitch/rate)
    try {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance("Red Bear Studio မှ ကြိုဆိုပါသည်။ ဤသည်မှာ အသံနမူနာ ဖြစ်ပါသည်။");
        u.lang = "my-MM";
        const offset = state.pitch / 60; // -30..30Hz → -0.5..0.5
        u.pitch = Math.min(2, Math.max(0.1, v.pitch + offset));
        u.rate = v.rate;
        window.speechSynthesis.speak(u);
      }
    } catch (_) {}

    previewTimer = setTimeout(() => {
      btn.classList.remove("playing");
      btn.innerHTML = "▶ အသံနမူနာ နားထောင်ရန် (Preview)";
    }, 2600);
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
    if (lab) lab.textContent = label || "ဗီဒီယို ဖန်တီးနေပါသည်...";
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
      await runRenderProgress("ဗီဒီယို ဖန်တီးနေပါသည်...");
      toast("အသံနှင့် ဗီဒီယို ဖန်တီးပြီးပါပြီ ✓", "ok");
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
    $("#resVoice").textContent = v ? v.code + " · " + v.label.replace(/^[A-Z]{2} /, "").replace(/^\(|\)$/g, "") : "—";
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
    toast("ပြန်လည် ဖန်တီးပြီးပါပြီ ✓", "ok");
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
    $("#step2RawText").value = "";
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

  const recapVoiceGrid = $("#recapVoiceGrid");
  VOICES.forEach((v) => {
    const card = document.createElement("div");
    card.className = "voice-card";
    card.dataset.code = v.code;
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.innerHTML = `
      <div class="vc-code">${v.code}</div>
      <div class="vc-label">${v.label}</div>
      <button class="vc-preview recap-vc-preview" type="button">▶ အသံနမူနာ နားထောင်ရန် (Preview)</button>
    `;
    card.addEventListener("click", (e) => {
      if (e.target.closest(".vc-preview")) return;
      selectRecapVoice(v.code);
    });
    $(".vc-preview", card).addEventListener("click", (e) => {
      e.stopPropagation();
      selectRecapVoice(v.code);
      previewVoice(v, e.currentTarget);
    });
    recapVoiceGrid.appendChild(card);
  });

  function selectRecapVoice(code) {
    state.voice = code;
    $$("#recapVoiceGrid .voice-card").forEach((c) => c.classList.toggle("selected", c.dataset.code === code));
    $("#recapVoiceChip").hidden = false;
    $("#recapVoiceChip").textContent = code + " ရွေးပြီး";
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
    toast("Transcript → Gemini ဘာသာပြန် → TTS → Video Muxing…", "ok");
    await wait(900);
    toast("မြန်မာဘာသာပြန် ပြီးပါပြီ — အသံ ဖန်တီးနေပါသည်…", "ok");
    await wait(900);
    toast("ဗီဒီယို Muxing လုပ်နေပါသည်…", "ok");
    await wait(900);
    state.transcriptReady = true;
    state.voiceGenerated = true;
    const sample = "ဤသည်မှာ Auto Recap မှ အလိုအလျောက် ဖန်တီးထားသော မြန်မာ ဇာတ်ကြောင်း ဖြစ်ပါသည်။";
    $("#burmeseText").value = sample;
    state.scriptLines = [{ text: sample, voice: "", pitch: "" }];
    state.voicePlan = [{ n: 1, text: sample, voice: state.voice, pitch: state.pitch }];
    $("#fileName").textContent = state.file ? state.file.name : "auto-recap.mp4";
    $("#fileMeta").textContent = "AUTO RECAP · 1-Click Pipeline";
    $("#fileChip").hidden = false;
    renderResult();
    setPage("manual");
    state.step = 4;
    state.maxStep = 4;
    $$(".step-panel").forEach((p) => p.classList.toggle("active", p.id === "stepPanel4"));
    updateStepsUI();
    await runRenderProgress("ဗီဒီယို ဖန်တီးနေပါသည်...");
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
