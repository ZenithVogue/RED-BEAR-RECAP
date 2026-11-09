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
  initVideoLanguageSwitch();
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

  // Mirror & Auto Color Filter
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

/* SIDEBAR TABS & VIDEO LANGUAGE SWITCH */
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

function initVideoLanguageSwitch() {
  const subTextDisplay = $("#subTextDisplay");
  $$(".lang-btn[data-vlang]").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".lang-btn[data-vlang]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const lang = btn.dataset.vlang;
      if (lang === "my") subTextDisplay.textContent = "စာသားနမူနာကြည့်ရအောင်";
      else if (lang === "en") subTextDisplay.textContent = "Let's see the subtitle sample";
      else if (lang === "ja") subTextDisplay.textContent = "字幕サンプルを見てみましょう";
    });
  });

  // Subtitle Width Slider Control only
  $("#rngSubWidth").addEventListener("input", (e) => {
    $("#subtitleOverlay").style.width = `${e.target.value}%`;
  });

  // Font Style Switcher
  $$(".font-card").forEach(card => {
    card.addEventListener("click", () => {
      $$(".font-card").forEach(c => c.classList.remove("active"));
      card.classList.add("active");
      subTextDisplay.style.fontFamily = `'${card.dataset.font}', sans-serif`;
    });
  });
}

/* STRICT BOUNDARY OVERLAYS (BLUR, SUBTITLE & CROP WITH CORNER RESIZING) */
function initOverlays() {
  const vp = $("#phoneViewport");
  const blurContainer = $("#blurContainer");
  const subOverlay = $("#subtitleOverlay");
  let blurCount = 0;

  // Blur Box Adder (Limit 3, Constrained inside Viewport)
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

  // Subtitle Draggable (Constrained)
  makeConstrainedDraggable(subOverlay, vp);

  // Crop Toggle & Reset
  const cropBoxEl = $("#cropOverlayBox");
  $("#btnToggleCrop").addEventListener("click", () => {
    cropBoxEl.classList.remove("hidden");
  });
  $("#btnResetCrop").addEventListener("click", () => {
    cropBoxEl.classList.add("hidden");
  });

  // Crop Box Dragging and Corner Resizing
  initCropInteractivity();
}

// CROP CORNER RESIZING & DRAGGING LOGIC
function initCropInteractivity() {
  const cropBox = $("#cropBox");
  const vp = $("#phoneViewport");

  // Move Crop Box
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

  // 4-Corner Resizing Handles
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

// BOUNDARY-LOCKED DRAG LOGIC
function makeConstrainedDraggable(el, container) {
  let isDrag = false, sX, sY, iL, iT;

  el.addEventListener("mousedown", (e) => {
    if (e.target.classList.contains("blur-resize-handle") || e.target.classList.contains("blur-close-btn")) return;
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
