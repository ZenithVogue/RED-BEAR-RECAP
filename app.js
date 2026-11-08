/* ============================================================
   Red Bear Studio v2.0 Pro Dynamic Engine
   ============================================================ */

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

document.addEventListener("DOMContentLoaded", () => {
  initThemeSwitcher();
  initAuthFlow();
  initMediaAcquisition();
  initTabsAndControls();
  initOverlaysAndEditing();
  initBackgroundControls();
});

/* ---------------- 1. Theme Switcher ---------------- */
function initThemeSwitcher() {
  const themeToggleBtn = $("#themeToggleBtn");
  const htmlElement = document.documentElement;

  themeToggleBtn.addEventListener("click", () => {
    const currentTheme = htmlElement.getAttribute("data-theme");
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    htmlElement.setAttribute("data-theme", newTheme);
    themeToggleBtn.textContent = newTheme === "dark" ? "☀️ Light" : "🌙 Dark";
  });
}

/* ---------------- 2. Auth Flow Simulation ---------------- */
function initAuthFlow() {
  const btnLogin = $("#btnLogin");
  const btnSignup = $("#btnSignup");
  const loggedOutAuth = $("#loggedOutAuth");
  const loggedInAuth = $("#loggedInAuth");
  const leftQuotaCard = $("#leftQuotaCard");
  const userEmailLabel = $("#userEmailLabel");

  btnLogin.addEventListener("click", () => authenticateUser("user@gmail.com"));
  btnSignup.addEventListener("click", () => authenticateUser("newbie_creator@gmail.com"));

  function authenticateUser(email) {
    loggedOutAuth.classList.add("hidden");
    loggedInAuth.classList.remove("hidden");
    leftQuotaCard.classList.remove("hidden");
    userEmailLabel.textContent = email;
  }
}

/* ---------------- 3. Media Ingestion & View Replacement Inside Blue Box ---------------- */
function initMediaAcquisition() {
  const fileInput = $("#fileInput");
  const btnBrowse = $("#btnBrowse");
  const uploadDropzone = $("#uploadDropzone");
  const linkInput = $("#linkInput");
  const btnPaste = $("#btnPaste");
  const btnFetch = $("#btnFetch");

  const mediaInputView = $("#mediaInputView");
  const phonePreviewView = $("#phonePreviewView");
  const previewVideo = $("#previewVideo");
  const activeFileName = $("#activeFileName");
  const btnRemoveMedia = $("#btnRemoveMedia");

  const btnPlayToggle = $("#btnPlayToggle");
  const videoProgress = $("#videoProgress");
  const timeReadout = $("#timeReadout");

  btnBrowse.addEventListener("click", () => fileInput.click());
  uploadDropzone.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length) {
      loadMediaStream(e.target.files[0]);
    }
  });

  btnPaste.addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      linkInput.value = text;
    } catch (_) {}
  });

  btnFetch.addEventListener("click", () => {
    const url = linkInput.value.trim();
    if (!url) return;
    const sampleStream = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";
    loadMediaStream(sampleStream, "social_media_video.mp4");
  });

  function loadMediaStream(source, name) {
    const streamUrl = typeof source === "string" ? source : URL.createObjectURL(source);
    const fileName = name || (source.name ? source.name : "video.mp4");

    previewVideo.src = streamUrl;
    activeFileName.textContent = fileName;

    // Direct View Replacement INSIDE the Blue Container Box
    mediaInputView.classList.add("hidden");
    phonePreviewView.classList.remove("hidden");
  }

  btnRemoveMedia.addEventListener("click", () => {
    previewVideo.pause();
    previewVideo.src = "";
    fileInput.value = "";
    linkInput.value = "";

    // Revert View INSIDE the Blue Container Box
    phonePreviewView.classList.add("hidden");
    mediaInputView.classList.remove("hidden");
  });

  btnPlayToggle.addEventListener("click", () => {
    if (previewVideo.paused) {
      previewVideo.play();
      btnPlayToggle.textContent = "❚❚";
    } else {
      previewVideo.pause();
      btnPlayToggle.textContent = "▶";
    }
  });

  previewVideo.addEventListener("timeupdate", () => {
    if (previewVideo.duration) {
      const pct = (previewVideo.currentTime / previewVideo.duration) * 100;
      videoProgress.value = pct;
      timeReadout.textContent = `${formatTime(previewVideo.currentTime)} / ${formatTime(previewVideo.duration)}`;
    }
  });

  videoProgress.addEventListener("input", (e) => {
    if (previewVideo.duration) {
      previewVideo.currentTime = (e.target.value / 100) * previewVideo.duration;
    }
  });

  function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec < 10 ? "0" : ""}${sec}`;
  }
}

/* ---------------- 4. Fixed Width Sidebar Tabs & Config Controls ---------------- */
function initTabsAndControls() {
  $$(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".tab-btn").forEach(b => b.classList.remove("active"));
      $$(".tab-content").forEach(c => c.classList.remove("active"));

      btn.classList.add("active");
      $(`#${btn.dataset.tab}`).classList.add("active");
    });
  });

  $$(".ratio-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".ratio-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  $$(".lang-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".lang-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  const subTextDisplay = $("#subTextDisplay");
  $$(".font-card").forEach(card => {
    card.addEventListener("click", () => {
      $$(".font-card").forEach(c => c.classList.remove("active"));
      card.classList.add("active");
      subTextDisplay.style.fontFamily = `'${card.dataset.font}', sans-serif`;
    });
  });

  const rngZoom = $("#rngZoom");
  const zoomVal = $("#zoomVal");
  rngZoom.addEventListener("input", (e) => {
    zoomVal.textContent = `${e.target.value}%`;
  });
}

/* ---------------- 5. Interactive Overlays (Blur & Functional Crop) ---------------- */
function initOverlaysAndEditing() {
  const btnToggleBlur = $("#btnToggleBlur");
  const btnToggleCrop = $("#btnToggleCrop");

  const blurOverlayBox = $("#blurOverlayBox");
  const blurSliderBar = $("#blurSliderBar");
  const btnCloseBlur = $("#btnCloseBlur");
  const rngBlurStrength = $("#rngBlurStrength");
  const blurValText = $("#blurValText");
  const blurResizeHandle = $("#blurResizeHandle");

  const cropOverlayBox = $("#cropOverlayBox");
  const subtitleOverlay = $("#subtitleOverlay");
  const previewVideo = $("#previewVideo");

  // Blur Activation
  btnToggleBlur.addEventListener("click", () => {
    blurOverlayBox.classList.remove("hidden");
    blurSliderBar.classList.remove("hidden");
    cropOverlayBox.classList.add("hidden");
    subtitleOverlay.classList.remove("hidden");
  });

  btnCloseBlur.addEventListener("click", () => {
    blurOverlayBox.classList.add("hidden");
    blurSliderBar.classList.add("hidden");
  });

  rngBlurStrength.addEventListener("input", (e) => {
    blurValText.textContent = e.target.value;
    blurOverlayBox.style.backdropFilter = `blur(${e.target.value / 2}px)`;
  });

  $("#btnBlurDec").addEventListener("click", () => {
    if (rngBlurStrength.value > 0) {
      rngBlurStrength.value--;
      rngBlurStrength.dispatchEvent(new Event("input"));
    }
  });

  $("#btnBlurInc").addEventListener("click", () => {
    if (rngBlurStrength.value < 50) {
      rngBlurStrength.value++;
      rngBlurStrength.dispatchEvent(new Event("input"));
    }
  });

  // Make Blur Box Draggable
  let isDraggingBlur = false, startX, startY, initialLeft, initialTop;

  blurOverlayBox.addEventListener("mousedown", (e) => {
    if (e.target === blurResizeHandle || e.target === btnCloseBlur) return;
    isDraggingBlur = true;
    startX = e.clientX;
    startY = e.clientY;
    initialLeft = blurOverlayBox.offsetLeft;
    initialTop = blurOverlayBox.offsetTop;
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDraggingBlur) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    blurOverlayBox.style.left = `${initialLeft + dx}px`;
    blurOverlayBox.style.top = `${initialTop + dy}px`;
  });

  document.addEventListener("mouseup", () => { isDraggingBlur = false; });

  // Make Blur Box Resizable via Circle Handle
  let isResizingBlur = false, rStartX, rStartY, startW, startH;

  blurResizeHandle.addEventListener("mousedown", (e) => {
    isResizingBlur = true;
    rStartX = e.clientX;
    rStartY = e.clientY;
    startW = blurOverlayBox.offsetWidth;
    startH = blurOverlayBox.offsetHeight;
    e.stopPropagation();
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isResizingBlur) return;
    const dw = e.clientX - rStartX;
    const dh = e.clientY - rStartY;
    blurOverlayBox.style.width = `${Math.max(60, startW + dw)}px`;
    blurOverlayBox.style.height = `${Math.max(40, startH + dh)}px`;
  });

  document.addEventListener("mouseup", () => { isResizingBlur = false; });

  // Crop Activation (Temporarily Hides Blur & Subtitles)
  btnToggleCrop.addEventListener("click", () => {
    cropOverlayBox.classList.remove("hidden");
    blurOverlayBox.classList.add("hidden");
    blurSliderBar.classList.add("hidden");
    subtitleOverlay.classList.add("hidden");
  });

  $("#btnResetCrop").addEventListener("click", () => {
    cropOverlayBox.classList.add("hidden");
    subtitleOverlay.classList.remove("hidden");
    previewVideo.style.clipPath = "none";
  });
}

/* ---------------- 6. Background Controls (Blur BG & Photo BG) ---------------- */
function initBackgroundControls() {
  const btnModeBlurBg = $("#btnModeBlurBg");
  const btnModePhotoBg = $("#btnModePhotoBg");
  const panelBlurBg = $("#panelBlurBg");
  const panelPhotoBg = $("#panelPhotoBg");

  const bgPhotoInput = $("#bgPhotoInput");
  const btnUploadBgPhoto = $("#btnUploadBgPhoto");
  const photoPreviewWrap = $("#photoPreviewWrap");
  const photoThumb = $("#photoThumb");
  const rngBgOpacity = $("#rngBgOpacity");
  const opacityValText = $("#opacityValText");
  const bgLayer = $("#bgLayer");

  btnModeBlurBg.addEventListener("click", () => {
    btnModeBlurBg.classList.add("active");
    btnModePhotoBg.classList.remove("active");
    panelBlurBg.classList.remove("hidden");
    panelPhotoBg.classList.add("hidden");
  });

  btnModePhotoBg.addEventListener("click", () => {
    btnModePhotoBg.classList.add("active");
    btnModeBlurBg.classList.remove("active");
    panelPhotoBg.classList.remove("hidden");
    panelBlurBg.classList.add("hidden");
  });

  $$(".blur-preset-card").forEach(card => {
    card.addEventListener("click", () => {
      $$(".blur-preset-card").forEach(c => c.classList.remove("active"));
      card.classList.add("active");
    });
  });

  btnUploadBgPhoto.addEventListener("click", () => bgPhotoInput.click());

  bgPhotoInput.addEventListener("change", (e) => {
    if (e.target.files.length) {
      const url = URL.createObjectURL(e.target.files[0]);
      photoThumb.style.backgroundImage = `url(${url})`;
      bgLayer.style.backgroundImage = `url(${url})`;
      photoPreviewWrap.classList.remove("hidden");
    }
  });

  rngBgOpacity.addEventListener("input", (e) => {
    opacityValText.textContent = `${e.target.value}%`;
    bgLayer.style.opacity = e.target.value / 100;
  });

  $("#btnClearBg").addEventListener("click", () => {
    bgLayer.style.backgroundImage = "none";
    photoPreviewWrap.classList.add("hidden");
    bgPhotoInput.value = "";
  });
}
