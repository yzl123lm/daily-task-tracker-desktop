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
  const recentListFullEl = document.getElementById("recordRecentListFull");
  const liveDotEl = document.getElementById("recordLiveDot");
  const waveEl = document.querySelector(".recorder-wave");
  const waveCanvasEl = document.getElementById("recordWaveCanvas");
  const recordFloatEl = document.getElementById("recorderFloatWin");
  const captureToolbarEl = document.getElementById("recordCaptureToolbar");
  const liveBadgeEl = document.getElementById("recordLiveBadge");
  const liveIndicatorEl = document.getElementById("recordLiveIndicator");
  const speakerEl = document.getElementById("recordCurrentSpeaker");
  const riskListEl = document.getElementById("recordRiskList");
  const timelineEl = document.getElementById("recordTimeline");
  const syncStatusEl = document.getElementById("recordSyncStatus");
  const syncDetailEl = document.getElementById("recordSyncDetail");
  const transcribeFileEl = document.getElementById("recordTranscriptFile");
  const transcribeDropzoneEl = document.getElementById("recordTranscribeDropzone");
  const transcribeStatusEl = document.getElementById("recordTranscribeStatus");
  const transcribeStartBtn = document.getElementById("recordTranscribeStartBtn");
  const transcribeCopyBtn = document.getElementById("recordTranscribeCopyBtn");
  const transcribeExportBtn = document.getElementById("recordTranscribeExportBtn");
  const summaryCopyBtn = document.getElementById("recordSummaryCopyBtn");
  const summaryExportMdBtn = document.getElementById("recordSummaryExportMdBtn");
  const historySearchEl = document.getElementById("recordHistorySearch");
  const historyDetailEl = document.getElementById("recordHistoryDetail");
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
  let historyFilter = "all";
  let pendingAudioFile = null;
  let recordStartedAt = 0;
  let audioContext = null;
  let analyser = null;
  let waveAnimFrame = 0;
  let syncPending = 0;
  const timelineMarkers = [];

  function formatClock(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = String(Math.floor(total / 60)).padStart(2, "0");
    const s = String(total % 60).padStart(2, "0");
    return `${m}:${s}`;
  }

  function pushTimeline(label) {
    const at = running && recordStartedAt ? Date.now() - recordStartedAt : 0;
    timelineMarkers.unshift({ at, label });
    if (timelineMarkers.length > 8) {
      timelineMarkers.pop();
    }
    if (!timelineEl) {
      return;
    }
    if (!timelineMarkers.length) {
      timelineEl.innerHTML = '<li class="recorder-monitor__list-empty">等待开始</li>';
      return;
    }
    timelineEl.innerHTML = timelineMarkers
      .map(
        (item) =>
          `<li><time>${formatClock(item.at)}</time><span>${String(item.label).replace(/</g, "&lt;")}</span></li>`
      )
      .join("");
  }

  function setSyncState(status, detail) {
    if (syncStatusEl) {
      syncStatusEl.textContent = status;
    }
    if (syncDetailEl) {
      syncDetailEl.textContent = detail;
    }
  }

  function updateSpeakerFromTranscript() {
    if (!speakerEl) {
      return;
    }
    if (!running) {
      speakerEl.textContent = "—";
      return;
    }
    const lines = transcriptEl.value.trim().split(/\n+/).filter(Boolean);
    const last = lines[lines.length - 1] || "";
    speakerEl.textContent = last ? `发言中 · ${last.slice(0, 18)}${last.length > 18 ? "…" : ""}` : "正在采集音频";
  }

  function extractRiskItems(text) {
    const source = String(text || "");
    if (!source.trim()) {
      return [];
    }
    const lines = source.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const hits = lines.filter((line) => /风险|阻塞|问题|延期|隐患|critical|blocker/i.test(line));
    return hits.slice(0, 4);
  }

  function renderRiskList() {
    if (!riskListEl) {
      return;
    }
    const risks = extractRiskItems(analysisEl.value || transcriptEl.value);
    if (!risks.length) {
      riskListEl.innerHTML = `<li class="recorder-monitor__list-empty">${running ? "实时监测中" : "暂无风险"}</li>`;
      return;
    }
    riskListEl.innerHTML = risks
      .map((item) => `<li class="recorder-monitor__list-item--risk">${item.replace(/</g, "&lt;")}</li>`)
      .join("");
  }

  function stopWaveCanvas() {
    cancelAnimationFrame(waveAnimFrame);
    waveAnimFrame = 0;
    if (waveCanvasEl) {
      const ctx = waveCanvasEl.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, waveCanvasEl.width, waveCanvasEl.height);
      }
    }
    if (audioContext) {
      audioContext.close().catch(() => {});
      audioContext = null;
    }
    analyser = null;
  }

  function startWaveCanvas(stream) {
    stopWaveCanvas();
    if (!waveCanvasEl || !stream) {
      return;
    }
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(stream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const buffer = new Uint8Array(analyser.frequencyBinCount);
      const ctx = waveCanvasEl.getContext("2d");
      const draw = () => {
        if (!analyser || !ctx) {
          return;
        }
        analyser.getByteFrequencyData(buffer);
        const w = waveCanvasEl.width;
        const h = waveCanvasEl.height;
        ctx.clearRect(0, 0, w, h);
        const bars = 48;
        const step = Math.floor(buffer.length / bars);
        const gap = 2;
        const barW = (w - gap * (bars - 1)) / bars;
        for (let i = 0; i < bars; i += 1) {
          const v = buffer[i * step] / 255;
          const barH = Math.max(4, v * (h - 8));
          const x = i * (barW + gap);
          const y = (h - barH) / 2;
          const grad = ctx.createLinearGradient(0, y, 0, y + barH);
          grad.addColorStop(0, "#5DA8FF");
          grad.addColorStop(1, "#2F80FF");
          ctx.fillStyle = grad;
          ctx.fillRect(x, y, barW, barH);
        }
        waveAnimFrame = requestAnimationFrame(draw);
      };
      draw();
    } catch {
      stopWaveCanvas();
    }
  }

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

  function renderRecentItemHtml(item, idx, { compact = false } = {}) {
    const title = String(item.title || "未命名记录").replace(/</g, "&lt;");
    const time = String(item.time || "").replace(/</g, "&lt;");
    const duration = String(item.duration || "--:--").replace(/</g, "&lt;");
    const typeLabel = String(item.type || "录音").replace(/</g, "&lt;");
    const docIcon =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M8 4h8l4 4v12a2 2 0 01-2 2H8a2 2 0 01-2-2V6a2 2 0 012-2z" stroke="currentColor" stroke-width="1.6"/><path d="M16 4v4h4M8 11h8M8 15h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
    const playBtn = `<button type="button" class="record-assistant__recent-play" data-action="play" data-idx="${idx}" title="查看转写" aria-label="查看转写"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 7l10 5-10 5V7z" fill="currentColor"/></svg></button>`;
    const moreBtn = `<button type="button" class="record-assistant__recent-more" data-action="detail" data-idx="${idx}" title="详情" aria-label="详情">⋯</button>`;
    const deleteBtn = `<button type="button" class="record-assistant__recent-more" data-action="more" data-idx="${idx}" title="删除" aria-label="删除">×</button>`;
    const actions = compact
      ? `${playBtn}${moreBtn}`
      : `${playBtn}${moreBtn}${deleteBtn}`;
    const badge = compact ? "" : `<span class="recorder-list-item__badge">${typeLabel}</span>`;
    return `
      <li class="record-assistant__recent-item recorder-list-item" data-idx="${idx}">
        <span class="record-assistant__recent-doc" aria-hidden="true">${docIcon}</span>
        <span class="record-assistant__recent-body">
          <span class="record-assistant__recent-title">${title}</span>
          <span class="record-assistant__recent-meta">${time} · 时长: ${duration}</span>
        </span>
        ${badge}
        <span class="record-assistant__recent-actions">${actions}</span>
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
        if (typeof window.recordAssistantActivate === "function") {
          window.recordAssistantActivate("transcribe");
        }
        return;
      }
      if (btn.dataset.action === "detail") {
        if (historyDetailEl) {
          historyDetailEl.hidden = false;
          historyDetailEl.innerHTML =
            `<strong>${String(item.title || "记录").replace(/</g, "&lt;")}</strong><br/>` +
            `${String(item.time || "")} · 时长 ${String(item.duration || "--:--")}<br/><br/>` +
            `<strong>转写摘要</strong><br/>${String(item.transcript || "（无）").replace(/</g, "&lt;").slice(0, 400)}`;
        }
        if (typeof window.recordAssistantActivate === "function") {
          window.recordAssistantActivate("history");
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

  function filterRecentItems(items) {
    const q = String(historySearchEl?.value || "").trim().toLowerCase();
    const now = new Date();
    return items.filter((item) => {
      if (q && !String(item.title || "").toLowerCase().includes(q)) {
        return false;
      }
      if (historyFilter === "all") {
        return true;
      }
      const t = new Date(item.time || "");
      if (Number.isNaN(t.getTime())) {
        return historyFilter === "all";
      }
      if (historyFilter === "today") {
        return t.toDateString() === now.toDateString();
      }
      if (historyFilter === "week") {
        const weekAgo = new Date(now);
        weekAgo.setDate(now.getDate() - 7);
        return t >= weekAgo;
      }
      if (historyFilter === "month") {
        return t.getFullYear() === now.getFullYear() && t.getMonth() === now.getMonth();
      }
      return true;
    });
  }

  function renderRecentRecords() {
    const items = readRecentRecords();
    const emptyHtml = '<li class="record-assistant__recent-empty">暂无历史记录，完成一次录音后将出现在这里。</li>';
    const previewHtml = items.length
      ? items.slice(0, 4).map((item, idx) => renderRecentItemHtml(item, idx, { compact: true })).join("")
      : emptyHtml;
    const filtered = filterRecentItems(items);
    const fullHtml = filtered.length
      ? filtered.map((item) => {
          const idx = items.indexOf(item);
          return renderRecentItemHtml(item, idx, { compact: false });
        }).join("")
      : emptyHtml;

    if (recentListEl) {
      recentListEl.innerHTML = previewHtml;
      bindRecentListActions(recentListEl);
    }
    if (recentListFullEl) {
      recentListFullEl.innerHTML = fullHtml;
      bindRecentListActions(recentListFullEl);
    }
  }

  function pushRecentRecord(title, durationLabel) {
    const items = readRecentRecords();
    items.unshift({
      title: title || "会议记录",
      time: new Date().toLocaleString("zh-CN", { hour12: false }),
      duration: durationLabel || "--:--",
      type: "录音",
      transcript: transcriptEl.value.trim(),
      analysis: analysisEl.value.trim(),
    });
    writeRecentRecords(items);
    renderRecentRecords();
  }

  function setStatus(text, isError = false) {
    statusEl.textContent = text;
    statusEl.classList.toggle("is-error", isError);
    if (running) {
      setSyncState(isError ? "异常" : syncPending > 0 ? "同步中" : "已连接", `ASR · ${text}`);
    }
  }

  function renderTranscript(nextText) {
    transcriptEl.value = String(nextText ?? finalText).trim();
    updateSpeakerFromTranscript();
    renderRiskList();
  }

  function setRunning(v) {
    running = v;
    startBtn.disabled = v;
    stopBtn.disabled = !v;
    asrSettingsBtn.disabled = v;
    waveEl?.classList.toggle("is-active", v);
    liveDotEl?.classList.toggle("is-live", v);
    liveIndicatorEl?.classList.toggle("is-live", v);
    liveBadgeEl?.classList.toggle("is-live", v);
    recordFloatEl?.classList.toggle("is-recording", v);
    captureToolbarEl && (captureToolbarEl.hidden = !v);
    window.RecorderMonitor?.setRecording?.(v);
    window.RecorderWindow?.setRecording?.(v);
    if (v) {
      startTimer();
      setSyncState("已连接", "ASR · 录音中");
      pushTimeline("开始录音");
    } else {
      stopTimer();
      stopWaveCanvas();
      setSyncState("待机", "ASR · 未连接");
      updateSpeakerFromTranscript();
    }
    renderRiskList();
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
      renderRiskList();
      pushTimeline("生成纪要");
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
    syncPending += 1;
    setSyncState("同步中", `ASR · 转写分段 (${syncPending})`);
    try {
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
      pushTimeline(finalChunk ? "转写完成" : "转写分段");
    }
    } finally {
    syncPending = Math.max(0, syncPending - 1);
    setSyncState(syncPending > 0 ? "同步中" : running ? "已连接" : "已同步", `ASR · ${syncPending > 0 ? "处理中" : "最新片段已写入"}`);
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
      startWaveCanvas(mediaStream);
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
    timelineMarkers.length = 0;
    if (timelineEl) {
      timelineEl.innerHTML = '<li class="recorder-monitor__list-empty">等待开始</li>';
    }
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
    pushTimeline("停止录音");
    setSyncState("已同步", "ASR · 输出已写入");
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

  transcribeDropzoneEl?.addEventListener("click", () => transcribeFileEl?.click());
  transcribeDropzoneEl?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      transcribeFileEl?.click();
    }
  });
  transcribeDropzoneEl?.addEventListener("dragover", (e) => {
    e.preventDefault();
    transcribeDropzoneEl.classList.add("is-dragover");
  });
  transcribeDropzoneEl?.addEventListener("dragleave", () => {
    transcribeDropzoneEl.classList.remove("is-dragover");
  });
  transcribeDropzoneEl?.addEventListener("drop", (e) => {
    e.preventDefault();
    transcribeDropzoneEl.classList.remove("is-dragover");
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      pendingAudioFile = file;
      if (transcribeStatusEl) {
        transcribeStatusEl.textContent = `已选择：${file.name}`;
      }
    }
  });
  transcribeFileEl?.addEventListener("change", () => {
    const file = transcribeFileEl.files?.[0];
    pendingAudioFile = file || null;
    if (transcribeStatusEl) {
      transcribeStatusEl.textContent = file ? `已选择：${file.name}` : "等待上传或录音转写";
    }
  });

  transcribeStartBtn?.addEventListener("click", async () => {
    if (pendingAudioFile) {
      if (transcribeStatusEl) {
        transcribeStatusEl.textContent = "正在转写上传的音频…";
      }
      try {
        await transcribeChunk(pendingAudioFile, true);
        if (transcribeStatusEl) {
          transcribeStatusEl.textContent = "转写完成。";
        }
      } catch (err) {
        if (transcribeStatusEl) {
          transcribeStatusEl.textContent = `转写失败：${err.message || err}`;
          transcribeStatusEl.classList.add("is-error");
        }
      }
      return;
    }
    if (transcriptEl.value.trim()) {
      if (transcribeStatusEl) {
        transcribeStatusEl.textContent = "已加载当前转写文本。";
      }
      return;
    }
    alert("请先上传音频文件，或在录音页完成录音。");
  });

  transcribeCopyBtn?.addEventListener("click", async () => {
    const text = transcriptEl.value.trim();
    if (!text) {
      alert("暂无转写文本可复制。");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      if (transcribeStatusEl) {
        transcribeStatusEl.textContent = "已复制到剪贴板。";
      }
    } catch {
      alert("复制失败，请手动选择文本复制。");
    }
  });

  transcribeExportBtn?.addEventListener("click", () => {
    exportWordDoc();
  });

  summaryCopyBtn?.addEventListener("click", async () => {
    const text = analysisEl.value.trim();
    if (!text) {
      alert("暂无纪要内容可复制。");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setStatus("纪要已复制到剪贴板。");
    } catch {
      alert("复制失败，请手动选择文本复制。");
    }
  });

  summaryExportMdBtn?.addEventListener("click", () => {
    const analysis = analysisEl.value.trim();
    if (!analysis) {
      alert("请先生成纪要。");
      return;
    }
    const blob = new Blob([analysis], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `会议纪要_${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus("已导出 Markdown。");
  });

  historySearchEl?.addEventListener("input", () => renderRecentRecords());
  document.querySelectorAll("[data-history-filter]").forEach((chip) => {
    chip.addEventListener("click", () => {
      historyFilter = chip.dataset.historyFilter || "all";
      document.querySelectorAll("[data-history-filter]").forEach((node) => {
        node.classList.toggle("is-active", node === chip);
      });
      renderRecentRecords();
    });
  });

  renderRecentRecords();
  setSyncState("未连接", "ASR · 待机");
  renderRiskList();
}

function initRecordAssistantNav() {
  /* 导航由 RecorderWindow 管理 */
}

initRecorderModule();

if (document.body.classList.contains("jl-window-record")) {
  queueMicrotask(() => {
    if (typeof window.fitRecordModuleWindow === "function") {
      window.fitRecordModuleWindow();
    }
  });
}
