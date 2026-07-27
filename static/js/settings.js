// Ruby — settings page logic
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const openaiKeyInput = $("openaiKeyInput");
  const geminiKeyInput = $("geminiKeyInput");
  const openaiModelInput = $("openaiModelInput");
  const geminiModelInput = $("geminiModelInput");
  const saveBtn = $("saveBtn");
  const saveStatus = $("saveStatus");

  document.querySelectorAll("[data-toggle-visibility]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = $(btn.dataset.toggleVisibility);
      if (!target) return;
      const isPassword = target.type === "password";
      target.type = isPassword ? "text" : "password";
      btn.textContent = isPassword ? "Hide" : "Show";
    });
  });

  document.querySelectorAll("[data-clear]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const provider = btn.dataset.clear;
      const label = provider === "openai" ? "OpenAI" : "Gemini";
      if (!confirm(`Remove your ${label} key? You can add it again anytime.`)) return;
      try {
        await fetch("/api/clear-key", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider }),
        });
        window.location.reload();
      } catch (e) {
        alert("Couldn't remove the key — check that app.py is still running.");
      }
    });
  });

  saveBtn.addEventListener("click", async () => {
    const body = {
      openai_key: openaiKeyInput.value.trim(),
      gemini_key: geminiKeyInput.value.trim(),
      openai_model: openaiModelInput.value.trim(),
      gemini_model: geminiModelInput.value.trim(),
    };

    saveBtn.disabled = true;
    saveStatus.textContent = "Saving…";
    saveStatus.classList.remove("error");

    try {
      const resp = await fetch("/api/save-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error("save failed");
      const data = await resp.json();

      if (data.openai_masked) {
        openaiKeyInput.value = "";
        openaiKeyInput.placeholder = data.openai_masked;
      }
      if (data.gemini_masked) {
        geminiKeyInput.value = "";
        geminiKeyInput.placeholder = data.gemini_masked;
      }
      saveStatus.textContent = "Saved. Ruby's ready to chat with these settings.";
      setTimeout(() => {
        window.location.reload();
      }, 700);
    } catch (e) {
      saveStatus.textContent = "Couldn't save — check that app.py is still running, then try again.";
      saveStatus.classList.add("error");
    } finally {
      saveBtn.disabled = false;
    }
  });
})();
