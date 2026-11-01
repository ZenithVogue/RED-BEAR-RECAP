const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

const state = {
  page: "manual",
  step: 1,
  maxStep: 1,
  file: null,
  videoUrl: null,
  voice: "hero",
  pitch: 0,
  fontStyle: "noto-sans",
  quotaLeft: 1
};

document.addEventListener("DOMContentLoaded", () => {
  initNavigation();
  initWizardSteps();
  initUploadAndMedia();
  initFontAndVoiceSelections();
});

function initNavigation() {
  $$(".nav-item").forEach(item => {
    item.addEventListener("click", () => {
      $$(".nav-item").forEach(n => n.classList.remove("active"));
      item.classList.add("active");
      state.page = item.dataset.page;
      toast(`ပြောင်းလဲပြီးပါပြီ: ${item.textContent.trim()}`, "ok");
    });
  });
}

function initWizardSteps() {
  const nextBtn = $("#nextBtn");
  const prevBtn = $("#prevBtn");

  nextBtn.addEventListener("click", () => {
    if (state.step === 1 && !state.file) {
      toast("ကျေးဇူးပြု၍ ဗီဒီယိုဖိုင် တစ်ခုချင်းစီ ဦးစွာတင်ပါ", "error");
      return;
    }
    if (state.step < 4) {
      state.step++;
      updateWizardUI();
    }
  });

  prevBtn.addEventListener("click", () => {
    if (state.step > 1) {
      state.step--;
      updateWizardUI();
    }
  });
}

function updateWizardUI() {
  $$(".step-panel").forEach((panel, idx) => {
    panel.classList.toggle("active", idx + 1 === state.step);
  });
  $$(".step-dot").forEach((dot, idx) => {
    dot.classList.toggle("active", idx + 1 <= state.step);
  });
  $("#prevBtn").disabled = state.step === 1;
  $("#nextBtn").textContent = state.step === 4 ? "ပြီးဆုံးသည်" : "ဆက်လုပ်မည် (Next)";
}

function initUploadAndMedia() {
  const dropzone = $("#dropzone");
  const fileInput = $("#videoFileInput");
  const browseBtn = $("#browseBtn");
  const previewBox = $("#videoPreviewBox");
  const sourceVideo = $("#sourceVideo");
  const reselectBtn = $("#reselectBtn");

  browseBtn.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("click", () => fileInput.click());

  dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.style.borderColor = "var(--primary)"; });
  dropzone.addEventListener("dragleave", () => { dropzone.style.borderColor = "var(--border)"; });
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) handleVideoFile(e.dataTransfer.files[0]);
  });

  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length) handleVideoFile(e.target.files[0]);
  });

  reselectBtn.addEventListener("click", () => {
    state.file = null;
    sourceVideo.src = "";
    previewBox.classList.add("hidden");
    dropzone.classList.remove("hidden");
  });

  function handleVideoFile(file) {
    state.file = file;
    state.videoUrl = URL.createObjectURL(file);
    sourceVideo.src = state.videoUrl;
    dropzone.classList.add("hidden");
    previewBox.classList.remove("hidden");
    toast("✓ ဗီဒီယိုဖိုင် အောင်မြင်စွာ တင်ပြီးပါပြီ", "ok");
  }
}

function initFontAndVoiceSelections() {
  // Voice Persona selection
  const voiceCards = $$(".voice-card");
  voiceCards.forEach(card => {
    card.addEventListener("click", () => {
      voiceCards.forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      state.voice = card.dataset.voice;
    });
  });

  // Font Style selection
  const fontCards = $$(".font-option-card");
  fontCards.forEach(card => {
    card.addEventListener("click", () => {
      fontCards.forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      state.fontStyle = card.dataset.font;
      const chip = $("#fontChip");
      if (chip) chip.textContent = state.fontStyle === "noto-sans" ? "Noto Sans" : "Pyidaungsu";
      toast("✓ စာတန်းထိုး ဖောင့်ပုံစံ ပြောင်းလဲပြီးပါပြီ", "ok");
    });
  });

  // Pitch Range
  const pitchRange = $("#pitchRange");
  const pitchVal = $("#pitchVal");
  if (pitchRange) {
    pitchRange.addEventListener("input", (e) => {
      state.pitch = e.target.value;
      pitchVal.textContent = `${state.pitch} Hz`;
    });
  }
}

function toast(msg, type = "ok") {
  const container = $("#toastContainer");
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}
