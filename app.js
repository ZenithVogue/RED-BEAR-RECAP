const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

document.addEventListener("DOMContentLoaded", () => {
  // File Upload Handling
  const browseBtn = $("#browseBtn");
  const fileInput = $("#videoFileInput");
  const dropzone = $("#dropzone");

  browseBtn.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length) {
      showToast(`✓ ဖိုင်တင်ပြီးပါပြီ: ${e.target.files[0].name}`);
    }
  });

  // Paste URL Button
  $("#pasteBtn").addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      $("#urlInput").value = text;
      showToast("✓ Link ကူးယူပြီးပါပြီ");
    } catch (err) {
      showToast("Link ကူးယူ၍မရပါ");
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
