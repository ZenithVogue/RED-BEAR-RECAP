/* ============================================================
   Red Bear Studio v2.0 Pro Engine
   ============================================================ */

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initMedia();
  initSidebarTabs();
  initOverlays();
  initVideoModeCards();
  initAudioSliders();
  initCaptionsControls();
  initSubtitleResizer();
});

function initTheme() {
  $("#themeToggleBtn").addEventListener("click", () => {
    const html = document.documentElement;
    const isDark = html.getAttribute("data-theme") === "dark";
    html.setAttribute("data-theme", isDark ? "light" : "dark");
    $("#themeToggleBtn").textContent = isDark ? "🌙 Dark" : "☀️ Light";
  });
}

function initMedia() {
  const fileInput = $("#fileInput");
  const previewVideo = $("#previewVideo");

  $("#btnBrowse").addEventListener("click", () => fileInput.click());
  $("#uploadDropzone").addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length) {
      previewVideo.src = URL.createObjectURL(e.target.files[0]);
      $("#mediaInputView").classList.add("hidden");
      $("#phonePreviewView").classList.remove("hidden");
    }
  });

  $("#btnFetch").addEventListener("click", () => {
    previewVideo.src = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";
    $("#mediaInputView").classList.add("hidden");
    $("#phonePreviewView").classList.remove("hidden");
  });

  $("#btnRemoveMedia").addEventListener("click", () => {
    previewVideo.pause();
    previewVideo.src = "";
    $("#phonePreviewView").classList.add("hidden");
    $("#mediaInputView").classList.remove("hidden");
  });

  $("#btnPlayToggle").addEventListener("click", () => {
    if (previewVideo.paused) {
      previewVideo.play();
      $("#btnPlayToggle").textContent = "❚❚";
    } else {
      previewVideo.pause();
      $("#btnPlayToggle").textContent = "▶";
    }
  });

  const chkMirror = $("#chkMirror");
  const chkAutoColor = $("#chkAutoColor");
  function applyFilters() {
    let t = chkMirror.checked ? "scaleX(-1)" : "none";
    let f = chkAutoColor.checked ? "saturate(1.4) contrast(1.2)" : "none";
    previewVideo.style.transform = t;
    previewVideo.style.filter = f;
  }
  chkMirror.addEventListener("change", applyFilters);
  chkAutoColor.addEventListener("change", applyFilters);
}

/* SIDEBAR TABS */
function initSidebarTabs() {
  $$(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".tab-btn").forEach(b => b.classList.remove("active"));
      $$(".tab-content").forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      $(`#${btn.dataset.tab}`).classList.add("active");
    });
  });
}

/* VIDEO MODE CARDS INTERACTIVITY */
function initVideoModeCards() {
  $$(".mode-card-item").forEach(card => {
    card.addEventListener("click", () => {
      $$(".mode-card-item").forEach(c => c.classList.remove("active"));
      card.classList.add("active");
      card.querySelector("input").checked = true;
    });
  });

  const subTextDisplay = $("#subTextDisplay");
  const captionPreviewText = $("#captionPreviewText");
  $$(".lang-btn[data-vlang]").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".lang-btn[data-vlang]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const lang = btn.dataset.vlang;
      let text = "ဒီနေရာမှာ စာတန်းထိုး ပေါ်မယ်";
      if (lang === "en") text = "Let's see the subtitle sample";
      else if (lang === "th") text = "ดูตัวอย่างคำบรรยาย";
      
      subTextDisplay.textContent = text;
      if (captionPreviewText) captionPreviewText.textContent = text;
    });
  });
}

/* AUDIO SLIDERS DYNAMIC INDICATORS */
function initAudioSliders() {
  const rngVoiceSpeed = $("#rngVoiceSpeed");
  const speedValText = $("#speedValText");
  if (rngVoiceSpeed) {
    rngVoiceSpeed.addEventListener("input", (e) => {
      speedValText.textContent = `${parseFloat(e.target.value).toFixed(1)}x`;
    });
  }

  const rngVoicePitch = $("#rngVoicePitch");
  const pitchValText = $("#pitchValText");
  if (rngVoicePitch) {
    rngVoicePitch.addEventListener("input", (e) => {
      pitchValText.textContent = parseFloat(e.target.value).toFixed(1);
    });
  }
}

/* CAPTIONS TAB CONTROLS WITH NATIVE COLOR PICKER POPUP */
function initCaptionsControls() {
  const subTextDisplay = $("#subTextDisplay");
  const captionPreviewText = $("#captionPreviewText");

  // Caption Width Slider (Bottom Positioned)
  $("#rngSubWidth").addEventListener("input", (e) => {
    const val = e.target.value;
    $("#captionWidthText").textContent = `${val}%`;
    $("#subtitleOverlay").style.width = `${val}%`;
  });

  // Font Dropdown
  $("#fontDropdown").addEventListener("change", (e) => {
    const font = e.target.value;
    subTextDisplay.style.fontFamily = `'${font}', sans-serif`;
    captionPreviewText.style.fontFamily = `'${font}', sans-serif`;
  });

  // Font Size Stepper
  const rngFontSize = $("#rngFontSize");
  const fontSizeText = $("#fontSizeText");
  function updateFontSize(val) {
    rngFontSize.value = val;
    fontSizeText.textContent = `${val}px`;
    subTextDisplay.style.fontSize = `${val}px`;
    captionPreviewText.style.fontSize = `${val}px`;
  }
  rngFontSize.addEventListener("input", (e) => updateFontSize(e.target.value));
  $("#btnFontSizeDec").addEventListener("click", () => updateFontSize(Math.max(12, parseInt(rngFontSize.value) - 1)));
  $("#btnFontSizeInc").addEventListener("click", () => updateFontSize(Math.min(32, parseInt(rngFontSize.value) + 1)));

  // Text Color Circles Swatches
  $$(".color-circle").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".color-circle").forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      const col = btn.dataset.color;
      $("#textColorIndicator").style.background = col;
      $("#nativeTextColorPicker").value = col;
      subTextDisplay.style.color = col;
      captionPreviewText.style.color = col;
    });
  });

  // Native Text Color Picker Popup Listener
  const nativeTextColorPicker = $("#nativeTextColorPicker");
  nativeTextColorPicker.addEventListener("input", (e) => {
    const col = e.target.value;
    $("#textColorIndicator").style.background = col;
    subTextDisplay.style.color = col;
    captionPreviewText.style.color = col;
  });

  // Native Outline Color Picker Popup Listener
  const nativeOutlineColorPicker = $("#nativeOutlineColorPicker");
  nativeOutlineColorPicker.addEventListener("input", (e) => {
    const col = e.target.value;
    $("#outlineColorIndicator").style.background = col;
    const w = $("#rngOutlineWidth").value;
    subTextDisplay.style.webkitTextStroke = `${w}px ${col}`;
    captionPreviewText.style.webkitTextStroke = `${w}px ${col}`;
  });

  // Outline Width Stepper
  const rngOutlineWidth = $("#rngOutlineWidth");
  const outlineWidthText = $("#outlineWidthText");
  function updateOutline(val) {
    rngOutlineWidth.value = val;
    outlineWidthText.textContent = `${val}px`;
    const col = nativeOutlineColorPicker.value;
    subTextDisplay.style.webkitTextStroke = `${val}px ${col}`;
    captionPreviewText.style.webkitTextStroke = `${val}px ${col}`;
  }
  rngOutlineWidth.addEventListener("input", (e) => updateOutline(e.target.value));
  $("#btnOutlineDec").addEventListener("click", () => updateOutline(Math.max(0, parseInt(rngOutlineWidth.value) - 1)));
  $("#btnOutlineInc").addEventListener("click", () => updateOutline(Math.min(8, parseInt(rngOutlineWidth.value) + 1)));

  // Box Background Toggle
  $("#chkBoxBg").addEventListener("change", (e) => {
    const bg = e.target.checked ? "rgba(30, 41, 59, 0.9)" : "transparent";
    $("#subtitleOverlay").style.background = bg;
  });
}

/* SUBTITLE RIGHT HANDLE WIDTH RESIZING LOGIC */
function initSubtitleResizer() {
  const subOverlay = $("#subtitleOverlay");
  const handleR = $("#subHandleR");
  const vp = $("#phoneViewport");
  const rngSubWidth = $("#rngSubWidth");
  const captionWidthText = $("#captionWidthText");

  let isResizing = false, startX, startW;

  handleR.addEventListener("mousedown", (e) => {
    isResizing = true;
    startX = e.clientX;
    startW = subOverlay.offsetWidth;
    e.stopPropagation();
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isResizing) return;
    let dx = e.clientX - startX;
    let newWidthPx = startW + (dx * 2);

    let pct = Math.round((newWidthPx / vp.clientWidth) * 100);
    pct = Math.max(30, Math.min(95, pct));

    subOverlay.style.width = `${pct}%`;
    if (rngSubWidth) rngSubWidth.value = pct;
    if (captionWidthText) captionWidthText.textContent = `${pct}%`;
  });

  document.addEventListener("mouseup", () => {
    isResizing = false;
  });
}

/* OVERLAYS LOGIC (BLUR & BOUNDARY DRAG) */
function initOverlays() {
  const vp = $("#phoneViewport");
  const blurContainer = $("#blurContainer");
  const subOverlay = $("#subtitleOverlay");
  let blurCount = 0;

  $("#btnToggleBlur").addEventListener("click", () => {
    if (blurCount >= 3) return;
    blurCount++;

    const box = document.createElement("div");
    box.className = "blur-overlay-box";
    box.innerHTML = `<div class="blur-close-btn">✕</div><div class="blur-resize-handle"></div>`;
    blurContainer.appendChild(box);

    box.querySelector(".blur-close-btn").addEventListener("click", () => {
      box.remove();
      blurCount--;
    });

    makeConstrainedDraggable(box, vp);
    makeResizable(box, vp);
  });

  makeConstrainedDraggable(subOverlay, vp);

  const cropBoxEl = $("#cropOverlayBox");
  $("#btnToggleCrop").addEventListener("click", () => cropBoxEl.classList.remove("hidden"));
  $("#btnResetCrop").addEventListener("click", () => cropBoxEl.classList.add("hidden"));

  initCropInteractivity();
}

function initCropInteractivity() {
  const cropBox = $("#cropBox");
  const vp = $("#phoneViewport");

  let isDrag = false, sX, sY, iL, iT;
  cropBox.addEventListener("mousedown", (e) => {
    if (e.target.classList.contains("crop-handle")) return;
    isDrag = true;
    sX = e.clientX;
    sY = e.clientY;
    iL = cropBox.offsetLeft;
    iT = cropBox.offsetTop;
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDrag) return;
    const maxL = vp.clientWidth - cropBox.offsetWidth;
    const maxT = vp.clientHeight - cropBox.offsetHeight;
    let nL = iL + (e.clientX - sX);
    let nT = iT + (e.clientY - sY);
    cropBox.style.left = `${Math.max(0, Math.min(maxL, nL))}px`;
    cropBox.style.top = `${Math.max(0, Math.min(maxT, nT))}px`;
  });

  document.addEventListener("mouseup", () => { isDrag = false; });

  $$(".crop-handle").forEach(handle => {
    let isResize = false, hType = handle.dataset.handle;
    let startX, startY, startL, startT, startW, startH;

    handle.addEventListener("mousedown", (e) => {
      isResize = true;
      startX = e.clientX;
      startY = e.clientY;
      startL = cropBox.offsetLeft;
      startT = cropBox.offsetTop;
      startW = cropBox.offsetWidth;
      startH = cropBox.offsetHeight;
      e.stopPropagation();
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isResize) return;
      let dx = e.clientX - startX;
      let dy = e.clientY - startY;

      let newL = startL, newT = startT, newW = startW, newH = startH;

      if (hType.includes("l")) {
        newL = Math.max(0, startL + dx);
        newW = startW - (newL - startL);
      }
      if (hType.includes("r")) {
        newW = Math.min(vp.clientWidth - startL, startW + dx);
      }
      if (hType.includes("t")) {
        newT = Math.max(0, startT + dy);
        newH = startH - (newT - startT);
      }
      if (hType.includes("b")) {
        newH = Math.min(vp.clientHeight - startT, startH + dy);
      }

      if (newW >= 50) {
        cropBox.style.left = `${newL}px`;
        cropBox.style.width = `${newW}px`;
      }
      if (newH >= 50) {
        cropBox.style.top = `${newT}px`;
        cropBox.style.height = `${newH}px`;
      }
    });

    document.addEventListener("mouseup", () => { isResize = false; });
  });
}

function makeConstrainedDraggable(el, container) {
  let isDrag = false, sX, sY, iL, iT;

  el.addEventListener("mousedown", (e) => {
    if (e.target.classList.contains("blur-resize-handle") || e.target.classList.contains("blur-close-btn") || e.target.classList.contains("sub-handle-r")) return;
    isDrag = true;
    sX = e.clientX;
    sY = e.clientY;
    iL = el.offsetLeft;
    iT = el.offsetTop;
    e.stopPropagation();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDrag) return;
    const maxL = container.clientWidth - el.offsetWidth;
    const maxT = container.clientHeight - el.offsetHeight;
    let nL = iL + (e.clientX - sX);
    let nT = iT + (e.clientY - sY);

    el.style.left = `${Math.max(0, Math.min(maxL, nL))}px`;
    el.style.top = `${Math.max(0, Math.min(maxT, nT))}px`;
    el.style.transform = "none";
  });

  document.addEventListener("mouseup", () => { isDrag = false; });
}

function makeResizable(el, container) {
  const handle = el.querySelector(".blur-resize-handle");
  let isResize = false, rX, rY, iW, iH;

  handle.addEventListener("mousedown", (e) => {
    isResize = true;
    rX = e.clientX;
    rY = e.clientY;
    iW = el.offsetWidth;
    iH = el.offsetHeight;
    e.stopPropagation();
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isResize) return;
    const maxW = container.clientWidth - el.offsetLeft;
    const maxH = container.clientHeight - el.offsetTop;
    let nW = iW + (e.clientX - rX);
    let nH = iH + (e.clientY - rY);

    el.style.width = `${Math.max(60, Math.min(maxW, nW))}px`;
    el.style.height = `${Math.max(30, Math.min(maxH, nH))}px`;
  });

  document.addEventListener("mouseup", () => { isResize = false; });
}
