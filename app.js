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

    mediaInputView.classList.add("hidden");
    phonePreviewView.classList.remove("hidden");
  }

  btnRemoveMedia.addEventListener("click", () => {
    previewVideo.pause();
    previewVideo.src = "";
    fileInput.value = "";
    linkInput.value = "";

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

/* ---------------- 4. Sidebar Tabs, Captions & Mirror/Color Logic ---------------- */
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

  // Mirror & Auto Color Toggles
  const chkMirror = $("#chkMirror");
  const chkAutoColor = $("#chkAutoColor");
  const previewVideo = $("#previewVideo");

  function updateVideoFilters() {
    let transforms = [];
    let filters = [];

    if (chkMirror.checked) transforms.push("scaleX(-1)");
    if (chkAutoColor.checked) filters.push("saturate(1.4) contrast(1.2) brightness(1.1)");

    previewVideo.style.transform = transforms.join(" ");
    previewVideo.style.filter = filters.join(" ");
  }

  chkMirror.addEventListener("change", updateVideoFilters);
  chkAutoColor.addEventListener("change", updateVideoFilters);

  // Captions Tab Controls (Opacity & Width)
  const rngSubOpacity = $("#rngSubOpacity");
  const subOpacityVal = $("#subOpacityVal");
  const rngSubWidth = $("#rngSubWidth");
  const subWidthVal = $("#subWidthVal");
  const subtitleOverlay = $("#subtitleOverlay");

  rngSubOpacity.addEventListener("input", (e) => {
    subOpacityVal.textContent = `${e.target.value}%`;
    subtitleOverlay.style.opacity = e.target.value / 100;
  });

  rngSubWidth.addEventListener("input", (e) => {
    subWidthVal.textContent = `${e.target.value}%`;
    subtitleOverlay.style.width = `${e.target.value}%`;
  });
}

/* ---------------- 5. Interactive Overlays (Multiple Blur Boxes & Functional Crop) ---------------- */
function initOverlaysAndEditing() {
  const btnToggleBlur = $("#btnToggleBlur");
  const btnToggleCrop = $("#btnToggleCrop");
  const blurBoxesContainer = $("#blurBoxesContainer");
  const cropOverlayBox = $("#cropOverlayBox");
  const subtitleOverlay = $("#subtitleOverlay");
  const phoneViewport = $("#phoneViewport");
  const previewVideo = $("#previewVideo");

  let blurBoxCount = 0;

  // Add Blur Box (Limit: 3)
  btnToggleBlur.addEventListener("click", () => {
    if (blurBoxCount >= 3) {
      alert("Blur box အများဆုံး ၃ ခုသာ ထည့်သွင်းနိုင်ပါသည်။");
      return;
    }
    blurBoxCount++;

    const box = document.createElement("div");
    box.className = "blur-overlay-box";
    box.innerHTML = `
      <div class="blur-close-btn">✕</div>
      <div class="blur-drag-handle">✛</div>
      <div class="blur-resize-handle"></div>
    `;
    blurBoxesContainer.appendChild(box);

    // Close Button
    box.querySelector(".blur-close-btn").addEventListener("click", () => {
      box.remove();
      blurBoxCount--;
    });

    // Make Drag & Bound inside Viewport
    let isDragging = false, startX, startY, initL, initT;
    box.addEventListener("mousedown", (e) => {
      if (e.target.classList.contains("blur-resize-handle") || e.target.classList.contains("blur-close-btn")) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      initL = box.offsetLeft;
      initT = box.offsetTop;
      e.stopPropagation();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const maxL = phoneViewport.clientWidth - box.offsetWidth;
      const maxT = phoneViewport.clientHeight - box.offsetHeight;

      box.style.left = `${Math.max(0, Math.min(maxL, initL + dx))}px`;
      box.style.top = `${Math.max(0, Math.min(maxT, initT + dy))}px`;
    });

    document.addEventListener("mouseup", () => { isDragging = false; });

    // Make Resizable
    const resizeHandle = box.querySelector(".blur-resize-handle");
    let isResizing = false, rX, rY, initW, initH;
    resizeHandle.addEventListener("mousedown", (e) => {
      isResizing = true;
      rX = e.clientX;
      rY = e.clientY;
      initW = box.offsetWidth;
      initH = box.offsetHeight;
      e.stopPropagation();
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isResizing) return;
      box.style.width = `${Math.max(50, initW + (e.clientX - rX))}px`;
      box.style.height = `${Math.max(30, initH + (e.clientY - rY))}px`;
    });

    document.addEventListener("mouseup", () => { isResizing = false; });
  });

  // Subtitle Overlay Boundary Dragging
  let isSubDragging = false, subStartX, subStartY, subInitL, subInitT;
  subtitleOverlay.addEventListener("mousedown", (e) => {
    isSubDragging = true;
    subStartX = e.clientX;
    subStartY = e.clientY;
    subInitL = subtitleOverlay.offsetLeft;
    subInitT = subtitleOverlay.offsetTop;
    e.stopPropagation();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isSubDragging) return;
    const dx = e.clientX - subStartX;
    const dy = e.clientY - subStartY;
    const maxL = phoneViewport.clientWidth - subtitleOverlay.offsetWidth;
    const maxT = phoneViewport.clientHeight - subtitleOverlay.offsetHeight;

    subtitleOverlay.style.left = `${Math.max(0, Math.min(maxL, subInitL + dx))}px`;
    subtitleOverlay.style.top = `${Math.max(0, Math.min(maxT, subInitT + dy))}px`;
    subtitleOverlay.style.transform = "none";
  });

  document.addEventListener("mouseup", () => { isSubDragging = false; });

  // Crop Activation
  btnToggleCrop.addEventListener("click", () => {
    cropOverlayBox.classList.remove("hidden");
    subtitleOverlay.classList.add("hidden");
  });

  $("#btnResetCrop").addEventListener("click", () => {
    cropOverlayBox.classList.add("hidden");
    subtitleOverlay.classList.remove("hidden");
    previewVideo.style.clipPath = "none";
  });

  // Functional Crop Box Dragging & Resizing
  const cropBox = $("#cropBox");
  let isCropDragging = false, cStartX, cStartY, cInitL, cInitT;

  cropBox.addEventListener("mousedown", (e) => {
    if (e.target.classList.contains("crop-corner")) return;
    isCropDragging = true;
    cStartX = e.clientX;
    cStartY = e.clientY;
    cInitL = cropBox.offsetLeft;
    cInitT = cropBox.offsetTop;
  });

  document.addEventListener("mousemove", (e) => {
    if (!isCropDragging) return;
    const dx = e.clientX - cStartX;
    const dy = e.clientY - cStartY;
    cropBox.style.left = `${cInitL + dx}px`;
    cropBox.style.top = `${cInitT + dy}px`;
  });

  document.addEventListener("mouseup", () => { isCropDragging = false; });
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
      const preset = card.dataset.preset;
      let blurVal = preset === "soft" ? "3px" : preset === "medium" ? "8px" : "15px";
      bgLayer.style.backdropFilter = `blur(${blurVal})`;
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
    bgLayer.style.backdropFilter = "none";
    photoPreviewWrap.classList.add("hidden");
    bgPhotoInput.value = "";
  });
}
