/* ============================================================
   Red Bear Studio v2.0 Pro — Logic Engine
   ============================================================ */

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

document.addEventListener("DOMContentLoaded", () => {
  initThemeToggle();
  initAuthSimulation();
  initMediaInputAndPlayer();
  initOptionControls();
});

/* ---------------- 1. Theme Switcher ---------------- */
function initThemeToggle() {
  const themeSwitchBtn = $("#themeSwitchBtn");
  const htmlElement = document.documentElement;

  themeSwitchBtn.addEventListener("click", () => {
    const currentTheme = htmlElement.getAttribute("data-theme");
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    htmlElement.setAttribute("data-theme", nextTheme);
    themeSwitchBtn.textContent = nextTheme === "dark" ? "☀️ Light" : "🌙 Dark";
    notifyToast(`Theme: ${nextTheme.toUpperCase()}`);
  });
}

/* ---------------- 2. Auth Flow Simulation ---------------- */
function initAuthSimulation() {
  const btnLogin = $("#btnLogin");
  const btnSignup = $("#btnSignup");
  const loggedOutAuth = $("#loggedOutAuth");
  const loggedInAuth = $("#loggedInAuth");
  const sidebarQuotaCard = $("#sidebarQuotaCard");
  const userEmailLabel = $("#userEmailLabel");

  btnLogin.addEventListener("click", () => handleLogin("user@gmail.com"));
  btnSignup.addEventListener("click", () => handleLogin("newbie_creator@gmail.com"));

  function handleLogin(email) {
    loggedOutAuth.classList.add("hidden");
    loggedInAuth.classList.remove("hidden");
    sidebarQuotaCard.classList.remove("hidden");
    userEmailLabel.textContent = email;
    notifyToast("✓ အကောင့် အောင်မြင်စွာ ဝင်ရောက်ပြီးပါပြီ");
  }
}

/* ---------------- 3. Media Input & Custom Video Player ---------------- */
function initMediaInputAndPlayer() {
  const fileInput = $("#fileInput");
  const btnBrowse = $("#btnBrowse");
  const uploadDropzone = $("#uploadDropzone");
  const linkInput = $("#linkInput");
  const btnPaste = $("#btnPaste");
  const btnFetch = $("#btnFetch");

  const playerPreviewWrapper = $("#playerPreviewWrapper");
  const previewVideoPlayer = $("#previewVideoPlayer");
  const loadedFileName = $("#loadedFileName");
  const btnRemoveFile = $("#btnRemoveFile");

  const btnPlayToggle = $("#btnPlayToggle");
  const videoProgressBar = $("#videoProgressBar");
  const timeDisplay = $("#timeDisplay");

  // Browse File Action
  btnBrowse.addEventListener("click", () => fileInput.click());
  uploadDropzone.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length) {
      loadMediaSource(e.target.files[0]);
    }
  });

  // Paste Link Action
  btnPaste.addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      linkInput.value = text;
      notifyToast("✓ Link Paste လုပ်ပြီးပါပြီ");
    } catch (_) {
      notifyToast("Clipboard ခွင့်ပြုချက်မရပါ");
    }
  });

  // Fetch Social Media Link (YouTube, TikTok, RedNote)
  btnFetch.addEventListener("click", () => {
    const url = linkInput.value.trim();
    if (!url) {
      notifyToast("⚠️ ကျေးဇူးပြု၍ Link အရင်ထည့်ပါ");
      return;
    }

    if (url.includes("xiaohongshu") || url.includes("rednote") || url.includes("xhslink")) {
      notifyToast("🌸 RedNote (小红书) Link မှ ဗီဒီယို ဖတ်ရှုဆွဲယူပြီးပါပြီ");
    } else if (url.includes("tiktok")) {
      notifyToast("🎵 TikTok Link မှ ဗီဒီယို ဖတ်ရှုဆွဲယူပြီးပါပြီ");
    } else if (url.includes("youtube") || url.includes("youtu.be")) {
      notifyToast("📺 YouTube Link မှ ဗီဒီယို ဖတ်ရှုဆွဲယူပြီးပါပြီ");
    } else {
      notifyToast("🔗 Link မှ ဗီဒီယို ရယူနေပါသည်...");
    }

    // Set demo video stream
    const demoUrl = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";
    loadMediaSource(demoUrl, "social_media_video.mp4");
  });

  function loadMediaSource(source, fileName) {
    let srcUrl = typeof source === "string" ? source : URL.createObjectURL(source);
    let name = fileName || (source.name ? source.name : "video.mp4");

    previewVideoPlayer.src = srcUrl;
    loadedFileName.textContent = name;

    uploadDropzone.classList.add("hidden");
    playerPreviewWrapper.classList.remove("hidden");
    notifyToast("✓ Video Preview အဆင်သင့်ဖြစ်ပါပြီ");
  }

  // Remove Selected Video File
  btnRemoveFile.addEventListener("click", () => {
    previewVideoPlayer.pause();
    previewVideoPlayer.src = "";
    fileInput.value = "";
    linkInput.value = "";
    playerPreviewWrapper.classList.add("hidden");
    uploadDropzone.classList.remove("hidden");
    notifyToast("🗑️ ဗီဒီယိုဖိုင် ဖယ်ရှားလိုက်ပါပြီ");
  });

  // Video Play / Pause Toggle
  btnPlayToggle.addEventListener("click", () => {
    if (previewVideoPlayer.paused) {
      previewVideoPlayer.play();
      btnPlayToggle.textContent = "❚❚";
    } else {
      previewVideoPlayer.pause();
      btnPlayToggle.textContent = "▶";
    }
  });

  // Time & Progress Updates
  previewVideoPlayer.addEventListener("timeupdate", () => {
    if (previewVideoPlayer.duration) {
      const pct = (previewVideoPlayer.currentTime / previewVideoPlayer.duration) * 100;
      videoProgressBar.value = pct;
      timeDisplay.textContent = `${formatTime(previewVideoPlayer.currentTime)} / ${formatTime(previewVideoPlayer.duration)}`;
    }
  });

  videoProgressBar.addEventListener("input", (e) => {
    if (previewVideoPlayer.duration) {
      previewVideoPlayer.currentTime = (e.target.value / 100) * previewVideoPlayer.duration;
    }
  });

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  }
}

/* ---------------- 4. Options Controls & Font Selection ---------------- */
function initOptionControls() {
  // Ratio selection
  $$(".ratio-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".ratio-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  // Language selection
  $$(".lang-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".lang-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  // Font Style selection
  const subTextDisplay = $("#subTextDisplay");
  $$(".font-card").forEach(card => {
    card.addEventListener("click", () => {
      $$(".font-card").forEach(c => c.classList.remove("active"));
      card.classList.add("active");
      const font = card.dataset.font;
      subTextDisplay.style.fontFamily = `'${font}', sans-serif`;
      notifyToast(`✓ Subtitle Font: ${font}`);
    });
  });

  // Zoom range
  const rngZoom = $("#rngZoom");
  const zoomValText = $("#zoomValText");
  rngZoom.addEventListener("input", (e) => {
    zoomValText.textContent = `${e.target.value}%`;
  });

  // Execute Process
  $("#btnExecute").addEventListener("click", () => {
    notifyToast("🚀 Video Dubbing & Subtitle ရယူခြင်း စတင်နေပါပြီ...");
  });
}

function notifyToast(msg) {
  const stack = $("#toastStack");
  const el = document.createElement("div");
  el.className = "toast-message";
  el.textContent = msg;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
