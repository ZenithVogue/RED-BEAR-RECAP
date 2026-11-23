/* ============================================================
   Red Bear Studio v2.0 Pro Engine — Full Fixed Build
   ============================================================ */
const $  = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initMedia();
  initSidebarTabs();
  initSidebarToggle();
  initVideoModeCards();
  initAudioSliders();
  initCaptionsControls();
  initSubtitleResizer();
  initOverlays();
  initBackgroundControls();
  initRatioControls();
  initZoomControl();
  initExecuteButton();
});

/* ============================================================
   THEME
   ============================================================ */
function initTheme() {
  const btn = $("#themeToggleBtn");
  btn.addEventListener("click", () => {
    const html = document.documentElement;
    const isDark = html.getAttribute("data-theme") === "dark";
    html.setAttribute("data-theme", isDark ? "light" : "dark");
    btn.querySelector(".theme-icon").textContent = isDark ? "🌙" : "☀️";
    btn.querySelector(".theme-text").textContent = isDark ? "Dark" : "Light";
  });
}

/* ============================================================
   MEDIA + PLAYBACK SYNC (two video layers)
   ============================================================ */
function initMedia() {
  const fileInput     = $("#fileInput");
  const mainVid       = $("#previewVideo");
  const bgVid         = $("#previewVideoBg");
  const videoProgress = $("#videoProgress");
  const timeReadout   = $("#timeReadout");
  const btnPlayToggle = $("#btnPlayToggle");

  const loadVideo = (src) => {
    // Set src on BOTH videos
    mainVid.src = src;
    bgVid.src   = src;

    // Hide bg video by default (only shown in Blur BG mode)
    bgVid.style.display = "none";
    bgVid.muted = true;

    // Sync bg video with main video
    mainVid.addEventListener("play",  () => { if (bgVid.src) bgVid.play(); });
    mainVid.addEventListener("pause", () => bgVid.pause());
    mainVid.addEventListener("seeked", () => { bgVid.currentTime = mainVid.currentTime; });
    mainVid.addEventListener("timeupdate", () => {
      if (Math.abs(bgVid.currentTime - mainVid.currentTime) > 0.3) {
        bgVid.currentTime = mainVid.currentTime;
      }
    });

    $("#mediaInputView").classList.add("hidden");
    $("#phonePreviewView").classList.remove("hidden");
  };

  $("#btnBrowse").addEventListener("click", (e) => { e.stopPropagation(); fileInput.click(); });
  $("#uploadDropzone").addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length) loadVideo(URL.createObjectURL(e.target.files[0]));
  });

  $("#btnFetch").addEventListener("click", () => {
    const url = $("#linkInput").value.trim() ||
      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";
    loadVideo(url);
  });

  $("#btnRemoveMedia").addEventListener("click", () => {
    mainVid.pause();
    mainVid.removeAttribute("src");
    mainVid.load();
    bgVid.pause();
    bgVid.removeAttribute("src");
    bgVid.load();
    $("#phonePreviewView").classList.add("hidden");
    $("#mediaInputView").classList.remove("hidden");
  });

  btnPlayToggle.addEventListener("click", () => {
    mainVid.paused ? mainVid.play() : mainVid.pause();
  });
  mainVid.addEventListener("play",  () => btnPlayToggle.textContent = "❚❚");
  mainVid.addEventListener("pause", () => btnPlayToggle.textContent = "▶");

  mainVid.addEventListener("timeupdate", () => {
    if (!mainVid.duration) return;
    videoProgress.value = (mainVid.currentTime / mainVid.duration) * 100;
    timeReadout.textContent = `${fmt(mainVid.currentTime)} / ${fmt(mainVid.duration)}`;
  });

  videoProgress.addEventListener("input", (e) => {
    if (mainVid.duration) mainVid.currentTime = (e.target.value / 100) * mainVid.duration;
  });

  const fmt = (s) => {
    if (!isFinite(s)) return "0:00";
    return `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,"0")}`;
  };

  const applyFilters = () => {
    const mirror = $("#chkMirror").checked ? "scaleX(-1) " : "";
    const zoom   = (parseInt($("#rngZoom").value) || 100) / 100;
    mainVid.style.transform = mirror + `scale(${zoom})`;
    mainVid.style.filter    = $("#chkAutoColor").checked ? "saturate(1.4) contrast(1.2)" : "none";
  };
  $("#chkMirror").addEventListener("change", applyFilters);
  $("#chkAutoColor").addEventListener("change", applyFilters);
}

/* ============================================================
   SIDEBAR TABS
   ============================================================ */
function initSidebarTabs() {
  $$(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".tab-btn").forEach(b => b.classList.remove("active"));
      $$(".tab-content").forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      const target = $(`#${btn.dataset.tab}`);
      if (target) target.classList.add("active");
    });
  });
}

/* ============================================================
   COLLAPSIBLE SIDEBAR
   ============================================================ */
function initSidebarToggle() {
  const body = document.body;
  const btn  = $("#sidebarToggleBtn");
  if (!btn) return;

  const saved = localStorage.getItem("rbs_sidebar_state");
  if (saved === "collapsed") {
    body.classList.remove("sidebar-open");
    body.classList.add("sidebar-collapsed");
  }

  const toggle = () => {
    const isCollapsed = body.classList.toggle("sidebar-collapsed");
    body.classList.toggle("sidebar-open", !isCollapsed);
    localStorage.setItem("rbs_sidebar_state", isCollapsed ? "collapsed" : "open");
  };

  btn.addEventListener("click", toggle);

  // Mobile: tap floating hamburger area to reopen
  document.addEventListener("click", (e) => {
    if (window.innerWidth > 768) return;
    if (!body.classList.contains("sidebar-collapsed")) return;
    if (e.clientX > 52 || e.clientY > 52) return;
    if (e.target.closest("button, a, input, select")) return;
    toggle();
  });
}

/* ============================================================
   VIDEO MODE + LANGUAGE
   ============================================================ */
function initVideoModeCards() {
  $$(".mode-card-item").forEach(card => {
    card.addEventListener("click", () => {
      $$(".mode-card-item").forEach(c => c.classList.remove("active"));
      card.classList.add("active");
      const inp = card.querySelector("input");
      if (inp) inp.checked = true;
    });
  });

  const TEXTS = {
    my: "ဒီနေရာမှာ စာတန်းထိုး ပေါ်မယ်",
    en: "Let's see the subtitle sample",
    th: "ดูตัวอย่างคำบรรยาย",
  };
  $$(".lang-btn[data-vlang]").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".lang-btn[data-vlang]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const t = TEXTS[btn.dataset.vlang] || TEXTS.my;
      $("#subTextDisplay").textContent = t;
      const cp = $("#captionPreviewText");
      if (cp) cp.textContent = t;
    });
  });
}

/* ============================================================
   AUDIO SLIDERS
   ============================================================ */
function initAudioSliders() {
  const rngSpeed = $("#rngVoiceSpeed");
  rngSpeed?.addEventListener("input", (e) => {
    $("#speedValText").textContent = `${parseFloat(e.target.value).toFixed(1)}x`;
  });
  const rngPitch = $("#rngVoicePitch");
  rngPitch?.addEventListener("input", (e) => {
    $("#pitchValText").textContent = parseFloat(e.target.value).toFixed(1);
  });
}

/* ============================================================
   CAPTIONS CONTROLS
   ============================================================ */
function initCaptionsControls() {
  const subTextDisplay     = $("#subTextDisplay");
  const captionPreviewText = $("#captionPreviewText");
  const subOverlay         = $("#subtitleOverlay");
  const vp                 = $("#phoneViewport");

  $("#rngSubWidth").addEventListener("input", (e) => {
    const val = parseInt(e.target.value);
    $("#captionWidthText").textContent = `${val}%`;
    subOverlay.style.width     = `${val}%`;
    subOverlay.style.height    = "";
    subOverlay.style.minHeight = "";
    subOverlay.style.maxHeight = "";
    clampToViewport(subOverlay, vp);
  });

  $("#fontDropdown").addEventListener("change", (e) => {
    const f = `'${e.target.value}', sans-serif`;
    subTextDisplay.style.fontFamily     = f;
    captionPreviewText.style.fontFamily = f;
  });

  const rngFontSize = $("#rngFontSize");
  const setFontSize = (v) => {
    v = Math.max(12, Math.min(32, parseInt(v)));
    rngFontSize.value = v;
    $("#fontSizeText").textContent = `${v}px`;
    subTextDisplay.style.fontSize     = `${v}px`;
    captionPreviewText.style.fontSize = `${v}px`;
  };
  rngFontSize.addEventListener("input", (e) => setFontSize(e.target.value));
  $("#btnFontSizeDec").addEventListener("click", () => setFontSize(parseInt(rngFontSize.value) - 1));
  $("#btnFontSizeInc").addEventListener("click", () => setFontSize(parseInt(rngFontSize.value) + 1));

  $$(".color-circle").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".color-circle").forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      const col = btn.dataset.color;
      $("#textColorIndicator").style.background = col;
      $("#nativeTextColorPicker").value = col;
      subTextDisplay.style.color     = col;
      captionPreviewText.style.color = col;
    });
  });

  $("#nativeTextColorPicker").addEventListener("input", (e) => {
    const col = e.target.value;
    $("#textColorIndicator").style.background = col;
    subTextDisplay.style.color     = col;
    captionPreviewText.style.color = col;
  });

  $("#nativeOutlineColorPicker").addEventListener("input", (e) => {
    const col = e.target.value;
    $("#outlineColorIndicator").style.background = col;
    const w = $("#rngOutlineWidth").value;
    subTextDisplay.style.webkitTextStroke     = `${w}px ${col}`;
    captionPreviewText.style.webkitTextStroke = `${w}px ${col}`;
  });

  const rngOutlineWidth = $("#rngOutlineWidth");
  const setOutline = (v) => {
    v = Math.max(0, Math.min(8, parseInt(v)));
    rngOutlineWidth.value = v;
    $("#outlineWidthText").textContent = `${v}px`;
    const col = $("#nativeOutlineColorPicker").value;
    subTextDisplay.style.webkitTextStroke     = `${v}px ${col}`;
    captionPreviewText.style.webkitTextStroke = `${v}px ${col}`;
  };
  rngOutlineWidth.addEventListener("input", (e) => setOutline(e.target.value));
  $("#btnOutlineDec").addEventListener("click", () => setOutline(parseInt(rngOutlineWidth.value) - 1));
  $("#btnOutlineInc").addEventListener("click", () => setOutline(parseInt(rngOutlineWidth.value) + 1));

  $("#chkBoxBg").addEventListener("change", (e) => {
    subOverlay.style.background = e.target.checked ? "rgba(15,23,42,0.9)" : "transparent";
  });

  $("#chkEnableCaptions").addEventListener("change", (e) => {
    subOverlay.style.display = e.target.checked ? "" : "none";
    $("#captionLivePreviewBox").style.opacity = e.target.checked ? "1" : "0.4";
  });
}

/* ============================================================
   SUBTITLE RESIZER (right handle)
   ============================================================ */
function initSubtitleResizer() {
  const subOverlay = $("#subtitleOverlay");
  const handleR    = $("#subHandleR");
  const vp         = $("#phoneViewport");

  let isResizing = false;
  let startX, startW, lockLeft, lockH;

  handleR.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();

    const cRect = vp.getBoundingClientRect();
    const eRect = subOverlay.getBoundingClientRect();

    const curL = eRect.left - cRect.left;
    const curT = eRect.top  - cRect.top;

    subOverlay.style.left      = curL + "px";
    subOverlay.style.top       = curT + "px";
    subOverlay.style.bottom    = "auto";
    subOverlay.style.right     = "auto";
    subOverlay.style.transform = "none";
    subOverlay.style.height    = eRect.height + "px";
    subOverlay.style.minHeight = eRect.height + "px";
    subOverlay.style.maxHeight = eRect.height + "px";

    lockLeft   = curL;
    lockH      = eRect.height;
    startX     = e.clientX;
    startW     = eRect.width;
    isResizing = true;
  });

  document.addEventListener("mousemove", (e) => {
    if (!isResizing) return;
    const dx    = e.clientX - startX;
    const minPx = vp.clientWidth * 0.30;
    const maxPx = Math.min(vp.clientWidth * 0.95, vp.clientWidth - lockLeft);
    const newW  = Math.max(minPx, Math.min(startW + dx, maxPx));

    subOverlay.style.width  = newW + "px";
    subOverlay.style.height = lockH + "px";

    const pct = Math.round((newW / vp.clientWidth) * 100);
    $("#rngSubWidth").value = pct;
    $("#captionWidthText").textContent = pct + "%";
  });

  document.addEventListener("mouseup", () => { isResizing = false; });
}

/* ============================================================
   CONSTRAINED DRAGGABLE
   ============================================================ */
function makeConstrainedDraggable(el, container) {
  let isDrag = false;
  let startMouseX, startMouseY, startLeft, startTop;
  let lockedW, lockedH, maxL, maxT;

  el.addEventListener("mousedown", (e) => {
    if (e.target.closest(".blur-toolbar, .blur-resize-handle, .blur-close-btn, .sub-handle-r, .crop-handle")) return;
    e.preventDefault();

    const cRect = container.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();

    startLeft = eRect.left - cRect.left;
    startTop  = eRect.top  - cRect.top;
    lockedW   = eRect.width;
    lockedH   = eRect.height;

    el.style.setProperty('left', startLeft + "px", "important");
    el.style.setProperty('top', startTop + "px", "important");
    el.style.setProperty('bottom', 'auto', "important");
    el.style.setProperty('right', 'auto', "important");
    el.style.setProperty('transform', 'none', "important");
    el.style.setProperty('width', lockedW + "px", "important");
    el.style.setProperty('height', lockedH + "px", "important");
    el.style.setProperty('min-height', lockedH + "px", "important");
    el.style.setProperty('max-height', lockedH + "px", "important");

    maxL = Math.max(0, cRect.width  - lockedW);
    maxT = Math.max(0, cRect.height - lockedH);

    startMouseX = e.clientX;
    startMouseY = e.clientY;
    isDrag = true;
    e.stopPropagation();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDrag) return;
    let nL = startLeft + (e.clientX - startMouseX);
    let nT = startTop  + (e.clientY - startMouseY);
    nL = Math.max(0, Math.min(maxL, nL));
    nT = Math.max(0, Math.min(maxT, nT));
    el.style.setProperty('left', nL + "px", "important");
    el.style.setProperty('top', nT + "px", "important");
  });

  document.addEventListener("mouseup", () => { isDrag = false; });
}

function clampToViewport(el, container) {
  if (!el || el.classList.contains("hidden")) return;
  const cRect = container.getBoundingClientRect();
  const eRect = el.getBoundingClientRect();
  const curL  = eRect.left - cRect.left;
  const curT  = eRect.top  - cRect.top;
  const maxL  = Math.max(0, cRect.width  - eRect.width);
  const maxT  = Math.max(0, cRect.height - eRect.height);
  el.style.left      = Math.max(0, Math.min(maxL, curL)) + "px";
  el.style.top       = Math.max(0, Math.min(maxT, curT)) + "px";
  el.style.bottom    = "auto";
  el.style.right     = "auto";
  el.style.transform = "none";
}

/* ============================================================
   OVERLAYS (Blur boxes + Crop)
   ============================================================ */
function initOverlays() {
  const vp            = $("#phoneViewport");
  const blurContainer = $("#blurContainer");
  const subOverlay    = $("#subtitleOverlay");
  let blurCount = 0;

  $("#btnToggleBlur").addEventListener("click", () => {
    if (blurCount >= 3) return;
    blurCount++;

    const box = document.createElement("div");
    box.className = "blur-overlay-box";
    box.innerHTML = `
      <div class="blur-toolbar">
        <span class="blur-label">Blur</span>
        <button class="blur-btn blur-dec">−</button>
        <input type="range" class="blur-strength" min="0" max="30" value="10">
        <button class="blur-btn blur-inc">+</button>
        <span class="blur-val">10</span>
      </div>
      <div class="blur-close-btn">✕</div>
      <div class="blur-resize-handle"></div>
    `;
    blurContainer.appendChild(box);

    box.querySelector(".blur-close-btn").addEventListener("click", () => {
      box.remove(); blurCount--;
    });

    const strengthSlider = box.querySelector(".blur-strength");
    const strengthVal    = box.querySelector(".blur-val");
    const applyStrength  = (val) => {
      val = Math.max(0, Math.min(30, val));
      strengthSlider.value    = val;
      strengthVal.textContent = val;
      box.style.backdropFilter       = `blur(${val}px)`;
      box.style.webkitBackdropFilter = `blur(${val}px)`;
    };

    strengthSlider.addEventListener("input", (e) => applyStrength(parseInt(e.target.value)));
    box.querySelector(".blur-dec").addEventListener("click", (e) => { e.stopPropagation(); applyStrength(parseInt(strengthSlider.value) - 1); });
    box.querySelector(".blur-inc").addEventListener("click", (e) => { e.stopPropagation(); applyStrength(parseInt(strengthSlider.value) + 1); });

    applyStrength(10);
    makeConstrainedDraggable(box, vp);
    makeResizable(box, vp);
  });

  makeConstrainedDraggable(subOverlay, vp);

  const cropOverlay = $("#cropOverlayBox");
  $("#btnToggleCrop").addEventListener("click", () => cropOverlay.classList.remove("hidden"));
  $("#btnResetCrop").addEventListener("click", () => {
    cropOverlay.classList.add("hidden");
    const c = $("#cropBox");
    c.style.left = "15%"; c.style.top = "15%";
    c.style.width = "70%"; c.style.height = "70%";
  });

  initCropInteractivity();
}

/* ============================================================
   RESIZE BLUR HANDLE
   ============================================================ */
function makeResizable(box, container) {
  const handle = box.querySelector(".blur-resize-handle");
  if (!handle) return;
  let isResize = false, sX, sY, sW, sH;

  handle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    isResize = true;
    sX = e.clientX; sY = e.clientY;
    sW = box.offsetWidth; sH = box.offsetHeight;
  });

  document.addEventListener("mousemove", (e) => {
    if (!isResize) return;
    const dx = e.clientX - sX;
    const dy = e.clientY - sY;
    const newW = Math.max(30, Math.min(container.clientWidth  - box.offsetLeft, sW + dx));
    const newH = Math.max(30, Math.min(container.clientHeight - box.offsetTop,  sH + dy));
    box.style.setProperty('width', newW + "px", "important");
    box.style.setProperty('height', newH + "px", "important");
  });

  document.addEventListener("mouseup", () => { isResize = false; });
}

/* ============================================================
   CROP INTERACTIVITY
   ============================================================ */
function initCropInteractivity() {
  const cropBox = $("#cropBox");
  const vp      = $("#phoneViewport");

  let isDrag = false, sX, sY, iL, iT;
  cropBox.addEventListener("mousedown", (e) => {
    if (e.target.classList.contains("crop-handle")) return;
    isDrag = true;
    sX = e.clientX; sY = e.clientY;
    iL = cropBox.offsetLeft; iT = cropBox.offsetTop;
  });
  document.addEventListener("mousemove", (e) => {
    if (!isDrag) return;
    const maxL = vp.clientWidth  - cropBox.offsetWidth;
    const maxT = vp.clientHeight - cropBox.offsetHeight;
    cropBox.style.left = `${Math.max(0, Math.min(maxL, iL + e.clientX - sX))}px`;
    cropBox.style.top  = `${Math.max(0, Math.min(maxT, iT + e.clientY - sY))}px`;
  });
  document.addEventListener("mouseup", () => { isDrag = false; });

  $$(".crop-handle").forEach(handle => {
    let isResize = false, hType = handle.dataset.handle;
    let startX, startY, startL, startT, startW, startH;

    handle.addEventListener("mousedown", (e) => {
      isResize = true;
      startX = e.clientX; startY = e.clientY;
      startL = cropBox.offsetLeft; startT = cropBox.offsetTop;
      startW = cropBox.offsetWidth; startH = cropBox.offsetHeight;
      e.stopPropagation(); e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isResize) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      let nL = startL, nT = startT, nW = startW, nH = startH;
      if (hType.includes("l")) { nL = Math.max(0, startL + dx); nW = startW - (nL - startL); }
      if (hType.includes("r")) { nW = Math.min(vp.clientWidth  - startL, startW + dx); }
      if (hType.includes("t")) { nT = Math.max(0, startT + dy); nH = startH - (nT - startT); }
      if (hType.includes("b")) { nH = Math.min(vp.clientHeight - startT, startH + dy); }
      if (nW >= 50) { cropBox.style.left = `${nL}px`; cropBox.style.width = `${nW}px`; }
      if (nH >= 50) { cropBox.style.top  = `${nT}px`; cropBox.style.height = `${nH}px`; }
    });
    document.addEventListener("mouseup", () => { isResize = false; });
  });
}

/* ============================================================
   BACKGROUND CONTROLS (Blur video BG / Photo BG)
   ============================================================ */
function initBackgroundControls() {
  const bgVid         = $("#previewVideoBg");
  const bgLayer       = $("#bgLayer");
  const panelBlurBg   = $("#panelBlurBg");
  const panelPhotoBg  = $("#panelPhotoBg");
  const vp            = $("#phoneViewport");
  const BLUR_MAP      = { soft: 8, medium: 16, hard: 28 };

  const bgPhotoInput     = $("#bgPhotoInput");
  const photoPreviewWrap = $("#photoPreviewWrap");
  const photoThumb       = $("#photoThumb");

  // ---- Photo upload ----
  $("#btnUploadBgPhoto").addEventListener("click", () => bgPhotoInput.click());
  bgPhotoInput.addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    bgLayer.style.backgroundImage    = `url(${url})`;
    bgLayer.classList.add("visible");
    photoThumb.style.backgroundImage = `url(${url})`;
    photoPreviewWrap.classList.remove("hidden");
  });

  // ---- Opacity ----
  $("#rngBgOpacity").addEventListener("input", (e) => {
    bgLayer.style.opacity = (parseInt(e.target.value) / 100).toString();
  });

  // ---- Mode: Blur BG ----
  $("#btnModeBlurBg").addEventListener("click", () => {
    $("#btnModeBlurBg").classList.add("active");
    $("#btnModePhotoBg").classList.remove("active");
    panelBlurBg.classList.remove("hidden");
    panelPhotoBg.classList.add("hidden");

    // Show blurred video, hide photo layer
    if (bgVid.src) bgVid.style.display = "block";
    bgLayer.classList.remove("visible");

    const active = document.querySelector(".blur-preset-card.active");
    if (active) applyBlur(active.dataset.preset);
  });

  // ---- Mode: Photo BG ----
  $("#btnModePhotoBg").addEventListener("click", () => {
    $("#btnModePhotoBg").classList.add("active");
    $("#btnModeBlurBg").classList.remove("active");
    panelPhotoBg.classList.remove("hidden");
    panelBlurBg.classList.add("hidden");

    // Hide blurred video, show photo layer
    bgVid.style.display = "none";
    bgLayer.classList.add("visible");
  });

  function applyBlur(preset) {
    const px = BLUR_MAP[preset] ?? 16;
    vp.style.setProperty("--bg-blur", px + "px");
  }

  $$(".blur-preset-card").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".blur-preset-card").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      applyBlur(btn.dataset.preset);
    });
  });

  $("#btnClearBg").addEventListener("click", () => {
    bgLayer.style.backgroundImage = "none";
    bgLayer.classList.remove("visible");
    bgVid.style.display = "none";
  });
}

/* ============================================================
   RATIO CONTROLS (resize phone frame + reposition overlays)
   ============================================================ */
function initRatioControls() {
  const vp    = $("#phoneViewport");
  const frame = document.querySelector(".phone-frame");
  const RATIO_SIZES = {
    "9:16": { w: 240, h: 426 },
    "3:4":  { w: 260, h: 347 },
    "16:9": { w: 360, h: 203 },
    "1:1":  { w: 280, h: 280 },
  };

  $$(".ratio-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".ratio-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const ratio = btn.dataset.ratio;
      vp.dataset.ratio = ratio;

      const size = RATIO_SIZES[ratio] || RATIO_SIZES["9:16"];
      frame.style.width  = size.w + "px";
      frame.style.height = size.h + "px";

      requestAnimationFrame(() => {
        clampToViewport($("#subtitleOverlay"), vp);
        $$("#blurContainer .blur-overlay-box").forEach(b => clampToViewport(b, vp));
      });
    });
  });
}

/* ============================================================
   ZOOM
   ============================================================ */
function initZoomControl() {
  const rngZoom   = $("#rngZoom");
  const mainVid   = $("#previewVideo");
  rngZoom.addEventListener("input", (e) => {
    const z = parseInt(e.target.value);
    $("#zoomVal").textContent = z + "%";
    const mirror = $("#chkMirror").checked ? "scaleX(-1) " : "";
    mainVid.style.transform = mirror + `scale(${z / 100})`;
  });
}

/* ============================================================
   EXECUTE
   ============================================================ */
function initExecuteButton() {
  $(".btn-execute").addEventListener("click", () => {
    const payload = buildRenderPayload();
    console.log("🎬 Render payload:", payload);
    alert("Payload built! (Console မှာ ကြည့်ပါ — backend endpoint မချိတ်ရသေးပါ)");
  });
}

function buildRenderPayload() {
  const vp  = $("#phoneViewport");
  const sub = $("#subtitleOverlay");
  const crp = $("#cropBox");
  const vpR = vp.getBoundingClientRect();
  const rel = (el) => {
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.left - vpR.left),
      y: Math.round(r.top  - vpR.top),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  };
  const activeBlur = document.querySelector(".blur-preset-card.active");
  return {
    version: "2.0-pro",
    generatedAt: new Date().toISOString(),
    ratio: vp.dataset.ratio || "9:16",
    viewport: { width: Math.round(vpR.width), height: Math.round(vpR.height) },
    video: { url: $("#previewVideo").src },
    crop: $("#cropOverlayBox").classList.contains("hidden") ? null : rel(crp),
    subtitle: {
      ...rel(sub),
      text:         $("#subTextDisplay").textContent,
      fontFamily:   $("#fontDropdown").value,
      fontSize:     parseInt($("#rngFontSize").value),
      color:        $("#nativeTextColorPicker").value,
      outlineColor: $("#nativeOutlineColorPicker").value,
      outlineWidth: parseInt($("#rngOutlineWidth").value),
      boxBg:        $("#chkBoxBg").checked,
    },
    blurBoxes: Array.from(document.querySelectorAll("#blurContainer .blur-overlay-box")).map(box => ({
      ...rel(box),
      strength: box.querySelector(".blur-strength")
        ? parseInt(box.querySelector(".blur-strength").value)
        : 10,
    })),
    background: {
      mode:       $("#btnModeBlurBg").classList.contains("active") ? "blur" : "photo",
      blurPreset: activeBlur?.dataset.preset || "medium",
      opacity:    parseInt($("#rngBgOpacity").value) / 100,
    },
    tts: {
      voice: $("#voiceSelectDropdown").value,
      speed: parseFloat($("#rngVoiceSpeed").value),
      pitch: parseFloat($("#rngVoicePitch").value),
    },
  };
}
