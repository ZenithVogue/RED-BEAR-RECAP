const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

document.addEventListener("DOMContentLoaded", () => {
  // Theme Toggle Functionality (Dark / Light Mode with distinct shadow & colors)
  const themeToggleBtn = $("#themeToggleBtn");
  const htmlElement = document.documentElement;

  themeToggleBtn.addEventListener("click", () => {
    const currentTheme = htmlElement.getAttribute("data-theme");
    const newTheme = currentTheme === "light" ? "dark" : "light";
    htmlElement.setAttribute("data-theme", newTheme);
    themeToggleBtn.textContent = newTheme === "dark" ? "☀️ Light" : "🌙 Dark";
    showToast(`Theme သို့ ပြောင်းပြီးပါပြီ: ${newTheme.toUpperCase()}`);
  });

  // Auth Simulation (Login / Create Account)
  $("#loginBtn").addEventListener("click", () => {
    simulateAuth("user@gmail.com");
  });

  $("#registerBtn").addEventListener("click", () => {
    simulateAuth("newbie_creator@gmail.com");
  });

  function simulateAuth(email) {
    $("#authBox").classList.add("hidden");
    $("#userInfo").classList.remove("hidden");
    $("#userEmailDisplay").textContent = email;
    showToast("✓ အောင်မြင်စွာ အကောင့်ဝင်ရောက်ပြီးပါပြီ");
  }

  // File Upload & Preview Handling
  const browseBtn = $("#browseBtn");
  const fileInput = $("#videoFileInput");
  const dropzone = $("#dropzone");
  const previewContainer = $("#videoPreviewContainer");
  const sourceVideoPreview = $("#sourceVideoPreview");
  const videoFileName = $("#videoFileName");
  const removeVideoBtn = $("#removeVideoBtn");

  browseBtn.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length) {
      handleSelectedFile(e.target.files[0]);
    }
  });

  function handleSelectedFile(file) {
    const videoUrl = URL.createObjectURL(file);
    sourceVideoPreview.src = videoUrl;
    videoFileName.textContent = file.name;
    dropzone.classList.add("hidden");
    previewContainer.classList.remove("hidden");
    showToast("✓ ဗီဒီယိုဖိုင် အောင်မြင်စွာ တင်ပြီး Preview ထွက်လာပါပြီ");
  }

  removeVideoBtn.addEventListener("click", () => {
    sourceVideoPreview.src = "";
    fileInput.value = "";
    previewContainer.classList.add("hidden");
    dropzone.classList.remove("hidden");
    showToast("🗑️ ဗီဒီယိုဖိုင် ဖယ်ရှားပြီးပါပြီ");
  });

  // Paste URL Button & RedNote / TikTok / YouTube Link Handling
  $("#pasteBtn").addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      $("#urlInput").value = text;
      showToast("✓ Link ကူးယူပြီးပါပြီ");
    } catch (err) {
      showToast("Link ကူးယူ၍မရပါ။ Clipboard ခွင့်ပြုချက်လိုပါသည်။");
    }
  });

  $("#fetchBtn").addEventListener("click", () => {
    const linkVal = $("#urlInput").value.trim();
    if (!linkVal) {
      showToast("⚠️ ကျေးဇူးပြု၍ Link ထည့်ပါ");
      return;
    }
    if (linkVal.includes("xiaohongshu") || linkVal.includes("rednote") || linkVal.includes("xhslink")) {
      showToast("🌸 RedNote (小红书) Link ကို အောင်မြင်စွာ ဆွဲယူပြီးပါပြီ!");
    } else if (linkVal.includes("tiktok")) {
      showToast("🎵 TikTok Link ကို အောင်မြင်စွာ ဆွဲယူပြီးပါပြီ!");
    } else if (linkVal.includes("youtube") || linkVal.includes("youtu.be")) {
      showToast("📺 YouTube Link ကို အောင်မြင်စွာ ဆွဲယူပြီးပါပြီ!");
    } else {
      showToast("🔗 Link အချက်အလက်များကို ဆွဲယူနေပါပြီ...");
    }
  });

  // Ratio Buttons Selection
  $$(".ratio-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".ratio-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  // Language Buttons Selection
  $$(".lang-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".lang-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  // Zoom Range Change
  const zoomRange = $("#zoomRange");
  const zoomVal = $("#zoomVal");
  zoomRange.addEventListener("input", (e) => {
    zoomVal.textContent = `${e.target.value}%`;
  });

  // Submit Action
  $("#submitBtn").addEventListener("click", () => {
    showToast("🚀 လုပ်ဆောင်ချက် စတင်နေပါပြီ...");
  });
});

function showToast(msg) {
  const container = $("#toastContainer");
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}
