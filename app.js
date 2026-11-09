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
  $$(".lang-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".lang-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const lang = btn.dataset.vlang;
      if (lang === "my") subTextDisplay.textContent = "စာသားနမူနာကြည့်ရအောင်";
      else if (lang === "en") subTextDisplay.textContent = "Let's see the subtitle sample";
      else if (lang === "ja") subTextDisplay.textContent = "字幕サンプルを見てみましょう";
    });
  });

  // Subtitle Width Slider Control
  $("#rngSubWidth").addEventListener("input", (e) => {
    subTextDisplay.style.fontSize = `${10 + (e.target.value / 20)}px`;
  });
  $("#rngSubOpacity").addEventListener("input", (e) => {
    $("#subtitleOverlay").style.opacity = e.target.value / 100;
  });
}

/* STRICT BOUNDARY OVERLAYS (BLUR, SUBTITLE & CROP) */
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
  const cropBox = $("#cropOverlayBox");
  $("#btnToggleCrop").addEventListener("click", () => {
    cropBox.classList.remove("hidden");
  });
  $("#btnResetCrop").addEventListener("click", () => {
    cropBox.classList.add("hidden");
  });
  makeConstrainedDraggable($("#cropBox"), vp);
}

// BOUNDARY-LOCKED DRAG LOGIC (Strict Container Bounds)
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
