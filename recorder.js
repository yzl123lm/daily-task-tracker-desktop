function initRecorderModule() {
  const api = window.electronAPI;
  const startBtn = document.getElementById("recordStartBtn");
  const stopBtn = document.getElementById("recordStopBtn");
  const asrSettingsBtn = document.getElementById("recordASRSettingsBtn");
  const analyzeBtn = document.getElementById("recordAnalyzeBtn");
  const exportBtn = document.getElementById("recordExportBtn");
  const autoAnalyzeEl = document.getElementById("recordAutoAnalyze");
  const statusEl = document.getElementById("recordStatus");
  const transcriptEl = document.getElementById("recordTranscript");
  const analysisEl = document.getElementById("recordAnalysis");
  const timerEl = document.getElementById("recordTimer");
  const recentListEl = document.getElementById("recordRecentList");
  const recentPreviewEl = document.getElementById("recordRecentListPreview");
  const liveDotEl = document.getElementById("recordLiveDot");
  const waveEl = document.querySelector(".record-assistant__wave");
  const RECENT_KEY = "daily_task_tracker_record_recent_v1";
  const asrDialog = document.getElementById("asrSettingsDialog");
  const asrForm = document.getElementById("asrSettingsForm");
  const asrBaseUrl = document.getElementById("asrBaseUrl");
  const asrModel = document.getElementById("asrModel");
  const asrLanguage = document.getElementById("asrLanguage");
  const asrPrompt = document.getElementById("asrPrompt");
  const asrApiKey = document.getElementById("asrApiKey");
  const asrClearKeyBtn = document.getElementById("asrClearKeyBtn");
  const asrSettingsCloseBtn = document.getElementById("asrSettingsCloseBtn");
  if (
    !startBtn ||
    !stopBtn ||
    !asrSettingsBtn ||
    !analyzeBtn ||
    !exportBtn ||
    !statusEl ||
    !transcriptEl ||
    !analysisEl
  ) {
    return;
  }

  let mediaStream = null;
  let mediaRecorder = null;
  let running = false;
  let finalText = "";
  let transcribeQueue = Promise.resolve();
  let timerInterval = null;
  let recordStartedAt = 0;

  function formatTimer(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = String(Math.floor(total / 3600)).padStart(2, "0");
    const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
    const s = String(total % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
  }

  function syncTimerDisplay() {
    if (!timerEl) {
      return;
    }
    if (!running || !recordStartedAt) {
      timerEl.textContent = "00:00:00";
      return;
    }
    timerEl.textContent = formatTimer(Date.now() - recordStartedAt);
  }

  function startTimer() {
    recordStartedAt = Date.now();
    syncTimerDisplay();
    clearInterval(timerInterval);
    timerInterval = window.setInterval(syncTimerDisplay, 1000);
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    syncTimerDisplay();
  }

  function readRecentRecords() {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeRecentRecords(items) {
    localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0, 12)));
  }

  function renderRecentItemHtml(item, idx) {
    const title = String(item.title || "未命名记录").replace(/</g, "&lt;");
    const time = String(item.time || "").replace(/</g, "&lt;");
    const duration = String(item.duration || "--:--").replace(/</g, "&lt;");
    return `
      <li class="record-assistant__recent-item" data-idx="${idx}">
        <span class="record-assistant__recent-doc" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M8 4h8l4 4v12a2 2 0 01-2 2H8a2 2 0 01-2-2V6a2 2 0 012-2z" stroke="currentColor" stroke-width="1.6"/><path d="M16 4v4h4M8 11h8M8 15h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
        </span>
        <span class="record-assistant__recent-body">
          <span class="record-assistant__recent-title">${title}</span>
          <span class="record-assistant__recent-meta">${time} · 时长: ${duration}</span>
        </span>
        <span class="record-assistant__recent-actions">
          <button type="button" class="record-assistant__recent-play" data-action="play" data-idx="${idx}" title="查看转写" aria-label="查看转写">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 7l10 5-10 5V7z" fill="currentColor"/></svg>
          </button>
          <button type="button" class="record-assistant__recent-more" data-action="more" data-idx="${idx}" title="更多" aria-label="更多">⋯</button>
        </span>
      </li>`;
  }

  function bindRecentListActions(listEl) {
    if (!listEl || listEl.dataset.jlRecentBound === "1") {
      return;
    }
    listEl.dataset.jlRecentBound = "1";
    listEl.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-action]");
      if (!btn) {
        return;
      }
      const idx = Number(btn.dataset.idx);
      const items = readRecentRecords();
      const item = items[idx];
      if (!item) {
        return;
      }
      if (btn.dataset.action === "play") {
        if (item.transcript) {
          transcriptEl.value = item.transcript;
        }
        if (item.analysis) {
          analysisEl.value = item.analysis;
        }
        if (typeof window.setRecordAssistantView === "function") {
          window.setRecordAssistantView("transcript");
        }
        return;
      }
      if (btn.dataset.action === "more") {
        const choice = window.confirm(`「${item.title || "记录"}」\n\n确定删除这条最近记录？`);
        if (!choice) {
          return;
        }
        items.splice(idx, 1);
        writeRecentRecords(items);
        renderRecentRecords();
      }
    });
  }

  function renderRecentRecords() {
    const items = readRecentRecords();
    const emptyHtml = '<li class="record-assistant__recent-empty">暂无历史记录，完成一次录音后将出现在这里。</li>';
    const html = items.length
      ? items.map((item, idx) => renderRecentItemHtml(item, idx)).join("")
      : emptyHtml;
    if (recentListEl) {
      recentListEl.innerHTML = html;
    }
    if (recentPreviewEl) {
      const previewItems = items.slice(0, 2);
      recentPreviewEl.innerHTML = previewItems.length
        ? previewItems.map((item, idx) => renderRecentItemHtml(item, idx)).join("")
        : emptyHtml;
    }
    bindRecentListActions(recentListEl);
    bindRecentListActions(recentPreviewEl);
  }

  function pushRecentRecord(title, durationLabel) {
    const items = readRecentRecords();
    items.unshift({
      title: title || "会议记录",
      time: new Date().toLocaleString("zh-CN", { hour12: false }),
      duration: durationLabel || "--:--",
      transcript: transcriptEl.value.trim(),
      analysis: analysisEl.value.trim(),
    });
    writeRecentRecords(items);
    renderRecentRecords();
  }

  function setStatus(text, isError = false) {
    statusEl.textContent = text;
    statusEl.classList.toggle("is-error", isError);
  }

  function renderTranscript(nextText) {
    transcriptEl.value = String(nextText ?? finalText).trim();
  }

  function setRunning(v) {
    running = v;
    startBtn.disabled = v;
    stopBtn.disabled = !v;
    asrSettingsBtn.disabled = v;
    waveEl?.classList.toggle("is-active", v);
    liveDotEl?.classList.toggle("is-live", v);
    document.querySelector(".record-assistant")?.classList.toggle("is-recording", v);
    if (v) {
      startTimer();
    } else {
      stopTimer();
    }
  }

  function stopMedia() {
    const r = mediaRecorder;
    mediaRecorder = null;
    if (r && r.state !== "inactive") {
      r.stop();
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
    }
    mediaStream = null;
  }

  async function loadASRSettingsToForm() {
    if (!api || typeof api.getASRSettings !== "function" || !asrBaseUrl || !asrModel || !asrLanguage || !asrPrompt) {
      return;
    }
    const s = await api.getASRSettings();
    asrBaseUrl.value = s.baseUrl || "";
    asrModel.value = s.model || "";
    asrLanguage.value = s.language || "";
    asrPrompt.value = s.prompt || "";
    if (asrApiKey) {
      asrApiKey.value = "";
      asrApiKey.placeholder = s.hasKey ? "留空表示不修改已保存密钥" : "请输入 ASR API Key";
    }
  }

  async function analyzeTranscript() {
    const text = transcriptEl.value.trim();
    if (!text) {
      alert("请先录音或输入转写文本。");
      return;
    }
    if (!api || typeof api.aiChat !== "function") {
      alert("当前环境不支持 AI 调用，请在桌面版中使用。");
      return;
    }
    setStatus("正在调用大模型整理分析…");
    analyzeBtn.disabled = true;
    try {
      const prompt =
        "请将以下会议/沟通记录整理为：\\n" +
        "1) 关键结论\\n2) 待办事项（含责任人建议）\\n3) 风险与阻塞\\n4) 下一步建议\\n\\n" +
        `原始记录：\\n${text}`;
      const res = await api.aiChat({
        messages: [
          { role: "system", content: "你是专业会议纪要助手，输出中文，结构清晰、简洁。" },
          { role: "user", content: prompt },
        ],
      });
      analysisEl.value = (res && res.content) || "（空回复）";
      setStatus("分析完成。");
    } catch (err) {
      setStatus(`分析失败：${err.message || err}`, true);
    } finally {
      analyzeBtn.disabled = false;
    }
  }

  function exportWordDoc() {
    const transcript = transcriptEl.value.trim();
    const analysis = analysisEl.value.trim();
    const now = new Date();
    const title = `记录整理_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate()
    ).padStart(2, "0")}`;
    const html =
      "<html><head><meta charset='utf-8'></head><body>" +
      `<h1>${title}</h1>` +
      `<h2>一、实时转写文本</h2><pre>${(transcript || "（无）").replace(/</g, "&lt;")}</pre>` +
      `<h2>二、AI整理分析</h2><pre>${(analysis || "（无）").replace(/</g, "&lt;")}</pre>` +
      "</body></html>";
    const blob = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title}.doc`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus("已导出 Word 文档。");
    pushRecentRecord(title, timerEl?.textContent || "--:--");
  }

  async function transcribeChunk(blob, finalChunk = false) {
    if (!api || typeof api.asrTranscribe !== "function") {
      throw new Error("ASR 接口不可用");
    }
    let outMime = blob.type || "audio/webm";
    let outBytes = new Uint8Array(await blob.arrayBuffer());
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const decoded = await audioCtx.decodeAudioData(await blob.arrayBuffer());
      const sampleRate = decoded.sampleRate;
      const channels = Math.min(1, decoded.numberOfChannels);
      const pcm = decoded.getChannelData(0);
      const wavBuf = new ArrayBuffer(44 + pcm.length * 2);
      const view = new DataView(wavBuf);
      const writeStr = (offset, s) => {
        for (let i = 0; i < s.length; i += 1) {
          view.setUint8(offset + i, s.charCodeAt(i));
        }
      };
      writeStr(0, "RIFF");
      view.setUint32(4, 36 + pcm.length * 2, true);
      writeStr(8, "WAVE");
      writeStr(12, "fmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, channels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * channels * 2, true);
      view.setUint16(32, channels * 2, true);
      view.setUint16(34, 16, true);
      writeStr(36, "data");
      view.setUint32(40, pcm.length * 2, true);
      let o = 44;
      for (let i = 0; i < pcm.length; i += 1) {
        const s = Math.max(-1, Math.min(1, pcm[i]));
        view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        o += 2;
      }
      outMime = "audio/wav";
      outBytes = new Uint8Array(wavBuf);
      audioCtx.close().catch(() => {});
    } catch {
      /* fallback to original blob bytes */
    }
    let bin = "";
    for (let i = 0; i < outBytes.length; i++) {
      bin += String.fromCharCode(outBytes[i]);
    }
    const audioBase64 = btoa(bin);
    const res = await api.asrTranscribe({
      audioBase64,
      mimeType: outMime,
      finalChunk: !!finalChunk,
    });
    const text = String(res?.text || "").trim();
    if (text) {
      finalText = `${finalText}${finalText ? "\n" : ""}${text}`;
      renderTranscript();
    }
  }

  async function startRecording() {
    if (!api || typeof api.getASRSettings !== "function") {
      alert("当前环境不支持 ASR 接口。");
      return;
    }
    const s = await api.getASRSettings();
    const asrModel = String(s?.model || "").trim().toLowerCase();
    const localAsr = asrModel.startsWith("local:qwen3-asr");
    let hasKey = s?.hasKey;
    if (typeof api.getCapabilitySettings === "function" && typeof api.getAISettings === "function") {
      const cap = await api.getCapabilitySettings();
      if (cap && cap.routingMode !== "modular") {
        const ai = await api.getAISettings();
        hasKey = !!ai?.hasKey;
      }
    }
    if (!localAsr && !hasKey) {
      alert("请配置 API Key：分模块模式下在「ASR设置」填写；统一模式下在「模型配置」填写（与对话共用）。");
      return;
    }
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(mediaStream);
      mediaRecorder.ondataavailable = (e) => {
        if (!e.data || e.data.size < 1024) {
          return;
        }
        transcribeQueue = transcribeQueue
          .then(() => transcribeChunk(e.data, false))
          .catch((err) => setStatus(`ASR转写异常：${err.message || err}`, true));
      };
      mediaRecorder.start(3500);
    } catch (err) {
      setStatus(`麦克风打开失败：${err.message || err}`, true);
      return;
    }

    finalText = "";
    renderTranscript();
    setRunning(true);
    setStatus("录音中，正在通过 ASR 接口分段转写…");
  }

  async function stopRecording() {
    if (!running) {
      return;
    }
    setRunning(false);
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      try {
        mediaRecorder.requestData();
      } catch {
        /* ignore */
      }
    }
    stopMedia();
    await transcribeQueue;
    renderTranscript(finalText);
    const durationLabel = timerEl?.textContent || "--:--";
    setStatus("录音已停止。");
    pushRecentRecord(`会议记录 ${new Date().toLocaleDateString("zh-CN")}`, durationLabel);
    if (autoAnalyzeEl && autoAnalyzeEl.checked) {
      await analyzeTranscript();
    }
  }

  if (asrSettingsBtn && asrDialog) {
    asrSettingsBtn.addEventListener("click", async () => {
      try {
        await loadASRSettingsToForm();
      } catch {
        /* ignore */
      }
      asrDialog.showModal();
    });
  }
  if (asrSettingsCloseBtn && asrDialog) {
    asrSettingsCloseBtn.addEventListener("click", () => asrDialog.close());
  }
  if (asrClearKeyBtn && api?.setASRSettings) {
    asrClearKeyBtn.addEventListener("click", async () => {
      if (!confirm("确定清除 ASR API Key？")) {
        return;
      }
      try {
        await api.setASRSettings({
          clearKey: true,
          preserveKey: false,
          baseUrl: asrBaseUrl?.value?.trim() || "",
          model: asrModel?.value?.trim() || "",
          language: asrLanguage?.value?.trim() || "",
          prompt: asrPrompt?.value || "",
        });
        await loadASRSettingsToForm();
      } catch (err) {
        alert(err.message || String(err));
      }
    });
  }
  if (asrForm && api?.setASRSettings) {
    asrForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await api.setASRSettings({
          baseUrl: asrBaseUrl?.value?.trim() || "",
          model: asrModel?.value?.trim() || "",
          language: asrLanguage?.value?.trim() || "",
          prompt: asrPrompt?.value || "",
          apiKey: asrApiKey?.value?.trim() || "",
          preserveKey: !(asrApiKey?.value?.trim()),
        });
        await loadASRSettingsToForm();
        asrDialog?.close();
        setStatus("ASR 配置已保存。");
      } catch (err) {
        alert(err.message || String(err));
      }
    });
  }

  startBtn.addEventListener("click", () => startRecording());
  stopBtn.addEventListener("click", () => stopRecording());
  analyzeBtn.addEventListener("click", () => analyzeTranscript());
  exportBtn.addEventListener("click", () => exportWordDoc());
  renderRecentRecords();
}

initRecorderModule();

if (document.body.classList.contains("jl-window-record")) {
  queueMicrotask(() => {
    if (typeof window.initRecordAssistantUI === "function") {
      window.initRecordAssistantUI();
    }
    if (typeof window.fitRecordModuleWindow === "function") {
      window.fitRecordModuleWindow();
    }
  });
}
