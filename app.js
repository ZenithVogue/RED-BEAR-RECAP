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
    transcriptReady: false,
    translated: false,
    voice: null,        // persona code
    pitch: 0,           // -30..30 Hz
    voiceGenerated: false,
    quotaLeft: 1,
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

  const TRANSCRIPT = [
    { t: "00:01", text: "Welcome back to Red Bear Studio. Today, we are exploring the ancient city of Bagan." },
    { t: "00:08", text: "Thousands of temples rise from the plains, and each one has its own story to tell." },
    { t: "00:15", text: "As the sun sets, the whole horizon turns gold and everything becomes quiet." },
    { t: "00:22", text: "Stay with us until the end, and we will share three travel tips for your first visit." },
  ];

  const BURMESE = [
    "Red Bear Studio မှ ပြန်လည် ကြိုဆိုပါသည်။ ယနေ့တွင် ရှေးဟောင်း ပုဂံမြို့ကို စူးစမ်း လေ့လာသွားကြမည်။",
    "ကျယ်ပြန့်သော လွင်ပြင်များပေါ်တွင် ဘုရားစေတီ ထောင်ပေါင်းများစွာ တည်ရှိပြီး တစ်ဆူချင်းစီတွင် ကိုယ်ပိုင် သမိုင်းကြောင်းများ ရှိပါသည်။",
    "နေဝင်ချိန်တွင် မိုးကောင်းကင် တစ်ခုလုံး ရွှေရောင် ဝင်းလက်လာပြီး တိတ်ဆိတ် သွားပါသည်။",
    "အဆုံးထိ ကြည့်ရှုပေးပါ။ ပထမဆုံး သွားရောက်မည့် သူများအတွက် ခရီးသွား အကြံပြုချက် သုံးချက်ကို မျှဝေပေးပါမည်။",
  ];

  const SRT_TIMES = [
    ["00:00:01,000", "00:00:07,000"],
    ["00:00:08,000", "00:00:14,000"],
    ["00:00:15,000", "00:00:21,000"],
    ["00:00:22,000", "00:00:28,000"],
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
    state.transcriptReady = false;
    state.translated = false;
    state.voiceGenerated = false;
    state.maxStep = 1;
    $("#fileName").textContent = f.name;
    $("#fileMeta").textContent = `${ext.toUpperCase()} · ${fmtSize(f.size)} · အများဆုံး ၁၀ မိနစ်`;
    $("#fileChip").hidden = false;
    $("#btnToStep2").disabled = false;
    $("#step1Hint").textContent = "ဖိုင် အသင့်ဖြစ်ပါပြီ — ရှေ့သို့ ဆက်သွားနိုင်ပါသည်";
    hideDanger();
    toast("ဗီဒီယိုဖိုင် တင်ပြီးပါပြီ ✓", "ok");
  }

  $("#fileRemove").addEventListener("click", () => {
    state.file = null;
    fileInput.value = "";
    $("#fileChip").hidden = true;
    $("#btnToStep2").disabled = true;
    $("#step1Hint").textContent = "ဗီဒီယိုဖိုင် ရွေးချယ်ပြီးမှ ရှေ့သို့ ဆက်နိုင်ပါမည်";
  });

  /* ---------------- Step 1 → 2: Extract transcript ---------------- */
  $("#btnToStep2").addEventListener("click", async () => {
    if (!state.file) return;
    const btn = $("#btnToStep2");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> စာသား ထုတ်ယူနေပါသည်...';
    await wait(1500);
    state.transcriptReady = true;
    renderTranscript();
    btn.disabled = false;
    btn.textContent = "ရှေ့သို့ ဆက်သွားမည် (Next)";
    goToStep(2);
    toast("မူရင်း အင်္ဂလိပ် စာသားများ ထုတ်ယူပြီးပါပြီ ✓", "ok");
  });

  function renderTranscript() {
    const box = $("#transcriptBox");
    box.innerHTML = "";
    TRANSCRIPT.forEach((line) => {
      const div = document.createElement("div");
      div.className = "t-line";
      const t = document.createElement("span");
      t.className = "t-time";
      t.textContent = line.t;
      div.appendChild(t);
      div.appendChild(document.createTextNode(line.text));
      box.appendChild(div);
    });
    const words = TRANSCRIPT.reduce((n, l) => n + l.text.split(/\s+/).length, 0);
    $("#transcriptWords").textContent = `${words} words · ${TRANSCRIPT.length} segments`;
    $("#transcriptDur").textContent = "≈ 00:28";
  }

  /* ---------------- Step 2 actions ---------------- */
  $("#btnCopyGemini").addEventListener("click", async () => {
    // Copy the English transcript text to the clipboard (Free Workflow)
    const text = TRANSCRIPT.map((l) => l.text).join("\n");
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch (_) {
      // Fallback for non-secure contexts
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { copied = document.execCommand("copy"); } catch (_) {}
      ta.remove();
    }
    if (copied) {
      toast("✓ စာသားများကို Clipboard သို့ ကူးယူပြီးပါပြီ!", "ok");
    } else {
      toast("Clipboard ကို အသုံးပြု၍ မရသေးပါ — စာသားကို ကိုယ်တိုင် ကူးယူပါ။", "info");
    }
  });

  $("#btnAutoTranslate").addEventListener("click", async () => {
    const btn = $("#btnAutoTranslate");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> ဘာသာပြန်နေပါသည်...';
    await wait(1300);
    $("#burmeseText").value = BURMESE.join("\n\n");
    state.translated = true;
    btn.disabled = false;
    btn.innerHTML = "🌏 မြန်မာသို့ အလိုအလျောက် ဘာသာပြန်မည် (Auto Translate)";
    goToStep(3);
    toast("မြန်မာဘာသာ ပြန်ဆိုပြီးပါပြီ ✓", "ok");
  });

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
    pitchValue.textContent = (v > 0 ? "+" : "") + v + " Hz";
  });

  /* ---------------- Generate voice over ---------------- */
  $("#btnGenerate").addEventListener("click", async () => {
    const text = $("#burmeseText").value.trim();
    if (!text) {
      toast("မြန်မာဘာသာပြန် စာမူ ဗလာ ဖြစ်နေပါသည် — Auto Translate ကို အရင်နှိပ်ပါ။", "info");
      return;
    }
    if (!state.voice) {
      toast("ကျေးဇူးပြု၍ Voice Persona တစ်ခု ရွေးချယ်ပါ။", "info");
      return;
    }
    const btn = $("#btnGenerate");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> အသံ ဖန်တီးနေပါသည်...';
    await wait(1900);
    state.voiceGenerated = true;
    hideDanger();
    useQuota();
    updateStepsUI();
    renderResult();
    btn.disabled = false;
    btn.innerHTML = "🔊 အသံဖန်တီးပေးမည် (Generate Voice Over)";
    toast("အသံ ဖန်တီးပြီးပါပြီ — Step 4 သို့ သွားနိုင်ပါပြီ ✓", "ok");
  });

  /* ---------------- Step 4: Result ---------------- */
  function renderResult() {
    $("#resFileName").textContent = state.file ? state.file.name : "—";
    const v = VOICES.find((x) => x.code === state.voice);
    $("#resVoice").textContent = v ? v.code + " · " + v.label.replace(/^[A-Z]{2} /, "").replace(/^\(|\)$/g, "") : "—";
    $("#resPitch").textContent = (state.pitch > 0 ? "+" : "") + state.pitch + " Hz";
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
  $("#btnDownloadSrt").addEventListener("click", () => {
    const lines = $("#burmeseText").value.trim().split(/\n+/).filter(Boolean);
    const body = SRT_TIMES.map((range, i) => {
      const text = lines[i] || BURMESE[i] || "";
      return `${i + 1}\n${range[0]} --> ${range[1]}\n${text}\n`;
    }).join("\n");
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
    state.file = null;
    state.transcriptReady = false;
    state.translated = false;
    state.voice = null;
    state.voiceGenerated = false;
    state.pitch = 0;
    pitchSlider.value = 0;
    pitchValue.textContent = "0 Hz";
    fileInput.value = "";
    $("#fileChip").hidden = true;
    $("#btnToStep2").disabled = true;
    $("#step1Hint").textContent = "ဗီဒီယိုဖိုင် ရွေးချယ်ပြီးမှ ရှေ့သို့ ဆက်နိုင်ပါမည်";
    $("#transcriptBox").innerHTML = "";
    $("#burmeseText").value = "";
    $("#voiceChip").hidden = true;
    $$(".voice-card").forEach((c) => c.classList.remove("selected"));
    state.step = 1;
    state.maxStep = 1;
    $$(".step-panel").forEach((p, i) => p.classList.toggle("active", i === 0));
    updateStepsUI();
    toast("အလုပ်အသစ် စတင်ပါပြီ 🆕", "info");
  });

  /* ---------------- Auto Recap page ---------------- */
  $("#btnAutoRecap").addEventListener("click", async () => {
    const btn = $("#btnAutoRecap");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Auto Recap ဖန်တီးနေပါသည်...';
    await wait(1800);
    btn.disabled = false;
    btn.innerHTML = "⚡ 1-Click Auto Recap ဖန်တီးမည်";
    toast("Pro အဆင့် လိုအပ်ပါသည် — Upgrade to Pro ကို နှိပ်ပါ။", "info");
  });

  /* ---------------- Job history ---------------- */
  $$(".mini-btn").forEach((b) =>
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

  function loadKeys() {
    try {
      const g = localStorage.getItem("rb_gemini") || "";
      const a = localStorage.getItem("rb_assembly") || "";
      $("#geminiKey").value = g;
      $("#assemblyKey").value = a;
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

  function saveKeys() {
    const g = $("#geminiKey").value.trim();
    const a = $("#assemblyKey").value.trim();
    // Block saving when either API key field is empty
    if (!g || !a) {
      showKeyMsg("error", "⚠️ API Key များ မသိမ်းဆည်းရသေးပါ");
      return;
    }
    try {
      localStorage.setItem("rb_gemini", g);
      localStorage.setItem("rb_assembly", a);
    } catch (_) {}
    loadKeys();
    showKeyMsg("ok", "✓ API Key များကို အောင်မြင်စွာ သိမ်းဆည်းပြီးပါပြီ");
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
})();
