// Ruby — chat page logic
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const chatArea = $("chatArea");
  const messagesEl = $("messages");
  const emptyState = $("emptyState");
  const providerToggle = $("providerToggle");
  const disabledHint = $("disabledHint");
  const composerForm = $("composerForm");
  const messageInput = $("messageInput");
  const sendBtn = $("sendBtn");
  const attachBtn = $("attachBtn");
  const fileInput = $("fileInput");
  const micBtn = $("micBtn");
  const voiceOutToggle = $("voiceOutToggle");
  const newChatBtn = $("newChatBtn");
  const imagePreviewStrip = $("imagePreviewStrip");

  marked.setOptions({ breaks: true, gfm: true });

  // ---------------------------------------------------------------------
  // Icons + gem mark
  // ---------------------------------------------------------------------

  const GEM_INNER =
    '<polygon points="5,4 19,4 23,10 12,22 1,10" fill="url(#gemGrad)" stroke="#d4af37" stroke-width="0.6"/>' +
    '<polygon points="5,4 19,4 15.5,10 8.5,10" fill="#ff6b83" fill-opacity="0.5"/>' +
    '<polyline points="5,4 1,10 12,22" fill="none" stroke="#d4af37" stroke-width="0.5" opacity="0.6"/>' +
    '<polyline points="19,4 23,10 12,22" fill="none" stroke="#d4af37" stroke-width="0.5" opacity="0.6"/>' +
    '<line x1="1" y1="10" x2="23" y2="10" stroke="#d4af37" stroke-width="0.5" opacity="0.6"/>';

  function gemSVG(extraClass) {
    return `<svg viewBox="0 0 24 24" class="gem-mark ${extraClass || ""}" aria-hidden="true">${GEM_INNER}</svg>`;
  }

  const ICONS = {
    copy:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
    regen:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11A8 8 0 1 0 18 16"/><path d="M20 5v6h-6"/></svg>',
    speakerOn:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 8a5 5 0 0 1 0 8"/><path d="M19.5 5.5a9 9 0 0 1 0 13"/></svg>',
    speakerOff:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z"/><line x1="17" y1="9" x2="22" y2="14"/><line x1="22" y1="9" x2="17" y2="14"/></svg>',
  };

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------

  const state = {
    provider: localStorage.getItem("ruby_provider") || null,
    hasOpenAI: false,
    hasGemini: false,
    conversation: [],
    pendingImage: null, // { dataUrl, name }
    voiceOutEnabled: localStorage.getItem("ruby_voice_out") === "1",
    recognizing: false,
  };

  try {
    const saved = JSON.parse(localStorage.getItem("ruby_conversation") || "[]");
    if (Array.isArray(saved)) state.conversation = saved;
  } catch (e) {
    state.conversation = [];
  }

  function persistConversation() {
    localStorage.setItem("ruby_conversation", JSON.stringify(state.conversation));
  }

  // ---------------------------------------------------------------------
  // Scrolling
  // ---------------------------------------------------------------------

  function isNearBottom() {
    return chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight < 140;
  }
  function scrollToBottom(smooth) {
    chatArea.scrollTo({ top: chatArea.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }

  // ---------------------------------------------------------------------
  // Markdown + code block rendering
  // ---------------------------------------------------------------------

  function renderMarkdownInto(el, text) {
    el.innerHTML = marked.parse(text || "");
    el.querySelectorAll("pre").forEach((pre) => {
      const codeEl = pre.querySelector("code");
      let lang = "";
      if (codeEl) {
        const m = codeEl.className.match(/language-(\w+)/);
        if (m) lang = m[1];
        hljs.highlightElement(codeEl);
      }
      const wrap = document.createElement("div");
      wrap.className = "code-block-wrap";
      pre.replaceWith(wrap);
      wrap.appendChild(pre);
      if (lang) {
        const langLabel = document.createElement("span");
        langLabel.className = "code-lang";
        langLabel.textContent = lang;
        wrap.appendChild(langLabel);
      }
      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "copy-code-btn";
      copyBtn.textContent = "Copy";
      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(codeEl ? codeEl.textContent : pre.textContent).then(() => {
          copyBtn.textContent = "Copied";
          setTimeout(() => (copyBtn.textContent = "Copy"), 1400);
        });
      });
      wrap.appendChild(copyBtn);
    });
  }

  function scheduleRender(el, getText) {
    if (el._scheduled) return;
    el._scheduled = true;
    requestAnimationFrame(() => {
      el._scheduled = false;
      renderMarkdownInto(el, getText());
      if (isNearBottom()) scrollToBottom(false);
    });
  }

  // ---------------------------------------------------------------------
  // Message rendering
  // ---------------------------------------------------------------------

  function updateEmptyState() {
    emptyState.style.display = state.conversation.length === 0 ? "flex" : "none";
  }

  function renderUserRow(msg) {
    const row = document.createElement("div");
    row.className = "msg-row user";
    const avatar = document.createElement("div");
    avatar.className = "msg-avatar user-avatar";
    avatar.textContent = "You";
    const col = document.createElement("div");
    col.className = "msg-col";
    const bubble = document.createElement("div");
    bubble.className = "bubble plain";
    if (msg.image) {
      const img = document.createElement("img");
      img.src = msg.image;
      img.className = "msg-image";
      img.alt = "Attached image";
      bubble.appendChild(img);
    }
    if (msg.content) {
      const textNode = document.createElement("div");
      textNode.style.whiteSpace = "pre-wrap";
      textNode.textContent = msg.content;
      bubble.appendChild(textNode);
    }
    col.appendChild(bubble);
    col.appendChild(buildActions(msg.content));
    row.appendChild(avatar);
    row.appendChild(col);
    messagesEl.appendChild(row);
    return row;
  }

  function buildActions(getTextOrString, onRegen) {
    const actions = document.createElement("div");
    actions.className = "msg-actions";
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.innerHTML = `${ICONS.copy}<span>Copy</span>`;
    copyBtn.addEventListener("click", () => {
      const text = typeof getTextOrString === "function" ? getTextOrString() : getTextOrString;
      navigator.clipboard.writeText(text || "");
      copyBtn.querySelector("span").textContent = "Copied";
      setTimeout(() => (copyBtn.querySelector("span").textContent = "Copy"), 1400);
    });
    actions.appendChild(copyBtn);
    if (onRegen) {
      const regenBtn = document.createElement("button");
      regenBtn.type = "button";
      regenBtn.innerHTML = `${ICONS.regen}<span>Regenerate</span>`;
      regenBtn.addEventListener("click", onRegen);
      actions.appendChild(regenBtn);
    }
    return actions;
  }

  const PROVIDER_LABEL = { openai: "OpenAI", gemini: "Gemini" };

  function renderAssistantRow(initialText, providerUsed) {
    const row = document.createElement("div");
    row.className = "msg-row assistant";
    const avatar = document.createElement("div");
    avatar.className = "msg-avatar";
    avatar.innerHTML = gemSVG();
    const col = document.createElement("div");
    col.className = "msg-col";
    const name = document.createElement("span");
    name.className = "msg-name";
    name.textContent = "Ruby";
    if (providerUsed && PROVIDER_LABEL[providerUsed]) {
      const tag = document.createElement("span");
      tag.className = "provider-tag";
      tag.textContent = ` · ${PROVIDER_LABEL[providerUsed]}`;
      name.appendChild(tag);
    }
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    const content = document.createElement("div");
    content.className = "bubble-content";
    bubble.appendChild(content);
    col.appendChild(name);
    col.appendChild(bubble);
    row.appendChild(avatar);
    row.appendChild(col);
    messagesEl.appendChild(row);

    if (initialText === null) {
      content.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
    } else {
      renderMarkdownInto(content, initialText);
    }
    return { row, col, content };
  }

  function renderExisting() {
    messagesEl.innerHTML = "";
    state.conversation.forEach((msg, idx) => {
      if (msg.role === "user") {
        renderUserRow(msg);
      } else {
        const { col, content } = renderAssistantRow(msg.content, msg.provider);
        col.appendChild(buildActions(() => msg.content, () => regenerateFrom(idx)));
      }
    });
    updateEmptyState();
    scrollToBottom(false);
  }

  // ---------------------------------------------------------------------
  // Sending / streaming
  // ---------------------------------------------------------------------

  function stripMarkdownForSpeech(text) {
    return text
      .replace(/```[\s\S]*?```/g, " code block omitted. ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[#*_>~-]/g, "")
      .trim();
  }

  function speak(text) {
    if (!state.voiceOutEnabled || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const cleaned = stripMarkdownForSpeech(text);
    if (!cleaned) return;
    const utter = new SpeechSynthesisUtterance(cleaned);
    utter.rate = 1.0;
    window.speechSynthesis.speak(utter);
  }

  async function runAssistantTurn() {
    if (!state.provider) return;
    const providerAtSend = state.provider;
    const payload = state.conversation.map((m) => ({
      role: m.role,
      content: m.content,
      image: m.image || undefined,
    }));

    const { col, content } = renderAssistantRow(null, providerAtSend);
    scrollToBottom(true);

    let resp;
    try {
      resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerAtSend, messages: payload }),
      });
    } catch (err) {
      content.innerHTML = "";
      content.parentElement.classList.add("error-bubble");
      content.textContent = "Ruby couldn't reach the server. Is app.py still running?";
      return;
    }

    if (!resp.ok) {
      let errMsg = "Something went wrong.";
      try {
        const errData = await resp.json();
        errMsg = errData.error || errMsg;
      } catch (e) {
        /* ignore */
      }
      content.innerHTML = "";
      content.parentElement.classList.add("error-bubble");
      content.textContent = errMsg;
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let full = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      full += decoder.decode(value, { stream: true });
      scheduleRender(content, () => full);
    }
    renderMarkdownInto(content, full);

    const msgIndex = state.conversation.length;
    state.conversation.push({ role: "assistant", content: full, provider: providerAtSend });
    persistConversation();
    col.appendChild(buildActions(() => full, () => regenerateFrom(msgIndex)));

    if (isNearBottom()) scrollToBottom(true);
    speak(full);
  }

  function regenerateFrom(assistantIndex) {
    if (state.conversation[assistantIndex]?.role !== "assistant") return;
    state.conversation = state.conversation.slice(0, assistantIndex);
    persistConversation();
    renderExisting();
    runAssistantTurn();
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!state.provider) return;
    const text = messageInput.value.trim();
    const image = state.pendingImage ? state.pendingImage.dataUrl : null;
    if (!text && !image) return;

    state.conversation.push({ role: "user", content: text, image: image || undefined });
    persistConversation();
    renderUserRow(state.conversation[state.conversation.length - 1]);
    updateEmptyState();

    messageInput.value = "";
    autoResizeTextarea();
    clearPendingImage();
    scrollToBottom(true);

    await runAssistantTurn();
  }

  composerForm.addEventListener("submit", handleSend);

  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  });

  function autoResizeTextarea() {
    messageInput.style.height = "auto";
    messageInput.style.height = Math.min(messageInput.scrollHeight, 200) + "px";
  }
  messageInput.addEventListener("input", autoResizeTextarea);

  // ---------------------------------------------------------------------
  // Image attach (file picker, drag-and-drop, paste)
  // ---------------------------------------------------------------------

  function setPendingImage(dataUrl, name) {
    state.pendingImage = { dataUrl, name };
    imagePreviewStrip.classList.remove("hidden");
    imagePreviewStrip.innerHTML = "";
    const chip = document.createElement("div");
    chip.className = "image-preview-chip";
    const img = document.createElement("img");
    img.src = dataUrl;
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", clearPendingImage);
    chip.appendChild(img);
    chip.appendChild(removeBtn);
    imagePreviewStrip.appendChild(chip);
  }

  function clearPendingImage() {
    state.pendingImage = null;
    imagePreviewStrip.classList.add("hidden");
    imagePreviewStrip.innerHTML = "";
    fileInput.value = "";
  }

  function loadImageFile(file) {
    if (!file || !file.type.startsWith("image/")) return;
    if (file.size > 8 * 1024 * 1024) {
      alert("That image is a bit large — please pick one under 8MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPendingImage(reader.result, file.name);
    reader.readAsDataURL(file);
  }

  attachBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    if (fileInput.files && fileInput.files[0]) loadImageFile(fileInput.files[0]);
  });

  ["dragenter", "dragover"].forEach((evt) =>
    composerForm.addEventListener(evt, (e) => {
      e.preventDefault();
      composerForm.classList.add("drag-over");
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    composerForm.addEventListener(evt, (e) => {
      e.preventDefault();
      composerForm.classList.remove("drag-over");
    })
  );
  composerForm.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) loadImageFile(file);
  });

  messageInput.addEventListener("paste", (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        loadImageFile(item.getAsFile());
        break;
      }
    }
  });

  // ---------------------------------------------------------------------
  // Voice input (speech-to-text)
  // ---------------------------------------------------------------------

  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;

  if (!SpeechRecognitionCtor) {
    micBtn.disabled = true;
    micBtn.title = "Voice input isn't supported in this browser — try Chrome or Edge.";
    micBtn.style.opacity = "0.35";
  } else {
    micBtn.addEventListener("click", () => {
      if (state.recognizing) {
        recognition && recognition.stop();
        return;
      }
      recognition = new SpeechRecognitionCtor();
      recognition.lang = "en-US";
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.onresult = (e) => {
        let transcript = "";
        for (let i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript;
        messageInput.value = transcript;
        autoResizeTextarea();
      };
      recognition.onend = () => {
        state.recognizing = false;
        micBtn.classList.remove("mic-active");
      };
      recognition.onerror = () => {
        state.recognizing = false;
        micBtn.classList.remove("mic-active");
      };
      recognition.start();
      state.recognizing = true;
      micBtn.classList.add("mic-active");
    });
  }

  // ---------------------------------------------------------------------
  // Voice output (text-to-speech) toggle
  // ---------------------------------------------------------------------

  function renderVoiceOutBtn() {
    voiceOutToggle.innerHTML = state.voiceOutEnabled ? ICONS.speakerOn : ICONS.speakerOff;
    voiceOutToggle.classList.toggle("active", state.voiceOutEnabled);
    voiceOutToggle.title = state.voiceOutEnabled ? "Ruby will read replies aloud (click to mute)" : "Read replies aloud";
  }
  voiceOutToggle.addEventListener("click", () => {
    state.voiceOutEnabled = !state.voiceOutEnabled;
    localStorage.setItem("ruby_voice_out", state.voiceOutEnabled ? "1" : "0");
    if (!state.voiceOutEnabled && "speechSynthesis" in window) window.speechSynthesis.cancel();
    renderVoiceOutBtn();
  });
  renderVoiceOutBtn();

  // ---------------------------------------------------------------------
  // New chat
  // ---------------------------------------------------------------------

  newChatBtn.addEventListener("click", () => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    state.conversation = [];
    persistConversation();
    clearPendingImage();
    messageInput.value = "";
    autoResizeTextarea();
    renderExisting();
  });

  // Suggestion chips in the empty state
  document.querySelectorAll(".suggestion-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      messageInput.value = chip.dataset.prompt || chip.textContent;
      autoResizeTextarea();
      messageInput.focus();
    });
  });

  // ---------------------------------------------------------------------
  // Provider setup
  // ---------------------------------------------------------------------

  function setComposerEnabled(enabled) {
    messageInput.disabled = !enabled;
    sendBtn.disabled = !enabled;
    attachBtn.disabled = !enabled;
    messageInput.placeholder = enabled ? "Message Ruby..." : "Add an API key in Settings to start chatting";
  }

  function selectProvider(p) {
    state.provider = p;
    localStorage.setItem("ruby_provider", p);
    renderProviderToggle();
  }

  function renderProviderToggle() {
    providerToggle.innerHTML = "";
    const options = [
      { key: "openai", label: "OpenAI", has: state.hasOpenAI },
      { key: "gemini", label: "Gemini", has: state.hasGemini },
    ];
    options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = opt.label;
      if (opt.has) {
        btn.className = state.provider === opt.key ? "active" : "";
        btn.addEventListener("click", () => selectProvider(opt.key));
      } else {
        btn.disabled = true;
        btn.title = `Add a ${opt.label} key in Settings to enable this`;
        btn.addEventListener("click", () => (window.location.href = "/settings"));
      }
      providerToggle.appendChild(btn);
    });

    const anyKey = state.hasOpenAI || state.hasGemini;
    setComposerEnabled(Boolean(state.provider));
    disabledHint.classList.toggle("hidden", anyKey);
  }

  async function loadConfig() {
    try {
      const resp = await fetch("/api/config");
      const cfg = await resp.json();
      state.hasOpenAI = cfg.has_openai;
      state.hasGemini = cfg.has_gemini;
      if (!(state.provider === "openai" && state.hasOpenAI) && !(state.provider === "gemini" && state.hasGemini)) {
        state.provider = state.hasOpenAI ? "openai" : state.hasGemini ? "gemini" : null;
      }
    } catch (e) {
      state.hasOpenAI = false;
      state.hasGemini = false;
      state.provider = null;
    }
    renderProviderToggle();
  }

  // ---------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------

  renderExisting();
  loadConfig();
})();
