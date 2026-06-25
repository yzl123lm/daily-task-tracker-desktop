function initCapabilityModule() {
  const api = window.electronAPI;
  const btn = document.getElementById("topbarCapabilityBtn");
  const dialog = document.getElementById("aiCapabilityDialog");
  const closeBtn = document.getElementById("aiCapabilityDialogClose");
  const form = document.getElementById("aiCapabilityForm");
  const routingEl = document.getElementById("capRoutingMode");
  const modularSections = document.querySelectorAll("[data-cap-modular-only]");
  const unifiedHint = document.getElementById("capUnifiedHint");
  const ttsEngineEl = document.getElementById("capTtsEngineSelect");
  const ttsModelEl = document.getElementById("capTtsModel");
  const speechTabs = Array.from(document.querySelectorAll(".cap-speech-tab[data-speech-tab]"));
  const speechPanels = Array.from(document.querySelectorAll(".cap-speech-tab-panel[data-speech-panel]"));
  const speechAsrToggleWrap = document.getElementById("capSpeechAsrToggleWrap");
  const speechTtsToggleWrap = document.getElementById("capSpeechTtsToggleWrap");
  const navItems = Array.from(document.querySelectorAll(".cap-nav-item[data-cap-target]"));
  const panels = Array.from(document.querySelectorAll(".cap-panel[data-cap-panel]"));

  if (!api || !btn || !dialog || !form) {
    return;
  }

  function asrModelDisplayLabel() {
    const preset = document.getElementById("capAsrModelPreset");
    const model = document.getElementById("capAsrModel");
    const presetVal = String(preset?.value || "").trim();
    if (presetVal && preset) {
      const opt = Array.from(preset.options).find((o) => o.value === presetVal);
      if (opt?.textContent) {
        return opt.textContent.replace(/（[^）]+）$/, "").trim();
      }
    }
    return String(model?.value || "").trim() || "—";
  }

  function asrLanguageDisplayLabel() {
    const langEl = document.getElementById("capAsrLanguage");
    if (!langEl) {
      return "—";
    }
    const v = String(langEl.value || "").trim();
    if (!v) {
      return "自动识别";
    }
    const opt = Array.from(langEl.options || []).find((o) => o.value === v);
    if (opt?.textContent) {
      return opt.textContent.trim();
    }
    return v;
  }

  function ensureAsrLanguageOption(value) {
    const langEl = document.getElementById("capAsrLanguage");
    const v = String(value || "").trim();
    if (!langEl || !v) {
      return;
    }
    const has = Array.from(langEl.options).some((o) => o.value === v);
    if (!has) {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      langEl.appendChild(opt);
    }
  }

  function updateSpeechStatusCards() {
    const asrEnabled = document.getElementById("capAsrEnabled")?.checked !== false;
    const ttsEnabled = !!document.getElementById("capTtsEnabled")?.checked;
    const speakReply = !!document.getElementById("capTtsSpeakReply")?.checked;
    const asrStatusLabel = document.getElementById("capSpeechAsrStatusLabel");
    const asrStatusDot = document.getElementById("capSpeechAsrStatusDot");
    const asrModelLabel = document.getElementById("capSpeechAsrModelLabel");
    const asrLangLabel = document.getElementById("capSpeechAsrLangLabel");
    const ttsStatusLabel = document.getElementById("capSpeechTtsStatusLabel");
    const ttsStatusDot = document.getElementById("capSpeechTtsStatusDot");
    const ttsVoiceLabel = document.getElementById("capSpeechTtsVoiceLabel");
    const ttsSpeakLabel = document.getElementById("capSpeechTtsSpeakLabel");
    if (asrStatusLabel) {
      asrStatusLabel.textContent = asrEnabled ? "ASR 已启用" : "ASR 未启用";
    }
    if (asrStatusDot) {
      asrStatusDot.classList.toggle("is-on", asrEnabled);
    }
    if (asrModelLabel) {
      asrModelLabel.textContent = asrModelDisplayLabel();
    }
    if (asrLangLabel) {
      asrLangLabel.textContent = asrLanguageDisplayLabel();
    }
    if (ttsStatusLabel) {
      ttsStatusLabel.textContent = ttsEnabled ? "TTS 已启用" : "TTS 未启用";
    }
    if (ttsStatusDot) {
      ttsStatusDot.classList.toggle("is-on", ttsEnabled);
    }
    if (ttsVoiceLabel) {
      const voice = document.getElementById("capTtsVoice")?.value?.trim() || "—";
      ttsVoiceLabel.textContent = voice;
      ttsVoiceLabel.title = voice;
    }
    if (ttsSpeakLabel) {
      ttsSpeakLabel.textContent = ttsEnabled && speakReply ? "已启用" : "未启用";
    }
  }

  function updateAsrPromptCount() {
    const ta = document.getElementById("capAsrPrompt");
    const countEl = document.getElementById("capAsrPromptCount");
    if (!ta || !countEl) {
      return;
    }
    const len = String(ta.value || "").length;
    countEl.textContent = `${len}/500`;
  }

  function setSpeechTab(tabKey) {
    const key = tabKey === "tts" ? "tts" : "asr";
    speechTabs.forEach((btn) => {
      const on = btn.dataset.speechTab === key;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    speechPanels.forEach((panel) => {
      const on = panel.dataset.speechPanel === key;
      panel.hidden = !on;
      panel.classList.toggle("is-active", on);
    });
    if (speechAsrToggleWrap) {
      speechAsrToggleWrap.hidden = key !== "asr";
    }
    if (speechTtsToggleWrap) {
      speechTtsToggleWrap.hidden = key !== "tts";
    }
  }

  function wireKeyToggle(btnId, inputId) {
    const btn = document.getElementById(btnId);
    const input = document.getElementById(inputId);
    if (!btn || !input) {
      return;
    }
    btn.addEventListener("click", () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.setAttribute("aria-label", show ? "隐藏密钥" : "显示密钥");
    });
  }

  wireKeyToggle("capAsrKeyToggle", "capAsrApiKey");
  wireKeyToggle("capTtsKeyToggle", "capTtsApiKey");
  wireKeyToggle("capImgKeyToggle", "capImgApiKey");

  const IMG_STYLE_LABELS = {
    realistic: "写实",
    illustration: "插画",
    "3d": "3D 渲染",
    concept: "概念艺术",
  };
  const IMG_RES_LABELS = {
    sd: "标清（512）",
    hd: "高清（1024）",
    uhd: "超清（1536）",
  };
  const IMG_RES_SHORT = {
    sd: "标清 (0.5x)",
    hd: "标准 (1x)",
    uhd: "超清 (2x)",
  };
  const IMG_TAG_LABELS = {
    object: "物体",
    scene: "场景",
    ocr: "文字(OCR)",
    chart: "图表",
    person: "人像",
  };

  function ensureImgSizeOption(value) {
    const sizeEl = document.getElementById("capImgSize");
    const v = String(value || "").trim();
    if (!sizeEl || !v) {
      return;
    }
    const has = Array.from(sizeEl.options).some((o) => o.value === v);
    if (!has) {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      sizeEl.appendChild(opt);
    }
  }

  function syncVisionTagAddSelect() {
    const addEl = document.getElementById("capImgVisionTagAdd");
    if (!addEl) {
      return;
    }
    const checked = new Set(
      Array.from(document.querySelectorAll(".cap-img-vision-tag:checked")).map((el) => el.value),
    );
    Array.from(addEl.options).forEach((opt) => {
      if (!opt.value) {
        opt.hidden = false;
        return;
      }
      opt.hidden = checked.has(opt.value);
    });
    addEl.value = "";
  }

  function collectVisionTags() {
    return Array.from(document.querySelectorAll(".cap-img-vision-tag:checked"))
      .map((el) => el.value)
      .join(",");
  }

  function applyVisionTagsFromString(tags) {
    const set = new Set(
      String(tags || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
    document.querySelectorAll(".cap-img-vision-tag").forEach((el) => {
      el.checked = set.has(el.value);
    });
  }

  function visionTagsDisplayLabel() {
    const tags = Array.from(document.querySelectorAll(".cap-img-vision-tag:checked")).map((el) => el.value);
    if (!tags.length) {
      return "未选择";
    }
    if (tags.length >= 2) {
      return "多类型";
    }
    return IMG_TAG_LABELS[tags[0]] || tags[0];
  }

  function syncImageRouteModeUi() {
    const modular = routingEl?.value === "modular";
    document.querySelectorAll("[data-image-route-mode]").forEach((btn) => {
      const mode = btn.dataset.imageRouteMode === "modular" ? "modular" : "unified";
      btn.classList.toggle("is-active", mode === (modular ? "modular" : "unified"));
    });
  }

  function setImageValidateRow(check, ok, statusText) {
    const li = document.querySelector(`#capImageValidateList [data-check="${check}"]`);
    if (!li) {
      return;
    }
    const statusEl = li.querySelector(".cap-image-validate-status-text");
    if (statusEl) {
      statusEl.textContent = statusText;
    }
    li.classList.toggle("is-ok", ok);
    li.classList.toggle("is-err", !ok);
  }

  function formatValidateTime(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  function setImageServiceStat(id, ok, text, withCheck = true) {
    const el = document.getElementById(id);
    if (!el) {
      return;
    }
    const textEl = el.querySelector(".cap-image-stat-row-text");
    if (textEl) {
      textEl.textContent = text;
    } else {
      el.textContent = text;
    }
    el.classList.toggle("is-ok", ok);
    el.classList.toggle("is-err", !ok);
    const check = el.querySelector(".cap-image-stat-check");
    if (check) {
      check.style.display = withCheck && ok ? "inline-block" : "none";
    }
  }

  async function validateImageConfig() {
    const modular = routingEl?.value === "modular";
    const genOn = document.getElementById("capImageGen")?.checked !== false;
    const visionOn = document.getElementById("capImageUnderstand")?.checked !== false;
    const genModel = document.getElementById("capImgGenModel")?.value?.trim() || "";
    const visionModel = document.getElementById("capImgVisionModel")?.value?.trim() || "";
    let baseUrl = document.getElementById("capImgBaseUrl")?.value?.trim() || "";
    let hasKey = false;

    const t0 = performance.now();
    try {
      const img = await api.getImageSettings();
      hasKey = !!img.hasKey;
      if (!baseUrl && modular) {
        baseUrl = String(img.baseUrl || "").trim();
      }
      if (!modular && typeof api.getAISettings === "function") {
        const ai = await api.getAISettings();
        hasKey = hasKey || !!ai?.hasKey;
      }
    } catch {
      /* ignore */
    }
    const latency = Math.round(performance.now() - t0);

    const genOk = !genOn || !!genModel;
    const visionOk = !visionOn || !!visionModel;
    const apiOk = modular ? !!baseUrl && hasKey : hasKey;
    const serviceOk = (genOn || visionOn) && genOk && visionOk && apiOk;

    setImageValidateRow("gen", genOk, genOk ? "可用" : "待配置");
    setImageValidateRow("vision", visionOk, visionOk ? "可用" : "待配置");
    setImageValidateRow("api", apiOk, apiOk ? "正常" : "待完善");
    setImageValidateRow("service", serviceOk, serviceOk ? "正常" : "待完善");

    setImageServiceStat("capImageStatApi", apiOk, apiOk ? "正常" : "待完善");
    setImageServiceStat(
      "capImageStatModels",
      genOk && visionOk,
      genOk && visionOk ? "正常" : "待完善",
    );
    setImageServiceStat("capImageStatLatency", serviceOk, `${latency} ms`, false);

    const timeEl = document.getElementById("capImageValidateTime");
    if (timeEl) {
      timeEl.textContent = `校验时间：${formatValidateTime(new Date())}`;
    }
  }

  function updateImageStatusCards() {
    const genOn = document.getElementById("capImageGen")?.checked !== false;
    const visionOn = document.getElementById("capImageUnderstand")?.checked !== false;
    const modular = routingEl?.value === "modular";

    const setVal = (id, v) => {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = v;
      }
    };

    setVal("capImageStatRouteMode", modular ? "独立配置" : "统一配置");

    const genDot = document.getElementById("capImageStatGenDot");
    if (genDot) {
      genDot.classList.toggle("is-on", genOn);
    }
    const visionDot = document.getElementById("capImageStatVisionDot");
    if (visionDot) {
      visionDot.classList.toggle("is-on", visionOn);
    }

    const genModel = document.getElementById("capImgGenModel")?.value?.trim() || "—";
    const size = document.getElementById("capImgSize")?.value?.trim() || "—";
    const resKey = document.getElementById("capImgGenResolution")?.value || "hd";
    setVal("capImageStatGenModel", genModel);
    setVal("capImageStatGenSize", size);
    setVal("capImageStatGenResolution", IMG_RES_SHORT[resKey] || IMG_RES_LABELS[resKey] || resKey);

    const visionModel = document.getElementById("capImgVisionModel")?.value?.trim() || "—";
    const limit = document.getElementById("capImgVisionImageLimit")?.value || "9";
    setVal("capImageStatVisionModel", visionModel);
    setVal("capImageStatVisionTags", visionTagsDisplayLabel());
    setVal("capImageStatVisionLimit", `${limit} 张`);
  }

  function updateVisionPromptCount() {
    const ta = document.getElementById("capImgVisionPrompt");
    const countEl = document.getElementById("capImgVisionPromptCount");
    if (!ta || !countEl) {
      return;
    }
    const len = String(ta.value || "").length;
    countEl.textContent = `${len}/200`;
  }

  document.querySelectorAll("[data-image-route-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!routingEl) {
        return;
      }
      routingEl.value = btn.dataset.imageRouteMode === "modular" ? "modular" : "unified";
      applyRoutingUi();
      syncImageRouteModeUi();
      updateImageStatusCards();
      void validateImageConfig();
    });
  });

  const capImageStatRouteBtn = document.getElementById("capImageStatRouteBtn");
  if (capImageStatRouteBtn) {
    capImageStatRouteBtn.addEventListener("click", () => {
      if (!routingEl) {
        return;
      }
      routingEl.value = routingEl.value === "modular" ? "unified" : "modular";
      applyRoutingUi();
      syncImageRouteModeUi();
      updateImageStatusCards();
      void validateImageConfig();
      document.querySelector(".cap-image-step-body--switches")?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
  }

  const capImageValidateBtn = document.getElementById("capImageValidateBtn");
  if (capImageValidateBtn) {
    capImageValidateBtn.addEventListener("click", () => {
      void validateImageConfig();
    });
  }

  const capImageTestGenBtn = document.getElementById("capImageTestGenBtn");
  if (capImageTestGenBtn) {
    capImageTestGenBtn.addEventListener("click", async () => {
      const prompt = window.prompt("输入测试提示词", "一只可爱的猫，高清摄影");
      if (!prompt?.trim()) {
        return;
      }
      try {
        capImageTestGenBtn.disabled = true;
        const res = await api.imageGenerate({ prompt: prompt.trim() });
        if (res?.error) {
          alert(res.error);
        } else {
          alert("文生图测试成功，可在 AI 助手中查看生成结果。");
        }
      } catch (e) {
        alert(e.message || String(e));
      } finally {
        capImageTestGenBtn.disabled = false;
      }
    });
  }

  const capImageTestVisionBtn = document.getElementById("capImageTestVisionBtn");
  if (capImageTestVisionBtn) {
    capImageTestVisionBtn.addEventListener("click", () => {
      dialog.close();
      if (typeof window.openOrFocusTab === "function") {
        window.openOrFocusTab("ai");
      }
      document.dispatchEvent(
        new CustomEvent("navigate-ai-image-mode", { detail: { mode: "image-vision" } }),
      );
    });
  }

  [
    "capImageGen",
    "capImageUnderstand",
    "capImgGenModel",
    "capImgGenPreset",
    "capImgSize",
    "capImgBaseUrl",
    "capImgGenStyle",
    "capImgGenResolution",
    "capImgVisionModel",
    "capImgVisionPreset",
    "capImgVisionImageLimit",
    "capImgVisionOutputFormat",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", updateImageStatusCards);
      el.addEventListener("change", updateImageStatusCards);
    }
  });

  document.querySelectorAll(".cap-img-vision-tag").forEach((el) => {
    el.addEventListener("change", () => {
      updateImageStatusCards();
      syncVisionTagAddSelect();
    });
  });

  document.querySelectorAll(".cap-image-tag-remove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const input = btn.closest(".cap-image-tag")?.querySelector(".cap-img-vision-tag");
      if (input) {
        input.checked = false;
        updateImageStatusCards();
        syncVisionTagAddSelect();
      }
    });
  });

  const capImgVisionTagAdd = document.getElementById("capImgVisionTagAdd");
  if (capImgVisionTagAdd) {
    capImgVisionTagAdd.addEventListener("change", () => {
      const v = String(capImgVisionTagAdd.value || "").trim();
      if (!v) {
        return;
      }
      const input = document.querySelector(`.cap-img-vision-tag[value="${v}"]`);
      if (input) {
        input.checked = true;
        updateImageStatusCards();
      }
      syncVisionTagAddSelect();
    });
  }

  const capImgVisionPromptEl = document.getElementById("capImgVisionPrompt");
  if (capImgVisionPromptEl) {
    capImgVisionPromptEl.addEventListener("input", () => {
      updateVisionPromptCount();
    });
  }

  speechTabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      setSpeechTab(btn.dataset.speechTab || "asr");
    });
  });

  ["capAsrEnabled", "capTtsEnabled", "capTtsSpeakReply", "capAsrModel", "capAsrModelPreset", "capAsrLanguage", "capTtsVoice", "capTtsModel", "capTtsEngineSelect"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", updateSpeechStatusCards);
      el.addEventListener("change", updateSpeechStatusCards);
    }
  });

  const asrPromptEl = document.getElementById("capAsrPrompt");
  if (asrPromptEl) {
    asrPromptEl.addEventListener("input", () => {
      updateAsrPromptCount();
      updateSpeechStatusCards();
    });
  }

  function syncPresetFromInput(presetEl, inputEl) {
    if (!presetEl || !inputEl) {
      return;
    }
    const v = String(inputEl.value || "").trim();
    const has = Array.from(presetEl.options).some((o) => o.value === v && o.value !== "");
    presetEl.value = has ? v : "";
  }

  function syncImageModelSubFields() {
    [
      ["capImgGenPreset", "capImgGenModel"],
      ["capImgVisionPreset", "capImgVisionModel"],
    ].forEach(([presetId, modelId]) => {
      const presetEl = document.getElementById(presetId);
      const modelEl = document.getElementById(modelId);
      if (!presetEl || !modelEl) {
        return;
      }
      const hasPreset = !!String(presetEl.value || "").trim();
      modelEl.classList.toggle("cap-image-control--collapsed", hasPreset);
    });
  }

  function wireModelPreset(presetId, inputId) {
    const presetEl = document.getElementById(presetId);
    const inputEl = document.getElementById(inputId);
    if (!presetEl || !inputEl) {
      return;
    }
    presetEl.addEventListener("change", () => {
      if (presetEl.value) {
        inputEl.value = presetEl.value;
      }
      if (presetId === "capImgGenPreset" || presetId === "capImgVisionPreset") {
        syncImageModelSubFields();
        updateImageStatusCards();
      }
    });
    inputEl.addEventListener("input", () => {
      syncPresetFromInput(presetEl, inputEl);
      if (presetId === "capImgGenPreset" || presetId === "capImgVisionPreset") {
        syncImageModelSubFields();
      }
    });
    inputEl.addEventListener("blur", () => {
      syncPresetFromInput(presetEl, inputEl);
      if (presetId === "capImgGenPreset" || presetId === "capImgVisionPreset") {
        syncImageModelSubFields();
      }
    });
  }

  wireModelPreset("capTtsVoicePreset", "capTtsVoice");
  wireModelPreset("capAsrModelPreset", "capAsrModel");
  wireModelPreset("capImgGenPreset", "capImgGenModel");
  wireModelPreset("capImgVisionPreset", "capImgVisionModel");

  function applyRoutingUi() {
    const modular = routingEl && routingEl.value === "modular";
    modularSections.forEach((el) => {
      el.hidden = !modular;
    });
    if (unifiedHint) {
      unifiedHint.hidden = modular;
    }
    applyTtsProviderUi();
    syncImageRouteModeUi();
    updateImageStatusCards();
  }

  function ttsEngineValue() {
    return String(ttsEngineEl?.value || "");
  }

  function syncTtsEngineSelectFromModelField() {
    if (!ttsEngineEl || !ttsModelEl) {
      return;
    }
    const m = String(ttsModelEl.value || "").trim();
    if (!m) {
      ttsEngineEl.value = "";
      return;
    }
    const isLocal = m.startsWith("local:");
    const want = isLocal ? m : `cloud:${m}`;
    const has = Array.from(ttsEngineEl.options).some((o) => o.value === want);
    ttsEngineEl.value = has ? want : "";
  }

  function applyTtsEngineFromSaved(tts) {
    if (!ttsEngineEl) {
      return;
    }
    const m = String(tts.model || "").trim();
    const provider = String(tts.provider || "").trim().toLowerCase();
    if (!m) {
      ttsEngineEl.value = "";
      return;
    }
    const want = provider === "local" ? m : `cloud:${m}`;
    const has = Array.from(ttsEngineEl.options).some((o) => o.value === want);
    ttsEngineEl.value = has ? want : "";
  }

  function applyTtsProviderUi() {
    const engine = ttsEngineValue();
    const localTts = engine.startsWith("local:");
    modularSections.forEach((el) => {
      if (el && el.getAttribute("data-cap-modular-only") != null) {
        const modular = routingEl && routingEl.value === "modular";
        el.hidden = !modular || localTts;
      }
    });
  }

  function setActivePanel(panelKey) {
    let speechTab = null;
    if (panelKey === "asr" || panelKey === "tts") {
      speechTab = panelKey;
      panelKey = "speech";
    }
    if (panelKey === "image-gen" || panelKey === "image-vision") {
      panelKey = "image";
    }
    navItems.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.capTarget === panelKey);
    });
    panels.forEach((panel) => {
      const active = panel.dataset.capPanel === panelKey;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });
    dialog.classList.toggle("is-local-models", panelKey === "local-models");
    if (panelKey === "routing") {
      document.dispatchEvent(new CustomEvent("open-capability-web-strategy", { detail: {} }));
    }
    if (panelKey === "local-models" && typeof window.onLocalModelsPanelVisible === "function") {
      void window.onLocalModelsPanelVisible();
    }
    if (panelKey === "speech") {
      setSpeechTab(speechTab || "asr");
      updateSpeechStatusCards();
      updateAsrPromptCount();
    }
    if (panelKey === "image") {
      syncImageRouteModeUi();
      updateImageStatusCards();
      updateVisionPromptCount();
      void validateImageConfig();
    }
    if (panelKey === "skills" && typeof window.renderSkillCenter === "function") {
      window.renderSkillCenter();
    }
  }

  async function loadForm() {
    try {
      const cap = await api.getCapabilitySettings();
      if (routingEl) {
        routingEl.value = cap.routingMode === "modular" ? "modular" : "unified";
      }
      const setChk = (id, v) => {
        const el = document.getElementById(id);
        if (el) {
          el.checked = !!v;
        }
      };
      setChk("capAsrEnabled", cap.asrEnabled !== false);
      setChk("capTtsEnabled", cap.ttsEnabled);
      setChk("capTtsSpeakReply", cap.ttsSpeakOnAiReply);
      setChk("capImageGen", cap.imageGenEnabled !== false);
      setChk("capImageUnderstand", cap.imageUnderstandEnabled !== false);

      const asr = await api.getASRSettings();
      const setVal = (id, v) => {
        const el = document.getElementById(id);
        if (el) {
          el.value = v || "";
        }
      };
      setVal("capAsrBaseUrl", asr.baseUrl);
      ensureAsrLanguageOption(asr.language);
      setVal("capAsrModel", asr.model);
      setVal("capAsrLanguage", asr.language);
      setVal("capAsrPrompt", asr.prompt);
      const asrKey = document.getElementById("capAsrApiKey");
      if (asrKey) {
        asrKey.value = "";
        asrKey.placeholder = asr.hasKey ? "留空表示不修改已保存密钥" : "请输入 API Key（分模块路由）";
      }

      const tts = await api.getTTSSettings();
      setVal("capTtsBaseUrl", tts.baseUrl);
      setVal("capTtsModel", tts.model);
      setVal("capTtsVoice", tts.voice);
      const ttsKey = document.getElementById("capTtsApiKey");
      if (ttsKey) {
        ttsKey.value = "";
        ttsKey.placeholder = tts.hasKey ? "留空表示不修改已保存密钥" : "请输入 API Key（分模块路由）";
      }

      const img = await api.getImageSettings();
      setVal("capImgBaseUrl", img.baseUrl);
      setVal("capImgGenModel", img.genModel);
      setVal("capImgVisionModel", img.visionModel);
      setVal("capImgSize", img.size);
      ensureImgSizeOption(img.size);
      setVal("capImgGenStyle", img.genStyle || "realistic");
      setVal("capImgGenResolution", img.genResolution || "hd");
      setVal("capImgVisionImageLimit", String(img.visionImageLimit ?? 9));
      setVal("capImgVisionOutputFormat", img.visionOutputFormat || "json");
      setVal("capImgVisionPrompt", img.visionPrompt || "");
      applyVisionTagsFromString(img.visionTags);
      const imgKey = document.getElementById("capImgApiKey");
      if (imgKey) {
        imgKey.value = "";
        imgKey.placeholder = img.hasKey ? "留空表示不修改已保存密钥" : "请输入 API Key（分模块路由）";
      }

      syncPresetFromInput(document.getElementById("capAsrModelPreset"), document.getElementById("capAsrModel"));
      applyTtsEngineFromSaved(tts);
      syncPresetFromInput(document.getElementById("capTtsVoicePreset"), document.getElementById("capTtsVoice"));
      syncPresetFromInput(document.getElementById("capImgGenPreset"), document.getElementById("capImgGenModel"));
      syncPresetFromInput(document.getElementById("capImgVisionPreset"), document.getElementById("capImgVisionModel"));
      syncImageModelSubFields();
    } catch (e) {
      alert(e.message || String(e));
    }
    applyRoutingUi();
    applyTtsProviderUi();
    syncImageRouteModeUi();
    updateSpeechStatusCards();
    updateAsrPromptCount();
    updateImageStatusCards();
    updateVisionPromptCount();
    syncVisionTagAddSelect();
    void validateImageConfig();
  }

  if (routingEl) {
    routingEl.addEventListener("change", applyRoutingUi);
  }
  if (ttsEngineEl) {
    ttsEngineEl.addEventListener("change", () => {
      const v = ttsEngineValue();
      if (v.startsWith("cloud:") && ttsModelEl) {
        const id = v.slice("cloud:".length);
        if (id) {
          ttsModelEl.value = id;
        }
      } else if (v.startsWith("local:") && ttsModelEl) {
        ttsModelEl.value = v;
      }
      applyTtsProviderUi();
    });
  }
  if (ttsModelEl) {
    ttsModelEl.addEventListener("input", () => syncTtsEngineSelectFromModelField());
    ttsModelEl.addEventListener("blur", () => syncTtsEngineSelectFromModelField());
  }

  document.addEventListener("navigate-capability-to-chat-profiles", async (ev) => {
    const scrollToAdd = !!(ev.detail && ev.detail.scrollToAdd);
    if (!dialog.open) {
      await loadForm();
      dialog.showModal();
    }
    setActivePanel("chat-profiles");
    document.dispatchEvent(new CustomEvent("refresh-ai-chat-profiles", { detail: { scrollToAdd } }));
  });

  document.addEventListener("navigate-capability-to-local-models", async (ev) => {
    const detail = ev.detail && typeof ev.detail === "object" ? ev.detail : {};
    const view =
      detail.view === "catalog" ? "catalog" : detail.view === "inference" ? "inference" : "overview";
    if (!dialog.open) {
      await loadForm();
      dialog.showModal();
    }
    setActivePanel("local-models");
    if (detail.scrollToInference && typeof window.focusLocalModelsInference === "function") {
      void window.focusLocalModelsInference();
    } else if (typeof window.showLocalModelsView === "function") {
      window.showLocalModelsView(view);
    }
  });

  window.openCapabilityLocalModels = (options = {}) => {
    document.dispatchEvent(new CustomEvent("navigate-capability-to-local-models", { detail: options }));
  };

  document.addEventListener("navigate-capability-to-skills", async () => {
    if (!dialog.open) {
      await loadForm();
      dialog.showModal();
    }
    setActivePanel("skills");
  });

  window.openCapabilitySkills = () => {
    document.dispatchEvent(new CustomEvent("navigate-capability-to-skills"));
  };

  window.openCapabilityChatProfiles = () => {
    document.dispatchEvent(new CustomEvent("navigate-capability-to-chat-profiles", { detail: {} }));
  };

  navItems.forEach((navBtn) => {
    navBtn.addEventListener("click", () => {
      const key = navBtn.dataset.capTarget || "routing";
      setActivePanel(key);
      if (key === "chat-profiles") {
        document.dispatchEvent(new CustomEvent("refresh-ai-chat-profiles", { detail: {} }));
      }
      if (key === "local-models" && typeof window.showLocalModelsView === "function") {
        window.showLocalModelsView("overview");
      }
      if (key === "speech") {
        updateSpeechStatusCards();
        updateAsrPromptCount();
      }
      if (key === "image") {
        syncImageRouteModeUi();
        updateImageStatusCards();
        updateVisionPromptCount();
        void validateImageConfig();
      }
      if (key === "skills" && typeof window.renderSkillCenter === "function") {
        window.renderSkillCenter();
      }
    });
  });

  btn.addEventListener("click", async () => {
    await loadForm();
    setActivePanel("routing");
    dialog.showModal();
  });

  if (closeBtn) {
    closeBtn.addEventListener("click", () => dialog.close());
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const routingMode = routingEl?.value === "modular" ? "modular" : "unified";
      await api.setCapabilitySettings({
        routingMode,
        asrEnabled: document.getElementById("capAsrEnabled")?.checked !== false,
        ttsEnabled: document.getElementById("capTtsEnabled")?.checked,
        ttsSpeakOnAiReply: document.getElementById("capTtsSpeakReply")?.checked,
        imageGenEnabled: document.getElementById("capImageGen")?.checked,
        imageUnderstandEnabled: document.getElementById("capImageUnderstand")?.checked,
      });

      const asrPayload = {
        baseUrl: document.getElementById("capAsrBaseUrl")?.value?.trim() || "",
        model: document.getElementById("capAsrModel")?.value?.trim() || "",
        language: document.getElementById("capAsrLanguage")?.value?.trim() || "",
        prompt: document.getElementById("capAsrPrompt")?.value || "",
        preserveKey: true,
      };
      const asrK = document.getElementById("capAsrApiKey")?.value?.trim() || "";
      if (asrK) {
        asrPayload.apiKey = asrK;
        asrPayload.preserveKey = false;
      }
      await api.setASRSettings(asrPayload);

      const ev = ttsEngineValue();
      let ttsModelOut = document.getElementById("capTtsModel")?.value?.trim() || "";
      let ttsProviderOut = "cloud";
      if (ev.startsWith("cloud:")) {
        const fromSel = ev.slice("cloud:".length);
        if (fromSel) {
          ttsModelOut = fromSel;
        }
        ttsProviderOut = "cloud";
      } else if (ev.startsWith("local:")) {
        ttsModelOut = ev;
        ttsProviderOut = "local";
      }
      const ttsPayload = {
        provider: ttsProviderOut,
        baseUrl: document.getElementById("capTtsBaseUrl")?.value?.trim() || "",
        model: ttsModelOut,
        voice: document.getElementById("capTtsVoice")?.value?.trim() || "",
        preserveKey: true,
      };
      const ttsK = document.getElementById("capTtsApiKey")?.value?.trim() || "";
      if (ttsK) {
        ttsPayload.apiKey = ttsK;
        ttsPayload.preserveKey = false;
      }
      await api.setTTSSettings(ttsPayload);

      const imgPayload = {
        baseUrl: document.getElementById("capImgBaseUrl")?.value?.trim() || "",
        genModel: document.getElementById("capImgGenModel")?.value?.trim() || "",
        visionModel: document.getElementById("capImgVisionModel")?.value?.trim() || "",
        size: document.getElementById("capImgSize")?.value?.trim() || "",
        genStyle: document.getElementById("capImgGenStyle")?.value?.trim() || "realistic",
        genResolution: document.getElementById("capImgGenResolution")?.value?.trim() || "hd",
        visionImageLimit: Number(document.getElementById("capImgVisionImageLimit")?.value) || 9,
        visionOutputFormat: document.getElementById("capImgVisionOutputFormat")?.value?.trim() || "json",
        visionTags: collectVisionTags(),
        visionPrompt: document.getElementById("capImgVisionPrompt")?.value || "",
        preserveKey: true,
      };
      const imgK = document.getElementById("capImgApiKey")?.value?.trim() || "";
      if (imgK) {
        imgPayload.apiKey = imgK;
        imgPayload.preserveKey = false;
      }
      await api.setImageSettings(imgPayload);

      dialog.close();
      alert("已保存 AI 能力与模块配置。");
    } catch (err) {
      alert(err.message || String(err));
    }
  });
}

initCapabilityModule();
