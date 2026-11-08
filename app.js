const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

document.addEventListener("DOMContentLoaded", () => {
  initThemeSwitcher();
  initAuthFlow();
  initMediaAcquisition();
  initTabsAndControls();
  initOverlaysAndEditing();
});

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

function initMediaAcquisition() {
  const fileInput = $("#fileInput");
  const btnBrowse = $("#btnBrowse");
  const uploadDropzone = $("#uploadDropzone");
  const linkInput = $("#linkInput");
  const btnPaste = $("#btnPaste");
  const btnFetch = $("#btnFetch");

  const mediaInputBox = $("#mediaInputBox");
  const phonePreviewContainer = $("#phonePreviewContainer");
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

    mediaInputBox.classList.add("hidden");
    phonePreviewContainer.classList.remove("hidden");
  }

  btnRemoveMedia.addEventListener("click", () => {
    previewVideo.pause();
    previewVideo.src = "";
    fileInput.value = "";
    linkInput.value = "";

    phonePreviewContainer.classList.add("hidden");
    mediaInputBox.classList.remove("hidden");
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

function initOverlaysAndEditing() {
  const btnToggleBlur = $("#btnToggleBlur");
  const btnToggleCrop = $("#btnToggleCrop");
  const btnConfirmChanges = $("#btnConfirmChanges");

  const blurOverlayBox = $("#blurOverlayBox");
  const blurSliderBar = $("#blurSliderBar");
  const btnCloseBlur = $("#btnCloseBlur");
  const rngBlurStrength = $("#rngBlurStrength");
  const blurValText = $("#blurValText");

  const cropOverlayBox = $("#cropOverlayBox");
  const subtitleOverlay = $("#subtitleOverlay");

  btnToggleBlur.addEventListener("click", () => {
    blurOverlayBox.classList.remove("hidden");
    blurSliderBar.classList.remove("hidden");
    cropOverlayBox.classList.add("hidden");
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

  btnToggleCrop.addEventListener("click", () => {
    cropOverlayBox.classList.remove("hidden");
    blurOverlayBox.classList.add("hidden");
    blurSliderBar.classList.add("hidden");
    subtitleOverlay.classList.add("hidden");
  });

  $("#btnResetCrop").addEventListener("click", () => {
    cropOverlayBox.classList.add("hidden");
    subtitleOverlay.classList.remove("hidden");
  });

  btnConfirmChanges.addEventListener("click", () => {
    cropOverlayBox.classList.add("hidden");
    blurOverlayBox.classList.add("hidden");
    blurSliderBar.classList.add("hidden");
    subtitleOverlay.classList.remove("hidden");
  });
}
