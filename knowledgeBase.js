(function initKnowledgeBasePanel() {
  const api = window.electronAPI;

  const el = {
    librarySelect: document.getElementById("kbLibrarySelect"),
    newLibraryName: document.getElementById("kbNewLibraryName"),
    createLibraryBtn: document.getElementById("kbCreateLibraryBtn"),
    storageDirInput: document.getElementById("kbStorageDirInput"),
    chooseStorageDirBtn: document.getElementById("kbChooseStorageDirBtn"),
    chooseStorageDirTextBtn: document.getElementById("kbChooseStorageDirTextBtn"),
    useDefaultStorageBtn: document.getElementById("kbUseDefaultStorageBtn"),
    chunkSize: document.getElementById("kbChunkSize"),
    chunkOverlap: document.getElementById("kbChunkOverlap"),
    embedModel: document.getElementById("kbEmbedModel"),
    searchTopK: document.getElementById("kbSearchTopK"),
    searchMinScore: document.getElementById("kbSearchMinScore"),
    searchCandidateK: document.getElementById("kbSearchCandidateK"),
    hybridVectorWeight: document.getElementById("kbHybridVectorWeight"),
    keywordRecallLimit: document.getElementById("kbKeywordRecallLimit"),
    searchMode: document.getElementById("kbSearchMode"),
    chunkStrategy: document.getElementById("kbChunkStrategy"),
    hybridSearch: document.getElementById("kbHybridSearch"),
    useRrfRanking: document.getElementById("kbUseRrfRanking"),
    rerankEnabled: document.getElementById("kbRerankEnabled"),
    rerankModel: document.getElementById("kbRerankModel"),
    rerankTopN: document.getElementById("kbRerankTopN"),
    rerankWeight: document.getElementById("kbRerankWeight"),
    rerankProvider: document.getElementById("kbRerankProvider"),
    autoWebVerify: document.getElementById("kbAutoWebVerify"),
    aiVerifyWriteback: document.getElementById("kbAiVerifyWriteback"),
    autoLearnEnabled: document.getElementById("kbAutoLearnEnabled"),
    autoLearnRequireConfirm: document.getElementById("kbAutoLearnRequireConfirm"),
    autoLearnMinQuestionChars: document.getElementById("kbAutoLearnMinQuestionChars"),
    autoLearnMinAnswerChars: document.getElementById("kbAutoLearnMinAnswerChars"),
    autoLearnQueueList: document.getElementById("kbAutoLearnQueueList"),
    autoLearnQueueRefreshBtn: document.getElementById("kbAutoLearnQueueRefreshBtn"),
    autoLearnPendingCount: document.getElementById("kbAutoLearnPendingCount"),
    watchDirInput: document.getElementById("kbWatchDirInput"),
    watchDirEnabled: document.getElementById("kbWatchDirEnabled"),
    chooseWatchDirBtn: document.getElementById("kbChooseWatchDirBtn"),
    watchScanNowBtn: document.getElementById("kbWatchScanNowBtn"),
    watchStatusHint: document.getElementById("kbWatchStatusHint"),
    watchStatusDetail: document.getElementById("kbWatchStatusDetail"),
    saveBtn: document.getElementById("kbSaveSettingsBtn"),
    opsSaveBtn: document.getElementById("kbOpsSaveBtn"),
    rebuildEmbeddingsBtn: document.getElementById("kbRebuildEmbeddingsBtn"),
    rebuildFtsBtn: document.getElementById("kbRebuildFtsBtn"),
    indexHealthBtn: document.getElementById("kbIndexHealthBtn"),
    indexHealthHint: document.getElementById("kbIndexHealthHint"),
    modelHealthBtn: document.getElementById("kbModelHealthBtn"),
    modelHealthDialog: document.getElementById("kbModelHealthDialog"),
    modelHealthSummary: document.getElementById("kbModelHealthSummary"),
    modelHealthOverallBadge: document.getElementById("kbModelHealthOverallBadge"),
    modelHealthCheckedAt: document.getElementById("kbModelHealthCheckedAt"),
    modelHealthDuration: document.getElementById("kbModelHealthDuration"),
    modelHealthOllamaBody: document.getElementById("kbModelHealthOllamaBody"),
    modelHealthEmbedBody: document.getElementById("kbModelHealthEmbedBody"),
    modelHealthRerankBody: document.getElementById("kbModelHealthRerankBody"),
    modelHealthSuggestions: document.getElementById("kbModelHealthSuggestions"),
    modelHealthJson: document.getElementById("kbModelHealthJson"),
    modelHealthRecheckBtn: document.getElementById("kbModelHealthRecheckBtn"),
    modelHealthCopyBtn: document.getElementById("kbModelHealthCopyBtn"),
    modelHealthOpenConfigBtn: document.getElementById("kbModelHealthOpenConfigBtn"),
    modelHealthCloseBtn: document.getElementById("kbModelHealthCloseBtn"),
    modelHealthCloseBtn2: document.getElementById("kbModelHealthCloseBtn2"),
    modelHealthHistory: document.getElementById("kbModelHealthHistory"),
    modelHealthStatusBadges: Array.from(document.querySelectorAll("[data-kb-mh-status]")),
    ingestModelHealthBanner: document.getElementById("kbIngestModelHealthBanner"),
    trialModelHealthBanner: document.getElementById("kbTrialModelHealthBanner"),
    searchResultModelHealthBanner: document.getElementById("kbSearchResultModelHealthBanner"),
    opsFeedback: document.getElementById("kbOpsFeedback"),
    status: document.getElementById("kbStatus"),
    statsBar: document.getElementById("kbStatsBar"),
    statsOpsLogBtn: document.getElementById("kbStatsOpsLogBtn"),
    opsLogDialog: document.getElementById("kbOpsLogDialog"),
    opsLogList: document.getElementById("kbOpsLogList"),
    opsLogMeta: document.getElementById("kbOpsLogDialogMeta"),
    opsLogCloseBtn: document.getElementById("kbOpsLogCloseBtn"),
    opsLogCloseBtn2: document.getElementById("kbOpsLogCloseBtn2"),
    opsLogRefreshBtn: document.getElementById("kbOpsLogRefreshBtn"),
    opsLogFilters: Array.from(document.querySelectorAll("[data-kb-log-filter]")),
    searchResultDialog: document.getElementById("kbSearchResultDialog"),
    searchResultQuery: document.getElementById("kbSearchResultQuery"),
    searchResultMeta: document.getElementById("kbSearchResultMeta"),
    searchResultList: document.getElementById("kbSearchResultList"),
    searchResultDetail: document.getElementById("kbSearchResultDetail"),
    searchResultCloseBtn: document.getElementById("kbSearchResultCloseBtn"),
    searchResultCloseBtn2: document.getElementById("kbSearchResultCloseBtn2"),
    searchResultOpenDocBtn: document.getElementById("kbSearchResultOpenDocBtn"),
    searchResultRelocateBtn: document.getElementById("kbSearchResultRelocateBtn"),
    searchResultCopyBtn: document.getElementById("kbSearchResultCopyBtn"),
    searchResultLocateBtn: document.getElementById("kbSearchResultLocateBtn"),
    searchResultFollowUpBtn: document.getElementById("kbSearchResultFollowUpBtn"),
    dirTree: document.getElementById("kbDirTree"),
    ingestProgress: document.getElementById("kbIngestProgress"),
    docSummary: document.getElementById("kbDocSummary"),
    ingestTotal: document.getElementById("kbIngestTotal"),
    viewAllDocsBtn: document.getElementById("kbViewAllDocsBtn"),
    ingestFull: document.getElementById("kbIngestFull"),
    docList: document.getElementById("kbDocList"),
    mainCreateLibraryBtn: document.getElementById("kbMainCreateLibraryBtn"),
    trialQuery: document.getElementById("kbTrialQuery"),
    trialSearch: document.getElementById("kbTrialSearchBtn"),
    trialStatus: document.getElementById("kbTrialStatus"),
    trialReset: document.getElementById("kbTrialResetBtn"),
    trialClear: document.getElementById("kbTrialClearBtn"),
    trialSettings: document.getElementById("kbTrialSettingsBtn"),
    trialSelectAll: document.getElementById("kbTrialSelectAll"),
    trialCharCount: document.getElementById("kbTrialCharCount"),
    trialHistory: document.getElementById("kbTrialHistoryBtn"),
    trialResults: document.getElementById("kbTrialResults"),
    trialDebug: document.getElementById("kbTrialDebug"),
    trialSearchAllLibraries: document.getElementById("kbTrialSearchAllLibraries"),
    trialLibraries: document.getElementById("kbTrialLibraries"),
    configDialog: document.getElementById("kbConfigDialog"),
    configOpenBtn: document.getElementById("kbConfigOpenBtn"),
    configCloseBtn: document.getElementById("kbConfigCloseBtn"),
    configCancelBtn: document.getElementById("kbConfigCancelBtn"),
    configRestoreDefaultsBtn: document.getElementById("kbConfigRestoreDefaultsBtn"),
    configVerifyBtn: document.getElementById("kbConfigVerifyBtn"),
    configPreviewBtn: document.getElementById("kbConfigPreviewBtn"),
    configSavedBadge: document.getElementById("kbConfigSavedBadge"),
    configLastSavedHint: document.getElementById("kbConfigLastSavedHint"),
    configOpenDirBtn: document.getElementById("kbConfigOpenDirBtn"),
    configSections: document.getElementById("kbConfigSections"),
    configSidebarDir: document.getElementById("kbConfigSidebarDir"),
    configSidebarChunks: document.getElementById("kbConfigSidebarChunks"),
    configSidebarModel: document.getElementById("kbConfigSidebarModel"),
    configSidebarStorage: document.getElementById("kbConfigSidebarStorage"),
    configNavItems: Array.from(document.querySelectorAll(".kb-config-nav-item")),
    graphOnlyDocs: document.getElementById("kbGraphOnlyDocs"),
    graphGlobalScope: document.getElementById("kbGraphGlobalScope"),
    graphForceEnabled: document.getElementById("kbGraphForceEnabled"),
    graphKeepLayout: document.getElementById("kbGraphKeepLayout"),
    graphResetLayoutBtn: document.getElementById("kbGraphResetLayoutBtn"),
    graphRefreshBtn: document.getElementById("kbGraphRefreshBtn"),
    graphFullscreenBtn: document.getElementById("kbGraphFullscreenBtn"),
    graphStage: document.getElementById("kbGraphStage"),
    graphMeta: document.getElementById("kbGraphMeta"),
    graphCanvas: document.getElementById("kbGraphCanvas"),
  };

  const KB_DIALOG_PORTAL_IDS = [
    "kbOpsLogDialog",
    "kbModelHealthDialog",
    "kbSearchResultDialog",
    "kbSourceLocateDialog",
    "kbConfigDialog",
  ];

  function portalKbDialogsToBody() {
    KB_DIALOG_PORTAL_IDS.forEach((id) => {
      const dlg = document.getElementById(id);
      if (!dlg || dlg.dataset.kbPortaled === "1") {
        return;
      }
      if (dlg.parentElement !== document.body) {
        document.body.appendChild(dlg);
      }
      dlg.classList.add("kb-dialog-portal");
      dlg.dataset.kbPortaled = "1";
    });
  }

  function isKbTrialFloatPanel() {
    return !!document.getElementById("jlKbFloatSearch")?.closest(".jl-float-win");
  }

  function shouldAutoOpenSearchResultDialog() {
    return !isKbTrialFloatPanel();
  }

  portalKbDialogsToBody();

  let lastOpStatus = "";
  let lastModelHealthDiagnostics = "";
  let modelHealthCheckInFlight = false;
  let searchResultState = { hits: [], out: null, selectedIndex: -1, query: "" };
  let locateHighlightTimer = 0;
  let lastOpIsErr = false;
  const KB_TREE_EXPANDED_KEY = "daily_task_tracker_kb_tree_expanded_v1";
  let docsTreeExpanded = {};
  let ingestDocsExpanded = false;
  let opsLogCategory = "all";
  let latestDocGroups = [];
  let activeLibraryIdCache = "";
  let configDirty = false;
  let configAutoSaveTimer = null;
  let configLastSavedAt = null;

  const KB_CONFIG_DEFAULTS =
    (typeof window !== "undefined" && window.KbConfigLayout?.DEFAULT_KB_RETRIEVAL_SETTINGS) || {
      chunkSize: 800,
      chunkOverlap: 120,
      embedModel: "bge-m3",
      searchTopK: 5,
      searchMinScore: 0.55,
      searchCandidateK: 200,
      hybridVectorWeight: 0.7,
      keywordRecallLimit: 50,
      searchMode: "auto",
      chunkStrategy: "semantic",
      hybridSearch: true,
      useRrfRanking: true,
      rerankEnabled: true,
      rerankModel: "dengcao/bge-reranker-v2-m3",
      rerankProvider: "ollama",
      rerankTopN: 30,
      rerankWeight: 0.75,
      aiVerifyWriteback: false,
      autoLearnEnabled: false,
      autoLearnRequireConfirm: false,
      autoLearnMinQuestionChars: 6,
      autoLearnMinAnswerChars: 80,
      autoWebVerify: false,
      watchDirEnabled: false,
      watchDirPath: "",
    };

  function formatAutoLearnBadge(meta) {
    if (!meta) {
      return { text: "对话·未确认", className: "is-unconfirmed" };
    }
    const source = meta.sourceType || "chat";
    const cred = meta.credibility || "unconfirmed";
    const sourceLabel =
      source === "web-verify"
        ? "联网核验"
        : source === "image-vision"
          ? "识图"
          : source === "manual"
            ? "手动"
            : "对话";
    const credLabel = cred === "verified" ? "已核验" : cred === "confirmed" ? "已确认" : "未确认";
    const className =
      cred === "verified" ? "is-verified" : cred === "confirmed" ? "is-confirmed" : "is-unconfirmed";
    return { text: `${sourceLabel}·${credLabel}`, className };
  }

  function formatAutoLearnSourceLabel(sourceType) {
    const source = String(sourceType || "chat").trim() || "chat";
    if (source === "web-verify") return "联网核验";
    if (source === "image-vision") return "识图";
    if (source === "manual") return "手动";
    return "AI 对话";
  }

  function formatAutoLearnQueueTitle(item) {
    const q = String(item?.question || "").trim();
    if (q) {
      return q.length > 48 ? `${q.slice(0, 48)}…` : q;
    }
    const a = String(item?.answer || "").trim();
    if (a) {
      return a.length > 48 ? `${a.slice(0, 48)}…` : a;
    }
    return "（无标题）";
  }

  async function refreshAutoLearnQueue(libraryId) {
    if (!el.autoLearnQueueList || typeof api.kbAutoLearnQueueList !== "function") {
      return;
    }
    const libId = String(libraryId || activeLibraryIdCache || "").trim();
    if (!libId) {
      return;
    }
    try {
      const out = await api.kbAutoLearnQueueList({ libraryId: libId, status: "pending", limit: 50 });
      if (!out?.ok) {
        return;
      }
      if (el.autoLearnPendingCount) {
        el.autoLearnPendingCount.textContent = String(out.pendingCount ?? out.items?.length ?? 0);
      }
      el.autoLearnQueueList.innerHTML = "";
      const items = Array.isArray(out.items) ? out.items : [];
      if (!items.length) {
        el.autoLearnQueueList.innerHTML = `
          <div class="kb-queue-empty-state">
            <p class="kb-queue-empty__title">暂无待审核条目</p>
            <p class="kb-queue-empty__hint">系统将在此展示自动学习待审核内容。</p>
          </div>`;
        return;
      }
      items.forEach((item) => {
        const row = document.createElement("div");
        row.className = "kb-queue-row";
        row.setAttribute("role", "row");
        row.title = String(item.question || item.answer || "").trim();

        const titleCell = document.createElement("span");
        titleCell.className = "kb-queue-row__title";
        titleCell.textContent = formatAutoLearnQueueTitle(item);

        const sourceCell = document.createElement("span");
        sourceCell.className = "kb-queue-row__source";
        sourceCell.textContent = formatAutoLearnSourceLabel(item.sourceType);

        const timeCell = document.createElement("span");
        timeCell.className = "kb-queue-row__time";
        timeCell.textContent = formatKbStatTime(item.createdAt);

        const opsCell = document.createElement("div");
        opsCell.className = "kb-queue-row__ops";
        const menu = document.createElement("details");
        menu.className = "kb-dir-menu";
        const menuBtn = document.createElement("summary");
        menuBtn.className = "kb-dir-menu__trigger";
        menuBtn.textContent = "⋯";
        menuBtn.title = "审核操作";
        menuBtn.addEventListener("click", (ev) => ev.stopPropagation());
        const menuPanel = document.createElement("div");
        menuPanel.className = "kb-dir-menu__panel";

        const approveBtn = document.createElement("button");
        approveBtn.type = "button";
        approveBtn.textContent = "批准入库";
        approveBtn.addEventListener("click", async (ev) => {
          ev.preventDefault();
          menu.open = false;
          if (typeof api.kbAutoLearnApprove !== "function") {
            return;
          }
          setStatus("正在批准入库…");
          try {
            const res = await api.kbAutoLearnApprove({ queueId: item.id, libraryId: libId });
            if (!res?.ok) {
              setStatus(res?.error || "批准失败", true);
              return;
            }
            setStatus("已批准并入库。");
            await refreshState();
          } catch (err) {
            setStatus(err.message || String(err), true);
          }
        });

        const rejectBtn = document.createElement("button");
        rejectBtn.type = "button";
        rejectBtn.textContent = "拒绝";
        rejectBtn.addEventListener("click", async (ev) => {
          ev.preventDefault();
          menu.open = false;
          if (typeof api.kbAutoLearnReject !== "function") {
            return;
          }
          if (!window.confirm("确定拒绝该条自动学习内容？拒绝后不会入库。")) {
            return;
          }
          setStatus("正在拒绝…");
          try {
            const res = await api.kbAutoLearnReject({ queueId: item.id, libraryId: libId });
            if (!res?.ok) {
              setStatus(res?.error || "拒绝失败", true);
              return;
            }
            setStatus("已拒绝。");
            await refreshAutoLearnQueue(libId);
          } catch (err) {
            setStatus(err.message || String(err), true);
          }
        });

        menuPanel.appendChild(approveBtn);
        menuPanel.appendChild(rejectBtn);
        menu.appendChild(menuBtn);
        menu.appendChild(menuPanel);
        opsCell.appendChild(menu);

        row.appendChild(titleCell);
        row.appendChild(sourceCell);
        row.appendChild(timeCell);
        row.appendChild(opsCell);
        el.autoLearnQueueList.appendChild(row);
      });
    } catch {
      /* 队列加载失败不阻塞主面板 */
    }
  }
  const graphViewState = {
    scale: 1,
    tx: 0,
    ty: 0,
    minScale: 0.35,
    maxScale: 3.2,
    dragging: false,
    dragMode: "",
    dragNodeId: "",
    dragClientX: 0,
    dragClientY: 0,
    dragWorldX: 0,
    dragWorldY: 0,
    lastClientX: 0,
    lastClientY: 0,
    viewportEl: null,
    simulationRaf: 0,
    simulationAlpha: 0,
    positions: new Map(),
    scene: null,
    activeLibraryId: "",
    hoveredNodeId: "",
    tooltipEl: null,
  };
  let renamingLibraryId = "";
  let ingestProgressState = null;

  const KB_INGEST_STEP_LABELS = {
    picking: "选择文件",
    running: "准备处理",
    checking: "校验文件",
    parsing: "解析文档",
    chunking: "文本分片",
    embedding: "生成向量",
    saving: "写入索引",
    "needs-password": "等待输入密码",
  };

  if (!el.saveBtn || !api) {
    return;
  }
  docsTreeExpanded = readTreeExpandedState();

  function setStatus(msg, isErr) {
    const text = String(msg || "");
    if (el.status) {
      el.status.textContent = text;
      el.status.style.color = isErr ? "var(--danger)" : "";
    }
    if (el.ingestProgress && !ingestProgressState?.active) {
      el.ingestProgress.hidden = !text;
      el.ingestProgress.textContent = text;
      el.ingestProgress.classList.toggle("is-error", Boolean(isErr));
      if (!isErr) {
        el.ingestProgress.classList.remove("is-error");
      }
    }
    if (isErr) {
      renderModelHealthActionBanner(el.ingestModelHealthBanner, text);
    } else if (!ingestProgressState?.active) {
      renderModelHealthActionBanner(el.ingestModelHealthBanner, "");
    }
    if (el.opsFeedback && el.configDialog?.open) {
      el.opsFeedback.textContent = text;
      el.opsFeedback.hidden = !text;
      el.opsFeedback.classList.toggle("is-error", Boolean(isErr));
      el.opsFeedback.classList.toggle("is-success", Boolean(text) && !isErr);
      el.opsFeedback.classList.toggle("is-busy", Boolean(text) && text.startsWith("正在"));
    }
    lastOpStatus = text;
    lastOpIsErr = Boolean(isErr);
  }

  function clearIngestProgress() {
    ingestProgressState = null;
    syncIngestProgressDom();
  }

  function syncIngestProgressDom() {
    const box = el.ingestProgress;
    if (!box) {
      return;
    }
    const p = ingestProgressState;
    if (!p?.active) {
      box.hidden = true;
      box.textContent = "";
      box.classList.remove("is-error");
      document.querySelectorAll(".kb-dir-status-badge--ingest").forEach((badge) => {
        badge.className = "kb-dir-status-badge";
        badge.textContent = "已启用";
      });
      return;
    }
    const stepLabel = KB_INGEST_STEP_LABELS[p.step] || p.stepLabel || "处理中";
    const libPrefix = p.libraryName ? `「${p.libraryName}」` : "";
    let line = "";
    if (p.phase === "picking") {
      line = `${libPrefix}正在选择入库文件…`;
    } else if (p.phase === "needs-password") {
      line = `${libPrefix}等待输入密码：${p.fileName || "加密文档"}`;
    } else if (p.total > 1) {
      line = `${libPrefix}正在入库（${p.index}/${p.total}）：${p.fileName || "文件"} · ${stepLabel}`;
    } else {
      line = `${libPrefix}正在入库：${p.fileName || "文件"} · ${stepLabel}`;
    }
    box.hidden = false;
    box.textContent = line;
    box.classList.toggle("is-error", p.phase === "error");
    document.querySelectorAll(".kb-dir-block").forEach((block) => {
      const badge = block.querySelector(".kb-dir-status-badge");
      if (!badge) {
        return;
      }
      if (block.dataset.libraryId === p.libraryId) {
        badge.className = "kb-dir-status-badge kb-dir-status-badge--ingest";
        badge.textContent = p.total > 1 ? `入库 ${p.index}/${p.total}` : "入库中";
      } else {
        badge.className = "kb-dir-status-badge";
        badge.textContent = "已启用";
      }
    });
  }

  function handleKbIngestProgress(ev) {
    if (!ev || typeof ev !== "object") {
      return;
    }
    if (ev.phase === "needs-password") {
      ingestProgressState = {
        ...ingestProgressState,
        active: true,
        phase: "needs-password",
        fileName: String(ev.fileName || ingestProgressState?.fileName || "").trim(),
        step: "needs-password",
      };
      syncIngestProgressDom();
      return;
    }
    if (ev.phase === "done" || ev.phase === "canceled") {
      clearIngestProgress();
      return;
    }
    ingestProgressState = {
      active: true,
      libraryId: String(ev.libraryId || ingestProgressState?.libraryId || "").trim(),
      libraryName: String(ev.libraryName || ingestProgressState?.libraryName || "").trim(),
      phase: ev.phase || "running",
      index: Number(ev.index) || 0,
      total: Number(ev.total) || 0,
      fileName: String(ev.fileName || "").trim(),
      step: String(ev.step || "running").trim(),
    };
    syncIngestProgressDom();
  }

  function setOpsButtonBusy(btn, busy, busyLabel) {
    if (!btn) {
      return;
    }
    if (busy) {
      if (!btn.dataset.idleLabel) {
        btn.dataset.idleLabel = btn.textContent || "";
      }
      btn.disabled = true;
      btn.classList.add("is-busy");
      btn.textContent = busyLabel || "处理中…";
      return;
    }
    btn.disabled = false;
    btn.classList.remove("is-busy");
    btn.textContent = btn.dataset.idleLabel || btn.textContent || "";
  }

  const KB_MH_STATUS_LABEL = {
    ok: "正常",
    warning: "警告",
    error: "异常",
    skipped: "已跳过",
    checking: "检测中",
    unknown: "—",
  };

  const KB_MH_OVERALL_LABEL = {
    ok: "全部正常",
    warning: "部分异常",
    error: "严重异常",
    checking: "检测中",
    unknown: "未检测",
  };

  const KB_MH_HISTORY_KEY = "daily_task_tracker_kb_model_health_history_v1";
  const KB_MH_HISTORY_MAX = 5;
  const KB_MODEL_ERROR_PATTERNS = [
    /ollama/i,
    /嵌入/,
    /\bembed/i,
    /bge-/i,
    /rerank/i,
    /重排/,
    /向量/,
    /11434/,
    /llama-server/i,
    /\bonnx\b/i,
    /preload:kb-rerank-model/i,
    /生成向量/,
    /模型.*未安装|未安装.*模型/i,
    /ECONNREFUSED/i,
    /冷启动/,
  ];

  function isKbModelRelatedError(text) {
    const msg = String(text || "");
    if (!msg) {
      return false;
    }
    return KB_MODEL_ERROR_PATTERNS.some((re) => re.test(msg));
  }

  function renderModelHealthActionBanner(host, message) {
    if (!host) {
      return;
    }
    const show = isKbModelRelatedError(message);
    host.hidden = !show;
    host.innerHTML = "";
    if (!show) {
      return;
    }
    const banner = document.createElement("div");
    banner.className = "kb-mh-action-banner";
    const text = document.createElement("span");
    text.className = "kb-mh-action-banner__text";
    text.textContent = "此问题可能与 Ollama 服务、嵌入或重排模型有关。";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "kb-mh-action-banner__btn";
    btn.textContent = "打开模型健康检测";
    btn.addEventListener("click", () => {
      if (typeof window.openKbModelHealthDialog === "function") {
        window.openKbModelHealthDialog();
      }
    });
    banner.appendChild(text);
    banner.appendChild(btn);
    host.appendChild(banner);
  }

  function buildModelHealthSummaryText(report) {
    if (!report) {
      return "";
    }
    const parts = [];
    if (report.ollama?.status === "ok") {
      parts.push("Ollama 正常");
    } else if (report.ollama?.status) {
      parts.push(`Ollama ${KB_MH_STATUS_LABEL[report.ollama.status] || report.ollama.status}`);
    }
    if (report.embedding?.status === "ok") {
      parts.push(`嵌入 ${report.embedding.model || "bge-m3"} 可用`);
    } else if (report.embedding?.status && report.embedding.status !== "skipped") {
      parts.push(`嵌入 ${KB_MH_STATUS_LABEL[report.embedding.status] || report.embedding.status}`);
    }
    if (report.reranker?.status === "skipped") {
      parts.push("重排未启用");
    } else if (report.reranker?.status === "ok") {
      parts.push(`重排 ${report.reranker.activeProvider || report.reranker.provider || "可用"}`);
    } else if (report.reranker?.status) {
      parts.push(`重排 ${KB_MH_STATUS_LABEL[report.reranker.status] || report.reranker.status}`);
    }
    return parts.join(" · ");
  }

  function readModelHealthHistory() {
    try {
      const raw = localStorage.getItem(KB_MH_HISTORY_KEY);
      if (!raw) {
        return [];
      }
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function appendModelHealthHistory(report) {
    if (!report?.checkedAt) {
      return;
    }
    const entry = {
      checkedAt: report.checkedAt,
      overallStatus: String(report.overallStatus || "unknown"),
      durationMs: Number(report.durationMs) || 0,
      summary: buildModelHealthSummaryText(report),
    };
    const list = readModelHealthHistory().filter((item) => item?.checkedAt !== entry.checkedAt);
    list.unshift(entry);
    try {
      localStorage.setItem(KB_MH_HISTORY_KEY, JSON.stringify(list.slice(0, KB_MH_HISTORY_MAX)));
    } catch {
      /* ignore quota */
    }
  }

  function renderModelHealthHistory() {
    if (!el.modelHealthHistory) {
      return;
    }
    const list = readModelHealthHistory();
    el.modelHealthHistory.innerHTML = "";
    if (!list.length) {
      const li = document.createElement("li");
      li.className = "kb-mh-history-empty";
      li.textContent = "暂无历史记录，完成一次检测后将显示最近 5 次结果。";
      el.modelHealthHistory.appendChild(li);
      return;
    }
    list.forEach((item) => {
      const li = document.createElement("li");
      li.className = "kb-mh-history-item";
      const status = String(item.overallStatus || "unknown");
      const badge = document.createElement("span");
      badge.className = `kb-mh-history-badge ${mhStatusClass(status === "ok" ? "ok" : status === "warning" ? "warning" : status === "error" ? "error" : "unknown")}`;
      badge.textContent = KB_MH_OVERALL_LABEL[status] || status;
      const main = document.createElement("div");
      main.className = "kb-mh-history-main";
      const time = document.createElement("span");
      time.className = "kb-mh-history-time";
      time.textContent = item.checkedAt || "—";
      const summary = document.createElement("span");
      summary.className = "kb-mh-history-summary";
      summary.textContent = item.summary || "—";
      main.appendChild(time);
      main.appendChild(summary);
      const meta = document.createElement("span");
      meta.className = "kb-mh-history-meta";
      meta.textContent = Number(item.durationMs) > 0 ? `${item.durationMs}ms` : "";
      li.appendChild(badge);
      li.appendChild(main);
      li.appendChild(meta);
      el.modelHealthHistory.appendChild(li);
    });
  }

  function mhStatusClass(status) {
    const s = String(status || "unknown").toLowerCase();
    if (["ok", "warning", "error", "skipped", "checking", "unknown"].includes(s)) {
      return `is-${s}`;
    }
    return "is-unknown";
  }

  function renderModelHealthKv(container, rows) {
    if (!container) {
      return;
    }
    container.innerHTML = "";
    (rows || []).forEach(([label, value]) => {
      if (value == null || value === "") {
        return;
      }
      const wrap = document.createElement("div");
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = String(value);
      wrap.appendChild(dt);
      wrap.appendChild(dd);
      container.appendChild(wrap);
    });
  }

  function renderModelHealthReport(report, diagnostics) {
    if (!report) {
      return;
    }
    lastModelHealthDiagnostics = String(diagnostics || "");
    const overall = String(report.overallStatus || "unknown");
    if (el.modelHealthOverallBadge) {
      el.modelHealthOverallBadge.textContent = KB_MH_OVERALL_LABEL[overall] || overall;
      el.modelHealthOverallBadge.className = `kb-mh-overall-badge ${mhStatusClass(overall === "ok" ? "ok" : overall === "warning" ? "warning" : overall === "error" ? "error" : "unknown")}`;
    }
    if (el.modelHealthCheckedAt) {
      el.modelHealthCheckedAt.textContent = `最近检测：${report.checkedAt || "—"}`;
    }
    if (el.modelHealthDuration) {
      el.modelHealthDuration.textContent =
        Number(report.durationMs) > 0 ? `耗时 ${report.durationMs}ms` : "";
    }
    if (el.modelHealthSummary) {
      const summaryText = buildModelHealthSummaryText(report);
      el.modelHealthSummary.textContent = summaryText
        ? summaryText
        : "检测 Ollama 服务、嵌入模型与重排序模型是否可用";
    }
    el.modelHealthStatusBadges.forEach((badge) => {
      const key = badge.getAttribute("data-kb-mh-status");
      const block = key === "ollama" ? report.ollama : key === "embedding" ? report.embedding : report.reranker;
      const st = block?.status || "unknown";
      badge.textContent = KB_MH_STATUS_LABEL[st] || st;
      badge.className = `kb-mh-status ${mhStatusClass(st)}`;
    });
    renderModelHealthKv(el.modelHealthOllamaBody, [
      ["服务地址", report.ollama?.baseUrl],
      ["版本", report.ollama?.version],
      ["已安装模型", report.ollama?.modelCount != null ? `${report.ollama.modelCount} 个` : ""],
      ["响应耗时", report.ollama?.latencyMs != null ? `${report.ollama.latencyMs}ms` : ""],
      ["错误", report.ollama?.error],
    ]);
    renderModelHealthKv(el.modelHealthEmbedBody, [
      ["当前模型", report.embedding?.model],
      ["模型已安装", report.embedding?.exists ? "是" : "否"],
      ["嵌入测试", report.embedding?.embedTestPassed ? "通过" : report.embedding?.status === "skipped" ? "跳过" : "未通过"],
      ["向量维度", report.embedding?.dimension != null ? String(report.embedding.dimension) : ""],
      ["耗时", report.embedding?.latencyMs != null ? `${report.embedding.latencyMs}ms` : ""],
      ["说明", report.embedding?.customModelNote],
      ["错误", report.embedding?.error],
    ]);
    renderModelHealthKv(el.modelHealthRerankBody, [
      ["已启用", report.reranker?.enabled ? "是" : "否"],
      ["Provider", report.reranker?.provider],
      ["实际 Provider", report.reranker?.activeProvider],
      ["模型", report.reranker?.model],
      ["打分测试", report.reranker?.testPassed ? "通过" : report.reranker?.status === "skipped" ? "跳过" : "未通过"],
      ["样本分数", report.reranker?.score != null ? String(report.reranker.score) : ""],
      ["耗时", report.reranker?.latencyMs != null ? `${report.reranker.latencyMs}ms` : ""],
      ["错误", report.reranker?.error],
    ]);
    if (el.modelHealthSuggestions) {
      el.modelHealthSuggestions.innerHTML = "";
      const items = Array.isArray(report.suggestions) ? report.suggestions : [];
      if (!items.length) {
        const li = document.createElement("li");
        li.className = "kb-mh-suggestions-empty";
        li.textContent = "未发现需要修复的问题。";
        el.modelHealthSuggestions.appendChild(li);
      } else {
        items.forEach((item) => {
          const li = document.createElement("li");
          li.className = `kb-mh-suggestion kb-mh-suggestion--${item.level || "warning"}`;
          const title = document.createElement("div");
          title.className = "kb-mh-suggestion__title";
          title.textContent = item.title || "建议";
          li.appendChild(title);
          if (item.actionText) {
            const action = document.createElement("div");
            action.className = "kb-mh-suggestion__action";
            action.textContent = item.actionText;
            li.appendChild(action);
          }
          if (item.command) {
            const cmdRow = document.createElement("div");
            cmdRow.className = "kb-mh-suggestion__cmd-row";
            const code = document.createElement("code");
            code.textContent = item.command;
            const copyBtn = document.createElement("button");
            copyBtn.type = "button";
            copyBtn.className = "kb-btn kb-btn--tiny";
            copyBtn.textContent = "复制命令";
            copyBtn.addEventListener("click", () => {
              void navigator.clipboard.writeText(item.command).then(() => {
                setStatus(`已复制：${item.command}`);
              });
            });
            cmdRow.appendChild(code);
            cmdRow.appendChild(copyBtn);
            li.appendChild(cmdRow);
          }
          el.modelHealthSuggestions.appendChild(li);
        });
      }
    }
    if (el.modelHealthJson) {
      el.modelHealthJson.textContent = lastModelHealthDiagnostics || "";
    }
    appendModelHealthHistory(report);
    renderModelHealthHistory();
  }

  function setModelHealthChecking(checked) {
    modelHealthCheckInFlight = !!checked;
    [el.modelHealthRecheckBtn, el.modelHealthBtn].forEach((btn) => {
      if (!btn) {
        return;
      }
      btn.disabled = !!checked;
      if (checked && btn === el.modelHealthRecheckBtn) {
        btn.classList.add("is-busy");
      } else if (btn === el.modelHealthRecheckBtn) {
        btn.classList.remove("is-busy");
      }
    });
    if (checked && el.modelHealthOverallBadge) {
      el.modelHealthOverallBadge.textContent = KB_MH_OVERALL_LABEL.checking;
      el.modelHealthOverallBadge.className = "kb-mh-overall-badge is-checking";
    }
    el.modelHealthStatusBadges.forEach((badge) => {
      if (checked) {
        badge.textContent = KB_MH_STATUS_LABEL.checking;
        badge.className = "kb-mh-status is-checking";
      }
    });
  }

  function openModelHealthDialog() {
    renderModelHealthHistory();
    if (el.modelHealthDialog && typeof el.modelHealthDialog.showModal === "function") {
      portalKbDialogsToBody();
      el.modelHealthDialog.showModal();
    }
  }

  function closeModelHealthDialog() {
    if (el.modelHealthDialog && typeof el.modelHealthDialog.close === "function") {
      el.modelHealthDialog.close();
    }
  }

  function scrollToKbModelConfigSection() {
    const basic = document.getElementById("kbConfigSectionBasic");
    if (basic) {
      basic.open = true;
      basic.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (!el.configDialog?.open && typeof el.configDialog?.showModal === "function") {
      el.configDialog.showModal();
    }
  }

  async function runModelHealthCheck({ openDialog = true } = {}) {
    if (typeof api.kbModelHealthCheck !== "function") {
      setStatus("当前环境不支持模型健康检测。", true);
      return null;
    }
    if (modelHealthCheckInFlight) {
      return null;
    }
    if (openDialog) {
      openModelHealthDialog();
    }
    setModelHealthChecking(true);
    setStatus("正在检测模型健康状态…");
    try {
      const payload = {
        embedModel: String(el.embedModel?.value || "").trim(),
        rerankEnabled: el.rerankEnabled?.checked === true,
        rerankProvider: String(el.rerankProvider?.value || "auto"),
        rerankModel: String(el.rerankModel?.value || "").trim(),
      };
      const out = await api.kbModelHealthCheck(payload);
      if (!out?.ok) {
        setStatus(out?.error || "模型健康检测失败", true);
        return null;
      }
      renderModelHealthReport(out.report, out.diagnostics);
      const overall = out.report?.overallStatus || "unknown";
      setStatus(
        overall === "ok"
          ? "模型健康检测：全部正常"
          : overall === "warning"
            ? "模型健康检测：部分异常，请查看修复建议"
            : "模型健康检测：存在严重异常，请查看修复建议",
        overall !== "ok"
      );
      return out.report;
    } catch (err) {
      setStatus(err.message || String(err), true);
      return null;
    } finally {
      setModelHealthChecking(false);
    }
  }

  window.openKbModelHealthDialog = () => {
    void runModelHealthCheck({ openDialog: true });
  };

  function readTreeExpandedState() {
    try {
      const raw = localStorage.getItem(KB_TREE_EXPANDED_KEY);
      if (!raw) {
        return {};
      }
      const obj = JSON.parse(raw);
      return obj && typeof obj === "object" ? obj : {};
    } catch {
      return {};
    }
  }

  function writeTreeExpandedState(next) {
    try {
      localStorage.setItem(KB_TREE_EXPANDED_KEY, JSON.stringify(next || {}));
    } catch {
      /* ignore */
    }
  }

  function setConfigDirty(dirty = true) {
    configDirty = !!dirty;
    if (el.configSavedBadge) {
      el.configSavedBadge.textContent = configDirty ? "未保存" : "已保存";
      el.configSavedBadge.classList.toggle("is-dirty", configDirty);
    }
  }

  function validateConfigPayload(payload) {
    const layout = typeof window !== "undefined" ? window.KbConfigLayout : null;
    if (!layout || typeof layout.validateKbSettings !== "function") {
      return { ok: true, settings: payload, errors: [], warnings: [] };
    }
    const result = layout.validateKbSettings(payload);
    return {
      ok: !result.errors.length,
      settings: result.settings,
      errors: result.errors,
      warnings: result.warnings,
    };
  }

  function formatSavedTime(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) {
      return "—";
    }
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    if (diffMs < 60_000) {
      return "刚刚";
    }
    if (diffMs < 3_600_000) {
      return `${Math.floor(diffMs / 60_000)} 分钟前`;
    }
    return d.toLocaleString();
  }

  function markConfigSaved() {
    configLastSavedAt = new Date();
    setConfigDirty(false);
    if (el.configLastSavedHint) {
      el.configLastSavedHint.textContent = `最后保存：${formatSavedTime(configLastSavedAt)}`;
    }
  }

  function setConfigSynced() {
    setConfigDirty(false);
  }

  function updateConfigSidebar(st) {
    const activeName =
      (st.libraries || []).find((x) => x.id === st.activeLibraryId)?.name || st.activeLibraryId || "默认";
    if (el.configSidebarDir) {
      el.configSidebarDir.textContent = activeName;
    }
    if (el.configSidebarChunks) {
      el.configSidebarChunks.textContent = `共 ${st.chunkTotal || 0} 条向量分片`;
    }
    if (el.configSidebarModel) {
      el.configSidebarModel.textContent = st.settings?.embedModel || "bge-m3";
    }
    if (el.configSidebarStorage) {
      const path = st.sqlitePath || st.storageRoot || "—";
      el.configSidebarStorage.textContent = path;
      el.configSidebarStorage.title = path;
    }
  }

  function applyConfigDefaultsToForm(defaults = KB_CONFIG_DEFAULTS) {
    const d = defaults || KB_CONFIG_DEFAULTS;
    if (el.chunkSize) el.chunkSize.value = String(d.chunkSize);
    if (el.chunkOverlap) el.chunkOverlap.value = String(d.chunkOverlap);
    if (el.embedModel) el.embedModel.value = d.embedModel;
    if (el.searchTopK) el.searchTopK.value = String(d.searchTopK);
    if (el.searchMinScore) el.searchMinScore.value = String(d.searchMinScore);
    if (el.searchCandidateK) el.searchCandidateK.value = String(d.searchCandidateK);
    if (el.hybridVectorWeight) el.hybridVectorWeight.value = String(d.hybridVectorWeight);
    if (el.keywordRecallLimit) el.keywordRecallLimit.value = String(d.keywordRecallLimit);
    if (el.searchMode) el.searchMode.value = d.searchMode;
    if (el.chunkStrategy) el.chunkStrategy.value = d.chunkStrategy;
    if (el.hybridSearch) el.hybridSearch.checked = d.hybridSearch !== false;
    if (el.useRrfRanking) el.useRrfRanking.checked = d.useRrfRanking !== false;
    if (el.rerankEnabled) el.rerankEnabled.checked = d.rerankEnabled !== false;
    if (el.rerankModel) el.rerankModel.value = d.rerankModel || KB_CONFIG_DEFAULTS.rerankModel;
    if (el.rerankTopN) el.rerankTopN.value = String(d.rerankTopN ?? 30);
    if (el.rerankWeight) el.rerankWeight.value = String(d.rerankWeight ?? 0.75);
    if (el.rerankProvider) el.rerankProvider.value = d.rerankProvider || KB_CONFIG_DEFAULTS.rerankProvider;
    if (el.aiVerifyWriteback) el.aiVerifyWriteback.checked = d.aiVerifyWriteback === true;
    if (el.autoLearnEnabled) el.autoLearnEnabled.checked = d.autoLearnEnabled === true;
    if (el.autoLearnRequireConfirm) el.autoLearnRequireConfirm.checked = d.autoLearnRequireConfirm === true;
    if (el.autoLearnMinQuestionChars) el.autoLearnMinQuestionChars.value = String(d.autoLearnMinQuestionChars);
    if (el.autoLearnMinAnswerChars) el.autoLearnMinAnswerChars.value = String(d.autoLearnMinAnswerChars);
    if (el.autoWebVerify) el.autoWebVerify.checked = d.autoWebVerify === true;
    if (el.watchDirEnabled) el.watchDirEnabled.checked = d.watchDirEnabled === true;
    if (el.watchDirInput) el.watchDirInput.value = d.watchDirPath || "";
    setConfigDirty(true);
  }

  function scrollToConfigSection(sectionId) {
    const panel = document.querySelector(`#kbConfigDialog .kb-card[data-section="${sectionId}"]`);
    const navItem = el.configNavItems.find((n) => n.dataset.section === sectionId);
    if (navItem) {
      el.configNavItems.forEach((n) => n.classList.toggle("is-active", n === navItem));
    }
    if (panel) {
      if (!panel.open) {
        panel.open = true;
      }
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function collectSettingsPayload() {
    return {
      chunkSize: Number(el.chunkSize?.value),
      chunkOverlap: Number(el.chunkOverlap?.value),
      embedModel: String(el.embedModel?.value || "").trim(),
      searchTopK: Number(el.searchTopK?.value),
      searchMinScore: Number(el.searchMinScore?.value),
      searchCandidateK: Number(el.searchCandidateK?.value),
      hybridVectorWeight: Number(el.hybridVectorWeight?.value),
      keywordRecallLimit: Number(el.keywordRecallLimit?.value),
      searchMode: String(el.searchMode?.value || "auto"),
      chunkStrategy: String(el.chunkStrategy?.value || "semantic"),
      hybridSearch: el.hybridSearch?.checked === true,
      useRrfRanking: el.useRrfRanking?.checked === true,
      rerankEnabled: el.rerankEnabled?.checked === true,
      rerankModel: String(el.rerankModel?.value || "").trim(),
      rerankProvider: String(el.rerankProvider?.value || "auto"),
      rerankTopN: Number(el.rerankTopN?.value),
      rerankWeight: Number(el.rerankWeight?.value),
      autoWebVerify: el.autoWebVerify?.checked === true,
      aiVerifyWriteback: el.aiVerifyWriteback?.checked === true,
      autoLearnEnabled: el.autoLearnEnabled?.checked === true,
      autoLearnRequireConfirm: el.autoLearnRequireConfirm?.checked === true,
      autoLearnMinQuestionChars: Number(el.autoLearnMinQuestionChars?.value),
      autoLearnMinAnswerChars: Number(el.autoLearnMinAnswerChars?.value),
      watchDirEnabled: el.watchDirEnabled?.checked === true,
      watchDirPath: String(el.watchDirInput?.value || "").trim(),
    };
  }

  async function saveConfigSettings({ closeAfter = false, silent = false } = {}) {
    if (typeof api.kbSetSettings !== "function") {
      return false;
    }
    const raw = collectSettingsPayload();
    const checked = validateConfigPayload(raw);
    if (!checked.ok) {
      setStatus(checked.errors.join(" "), true);
      return false;
    }
    if (!silent && checked.warnings.length) {
      setStatus(checked.warnings[0], false);
    }
    if (!silent) {
      setStatus("正在保存…");
    }
    try {
      await api.kbSetSettings(checked.settings);
      markConfigSaved();
      if (!silent) {
        setStatus("设置已保存。");
      }
      await refreshState();
      if (closeAfter) {
        closeConfigDialog();
      }
      return true;
    } catch (err) {
      setStatus(err.message || String(err), true);
      return false;
    }
  }

  function scheduleConfigAutoSave() {
    if (configAutoSaveTimer) {
      clearTimeout(configAutoSaveTimer);
    }
    setConfigDirty(true);
    configAutoSaveTimer = setTimeout(() => {
      void saveConfigSettings({ silent: true });
    }, 1800);
  }

  function bindConfigAutoSave() {
    const root = el.configDialog;
    if (!root) {
      return;
    }
    root.addEventListener("input", (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLElement)) {
        return;
      }
      if (t.closest("#kbConfigDialog")) {
        scheduleConfigAutoSave();
      }
    });
    root.addEventListener("change", (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLElement)) {
        return;
      }
      if (t.closest("#kbConfigDialog")) {
        scheduleConfigAutoSave();
      }
    });
  }

  function formatOpsLogCategory(category) {
    if (category === "auto-learn") return "自动学习";
    if (category === "search") return "检索";
    if (category === "ingest") return "入库";
    return "其他";
  }

  function closeOpsLogDialog() {
    const dlg = el.opsLogDialog;
    if (dlg?.open && typeof dlg.close === "function") {
      dlg.close();
    }
  }

  async function loadOpsLogList(category = opsLogCategory) {
    if (!el.opsLogList || typeof api.kbOpsLogList !== "function") {
      setStatus("当前环境不支持操作日志。", true);
      return;
    }
    const libId = String(activeLibraryIdCache || el.librarySelect?.value || "").trim();
    opsLogCategory = String(category || "all");
    el.opsLogList.innerHTML = `<p class="field-hint kb-ops-log-loading">正在加载日志…</p>`;
    try {
      const out = await api.kbOpsLogList({ libraryId: libId || undefined, category: opsLogCategory, limit: 80 });
      if (!out?.ok) {
        el.opsLogList.innerHTML = `<p class="field-hint kb-ops-log-empty">${out?.error || "加载失败"}</p>`;
        return;
      }
      const items = Array.isArray(out.items) ? out.items : [];
      if (el.opsLogMeta) {
        const libName =
          latestDocGroups.find((g) => g.id === out.libraryId)?.name || out.libraryId || "当前目录";
        el.opsLogMeta.textContent = `${libName} · 共 ${items.length} 条${
          opsLogCategory === "all" ? "" : `（${formatOpsLogCategory(opsLogCategory)}）`
        }`;
      }
      if (!items.length) {
        el.opsLogList.innerHTML = `<div class="kb-ops-log-empty-state">
          <p class="kb-ops-log-empty__title">暂无操作记录</p>
          <p class="kb-ops-log-empty__hint">执行检索试用、文件入库或自动学习后，将在此展示相关日志。</p>
        </div>`;
        return;
      }
      const esc = typeof escapeHtml === "function" ? escapeHtml : (t) => String(t ?? "");
      el.opsLogList.innerHTML = items
        .map((item) => {
          const time = formatKbStatTime(item.createdAt);
          const title = esc(String(item.title || "（无标题）"));
          const action = esc(String(item.actionLabel || item.action || "—"));
          const sourceHint =
            item.category === "auto-learn" && item.source
              ? ` · ${esc(formatAutoLearnSourceLabel(item.source))}`
              : item.source
                ? ` · ${esc(String(item.source))}`
                : "";
          const detail = item.detail ? ` title="${esc(item.detail)}"` : "";
          return `<div class="kb-ops-log-row" role="row"${detail}>
            <span class="kb-ops-log-row__time">${esc(time)}</span>
            <span class="kb-ops-log-row__type">${esc(formatOpsLogCategory(item.category))}</span>
            <span class="kb-ops-log-row__title">${title}</span>
            <span class="kb-ops-log-row__action">${action}${sourceHint}</span>
          </div>`;
        })
        .join("");
    } catch (err) {
      const esc = typeof escapeHtml === "function" ? escapeHtml : (t) => String(t ?? "");
      el.opsLogList.innerHTML = `<p class="field-hint kb-ops-log-empty">${esc(err.message || String(err))}</p>`;
    }
  }

  async function openOpsLogDialog(category = "all") {
    portalKbDialogsToBody();
    const dlg = el.opsLogDialog;
    if (!dlg || typeof dlg.showModal !== "function") {
      setStatus("当前环境不支持操作日志弹窗。", true);
      return;
    }
    opsLogCategory = String(category || "all");
    el.opsLogFilters.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.kbLogFilter === opsLogCategory);
    });
    if (!dlg.open) {
      dlg.showModal();
    }
    await loadOpsLogList(opsLogCategory);
  }

  function openConfigDialog() {
    portalKbDialogsToBody();
    const dlg = el.configDialog;
    if (!dlg || typeof dlg.showModal !== "function") {
      return;
    }
    if (dlg.open) {
      return;
    }
    scrollToConfigSection("basic");
    setConfigSynced();
    if (el.opsFeedback) {
      el.opsFeedback.hidden = true;
      el.opsFeedback.textContent = "";
      el.opsFeedback.classList.remove("is-error", "is-success", "is-busy");
    }
    dlg.showModal();
  }

  function closeConfigDialog() {
    const dlg = el.configDialog;
    if (!dlg || typeof dlg.close !== "function") {
      return;
    }
    if (dlg.open) {
      dlg.close();
    }
  }

  /** @type {Promise<{ password: string, remember: boolean, canceled: boolean }>|null} */
  let kbDocPasswordDialogPromise = null;

  function ensureKbDocPasswordDialog() {
    let dlg = document.getElementById("kbDocPasswordDialog");
    if (dlg) {
      return dlg;
    }
    dlg = document.createElement("dialog");
    dlg.id = "kbDocPasswordDialog";
    dlg.className = "kb-dialog-light kb-doc-password-dialog";
    dlg.innerHTML = `
      <form method="dialog" class="kb-doc-password-dialog__form">
        <div class="kb-dialog-light__head">文档密码</div>
        <div class="kb-dialog-light__body">
          <p class="kb-doc-password-dialog__file" data-kb-pwd-file></p>
          <p class="field-hint kb-doc-password-dialog__hint" data-kb-pwd-hint></p>
          <label class="field">
            <span class="field-label">密码</span>
            <input type="password" class="text-input" data-kb-pwd-input autocomplete="off" required />
          </label>
          <label class="field field--checkbox">
            <input type="checkbox" data-kb-pwd-remember checked />
            <span>记住密码（按文件与同目录加密文档复用）</span>
          </label>
        </div>
        <div class="kb-dialog-light__actions">
          <button type="button" class="secondary" data-kb-pwd-cancel>跳过</button>
          <button type="submit" data-kb-pwd-submit>确定</button>
        </div>
      </form>`;
    document.body.appendChild(dlg);
    const form = dlg.querySelector("form");
    const input = dlg.querySelector("[data-kb-pwd-input]");
    form?.addEventListener("submit", (ev) => {
      ev.preventDefault();
      dlg.close("submit");
    });
    dlg.querySelector("[data-kb-pwd-cancel]")?.addEventListener("click", () => dlg.close("cancel"));
    dlg.addEventListener("close", () => {
      if (!kbDocPasswordDialogPromise) {
        return;
      }
      const resolve = kbDocPasswordDialogPromise;
      kbDocPasswordDialogPromise = null;
      if (dlg.returnValue === "submit") {
        resolve({
          canceled: false,
          password: String(input?.value || ""),
          remember: dlg.querySelector("[data-kb-pwd-remember]")?.checked !== false,
        });
      } else {
        resolve({ canceled: true, password: "", remember: false });
      }
    });
    return dlg;
  }

  function promptKbDocumentPassword(meta = {}) {
    const dlg = ensureKbDocPasswordDialog();
    const fileName = String(meta.fileName || meta.name || "").trim() || "加密文档";
    const fileEl = dlg.querySelector("[data-kb-pwd-file]");
    const hintEl = dlg.querySelector("[data-kb-pwd-hint]");
    const input = dlg.querySelector("[data-kb-pwd-input]");
    if (fileEl) {
      fileEl.textContent = fileName;
    }
    if (hintEl) {
      hintEl.textContent =
        String(meta.message || "").trim() ||
        (meta.reason === "open"
          ? "该文档已加密，请输入密码后打开并完成索引。"
          : "该文档已加密，请输入密码以完成入库与检索。");
    }
    if (input) {
      input.value = "";
    }
    return new Promise((resolve) => {
      kbDocPasswordDialogPromise = resolve;
      if (typeof dlg.showModal === "function") {
        dlg.showModal();
        queueMicrotask(() => input?.focus());
      } else {
        resolve({ canceled: true, password: "", remember: false });
      }
    });
  }

  async function unlockKbDocumentWithPrompt(docId, libraryId, meta = {}) {
    if (typeof api.kbUnlockDocument !== "function") {
      return { ok: false, error: "当前环境不支持文档解锁" };
    }
    const prompt = await promptKbDocumentPassword(meta);
    if (prompt.canceled || !prompt.password) {
      return { ok: false, canceled: true };
    }
    setStatus("正在解密并重建索引…");
    const out = await api.kbUnlockDocument({
      docId,
      libraryId,
      password: prompt.password,
      remember: prompt.remember,
    });
    if (out?.ok) {
      await refreshState();
    }
    return out;
  }

  async function openKbDocumentWithPassword(payload, options = {}) {
    if (typeof api.kbOpenDocument !== "function") {
      return { ok: false, error: "当前环境不支持打开文档" };
    }
    const progressMode = options.progressMode || "none";
    let unsubProgress = null;
    let progressState = null;
    if (progressMode === "locate-dialog" && typeof api.onKbOpenDocumentProgress === "function") {
      progressState = createSourceLocateProgressState();
      unsubProgress = api.onKbOpenDocumentProgress((ev) => {
        if (ev?.phase === "full-disk") {
          updateSourceLocateScanProgress(progressState, ev);
        }
      });
    }
    try {
      let out = await api.kbOpenDocument(payload);
      if (out?.needsPassword) {
        const unlocked = await unlockKbDocumentWithPrompt(payload.docId, payload.libraryId, {
          fileName: out.name,
          filePath: out.path,
          message: out.error,
          reason: "open",
        });
        if (!unlocked?.ok) {
          return unlocked?.canceled ? { ok: false, canceled: true } : unlocked;
        }
        out = await api.kbOpenDocument(payload);
      }
      return out;
    } finally {
      if (typeof unsubProgress === "function") {
        unsubProgress();
      }
      if (progressState) {
        finishSourceLocateScanProgress(progressState);
      }
    }
  }

  const sourceLocateUi = {
    dialog: document.getElementById("kbSourceLocateDialog"),
    docName: document.getElementById("kbSourceLocateDocName"),
    missing: document.getElementById("kbSourceLocateMissing"),
    setup: document.getElementById("kbSourceLocateSetup"),
    scanPanel: document.getElementById("kbSourceLocateScanPanel"),
    scanStatus: document.getElementById("kbSourceLocateScanStatus"),
    scanDir: document.getElementById("kbSourceLocateScanDir"),
    driveList: document.getElementById("kbSourceLocateDriveList"),
    pickedPath: document.getElementById("kbSourceLocatePickedPath"),
    pickBtn: document.getElementById("kbSourceLocatePickBtn"),
    confirmPickBtn: document.getElementById("kbSourceLocateConfirmPickBtn"),
    startScanBtn: document.getElementById("kbSourceLocateStartScanBtn"),
    cancelBtn: document.getElementById("kbSourceLocateCancelBtn"),
  };

  let sourceLocateSession = null;

  function createSourceLocateProgressState() {
    showSourceLocateScanPanel(true);
    if (sourceLocateUi.scanStatus) {
      sourceLocateUi.scanStatus.textContent = "正在搜索文档，请稍候…";
    }
    if (sourceLocateUi.scanDir) {
      sourceLocateUi.scanDir.textContent = "";
    }
    return { lastUpdateAt: 0, pendingDir: "", pendingMessage: "" };
  }

  function updateSourceLocateScanProgress(state, ev) {
    if (!state) {
      return;
    }
    state.pendingDir = String(ev?.dir || "").trim();
    state.pendingMessage = String(ev?.message || "").trim();
    const now = Date.now();
    if (now - state.lastUpdateAt < 450) {
      return;
    }
    state.lastUpdateAt = now;
    if (sourceLocateUi.scanStatus) {
      sourceLocateUi.scanStatus.textContent = state.pendingMessage || "正在搜索文档，请稍候…";
    }
    if (sourceLocateUi.scanDir) {
      sourceLocateUi.scanDir.textContent = state.pendingDir
        ? `当前目录：${state.pendingDir}`
        : "";
    }
  }

  function finishSourceLocateScanProgress(state) {
    if (state && state.pendingDir && sourceLocateUi.scanDir) {
      sourceLocateUi.scanDir.textContent = `当前目录：${state.pendingDir}`;
    }
    showSourceLocateScanPanel(false);
  }

  function showSourceLocateScanPanel(active) {
    if (sourceLocateUi.setup) {
      sourceLocateUi.setup.hidden = Boolean(active);
    }
    if (sourceLocateUi.scanPanel) {
      sourceLocateUi.scanPanel.hidden = !active;
    }
    if (sourceLocateUi.startScanBtn) {
      sourceLocateUi.startScanBtn.disabled = Boolean(active);
    }
    if (sourceLocateUi.pickBtn) {
      sourceLocateUi.pickBtn.disabled = Boolean(active);
    }
    if (sourceLocateUi.confirmPickBtn) {
      sourceLocateUi.confirmPickBtn.disabled = Boolean(active) || !sourceLocateSession?.pickedPath;
    }
  }

  function renderSourceLocateDriveList(drives, selected) {
    if (!sourceLocateUi.driveList) {
      return;
    }
    sourceLocateUi.driveList.innerHTML = "";
    const selectedSet = new Set((selected || []).map((d) => String(d || "").toUpperCase()));
    (drives || []).forEach((drive) => {
      const value = String(drive || "").trim();
      if (!value) {
        return;
      }
      const label = document.createElement("label");
      label.className = "kb-source-locate-drive-item";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = value;
      input.checked = selectedSet.size ? selectedSet.has(value.toUpperCase()) : true;
      const text = document.createElement("span");
      text.textContent = value;
      label.appendChild(input);
      label.appendChild(text);
      sourceLocateUi.driveList.appendChild(label);
    });
  }

  function getSelectedSourceLocateDrives() {
    if (!sourceLocateUi.driveList) {
      return [];
    }
    return Array.from(sourceLocateUi.driveList.querySelectorAll('input[type="checkbox"]:checked'))
      .map((node) => String(node.value || "").trim())
      .filter(Boolean);
  }

  async function fetchFixedDrives() {
    if (typeof api.kbListFixedDrives === "function") {
      const out = await api.kbListFixedDrives();
      if (out?.ok && Array.isArray(out.drives) && out.drives.length) {
        return out.drives;
      }
    }
    return ["C:\\"];
  }

  function openSourceLocateDialog(context) {
    const dlg = sourceLocateUi.dialog;
    if (!dlg || typeof dlg.showModal !== "function") {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      sourceLocateSession = {
        resolve,
        context: { ...(context || {}) },
        pickedPath: "",
      };
      if (sourceLocateUi.docName) {
        sourceLocateUi.docName.textContent = `文档：${context?.docName || "（未知）"}`;
      }
      if (sourceLocateUi.missing) {
        const missing = String(context?.missingPath || "").trim();
        sourceLocateUi.missing.textContent = missing ? `原路径已失效：${missing}` : "原路径已失效。";
        if (context?.alreadyScanned) {
          sourceLocateUi.missing.textContent += " 上次搜索未找到，可手动指定或重新选择磁盘搜索。";
        }
      }
      if (sourceLocateUi.pickedPath) {
        sourceLocateUi.pickedPath.textContent = "";
      }
      if (sourceLocateUi.confirmPickBtn) {
        sourceLocateUi.confirmPickBtn.disabled = true;
      }
      showSourceLocateScanPanel(false);
      renderSourceLocateDriveList(context?.drives || [], context?.defaultDrives);
      dlg.showModal();
    });
  }

  function closeSourceLocateDialog(result) {
    const dlg = sourceLocateUi.dialog;
    if (dlg?.open) {
      dlg.close();
    }
    const resolve = sourceLocateSession?.resolve;
    sourceLocateSession = null;
    showSourceLocateScanPanel(false);
    if (typeof resolve === "function") {
      resolve(result || null);
    }
  }

  async function runKbOpenWithLocateFlow(basePayload, context = {}) {
    let out = await openKbDocumentWithPassword({
      ...basePayload,
      allowFullDiskScan: true,
    });
    if (out?.ok || out?.canceled) {
      return out;
    }
    if (!out?.needsLocate && !context.forceLocate) {
      return out;
    }
    const drives = out?.drives?.length ? out.drives : await fetchFixedDrives();
    const locateChoice = await openSourceLocateDialog({
      docName: out?.docName || context.docName || "",
      missingPath: out?.missingPath || basePayload.sourcePath || "",
      drives,
      alreadyScanned: Boolean(out?.alreadyScanned),
      defaultDrives: drives.filter((d) => /^E:/i.test(String(d || ""))),
      basePayload,
    });
    if (!locateChoice) {
      return { ok: false, canceled: true };
    }
    if (locateChoice.openResult) {
      return locateChoice.openResult;
    }
    if (locateChoice.manualPath) {
      return openKbDocumentWithPassword(
        {
          ...basePayload,
          manualPath: locateChoice.manualPath,
          allowFullDiskScan: false,
        },
        { progressMode: "none" }
      );
    }
    return { ok: false, canceled: true };
  }

  function formatOpenDocSuccessMessage(out, fallbackPath = "") {
    const openedPath = out?.path || fallbackPath || "";
    if (out?.relocated && out?.fullDiskScan) {
      return `已通过磁盘搜索定位并打开：${openedPath}`;
    }
    if (out?.relocated) {
      return `文档路径已更新并打开：${openedPath}`;
    }
    return `已打开源文件：${openedPath}`;
  }

  function showCopyableResultDialog(message, title = "提示") {
    let dlg = document.getElementById("kbResultDialog");
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = "kbResultDialog";
      dlg.className = "kb-result-dialog kb-result-dialog-light";
      dlg.innerHTML = `
        <div class="kb-result-dialog__head">
          <h3 class="kb-result-dialog__title"></h3>
        </div>
        <div class="kb-result-dialog__body">
          <textarea class="kb-result-dialog__textarea" readonly></textarea>
          <div class="dialog-actions kb-result-dialog__actions">
            <button type="button" class="secondary" data-kb-copy>复制内容</button>
            <button type="button" data-kb-close>确定</button>
          </div>
        </div>`;
      document.body.appendChild(dlg);
      dlg.querySelector("[data-kb-close]")?.addEventListener("click", () => dlg.close());
      dlg.querySelector("[data-kb-copy]")?.addEventListener("click", async () => {
        const ta = dlg.querySelector("textarea");
        const text = String(ta?.value || "");
        try {
          await navigator.clipboard.writeText(text);
          setStatus("已复制弹窗内容到剪贴板。");
        } catch {
          ta?.focus();
          ta?.select();
          setStatus("已选中文本，请 Ctrl+C 复制。");
        }
      });
    }
    const titleEl = dlg.querySelector(".kb-result-dialog__title");
    const ta = dlg.querySelector(".kb-result-dialog__textarea");
    dlg.className = "kb-result-dialog kb-result-dialog-light";
    if (titleEl) {
      titleEl.textContent = String(title || "提示");
    }
    if (ta) {
      ta.value = String(message || "");
      ta.scrollTop = 0;
    }
    dlg.showModal();
  }

  function renderLibraries(activeLibraryId, libraries) {
    if (!el.librarySelect) {
      return;
    }
    const list = Array.isArray(libraries) ? libraries : [];
    const fill = (target, selectedId) => {
      if (!target) return;
      target.innerHTML = "";
      list.forEach((lib) => {
        const opt = document.createElement("option");
        opt.value = lib.id;
        opt.textContent = lib.name || lib.id;
        if (lib.id === selectedId) {
          opt.selected = true;
        }
        target.appendChild(opt);
      });
    };
    fill(el.librarySelect, activeLibraryId);
  }

  function updateTrialCharCount() {
    if (!el.trialCharCount || !el.trialQuery) {
      return;
    }
    const len = String(el.trialQuery.value || "").length;
    el.trialCharCount.textContent = `${len}/500`;
  }

  function syncTrialSelectAllState() {
    if (!el.trialSelectAll || !el.trialLibraries) {
      return;
    }
    const inputs = Array.from(el.trialLibraries.querySelectorAll("input[data-role='kb-trial-library']"));
    if (!inputs.length) {
      el.trialSelectAll.checked = true;
      el.trialSelectAll.indeterminate = false;
      return;
    }
    const checked = inputs.filter((x) => x.checked).length;
    el.trialSelectAll.checked = checked === inputs.length;
    el.trialSelectAll.indeterminate = checked > 0 && checked < inputs.length;
  }

  function setAllTrialLibrariesChecked(checked) {
    if (!el.trialLibraries) {
      return;
    }
    el.trialLibraries.querySelectorAll("input[data-role='kb-trial-library']").forEach((node) => {
      node.checked = !!checked;
    });
    syncTrialSelectAllState();
  }

  function setTrialSearchBusy(busy) {
    if (!el.trialSearch) {
      return;
    }
    if (busy) {
      if (!el.trialSearch.dataset.idleLabel) {
        el.trialSearch.dataset.idleLabel = el.trialSearch.textContent || "检索";
      }
      el.trialSearch.disabled = true;
      el.trialSearch.classList.add("is-busy");
      el.trialSearch.textContent = "检索中…";
      el.trialReset?.setAttribute("disabled", "disabled");
      return;
    }
    el.trialSearch.disabled = false;
    el.trialSearch.classList.remove("is-busy");
    el.trialSearch.textContent = el.trialSearch.dataset.idleLabel || "检索";
    el.trialReset?.removeAttribute("disabled");
  }

  function setTrialStatus(message, options = {}) {
    const text = String(message || "").trim();
    const busy = Boolean(options.busy);
    const isErr = Boolean(options.isErr);
    if (el.trialStatus) {
      if (!text) {
        el.trialStatus.hidden = true;
        el.trialStatus.textContent = "";
        el.trialStatus.classList.remove("is-busy", "is-error", "is-ok");
      } else {
        el.trialStatus.hidden = false;
        el.trialStatus.textContent = text;
        el.trialStatus.classList.toggle("is-busy", busy);
        el.trialStatus.classList.toggle("is-error", isErr);
        el.trialStatus.classList.toggle("is-ok", !busy && !isErr);
      }
    }
    if (isErr) {
      renderModelHealthActionBanner(el.trialModelHealthBanner, text);
    } else if (!busy) {
      renderModelHealthActionBanner(el.trialModelHealthBanner, "");
    }
    if (el.trialResults) {
      el.trialResults.classList.toggle("is-active", busy || Boolean(text));
    }
  }

  function renderTrialLoading(query) {
    if (!el.trialResults) {
      return;
    }
    el.trialResults.innerHTML = "";
    const box = document.createElement("div");
    box.className = "kb-trial-loading";
    box.innerHTML = `<span class="kb-trial-loading__spinner" aria-hidden="true"></span><span class="kb-trial-loading__text"></span>`;
    box.querySelector(".kb-trial-loading__text").textContent = `正在检索「${query}」…`;
    el.trialResults.appendChild(box);
    el.trialResults.classList.add("is-active");
  }

  const htmlEsc =
    typeof escapeHtml === "function" ? escapeHtml : (text) => String(text ?? "");

  function closeSearchResultDialog() {
    const dlg = el.searchResultDialog;
    if (dlg?.open && typeof dlg.close === "function") {
      dlg.close();
    }
  }

  function formatHitTitle(hit) {
    const lib = hit.libraryName ? `【${hit.libraryName}】` : "";
    return `${lib}${hit.sourceFile || hit.docName || "未命名文档"}`;
  }

  function buildHitTraceLines(hit, out) {
    const trace = [];
    if (hit.chunkIndex != null) {
      trace.push(`分块 #${Number(hit.chunkIndex) + 1}`);
    }
    if (hit.charStart != null && hit.charEnd != null) {
      trace.push(`字符 ${hit.charStart}–${hit.charEnd}`);
    }
    if (hit.sourcePath && !String(hit.sourcePath).startsWith("ai://")) {
      trace.push(hit.sourcePath);
    }
    if (out?.hybridSearch && hit.vectorScore != null) {
      trace.push(`向量 ${Number(hit.vectorScore).toFixed(3)}${hit.vectorRank ? `#${hit.vectorRank}` : ""}`);
    }
    if (out?.hybridSearch && hit.keywordScore != null) {
      trace.push(`关键词 ${Number(hit.keywordScore).toFixed(3)}${hit.keywordRank ? `#${hit.keywordRank}` : ""}`);
    }
    if (hit.metadataScore != null) {
      trace.push(`元数据 ${Number(hit.metadataScore).toFixed(3)}${hit.metadataRank ? `#${hit.metadataRank}` : ""}`);
    }
    if (hit.ftsScore != null) {
      trace.push(`全文 ${Number(hit.ftsScore).toFixed(3)}${hit.ftsRank ? `#${hit.ftsRank}` : ""}`);
    }
    if (hit.fieldBoost != null && Number(hit.fieldBoost) !== 0) {
      trace.push(`字段+${Number(hit.fieldBoost).toFixed(2)}`);
    }
    if (hit.recallSource) {
      trace.push(`召回 ${hit.recallSource}`);
    }
    if (hit.credibility) {
      trace.push(`可信度 ${hit.credibility}`);
    }
    return trace;
  }

  function canOpenHitSource(hit) {
    if (!hit?.docId) {
      return false;
    }
    const sp = String(hit.sourcePath || "").trim();
    if (sp.startsWith("ai://")) {
      return false;
    }
    if (hit.autoLearn && !sp) {
      return false;
    }
    return true;
  }

  function extractHitSourcePathCandidates(hit) {
    const out = [];
    const push = (value) => {
      const v = String(value || "").trim();
      if (v && !v.startsWith("ai://") && !out.includes(v)) {
        out.push(v);
      }
    };
    push(hit?.sourcePath);
    const { meta } = parseHitChunkText(hit?.text || "");
    const pathRow = meta.find((row) => row.label === "路径");
    push(pathRow?.value);
    return out;
  }

  function showSearchResultActionFeedback(message, isErr = false) {
    const text = String(message || "");
    if (el.searchResultMeta) {
      el.searchResultMeta.textContent = text;
      el.searchResultMeta.classList.toggle("is-error", Boolean(isErr));
    }
    setStatus(text, isErr);
    if (isErr && text) {
      showCopyableResultDialog(text, "打开源文件失败");
    }
  }

  function followUpKbHit(hit, query) {
    if (!hit) {
      return;
    }
    const title = formatHitTitle(hit);
    const snippet = String(hit.text || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 240);
    const q = String(query || searchResultState.query || "").trim();
    const prompt = [
      `请基于知识库文档「${title}」继续解答我的问题。`,
      q ? `\n我的问题：${q}` : "",
      snippet ? `\n\n参考片段：\n${snippet}` : "",
    ].join("");
    closeSearchResultDialog();
    window.location.hash = "#/ai";
    window.setTimeout(() => {
      const input = document.getElementById("aiUserInput");
      if (!input) {
        return;
      }
      input.value = prompt;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
    }, 120);
  }

  function buildKbHitCardHtml(hit, index, query) {
    const score = Number(hit.finalScore ?? hit.score ?? 0);
    const preview = String(hit.text || "")
      .trim()
      .replace(/\s+/g, " ");
    const previewShort = preview.length > 120 ? `${preview.slice(0, 120)}…` : preview || "（无预览）";
    return [
      `<div class="jl-kb-card__source">${htmlEsc(formatHitTitle(hit))}</div>`,
      `<p class="jl-kb-card__snippet">${htmlEsc(previewShort)}</p>`,
      `<div class="jl-kb-card__foot">`,
      `<span class="jl-kb-card__score">相关度 ${score.toFixed(3)}</span>`,
      `<button type="button" class="jl-btn jl-btn--ghost kb-kb-followup-btn" data-kb-followup="${index}">继续追问</button>`,
      `</div>`,
    ].join("");
  }

  function wireKbHitCardActions(root, hits, query) {
    if (!root) {
      return;
    }
    root.querySelectorAll(".kb-kb-followup-btn").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const idx = Number(btn.getAttribute("data-kb-followup"));
        const hit = hits?.[idx];
        if (hit) {
          followUpKbHit(hit, query);
        }
      });
    });
  }

  function syncSearchResultActionButtons(hit) {
    if (el.searchResultOpenDocBtn) {
      const canOpen = canOpenHitSource(hit);
      el.searchResultOpenDocBtn.disabled = !canOpen;
      el.searchResultOpenDocBtn.title = canOpen
        ? "在系统默认应用中打开源文件"
        : hit?.docId
          ? hit.autoLearn
            ? "该条目无本地源文件（可能为自动学习生成）"
            : "该条目无可用本地路径"
          : "缺少文档信息";
    }
    if (el.searchResultRelocateBtn) {
      const canOpen = canOpenHitSource(hit);
      el.searchResultRelocateBtn.disabled = !canOpen;
      el.searchResultRelocateBtn.title = canOpen
        ? "手动指定迁移后的文件路径，或选择磁盘搜索"
        : "该条目无法指定源文件路径";
    }
    if (el.searchResultCopyBtn) {
      const hasText = Boolean(String(hit?.text || "").trim());
      el.searchResultCopyBtn.disabled = !hasText;
      el.searchResultCopyBtn.title = hasText ? "复制当前片段正文与来源信息" : "当前条目无可复制正文";
    }
    if (el.searchResultLocateBtn) {
      const canLocate = Boolean(hit?.docId);
      el.searchResultLocateBtn.disabled = !canLocate;
      el.searchResultLocateBtn.title = canLocate
        ? "在左侧目录树与入库文档列表中高亮该文档"
        : "该条目缺少文档信息，无法定位";
    }
    if (el.searchResultFollowUpBtn) {
      const hasText = Boolean(String(hit?.text || "").trim());
      el.searchResultFollowUpBtn.disabled = !hasText;
      el.searchResultFollowUpBtn.title = hasText ? "将当前片段带入 AI 助手继续追问" : "当前条目无可追问正文";
    }
  }

  function clearDocumentLocateHighlight() {
    document.querySelectorAll(".kb-ingest-row.is-located, .kb-dir-row.is-located").forEach((node) => {
      node.classList.remove("is-located");
    });
  }

  function findIngestDocRow(docId) {
    const id = String(docId || "").trim();
    if (!id || !el.docList) {
      return null;
    }
    return Array.from(el.docList.querySelectorAll(".kb-ingest-row")).find(
      (row) => String(row.dataset.docId || "") === id
    );
  }

  function pulseDocumentLocateHighlight(docId, libraryId) {
    clearDocumentLocateHighlight();
    const docRow = findIngestDocRow(docId);
    const libBlock = libraryId
      ? el.dirTree?.querySelector(`.kb-dir-block[data-library-id="${libraryId}"]`)
      : null;
    const libRow = libBlock?.querySelector(".kb-dir-row") || null;
    if (libRow) {
      libRow.classList.add("is-located");
      libRow.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    if (docRow) {
      docRow.classList.add("is-located");
      docRow.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    if (locateHighlightTimer) {
      clearTimeout(locateHighlightTimer);
    }
    locateHighlightTimer = window.setTimeout(() => {
      clearDocumentLocateHighlight();
      locateHighlightTimer = 0;
    }, 4500);
  }

  async function locateSearchResultInTree() {
    const index = searchResultState.selectedIndex;
    const hit = searchResultState.hits?.[index];
    if (!hit?.docId) {
      setStatus("该条目缺少文档信息，无法定位。", true);
      return;
    }
    const libId = String(hit.libraryId || activeLibraryIdCache || "").trim();
    closeSearchResultDialog();
    setStatus("正在定位文档…");
    try {
      if (libId && libId !== activeLibraryIdCache && typeof api.kbLibrarySetActive === "function") {
        const out = await api.kbLibrarySetActive(libId);
        if (!out?.ok) {
          setStatus(out?.error || "切换目录失败", true);
          return;
        }
        await refreshState();
      }
      if (libId) {
        docsTreeExpanded[libId] = true;
        writeTreeExpandedState(docsTreeExpanded);
      }
      ingestDocsExpanded = true;
      rerenderLibraryViews(latestDocGroups, activeLibraryIdCache);
      window.requestAnimationFrame(() => {
        const ingestPanel = document.querySelector(".kb-ingest-panel");
        ingestPanel?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        pulseDocumentLocateHighlight(hit.docId, libId);
        const docName = hit.sourceFile || hit.docName || "文档";
        if (findIngestDocRow(hit.docId)) {
          setStatus(`已定位到「${docName}」。`);
        } else {
          setStatus(`未在入库列表中找到「${docName}」，可能已被删除。`, true);
        }
      });
    } catch (err) {
      setStatus(err.message || String(err), true);
    }
  }

  async function copySearchResultSnippet() {
    const index = searchResultState.selectedIndex;
    const hit = searchResultState.hits?.[index];
    const text = String(hit?.text || "").trim();
    if (!text) {
      setStatus("当前条目无可复制正文。", true);
      return;
    }
    const title = formatHitTitle(hit);
    const trace = buildHitTraceLines(hit, searchResultState.out);
    const payload = [title, trace.length ? trace.join(" · ") : "", "", text]
      .filter((line, idx, arr) => !(idx === 1 && !line))
      .join("\n");
    try {
      await navigator.clipboard.writeText(payload);
      setStatus("已复制片段到剪贴板。");
    } catch {
      setStatus("复制失败，请手动选择详情区文本复制。", true);
    }
  }

  function parseHitChunkText(rawText) {
    const text = String(rawText || "").trim();
    if (!text) {
      return { meta: [], body: "（无正文）" };
    }
    const sepMatch = text.match(/\n---\n/);
    const headerPart = sepMatch ? text.slice(0, sepMatch.index) : "";
    let body = sepMatch ? text.slice(sepMatch.index + 5) : text;
    const meta = [];
    headerPart.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }
      const m = trimmed.match(/^\[([^\]]+)\]\s*(.*)$/);
      if (m) {
        meta.push({ label: m[1], value: m[2] });
      }
    });
    if (!meta.length && !sepMatch) {
      body = text;
    }
    return { meta, body: String(body || "").trim() || "（无正文）" };
  }

  function formatHitChunkBodyHtml(rawText) {
    const { meta, body } = parseHitChunkText(rawText);
    const parts = ['<div class="kb-hit-detail">'];
    if (meta.length) {
      parts.push('<dl class="kb-hit-detail__meta">');
      meta.forEach(({ label, value }) => {
        const isPath = label === "路径";
        parts.push(
          `<div class="kb-hit-detail__meta-row${isPath ? " is-path" : ""}">`,
          `<dt>${htmlEsc(label)}</dt>`,
          `<dd>${htmlEsc(value || "—")}</dd>`,
          `</div>`
        );
      });
      parts.push("</dl>");
    }
    const paragraphs = body.split(/\n{2,}/).filter((p) => p.trim());
    parts.push('<article class="kb-hit-detail__body">');
    if (!paragraphs.length) {
      parts.push(`<p class="kb-hit-detail__para">${htmlEsc(body)}</p>`);
    } else {
      paragraphs.forEach((para) => {
        const lines = para
          .split(/\r?\n/)
          .map((line) => htmlEsc(line.trim()))
          .filter(Boolean)
          .join("<br>");
        parts.push(`<p class="kb-hit-detail__para">${lines || htmlEsc(para.trim())}</p>`);
      });
    }
    parts.push("</article></div>");
    return parts.join("");
  }

  function formatHitTraceHtml(hit, out) {
    const trace = buildHitTraceLines(hit, out);
    if (!trace.length) {
      return "";
    }
    return `<div class="kb-search-result-detail__trace">${trace
      .map((line) => `<span class="kb-search-result-trace-chip">${htmlEsc(line)}</span>`)
      .join("")}</div>`;
  }

  function renderSearchResultDetail(hit, index, out) {
    if (!el.searchResultDetail) {
      return;
    }
    if (!hit) {
      el.searchResultDetail.innerHTML = `<p class="kb-search-result-detail-empty">选择左侧条目查看详情</p>`;
      syncSearchResultActionButtons(null);
      return;
    }
    const score = Number(hit.finalScore ?? hit.score ?? 0);
    const traceHtml = formatHitTraceHtml(hit, out);
    const bodyHtml = formatHitChunkBodyHtml(hit.text);
    el.searchResultDetail.innerHTML = [
      `<header class="kb-search-result-detail__head">`,
      `<h4 class="kb-search-result-detail__title">${htmlEsc(formatHitTitle(hit))}</h4>`,
      `<div class="kb-search-result-detail__badges">`,
      `<span class="kb-search-result-badge">#${index + 1}</span>`,
      `<span class="kb-search-result-badge is-score">相关度 ${score.toFixed(4)}</span>`,
      hit.autoLearn ? `<span class="kb-search-result-badge is-auto">自动学习</span>` : "",
      `</div>`,
      traceHtml,
      `</header>`,
      bodyHtml,
    ].join("");
    syncSearchResultActionButtons(hit);
  }

  function selectSearchResultHit(index) {
    const hits = searchResultState.hits || [];
    if (!hits.length || index < 0 || index >= hits.length) {
      searchResultState.selectedIndex = -1;
      renderSearchResultDetail(null, -1, searchResultState.out);
      if (el.searchResultList) {
        el.searchResultList.querySelectorAll(".kb-search-result-item").forEach((node) => {
          node.classList.remove("is-active");
        });
      }
      return;
    }
    searchResultState.selectedIndex = index;
    const hit = hits[index];
    renderSearchResultDetail(hit, index, searchResultState.out);
    if (el.searchResultList) {
      el.searchResultList.querySelectorAll(".kb-search-result-item").forEach((node, i) => {
        node.classList.toggle("is-active", i === index);
      });
      const active = el.searchResultList.querySelector(".kb-search-result-item.is-active");
      active?.scrollIntoView({ block: "nearest" });
    }
  }

  function formatEmbedDeviceSummary(dev, out) {
    if (!dev && !out?.recallMs) {
      return "";
    }
    const parts = [];
    if (dev) {
      const reqMap = { gpu: "优先 GPU", cpu: "仅 CPU", auto: "自动" };
      const req = reqMap[dev.requested] || String(dev.requested || "—");
      const actual = String(dev.label || "未知");
      const ms = Number(dev.embedMs || out?.embedMs || 0);
      const timing = ms > 0 ? ` · 嵌入 ${ms}ms` : "";
      parts.push(`向量算力 ${actual}（配置 ${req}${timing}）`);
    } else if (Number(out?.embedMs) > 0) {
      parts.push(`嵌入 ${out.embedMs}ms`);
    }
    if (Number(out?.recallMs) > 0) {
      parts.push(`召回 ${out.recallMs}ms`);
    }
    if (Number(out?.rerankMs) > 0 && out?.rerankProvider && out.rerankProvider !== "disabled") {
      parts.push(`重排 ${out.rerankMs}ms（${out.rerankProvider}）`);
    }
    return parts.length ? ` · ${parts.join(" · ")}` : "";
  }

  let searchLoadingTimer = null;
  let searchProgressLogEl = null;
  let activeSearchProgressId = null;
  let activeSearchQueryText = "";
  let pendingFullSearchResult = null;
  let unsubSearchProgress = null;
  let unsubSearchResult = null;
  let searchResultApplied = false;
  const KB_SEARCH_UI_TIMEOUT_MS = 360000;

  function createSearchId() {
    return `s${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function stopSearchProgressListener() {
    if (typeof unsubSearchProgress === "function") {
      unsubSearchProgress();
      unsubSearchProgress = null;
    }
    if (typeof unsubSearchResult === "function") {
      unsubSearchResult();
      unsubSearchResult = null;
    }
    activeSearchProgressId = null;
    activeSearchQueryText = "";
    pendingFullSearchResult = null;
    searchResultApplied = false;
  }

  function resolveSearchOutput(out, query) {
    const sid = activeSearchProgressId;
    const pending = pendingFullSearchResult;
    if (pending && sid && String(pending.searchId || "") === sid) {
      return pending;
    }
    if (out && Array.isArray(out.hits) && out.hits.length) {
      return out;
    }
    if (out && out.ok && out.deliveredVia === "event" && pending) {
      return pending;
    }
    return out;
  }

  function applySearchResultIfReady(query, source = "invoke") {
    if (searchResultApplied) {
      return true;
    }
    const sid = activeSearchProgressId;
    const pending = pendingFullSearchResult;
    if (!sid || !pending || String(pending.searchId || "") !== sid) {
      return false;
    }
    if (!pending.ok) {
      return false;
    }
    searchResultApplied = true;
    if (shouldAutoOpenSearchResultDialog()) {
      ensureSearchResultDialogVisible();
      populateSearchResultDialog(pending, query || activeSearchQueryText);
    } else {
      searchResultState = {
        hits: Array.isArray(pending.hits) ? pending.hits : [],
        out: pending,
        selectedIndex: -1,
        query: query || activeSearchQueryText,
      };
    }
    const latency = Number(pending.elapsedMs || 0);
    const hybridLabel = pending.hybridSearch ? "混合" : "向量";
    const profileLabel = pending.queryProfile ? ` · ${pending.queryProfile}` : "";
    const modeLabel = pending.searchMode ? ` · ${pending.searchMode}` : "";
    const confLabel = pending.lowConfidence ? " · 低置信" : "";
    const summary = `检索完成（${hybridLabel}${profileLabel}${modeLabel}${confLabel} · 模型 ${pending.model || "—"} · ${latency}ms），命中 ${(pending.hits || []).length} 条${formatEmbedDeviceSummary(pending.embedDevice, pending)}`;
    setTrialStatus(summary, { isErr: pending.lowConfidence });
    setStatus(
      `${summary}（阈值 ≥ ${Number(pending.minScore ?? 0.55).toFixed(2)}，候选池 ${pending.searchCandidateK || "—"}）。`
    );
    renderTrialResultHint(summary, (pending.hits || []).length, pending.hits || [], query || activeSearchQueryText);
    if (pending.debug && el.trialDebug) {
      const d = pending.debug;
      el.trialDebug.hidden = false;
      el.trialDebug.innerHTML = [
        "<h4 class=\"kb-debug-title\">检索调试</h4>",
        `<div class="kb-debug-grid">`,
        `<span>问题类型</span><span>${pending.queryType || d.queryType || "—"}</span>`,
        `<span>生效模式</span><span>${d.effectiveMode || pending.searchMode || "—"}</span>`,
        `<span>向量召回</span><span>${d.recallStats?.vector ?? pending.recallStats?.vector ?? 0} 条</span>`,
        `<span>关键词召回</span><span>${d.recallStats?.keyword ?? pending.recallStats?.keyword ?? 0} 条</span>`,
        `<span>元数据召回</span><span>${d.recallStats?.metadata ?? pending.recallStats?.metadata ?? 0} 条</span>`,
        `<span>全文召回</span><span>${d.recallStats?.fts ?? pending.recallStats?.fts ?? 0} 条</span>`,
        `<span>RRF</span><span>${d.useRrf ? "开启" : "关闭"}</span>`,
        `<span>阈值</span><span>${Number(d.minScore ?? pending.minScore ?? 0).toFixed(2)} / 拒答 ${Number(d.noAnswerThreshold ?? 0).toFixed(2)}</span>`,
        `<span>耗时</span><span>${latency} ms</span>`,
        `<span>呈现</span><span>${source === "event" ? "即时推送" : "IPC 返回"}</span>`,
        `</div>`,
      ].join("");
    }
    return true;
  }

  function handleSearchResultPush(ev) {
    if (!ev || (activeSearchProgressId && ev.searchId !== activeSearchProgressId)) {
      return;
    }
    pendingFullSearchResult = ev;
    applySearchResultIfReady(activeSearchQueryText, "event");
  }

  function appendSearchProgressLine(text, kind = "info") {
    if (!searchProgressLogEl) {
      return;
    }
    const li = document.createElement("li");
    li.className = `kb-search-progress-log__item is-${kind}`;
    const ts = document.createElement("span");
    ts.className = "kb-search-progress-log__time";
    ts.textContent = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    const msg = document.createElement("span");
    msg.className = "kb-search-progress-log__msg";
    msg.textContent = String(text || "");
    li.appendChild(ts);
    li.appendChild(msg);
    searchProgressLogEl.appendChild(li);
    searchProgressLogEl.scrollTop = searchProgressLogEl.scrollHeight;
  }

  function handleSearchProgress(ev) {
    if (!ev || (activeSearchProgressId && ev.searchId !== activeSearchProgressId)) {
      return;
    }
    const phase = String(ev.phase || "");
    const message = String(ev.message || "").trim();
    if (!message) {
      return;
    }
    let kind = "info";
    if (phase === "error") {
      kind = "error";
    } else if (phase === "done") {
      kind = "ok";
    } else if (phase === "embed_done" || phase === "recall_lib_done" || phase === "rerank_done") {
      kind = "done";
    }
    appendSearchProgressLine(message, kind);
    if (el.searchResultMeta) {
      const sec = ev.elapsedMs != null ? Math.round(Number(ev.elapsedMs) / 1000) : null;
      const tail = sec != null ? ` · 已 ${sec}s` : "";
      el.searchResultMeta.textContent = `${message}${tail}`;
      el.searchResultMeta.classList.remove("is-error");
    }
    if (phase === "error") {
      renderModelHealthActionBanner(el.searchResultModelHealthBanner, message);
    }
    if (phase === "done") {
      const wrap = searchProgressLogEl?.closest(".kb-search-result-loading");
      wrap?.querySelector(".kb-trial-loading__spinner")?.remove();
      if (!searchResultApplied) {
        appendSearchProgressLine("正在呈现结果列表…", "info");
      }
      applySearchResultIfReady(activeSearchQueryText, "event");
      return;
    }
    if (phase !== "error") {
      setTrialStatus(message, { busy: true });
    }
  }

  function stopSearchLoadingTimer() {
    if (searchLoadingTimer) {
      clearInterval(searchLoadingTimer);
      searchLoadingTimer = null;
    }
  }

  function startSearchLoadingTimer() {
    stopSearchLoadingTimer();
    const started = Date.now();
    searchLoadingTimer = setInterval(() => {
      const sec = Math.round((Date.now() - started) / 1000);
      const hint =
        sec >= 8
          ? "（首次检索可能需加载 bge-m3 或下载 bge-reranker ONNX（约 570MB），约 1–3 分钟；若超过 6 分钟将自动报错）"
          : "";
      if (el.searchResultMeta) {
        el.searchResultMeta.textContent = `正在检索，已等待 ${sec}s…${hint}`;
      }
    }, 1000);
  }

  function kbSearchWithTimeout(payload) {
    return Promise.race([
      api.kbSearch(payload),
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(
              `检索超时（>${Math.round(KB_SEARCH_UI_TIMEOUT_MS / 1000)}s）。主进程未在时限内返回，常见原因：① Ollama 嵌入 bge-m3 冷启动或卡住；② 首次下载 bge-reranker ONNX（约 570MB）；③ 与预热/入库争用 Ollama。请确认 Ollama 已启动，或执行 npm run preload:kb-rerank-model 预下载重排模型后重试。`
            )
          );
        }, KB_SEARCH_UI_TIMEOUT_MS);
      }),
    ]);
  }

  function renderSearchResultLoading(query) {
    if (el.searchResultQuery) {
      el.searchResultQuery.textContent = `检索词：${query}`;
    }
    if (el.searchResultMeta) {
      el.searchResultMeta.textContent = "正在检索，请稍候…（下方将实时显示各阶段进度）";
      el.searchResultMeta.classList.remove("is-error");
    }
    renderModelHealthActionBanner(el.searchResultModelHealthBanner, "");
    searchProgressLogEl = null;
    if (el.searchResultList) {
      const wrap = document.createElement("div");
      wrap.className = "kb-search-result-loading";
      const spinner = document.createElement("span");
      spinner.className = "kb-trial-loading__spinner";
      spinner.setAttribute("aria-hidden", "true");
      const title = document.createElement("p");
      title.className = "kb-search-progress-title";
      title.textContent = `正在检索「${query}」…`;
      const log = document.createElement("ul");
      log.className = "kb-search-progress-log";
      log.setAttribute("aria-live", "polite");
      wrap.appendChild(spinner);
      wrap.appendChild(title);
      wrap.appendChild(log);
      el.searchResultList.innerHTML = "";
      el.searchResultList.appendChild(wrap);
      searchProgressLogEl = log;
      appendSearchProgressLine("已提交检索请求，等待主进程…", "info");
    }
    renderSearchResultDetail(null, -1, null);
    syncSearchResultActionButtons(null);
  }

  function renderSearchResultError(message) {
    const errText = String(message || "检索失败");
    if (el.searchResultMeta) {
      el.searchResultMeta.textContent = errText;
      el.searchResultMeta.classList.add("is-error");
    }
    renderModelHealthActionBanner(el.searchResultModelHealthBanner, errText);
    if (el.searchResultList) {
      el.searchResultList.innerHTML = `<div class="kb-search-result-empty"><p class="kb-search-result-empty__title">检索失败</p><p class="kb-search-result-empty__hint">${htmlEsc(errText)}</p></div>`;
    }
    renderSearchResultDetail(null, -1, null);
  }

  function populateSearchResultDialog(out, query) {
    const hits = Array.isArray(out?.hits) ? out.hits : [];
    searchResultState = { hits, out, selectedIndex: -1, query };
    renderModelHealthActionBanner(el.searchResultModelHealthBanner, "");
    const latency = Number(out?.elapsedMs || 0);
    const hybridLabel = out?.hybridSearch ? "混合" : "向量";
    const profileLabel = out?.queryProfile ? ` · ${out.queryProfile}` : "";
    const modeLabel = out?.searchMode ? ` · ${out.searchMode}` : "";
    const confLabel = out?.lowConfidence ? " · 低置信" : "";
    if (el.searchResultQuery) {
      el.searchResultQuery.textContent = `检索词：${query}`;
    }
    if (el.searchResultMeta) {
      el.searchResultMeta.classList.remove("is-error");
      el.searchResultMeta.textContent = `命中 ${hits.length} 条 · ${hybridLabel}${profileLabel}${modeLabel}${confLabel} · ${latency}ms${formatEmbedDeviceSummary(out.embedDevice, out)}`;
      if (out?.note) {
        el.searchResultMeta.textContent += ` · ${out.note}`;
      }
    }
    if (!el.searchResultList) {
      return;
    }
    if (!hits.length) {
      const warn = out?.lowConfidence
        ? "未找到可靠答案。可尝试更精确的关键词、文件名，或确认相关文档已入库。"
        : out?.note || "未检索到相关内容。";
      el.searchResultList.innerHTML = `<div class="kb-search-result-empty"><p class="kb-search-result-empty__title">无命中结果</p><p class="kb-search-result-empty__hint">${htmlEsc(warn)}</p></div>`;
      renderSearchResultDetail(null, -1, out);
      return;
    }
    el.searchResultList.innerHTML = "";
    hits.forEach((hit, index) => {
      const item = document.createElement("article");
      item.className = "kb-search-result-item jl-kb-card";
      item.tabIndex = 0;
      item.setAttribute("role", "button");
      item.dataset.index = String(index);
      item.innerHTML = buildKbHitCardHtml(hit, index, query);
      item.addEventListener("click", (ev) => {
        if (ev.target.closest(".kb-kb-followup-btn")) {
          return;
        }
        selectSearchResultHit(index);
      });
      item.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          selectSearchResultHit(index);
        }
      });
      el.searchResultList.appendChild(item);
    });
    wireKbHitCardActions(el.searchResultList, hits, query);
    selectSearchResultHit(0);
  }

  function openSearchResultDialog(query) {
    portalKbDialogsToBody();
    const dlg = el.searchResultDialog;
    if (!dlg || typeof dlg.showModal !== "function") {
      return;
    }
    renderSearchResultLoading(query);
    if (!dlg.open) {
      dlg.showModal();
    }
  }

  function ensureSearchResultDialogVisible() {
    if (!shouldAutoOpenSearchResultDialog()) {
      return;
    }
    portalKbDialogsToBody();
    const dlg = el.searchResultDialog;
    if (dlg && typeof dlg.showModal === "function" && !dlg.open) {
      dlg.showModal();
    }
  }

  async function openSelectedSearchResultDoc(options = {}) {
    const index = searchResultState.selectedIndex;
    const hit = searchResultState.hits?.[index];
    if (!hit?.docId) {
      showSearchResultActionFeedback("该条目缺少文档信息，无法打开源文件。", true);
      return;
    }
    if (!canOpenHitSource(hit) || typeof api.kbOpenDocument !== "function") {
      showSearchResultActionFeedback("该条目无本地源文件（可能为自动学习生成）。", true);
      return;
    }
    const sourcePaths = extractHitSourcePathCandidates(hit);
    const basePayload = {
      docId: hit.docId,
      libraryId: String(hit.libraryId || activeLibraryIdCache || ""),
      sourcePath: sourcePaths[0] || "",
      sourcePaths,
    };
    try {
      showSearchResultActionFeedback("正在打开源文件…");
      const out = options.forceLocate
        ? await (async () => {
            const drives = await fetchFixedDrives();
            const locateChoice = await openSourceLocateDialog({
              docName: hit.sourceFile || hit.docName || pathBasename(sourcePaths[0] || ""),
              missingPath: sourcePaths[0] || "",
              drives,
              defaultDrives: drives.filter((d) => /^E:/i.test(String(d || ""))),
              basePayload,
            });
            if (!locateChoice) {
              return { ok: false, canceled: true };
            }
            if (locateChoice.openResult) {
              return locateChoice.openResult;
            }
            if (locateChoice.manualPath) {
              return openKbDocumentWithPassword({
                ...basePayload,
                manualPath: locateChoice.manualPath,
                allowFullDiskScan: false,
              });
            }
            return { ok: false, canceled: true };
          })()
        : await runKbOpenWithLocateFlow(basePayload, {
            docName: hit.sourceFile || hit.docName || "",
          });
      if (out?.canceled) {
        return;
      }
      if (!out?.ok) {
        showSearchResultActionFeedback(out?.error || "打开源文件失败", true);
      } else {
        showSearchResultActionFeedback(formatOpenDocSuccessMessage(out, sourcePaths[0] || ""));
      }
    } catch (err) {
      showSearchResultActionFeedback(err.message || String(err), true);
    }
  }

  function pathBasename(value) {
    const text = String(value || "").trim();
    if (!text) {
      return "";
    }
    const parts = text.split(/[/\\]/);
    return parts[parts.length - 1] || text;
  }

  function renderTrialResultHint(summary, hitCount, hits, query) {
    if (!el.trialResults) {
      return;
    }
    el.trialResults.innerHTML = "";
    const hint = document.createElement("p");
    hint.className = "field-hint kb-trial-result-hint";
    hint.textContent =
      hitCount > 0
        ? isKbTrialFloatPanel()
          ? `${summary}。下方为命中预览，点击卡片可打开详情弹窗。`
          : `${summary}。下方为命中预览，可继续追问或打开弹窗浏览详情。`
        : isKbTrialFloatPanel()
          ? `${summary}。`
          : `${summary}。详细说明见检索结果弹窗。`;
    el.trialResults.appendChild(hint);
    if (Array.isArray(hits) && hits.length) {
      const grid = document.createElement("div");
      grid.className = "jl-kb-card-grid";
      hits.slice(0, 5).forEach((hit, index) => {
        const card = document.createElement("article");
        card.className = "jl-kb-card kb-trial-hit-card";
        card.innerHTML = buildKbHitCardHtml(hit, index, query);
        card.addEventListener("click", (ev) => {
          if (ev.target.closest(".kb-kb-followup-btn")) {
            return;
          }
          openSearchResultDialog(query);
          selectSearchResultHit(index);
        });
        grid.appendChild(card);
      });
      wireKbHitCardActions(grid, hits.slice(0, 5), query);
      el.trialResults.appendChild(grid);
    }
    el.trialResults.classList.add("is-active");
  }

  function clearTrialForm() {
    if (el.trialQuery) {
      el.trialQuery.value = "";
    }
    updateTrialCharCount();
    if (el.trialResults) {
      el.trialResults.innerHTML = "";
      el.trialResults.classList.remove("is-active");
    }
    if (el.trialDebug) {
      el.trialDebug.hidden = true;
      el.trialDebug.innerHTML = "";
    }
    setTrialSearchBusy(false);
    setTrialStatus("");
    renderModelHealthActionBanner(el.trialModelHealthBanner, "");
    if (el.trialSearchAllLibraries) {
      el.trialSearchAllLibraries.checked = true;
    }
    setAllTrialLibrariesChecked(true);
    syncTrialLibrarySelectorState();
  }

  function renderTrialLibraries(activeLibraryId, libraries) {
    if (!el.trialLibraries) {
      return;
    }
    const list = Array.isArray(libraries) ? libraries : [];
    el.trialLibraries.innerHTML = "";
    list.forEach((lib) => {
      const id = String(lib?.id || "").trim();
      if (!id) return;
      const label = document.createElement("label");
      label.className = "record-inline-check";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = id;
      input.dataset.role = "kb-trial-library";
      input.checked = true;
      input.addEventListener("change", () => syncTrialSelectAllState());
      label.appendChild(input);
      label.appendChild(document.createTextNode(` ${lib?.name || id}`));
      el.trialLibraries.appendChild(label);
    });
    syncTrialSelectAllState();
    syncTrialLibrarySelectorState();
  }

  function selectedTrialLibraryIds(activeLibraryId) {
    if (el.trialSearchAllLibraries?.checked) {
      return ["__all__"];
    }
    const checks = el.trialLibraries
      ? Array.from(el.trialLibraries.querySelectorAll("input[data-role='kb-trial-library']:checked"))
      : [];
    const ids = checks.map((x) => String(x.value || "").trim()).filter(Boolean);
    if (ids.length) {
      return ids;
    }
    return activeLibraryId ? [activeLibraryId] : [];
  }

  function renderWatchStatus(activeStatus, allStatuses) {
    if (!el.watchStatusHint) {
      return;
    }
    const st = activeStatus || (Array.isArray(allStatuses) ? allStatuses[0] : null);
    if (!st || !st.enabled) {
      el.watchStatusHint.innerHTML = '监听状态：<span class="kb-watch-idle">未启用</span>';
      if (el.watchStatusDetail) {
        el.watchStatusDetail.textContent = "选择目录并开启后保存设置。";
        el.watchStatusDetail.hidden = false;
      }
      return;
    }
    const dir = st.dir || "（未配置）";
    const stateHtml = st.watching
      ? '<span class="kb-watch-running">● 运行中</span>'
      : '<span class="kb-watch-idle">○ 未监听</span>';
    el.watchStatusHint.innerHTML = `监听状态：${stateHtml}`;
    const queue = st.queueLength ? `队列 ${st.queueLength}` : "";
    const last = st.lastEvent;
    let lastLine = "";
    if (last?.filePath) {
      const base = last.filePath.split(/[/\\]/).pop();
      if (last.phase === "done") {
        lastLine = last.skipped ? `最近：跳过 ${base}` : `最近：已入库 ${base}`;
      } else if (last.phase === "error") {
        lastLine = `最近失败：${base}`;
      } else if (last.phase === "running") {
        lastLine = `正在入库：${base}`;
      } else {
        lastLine = `排队：${base}`;
      }
    }
    const detailParts = [dir, queue, lastLine].filter(Boolean);
    if (el.watchStatusDetail) {
      el.watchStatusDetail.textContent = detailParts.join(" · ");
      el.watchStatusDetail.hidden = detailParts.length === 0;
    }
  }

  function syncTrialLibrarySelectorState() {
    if (!el.trialLibraries) return;
    const disabled = el.trialSearchAllLibraries?.checked === true;
    el.trialLibraries.querySelectorAll("input[data-role='kb-trial-library']").forEach((node) => {
      node.disabled = disabled;
    });
    if (el.trialSelectAll) {
      el.trialSelectAll.disabled = disabled;
    }
    el.trialLibraries.style.opacity = disabled ? "0.6" : "1";
    const wrap = el.trialLibraries.closest(".kb-trial-libraries-wrap");
    if (wrap) {
      wrap.style.opacity = disabled ? "0.6" : "1";
    }
  }

  function formatIngestResultsMessage(results) {
    const list = Array.isArray(results) ? results : [];
    const skipped = list.filter((r) => r.ok && r.skipped);
    const ok = list.filter((r) => r.ok && !r.skipped && !r.locked);
    const locked = list.filter((r) => r.ok && r.locked);
    const fail = list.filter((r) => !r.ok && !r.passwordCanceled);
    const canceled = list.filter((r) => r.passwordCanceled);
    const dupLines = skipped
      .map((r) => {
        if (r.message) {
          return r.message;
        }
        if (r.reason === "duplicate-batch") {
          return `${r.name || r.path || "文件"}：与本次已选的其他文件内容相同，已自动合并`;
        }
        if (r.reason === "password-hint") {
          return r.message || `${r.name || r.path || "文件"}：密码提示文件，已跳过`;
        }
        return `${r.name || r.path || "文件"}：${r.reason || "重复"}`;
      })
      .filter(Boolean);
    const errs = fail
      .map((r) => `${r.path || r.name || ""}: ${r.error || "失败"}`)
      .filter(Boolean)
      .join("；");
    let msg = `入库完成：新增 ${ok.length} 个`;
    if (locked.length) {
      msg += `，待解锁 ${locked.length} 个`;
    }
    if (skipped.length) {
      msg += `，跳过重复 ${skipped.length} 个`;
    }
    if (canceled.length) {
      msg += `，跳过密码 ${canceled.length} 个`;
    }
    if (fail.length) {
      msg += `，失败 ${fail.length} 个`;
    }
    if (locked.length) {
      const lockedLines = locked
        .map((r) => r.message || `${r.name || r.path || "文件"}：已登记，待输入密码解锁`)
        .slice(0, 6);
      msg += `\n\n待解锁文档：\n${lockedLines.join("\n")}`;
      if (locked.length > 6) {
        msg += `\n… 另有 ${locked.length - 6} 个`;
      }
    }
    if (dupLines.length) {
      msg += `\n\n重复文档：\n${dupLines.slice(0, 8).join("\n")}`;
      if (dupLines.length > 8) {
        msg += `\n… 另有 ${dupLines.length - 8} 个`;
      }
    }
    if (errs) {
      msg += `\n\n失败详情：${errs}`;
    }
    return { msg, fail: fail.length };
  }

  async function pickAndIngestToLibrary(libraryId) {
    if (typeof api.kbPickAndIngest !== "function") {
      setStatus("仅桌面版支持入库。", true);
      return;
    }
    const profile = window.runtimeProfile;
    if (profile && profile.features?.kbIngest?.enabled === false) {
      const reason = profile.features.kbIngest.reason || "本地嵌入环境未就绪";
      setStatus(`${reason}。请点击顶栏「环境」或设置 → 本地模型部署完成配置。`, true);
      if (typeof window.openEnvironmentSetupWizard === "function") {
        const go = window.confirm(`${reason}\n\n是否打开环境配置向导？`);
        if (go) {
          void window.openEnvironmentSetupWizard();
        }
      }
      return;
    }
    const targetLibraryId = String(libraryId || el.librarySelect?.value || "").trim();
    const libName =
      latestDocGroups.find((g) => String(g?.id) === targetLibraryId)?.name ||
      targetLibraryId ||
      "";
    ingestProgressState = {
      active: true,
      libraryId: targetLibraryId,
      libraryName: libName,
      phase: "picking",
      index: 0,
      total: 0,
      fileName: "",
      step: "picking",
    };
    syncIngestProgressDom();
    setStatus("正在打开文件选择…");
    try {
      const res = await api.kbPickAndIngest({ libraryId: targetLibraryId });
      if (res.canceled) {
        clearIngestProgress();
        setStatus("已取消。");
        return;
      }
      const results = res.results || [];
      const { msg, fail } = formatIngestResultsMessage(results);
      showCopyableResultDialog(msg, "知识库入库结果");
      await refreshState();
      setStatus(msg.split("\n")[0], fail > 0);
    } catch (err) {
      clearIngestProgress();
      setStatus(err.message || String(err), true);
    }
  }

  async function refreshState() {
    if (typeof api.kbGetState !== "function") {
      setStatus("当前环境非桌面版，知识库不可用。", true);
      return;
    }
    try {
      const st = await api.kbGetState();
      const s = st.settings || {};
      if (el.chunkSize) {
        el.chunkSize.value = String(s.chunkSize ?? 800);
      }
      if (el.chunkOverlap) {
        el.chunkOverlap.value = String(s.chunkOverlap ?? 120);
      }
      if (el.embedModel) {
        el.embedModel.value = s.embedModel || "bge-m3";
      }
      if (el.searchTopK) {
        el.searchTopK.value = String(s.searchTopK ?? 10);
      }
      if (el.searchMinScore) {
        el.searchMinScore.value = String(s.searchMinScore ?? 0.55);
      }
      if (el.searchCandidateK) {
        el.searchCandidateK.value = String(s.searchCandidateK ?? 200);
      }
      if (el.hybridVectorWeight) {
        el.hybridVectorWeight.value = String(s.hybridVectorWeight ?? 0.6);
      }
      if (el.keywordRecallLimit) {
        el.keywordRecallLimit.value = String(s.keywordRecallLimit ?? 50);
      }
      if (el.searchMode) {
        el.searchMode.value = s.searchMode || "auto";
      }
      if (el.chunkStrategy) {
        el.chunkStrategy.value = s.chunkStrategy === "fixed" ? "fixed" : "semantic";
      }
      if (el.hybridSearch) {
        el.hybridSearch.checked = s.hybridSearch !== false;
      }
      if (el.useRrfRanking) {
        el.useRrfRanking.checked = s.useRrfRanking !== false;
      }
      if (el.rerankEnabled) {
        el.rerankEnabled.checked = s.rerankEnabled !== false;
      }
      if (el.rerankModel) {
        el.rerankModel.value = s.rerankModel || KB_CONFIG_DEFAULTS.rerankModel;
      }
      if (el.rerankTopN) {
        el.rerankTopN.value = String(s.rerankTopN ?? 30);
      }
      if (el.rerankWeight) {
        el.rerankWeight.value = String(s.rerankWeight ?? 0.75);
      }
      if (el.rerankProvider) {
        el.rerankProvider.value = s.rerankProvider || KB_CONFIG_DEFAULTS.rerankProvider;
      }
      if (el.autoWebVerify) {
        el.autoWebVerify.checked = s.autoWebVerify === true;
      }
      if (el.aiVerifyWriteback) {
        el.aiVerifyWriteback.checked = s.aiVerifyWriteback === true;
      }
      if (el.autoLearnEnabled) {
        el.autoLearnEnabled.checked = s.autoLearnEnabled === true;
      }
      if (el.autoLearnRequireConfirm) {
        el.autoLearnRequireConfirm.checked = s.autoLearnRequireConfirm === true;
      }
      if (el.autoLearnMinQuestionChars) {
        el.autoLearnMinQuestionChars.value = String(s.autoLearnMinQuestionChars ?? 6);
      }
      if (el.autoLearnMinAnswerChars) {
        el.autoLearnMinAnswerChars.value = String(s.autoLearnMinAnswerChars ?? 80);
      }
      if (el.watchDirInput) {
        el.watchDirInput.value = s.watchDirPath || "";
        el.watchDirInput.title = s.watchDirPath || "选择文件夹后，新增/修改文件将自动解析入库";
      }
      if (el.watchDirEnabled) {
        el.watchDirEnabled.checked = s.watchDirEnabled === true;
      }
      renderWatchStatus(st.watchStatus, st.watchStatuses);
      if (el.storageDirInput) {
        el.storageDirInput.value = st.storageRoot || "";
        el.storageDirInput.title = st.storageCustomRoot
          ? `自定义目录：${st.storageCustomRoot}`
          : "当前使用默认应用目录";
      }
      if (el.indexHealthHint) {
        const backend = st.storageBackend || "sqlite";
        const sqlitePath = st.sqlitePath || "";
        el.indexHealthHint.textContent = sqlitePath
          ? `元数据存储：${backend} · ${sqlitePath}`
          : `元数据存储：${backend}`;
      }
      renderLibraries(st.activeLibraryId, st.libraries || []);
      renderTrialLibraries(st.activeLibraryId, st.libraries || []);
      syncTrialLibrarySelectorState();
      const activeName =
        (st.libraries || []).find((x) => x.id === st.activeLibraryId)?.name || st.activeLibraryId || "默认";
      const groupedDocs =
        Array.isArray(st.docsByLibrary) && st.docsByLibrary.length
          ? st.docsByLibrary
          : [
              {
                id: st.activeLibraryId || "default",
                name: activeName,
                docCount: (st.documents || []).length,
                chunkCount: st.chunkTotal || 0,
                documents: st.documents || [],
              },
            ];
      latestDocGroups = groupedDocs;
      const existing = docsTreeExpanded && typeof docsTreeExpanded === "object" ? docsTreeExpanded : {};
      const nextExpanded = {};
      groupedDocs.forEach((g) => {
        const gid = String(g?.id || "");
        if (!gid) return;
        if (Object.prototype.hasOwnProperty.call(existing, gid)) {
          nextExpanded[gid] = !!existing[gid];
        } else {
          nextExpanded[gid] = gid === st.activeLibraryId;
        }
      });
      docsTreeExpanded = nextExpanded;
      writeTreeExpandedState(docsTreeExpanded);
      rerenderLibraryViews(groupedDocs, st.activeLibraryId);
      activeLibraryIdCache = st.activeLibraryId || "";
      updateConfigSidebar(st);
      if (!configDirty) {
        setConfigSynced();
      }
      await refreshAutoLearnQueue(activeLibraryIdCache);
      renderKbStats(st);
      if (el.graphMeta && st.graphSummary) {
        const gs = st.graphSummary;
        el.graphMeta.textContent =
          `节点 ${Number(gs.nodeCount || 0)}（文档 ${Number(gs.docNodeCount || 0)} / 章节 ${Number(
            gs.sectionNodeCount || 0
          )}） · 关联线 ${Number(gs.edgeCount || 0)}。`;
      }
      await refreshGraphSnapshot(false);
      if (!lastOpStatus || /^当前目录：/.test(lastOpStatus)) {
        const modeTip =
          st.storageRootMode === "custom-legacy-direct" ? "（已兼容识别旧版目录结构）" : "";
        setStatus(`当前目录：${activeName}；共 ${st.chunkTotal || 0} 条向量分片。${modeTip}`);
      } else {
        setStatus(`${lastOpStatus}（当前目录：${activeName}；共 ${st.chunkTotal || 0} 条向量分片）`, lastOpIsErr);
      }
    } catch (err) {
      setStatus(err.message || String(err), true);
    }
  }

  async function migrateDocument(doc, fromLibraryId, targetLibraryId) {
    if (!doc?.id || !fromLibraryId || !targetLibraryId) {
      setStatus("迁移失败：缺少必要参数。", true);
      return false;
    }
    if (fromLibraryId === targetLibraryId) {
      setStatus("文件已存在于目标目录。", true);
      return false;
    }
    if (!api.kbMoveDocument) {
      setStatus("当前环境不支持文件迁移。", true);
      return false;
    }
    setStatus("正在迁移文件…");
    try {
      const out = await api.kbMoveDocument({
        docId: doc.id,
        fromLibraryId,
        targetLibraryId,
      });
      if (!out?.ok) {
        setStatus(out?.error || "文件迁移失败，请重试。", true);
        return false;
      }
      docsTreeExpanded[fromLibraryId] = true;
      docsTreeExpanded[targetLibraryId] = true;
      writeTreeExpandedState(docsTreeExpanded);
      await refreshState();
      const targetName = latestDocGroups.find((x) => x.id === targetLibraryId)?.name || targetLibraryId;
      setStatus(`文件迁移成功，已移动至「${targetName}」。`);
      return true;
    } catch (err) {
      setStatus(err.message || String(err), true);
      return false;
    }
  }

  async function deleteLibrary(g, gid) {
    const name = String(g?.name || gid || "未命名目录");
    const docs = Array.isArray(g?.documents) ? g.documents : [];
    const docCount = docs.length || Number(g?.docCount) || 0;
    if (!(await confirmDeleteLibraryDialog(name, docCount))) {
      return false;
    }
    if (typeof api.kbLibraryDelete !== "function") {
      setStatus("删除功能不可用", true);
      return false;
    }
    setStatus("正在删除知识库目录…");
    try {
      const out = await api.kbLibraryDelete({ id: gid });
      if (!out?.ok) {
        setStatus(out?.error || "删除失败", true);
        return false;
      }
      if (docsTreeExpanded[gid]) {
        delete docsTreeExpanded[gid];
        writeTreeExpandedState(docsTreeExpanded);
      }
      if (Array.isArray(out.libraries)) {
        const nextGroups = out.libraries.map((lib) => {
          const prev = latestDocGroups.find((x) => x.id === lib.id);
          return (
            prev || {
              id: lib.id,
              name: lib.name || lib.id,
              docCount: 0,
              chunkCount: 0,
              documents: [],
            }
          );
        });
        latestDocGroups = nextGroups;
        activeLibraryIdCache = out.activeLibraryId || activeLibraryIdCache;
        renderLibraries(activeLibraryIdCache, out.libraries);
        renderTrialLibraries(activeLibraryIdCache, out.libraries);
        rerenderLibraryViews(nextGroups, activeLibraryIdCache);
        renderKbStats({
          activeLibraryId: activeLibraryIdCache,
          libraries: out.libraries,
          docsByLibrary: nextGroups,
          chunkTotal: nextGroups.reduce((sum, g) => sum + Number(g.chunkCount || 0), 0),
        });
      }
      await refreshState();
      const warn = String(out.warning || "").trim();
      setStatus(
        warn
          ? `已删除知识库目录「${name}」。${warn}`
          : `已删除知识库目录「${name}」。`
      );
      return true;
    } catch (err) {
      setStatus(err.message || String(err), true);
      return false;
    }
  }

  async function renameLibrary(libraryId, libraryName) {
    const id = String(libraryId || "").trim();
    const name = String(libraryName || "").trim();
    if (!id) {
      return false;
    }
    if (!name) {
      setStatus("知识库名称不能为空。", true);
      return false;
    }
    if (typeof api.kbLibraryRename !== "function") {
      setStatus("当前环境不支持目录重命名。", true);
      return false;
    }
    try {
      const out = await api.kbLibraryRename({ id, name });
      if (!out?.ok) {
        setStatus(out?.error || "目录重命名失败，请重试。", true);
        return false;
      }
      await refreshState();
      setStatus(`目录已重命名为「${name}」。`);
      return true;
    } catch (err) {
      setStatus(err.message || String(err), true);
      return false;
    }
  }

  async function chooseTargetLibraryForMigration(doc, fromLibraryId) {
    const candidates = (latestDocGroups || []).filter((g) => g && g.id && g.id !== fromLibraryId);
    if (!candidates.length) {
      setStatus("无可迁移的目标目录。", true);
      return "";
    }
    let dlg = document.getElementById("kbMoveDialog");
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = "kbMoveDialog";
      dlg.style.width = "min(520px, 92vw)";
      dlg.style.border = "1px solid var(--border)";
      dlg.style.borderRadius = "10px";
      dlg.style.padding = "0";
      dlg.innerHTML = `
        <div style="padding:12px 14px;border-bottom:1px solid var(--border);font-weight:700;">迁移至其他目录</div>
        <div style="padding:12px 14px;display:flex;flex-direction:column;gap:10px;">
          <input type="search" placeholder="搜索目录名称" />
          <select size="8" style="width:100%;"></select>
          <div style="display:flex;justify-content:flex-end;gap:8px;">
            <button type="button" class="secondary" data-kb-move-cancel>取消</button>
            <button type="button" data-kb-move-ok>确认迁移</button>
          </div>
        </div>`;
      document.body.appendChild(dlg);
    }
    const searchInput = dlg.querySelector("input");
    const select = dlg.querySelector("select");
    const cancelBtn = dlg.querySelector("[data-kb-move-cancel]");
    const okBtn = dlg.querySelector("[data-kb-move-ok]");
    const fill = (kw) => {
      const needle = String(kw || "").trim().toLowerCase();
      select.innerHTML = "";
      candidates
        .filter((x) => !needle || String(x.name || x.id).toLowerCase().includes(needle))
        .forEach((x) => {
          const opt = document.createElement("option");
          opt.value = x.id;
          opt.textContent = `${x.name || x.id}（文档${Number(x.docCount || (x.documents || []).length)}）`;
          select.appendChild(opt);
        });
      if (select.options.length) {
        select.selectedIndex = 0;
      }
    };
    fill("");
    searchInput.value = "";
    const ret = await new Promise((resolve) => {
      const onCancel = () => resolve("");
      const onOk = () => resolve(String(select.value || "").trim());
      const onSearch = () => fill(searchInput.value);
      cancelBtn.addEventListener("click", onCancel, { once: true });
      okBtn.addEventListener("click", onOk, { once: true });
      searchInput.addEventListener("input", onSearch);
      dlg.addEventListener(
        "close",
        () => {
          searchInput.removeEventListener("input", onSearch);
          resolve("");
        },
        { once: true }
      );
      dlg.showModal();
      dlg.querySelector("div")?.setAttribute("title", `待迁移文件：${doc?.name || "未命名文档"}`);
    });
    if (dlg.open) {
      dlg.close();
    }
    return ret;
  }

  function formatKbStatTime(raw) {
    const text = String(raw || "").trim();
    if (!text || text === "—") {
      return "—";
    }
    const d = new Date(text.replace(/\//g, "-"));
    if (Number.isNaN(d.getTime())) {
      return text.length > 16 ? `${text.slice(0, 16)}…` : text;
    }
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${day} ${hh}:${mm}`;
  }

  function getLibraryLastUpdated(docs) {
    let latestRaw = "";
    let latestTs = 0;
    (Array.isArray(docs) ? docs : []).forEach((d) => {
      const raw = String(d.createdAt || "");
      const ts = Date.parse(raw.replace(/\//g, "-")) || 0;
      if (ts > latestTs) {
        latestTs = ts;
        latestRaw = raw;
      }
    });
    return latestRaw ? formatKbStatTime(latestRaw) : "—";
  }

  function renderKbStats(st) {
    if (!el.statsBar) {
      return;
    }
    const groups = latestDocGroups.length ? latestDocGroups : st.docsByLibrary || [];
    const docTotal = groups.reduce((sum, g) => sum + (Array.isArray(g.documents) ? g.documents.length : Number(g.docCount || 0)), 0);
    const gs = st.graphSummary || {};
    const nodeCount = Number(gs.nodeCount || 0);
    const edgeCount = Number(gs.edgeCount || 0);
    const pending = Number(el.autoLearnPendingCount?.textContent || "0") || 0;
    let lastUpdated = "—";
    let latestTs = 0;
    groups.forEach((g) => {
      (g.documents || []).forEach((d) => {
        const raw = String(d.createdAt || "");
        const ts = Date.parse(raw.replace(/\//g, "-")) || 0;
        if (ts > latestTs) {
          latestTs = ts;
          lastUpdated = raw || "—";
        }
      });
    });
    const lastUpdatedShort = formatKbStatTime(lastUpdated);
    const esc = typeof escapeHtml === "function" ? escapeHtml : (t) => String(t ?? "");
    const cards = [
      { label: "知识库状态", value: '<span class="kb-stat-dot" aria-hidden="true"></span>已启用', tone: "ok", hint: "本地检索与入库可用" },
      { label: "入库文档", value: `${docTotal} 份`, tone: "num", hint: "全部目录合计" },
      { label: "知识节点", value: `${nodeCount} 个`, tone: "num", hint: "图谱节点总数" },
      { label: "关联关系", value: `${edgeCount} 条`, tone: "num", hint: "图谱关联线" },
      { label: "自动学习待审核", value: `${pending} 条`, tone: pending > 0 ? "warn" : "num", hint: "待人工确认条目" },
      {
        label: "最近更新",
        value: `<span class="kb-stat-stack"><span>${esc(lastUpdatedShort)}</span><span class="kb-stat-stack__sub">由系统触发</span></span>`,
        tone: "time",
        hint: lastUpdated === "—" ? "暂无入库记录" : lastUpdated,
      },
    ];
    el.statsBar.innerHTML = cards
      .map((c) => {
        const valueHtml = c.tone === "ok" || c.tone === "time" ? c.value : esc(c.value);
        return `<article class="kb-stat-card kb-stat-card--${c.tone}" title="${esc(c.hint)}">
          <span class="kb-stat-card__label">${esc(c.label)}</span>
          <strong class="kb-stat-card__value">${valueHtml}</strong>
        </article>`;
      })
      .join("");
    if (el.ingestTotal) {
      el.ingestTotal.textContent = `总数 ${docTotal} 份`;
    }
  }

  function rerenderLibraryViews(groups, activeLibraryId) {
    renderDirectoryTree(groups, activeLibraryId);
    renderIngestSummary(groups);
    renderIngestedDocsFull(groups, activeLibraryId);
    if (el.ingestFull) {
      el.ingestFull.hidden = !ingestDocsExpanded;
    }
    if (el.viewAllDocsBtn) {
      el.viewAllDocsBtn.textContent = ingestDocsExpanded ? "收起文档列表 ↑" : "查看全部文档 →";
    }
  }

  function attachLibraryRename(titleEl, g, gid) {
    titleEl.title = "双击可重命名目录";
    titleEl.addEventListener("mousedown", (ev) => ev.stopPropagation());
    titleEl.addEventListener("click", (ev) => ev.stopPropagation());
    titleEl.addEventListener("dblclick", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (renamingLibraryId && renamingLibraryId !== gid) {
        return;
      }
      renamingLibraryId = gid;
      const oldName = String(g.name || gid || "");
      const input = document.createElement("input");
      input.type = "text";
      input.className = "kb-doc-group-title-input";
      input.value = oldName;
      input.maxLength = 120;
      titleEl.textContent = "";
      titleEl.appendChild(input);
      let finished = false;
      const finish = async (submit) => {
        if (finished) return;
        finished = true;
        const nextName = String(input.value || "").trim();
        renamingLibraryId = "";
        if (!submit || !nextName || nextName === oldName) {
          titleEl.textContent = oldName;
          return;
        }
        const ok = await renameLibrary(gid, nextName);
        if (!ok) {
          titleEl.textContent = oldName;
        }
      };
      input.addEventListener("mousedown", (e2) => e2.stopPropagation());
      input.addEventListener("click", (e2) => e2.stopPropagation());
      input.addEventListener("dblclick", (e2) => e2.stopPropagation());
      input.addEventListener("keydown", (e2) => {
        if (e2.key === "Enter") {
          e2.preventDefault();
          void finish(true);
          return;
        }
        if (e2.key === "Escape") {
          e2.preventDefault();
          void finish(false);
        }
      });
      input.addEventListener("blur", () => {
        void finish(true);
      });
      input.focus();
      input.select();
    });
  }

  function bindDirMenuAction(btn, menu, handler) {
    btn.addEventListener("mousedown", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
    });
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      try {
        await handler();
      } finally {
        menu.open = false;
      }
    });
  }

  function wireKbDirMenu(menu, menuBtn, menuPanel) {
    menuPanel.addEventListener("mousedown", (ev) => ev.stopPropagation());
    menuPanel.addEventListener("click", (ev) => ev.stopPropagation());

    const reposition = () => {
      if (!menu.open) {
        menuPanel.classList.remove("is-floating");
        menuPanel.style.removeProperty("position");
        menuPanel.style.removeProperty("top");
        menuPanel.style.removeProperty("left");
        menuPanel.style.removeProperty("width");
        menuPanel.style.removeProperty("z-index");
        return;
      }
      document.querySelectorAll(".kb-dir-menu[open]").forEach((other) => {
        if (other !== menu) {
          other.open = false;
        }
      });
      const rect = menuBtn.getBoundingClientRect();
      menuPanel.classList.add("is-floating");
      menuPanel.style.position = "fixed";
      menuPanel.style.zIndex = "10000";
      menuPanel.style.width = `${Math.max(140, menuBtn.offsetWidth + 112)}px`;
      const panelWidth = menuPanel.offsetWidth || 160;
      const panelHeight = menuPanel.offsetHeight || 120;
      let left = rect.right - panelWidth;
      left = Math.max(8, Math.min(left, window.innerWidth - panelWidth - 8));
      let top = rect.bottom + 4;
      if (top + panelHeight > window.innerHeight - 8) {
        top = Math.max(8, rect.top - panelHeight - 4);
      }
      menuPanel.style.left = `${left}px`;
      menuPanel.style.top = `${top}px`;
    };

    menu.addEventListener("toggle", () => {
      requestAnimationFrame(reposition);
    });
  }

  function closeAllKbDirMenus() {
    document.querySelectorAll(".kb-dir-menu[open]").forEach((menu) => {
      menu.open = false;
    });
  }

  async function confirmDeleteLibraryDialog(name, docCount) {
    closeAllKbDirMenus();
    let dlg = document.getElementById("kbDeleteLibraryDialog");
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = "kbDeleteLibraryDialog";
      dlg.className = "kb-dialog-light";
      dlg.innerHTML = `
        <div class="kb-dialog-light__head">删除知识库目录</div>
        <div class="kb-dialog-light__body">
          <p class="kb-dialog-light__msg" data-kb-del-msg></p>
          <div class="kb-dialog-light__actions">
            <button type="button" class="secondary" data-kb-del-cancel>取消</button>
            <button type="button" class="danger" data-kb-del-ok>确认删除</button>
          </div>
        </div>`;
      document.body.appendChild(dlg);
    }
    dlg.className = "kb-dialog-light";
    const msgEl = dlg.querySelector("[data-kb-del-msg]");
    const cancelBtn = dlg.querySelector("[data-kb-del-cancel]");
    const okBtn = dlg.querySelector("[data-kb-del-ok]");
    if (msgEl) {
      msgEl.textContent =
        docCount > 0
          ? `确定删除知识库目录「${name}」？其中 ${docCount} 份文档及向量索引将被永久删除，此操作不可恢复。`
          : `确定删除知识库目录「${name}」？此操作不可恢复。`;
    }
    return new Promise((resolve) => {
      let settled = false;
      const finish = (confirmed) => {
        if (settled) {
          return;
        }
        settled = true;
        cancelBtn?.removeEventListener("click", onCancel);
        okBtn?.removeEventListener("click", onOk);
        dlg.removeEventListener("cancel", onDialogCancel);
        if (dlg.open) {
          dlg.close();
        }
        resolve(confirmed);
      };
      const onCancel = () => finish(false);
      const onOk = () => finish(true);
      const onDialogCancel = (ev) => {
        ev.preventDefault();
        finish(false);
      };
      cancelBtn?.addEventListener("click", onCancel, { once: true });
      okBtn?.addEventListener("click", onOk, { once: true });
      okBtn?.addEventListener(
        "pointerdown",
        (ev) => {
          ev.stopPropagation();
        },
        { once: true }
      );
      dlg.addEventListener("cancel", onDialogCancel, { once: true });
      dlg.showModal();
    });
  }

  function bindLibraryDropTarget(targetEl, gid, g, groups) {
    targetEl.addEventListener("dragover", (ev) => {
      const payload = String(ev.dataTransfer?.getData("text/kb-doc-move") || "");
      if (!payload) return;
      ev.preventDefault();
      targetEl.classList.add("is-drop-target");
    });
    targetEl.addEventListener("dragleave", () => targetEl.classList.remove("is-drop-target"));
    targetEl.addEventListener("drop", async (ev) => {
      targetEl.classList.remove("is-drop-target");
      const payload = String(ev.dataTransfer?.getData("text/kb-doc-move") || "");
      if (!payload) return;
      let parsed = null;
      try {
        parsed = JSON.parse(payload);
      } catch {
        parsed = null;
      }
      if (!parsed?.docId || !parsed?.fromLibraryId || parsed.fromLibraryId === gid) {
        return;
      }
      const fromGroup = groups.find((x) => x.id === parsed.fromLibraryId);
      const doc = (fromGroup?.documents || []).find((d) => String(d?.id || "") === String(parsed.docId || ""));
      if (!doc) return;
      if (!window.confirm(`确认将【${doc.name || "未命名文档"}】迁移至【${g.name || gid}】？`)) {
        return;
      }
      await migrateDocument(doc, parsed.fromLibraryId, gid);
    });
  }

  function renderDirectoryTree(groups, activeLibraryId) {
    if (!el.dirTree) {
      return;
    }
    el.dirTree.innerHTML = "";
    const list = Array.isArray(groups) ? groups : [];
    if (!list.length) {
      el.dirTree.innerHTML = `<p class="field-hint kb-dir-empty">暂无知识库目录，请点击「+ 新建目录」。</p>`;
      return;
    }
    list.forEach((g) => {
      const gid = String(g?.id || "");
      if (!gid) {
        return;
      }
      const expanded = docsTreeExpanded[gid] === true;
      const docs = Array.isArray(g.documents) ? g.documents : [];
      const block = document.createElement("div");
      block.className = "kb-dir-block";
      block.dataset.libraryId = gid;

      const row = document.createElement("div");
      row.className = `kb-dir-row${gid === activeLibraryId ? " is-active" : ""}`;
      row.setAttribute("role", "row");

      const nameCell = document.createElement("div");
      nameCell.className = "kb-dir-row__name";

      const arrowBtn = document.createElement("button");
      arrowBtn.type = "button";
      arrowBtn.className = "kb-dir-row__arrow-btn";
      arrowBtn.setAttribute("aria-label", expanded ? "收起目录" : "展开目录");
      arrowBtn.textContent = expanded ? "▼" : "›";
      arrowBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        docsTreeExpanded[gid] = !docsTreeExpanded[gid];
        writeTreeExpandedState(docsTreeExpanded);
        rerenderLibraryViews(groups, activeLibraryId);
      });

      const folder = document.createElement("span");
      folder.className = "kb-dir-row__folder";
      folder.setAttribute("aria-hidden", "true");
      folder.textContent = "📁";

      const title = document.createElement("span");
      title.className = "kb-dir-row__title";
      title.textContent = g.name || gid || "未命名目录";
      attachLibraryRename(title, g, gid);
      title.addEventListener("click", async () => {
        if (gid === activeLibraryId || typeof api.kbLibrarySetActive !== "function") {
          return;
        }
        setStatus("正在切换知识库目录…");
        try {
          const out = await api.kbLibrarySetActive(gid);
          if (!out?.ok) {
            setStatus(out?.error || "切换失败", true);
            return;
          }
          await refreshState();
        } catch (err) {
          setStatus(err.message || String(err), true);
        }
      });

      nameCell.appendChild(arrowBtn);
      nameCell.appendChild(folder);
      nameCell.appendChild(title);

      const countCell = document.createElement("span");
      countCell.className = "kb-dir-row__count";
      countCell.textContent = String(docs.length || g.docCount || 0);

      const statusCell = document.createElement("span");
      statusCell.className = "kb-dir-row__status";
      const badge = document.createElement("span");
      badge.className = "kb-dir-status-badge";
      badge.textContent = "已启用";
      statusCell.appendChild(badge);

      const opsCell = document.createElement("div");
      opsCell.className = "kb-dir-row__ops";
      const menu = document.createElement("details");
      menu.className = "kb-dir-menu";
      const menuBtn = document.createElement("summary");
      menuBtn.className = "kb-dir-menu__trigger";
      menuBtn.textContent = "⋯";
      menuBtn.title = "目录操作";
      menuBtn.addEventListener("click", (ev) => ev.stopPropagation());
      const menuPanel = document.createElement("div");
      menuPanel.className = "kb-dir-menu__panel";
      const ingestItem = document.createElement("button");
      ingestItem.type = "button";
      ingestItem.textContent = "选择文件入库";
      bindDirMenuAction(ingestItem, menu, async () => {
        await pickAndIngestToLibrary(gid);
      });
      menuPanel.appendChild(ingestItem);
      if (gid !== activeLibraryId) {
        const switchItem = document.createElement("button");
        switchItem.type = "button";
        switchItem.textContent = "切换到此目录";
        bindDirMenuAction(switchItem, menu, async () => {
          if (typeof api.kbLibrarySetActive !== "function") return;
          setStatus("正在切换知识库目录…");
          try {
            const out = await api.kbLibrarySetActive(gid);
            if (!out?.ok) {
              setStatus(out?.error || "切换失败", true);
              return;
            }
            await refreshState();
          } catch (err) {
            setStatus(err.message || String(err), true);
          }
        });
        menuPanel.appendChild(switchItem);
      }
      if (typeof api.kbOpenLibraryDir === "function") {
        const openItem = document.createElement("button");
        openItem.type = "button";
        openItem.textContent = "打开目录";
        bindDirMenuAction(openItem, menu, async () => {
          try {
            const out = await api.kbOpenLibraryDir({ libraryId: gid });
            if (!out?.ok) {
              setStatus(out?.error || "无法打开目录", true);
            }
          } catch (err) {
            setStatus(err.message || String(err), true);
          }
        });
        menuPanel.appendChild(openItem);
      }
      if (list.length > 1 && typeof api.kbLibraryDelete === "function") {
        const deleteItem = document.createElement("button");
        deleteItem.type = "button";
        deleteItem.className = "kb-dir-menu__danger";
        deleteItem.textContent = "删除知识库目录";
        bindDirMenuAction(deleteItem, menu, async () => {
          await deleteLibrary(g, gid);
        });
        menuPanel.appendChild(deleteItem);
      }
      wireKbDirMenu(menu, menuBtn, menuPanel);
      menu.appendChild(menuBtn);
      menu.appendChild(menuPanel);
      opsCell.appendChild(menu);

      row.appendChild(nameCell);
      row.appendChild(countCell);
      row.appendChild(statusCell);
      row.appendChild(opsCell);
      block.appendChild(row);
      bindLibraryDropTarget(row, gid, g, list);

      if (expanded) {
        if (!docs.length) {
          const detail = document.createElement("div");
          detail.className = "kb-dir-row__detail";
          detail.textContent = "该目录暂无入库文档";
          block.appendChild(detail);
        } else {
          const children = document.createElement("div");
          children.className = "kb-dir-children";
          docs.forEach((d) => {
            appendDirectoryDocRow(children, d, gid);
          });
          block.appendChild(children);
        }
      }

      el.dirTree.appendChild(block);
    });
    syncIngestProgressDom();
  }

  function appendDirectoryDocRow(container, d, gid) {
    const row = document.createElement("div");
    row.className = "kb-dir-doc-row";
    row.setAttribute("role", "row");
    row.dataset.docId = String(d.id || "");
    row.dataset.libraryId = gid;

    const nameCell = document.createElement("div");
    nameCell.className = "kb-dir-doc-row__name";
    const icon = document.createElement("span");
    icon.className = "kb-dir-doc-row__icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "📄";
    const title = document.createElement("span");
    title.className = "kb-dir-doc-row__title";
    title.textContent = d.name || "（未命名）";
    title.title = d.name || "";
    nameCell.appendChild(icon);
    nameCell.appendChild(title);

    const timeCell = document.createElement("span");
    timeCell.className = "kb-dir-doc-row__time";
    timeCell.textContent = d.createdAt ? String(d.createdAt).slice(0, 10) : "—";

    row.appendChild(nameCell);
    row.appendChild(document.createElement("span"));
    row.appendChild(timeCell);
    row.appendChild(document.createElement("span"));

    row.addEventListener("click", () => {
      if (!el.docList || !d.id) {
        return;
      }
      ingestDocsExpanded = true;
      rerenderLibraryViews(latestDocGroups, activeLibraryIdCache);
      if (el.ingestFull) {
        el.ingestFull.hidden = false;
      }
      if (el.viewAllDocsBtn) {
        el.viewAllDocsBtn.textContent = "收起文档列表 ↑";
      }
      requestAnimationFrame(() => {
        const target = el.docList.querySelector(`.kb-ingest-row[data-doc-id="${CSS.escape(String(d.id))}"]`);
        target?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        target?.classList.add("is-located");
        window.setTimeout(() => target?.classList.remove("is-located"), 1600);
      });
    });

    container.appendChild(row);
  }

  function appendIngestDocRow(container, d, gid, g, activeLibraryId, groups) {
    const row = document.createElement("div");
    row.className = "kb-ingest-row";
    row.setAttribute("role", "row");
    row.dataset.docId = String(d.id || "");
    row.dataset.libraryId = gid;
    row.draggable = true;
    row.addEventListener("dragstart", (ev) => {
      ev.dataTransfer?.setData(
        "text/kb-doc-move",
        JSON.stringify({
          docId: d.id,
          fromLibraryId: gid,
        })
      );
      row.classList.add("is-dragging");
    });
    row.addEventListener("dragend", () => row.classList.remove("is-dragging"));
    row.addEventListener("contextmenu", async (ev) => {
      ev.preventDefault();
      const targetLibraryId = await chooseTargetLibraryForMigration(d, gid);
      if (!targetLibraryId) return;
      if (!window.confirm(`确认将【${d.name || "未命名文档"}】迁移至目标目录？`)) return;
      await migrateDocument(d, gid, targetLibraryId);
    });

    const libCell = document.createElement("span");
    libCell.className = "kb-ingest-row__lib";
    libCell.textContent = g.name || gid || "—";

    const nameCell = document.createElement("div");
    nameCell.className = "kb-ingest-row__name";
    const nameEl = document.createElement("span");
    nameEl.textContent = d.name || "（未命名）";
    nameCell.appendChild(nameEl);
    if (d.autoLearn === true) {
      const badge = formatAutoLearnBadge(d.autoLearnMeta);
      const span = document.createElement("span");
      span.className = `kb-auto-learn-badge ${badge.className}`;
      span.textContent = badge.text;
      nameCell.appendChild(span);
    }
    if (d.encryptionStatus === "locked") {
      const lockBadge = document.createElement("span");
      lockBadge.className = "kb-auto-learn-badge kb-locked-badge";
      lockBadge.textContent = "待解锁";
      lockBadge.title = "文档已加密，输入密码后将自动建立检索索引";
      nameCell.appendChild(lockBadge);
    }

    const timeCell = document.createElement("span");
    timeCell.className = "kb-ingest-row__time";
    timeCell.textContent = d.createdAt || "—";

    const act = document.createElement("div");
    act.className = "kb-ingest-row__ops";
    if (d.encryptionStatus === "locked") {
      const unlockBtn = document.createElement("button");
      unlockBtn.type = "button";
      unlockBtn.className = "secondary";
      unlockBtn.textContent = "解锁";
      unlockBtn.title = "输入密码并完成索引";
      unlockBtn.addEventListener("click", async () => {
        const out = await unlockKbDocumentWithPrompt(d.id, gid, {
          fileName: d.name,
          filePath: d.sourcePath,
          reason: "unlock",
        });
        if (out?.canceled) {
          return;
        }
        if (!out?.ok) {
          setStatus(out?.error || "解锁失败", true);
          return;
        }
        setStatus(`已解锁并完成索引：${d.name || "文档"}`);
      });
      act.appendChild(unlockBtn);
    }
    if (d.autoLearn === true) {
      const cred = d.autoLearnMeta?.credibility || "unconfirmed";
      if (cred !== "verified") {
        const confirmBtn = document.createElement("button");
        confirmBtn.type = "button";
        confirmBtn.className = "secondary";
        confirmBtn.textContent = cred === "confirmed" ? "标为已核验" : "确认有效";
        confirmBtn.title = "提升可信度，检索排序权重随之提高";
        confirmBtn.addEventListener("click", async () => {
          if (typeof api.kbAutoLearnPromote !== "function") {
            return;
          }
          const nextCred = cred === "confirmed" ? "verified" : "confirmed";
          setStatus("正在更新可信度…");
          try {
            if (gid !== activeLibraryId && typeof api.kbLibrarySetActive === "function") {
              await api.kbLibrarySetActive(gid);
            }
            const res = await api.kbAutoLearnPromote({
              docId: d.id,
              libraryId: gid,
              credibility: nextCred,
            });
            if (!res?.ok) {
              setStatus(res?.error || "更新失败", true);
              return;
            }
            await refreshState();
            setStatus("可信度已更新。");
          } catch (err) {
            setStatus(err.message || String(err), true);
          }
        });
        act.appendChild(confirmBtn);
      }
      const rollbackBtn = document.createElement("button");
      rollbackBtn.type = "button";
      rollbackBtn.className = "secondary";
      rollbackBtn.textContent = "回滚";
      rollbackBtn.title = "删除该自动学习条目并记入审计";
      rollbackBtn.addEventListener("click", async () => {
        if (typeof api.kbAutoLearnRollback !== "function") {
          return;
        }
        if (!window.confirm(`确定回滚删除「${d.name}」？此操作不可恢复。`)) {
          return;
        }
        setStatus("正在回滚…");
        try {
          if (gid !== activeLibraryId && typeof api.kbLibrarySetActive === "function") {
            await api.kbLibrarySetActive(gid);
          }
          const res = await api.kbAutoLearnRollback({ docId: d.id, libraryId: gid });
          if (!res?.ok) {
            setStatus(res?.error || "回滚失败", true);
            return;
          }
          await refreshState();
          setStatus("已回滚删除。");
        } catch (err) {
          setStatus(err.message || String(err), true);
        }
      });
      act.appendChild(rollbackBtn);
    }
    const moveBtn = document.createElement("button");
    moveBtn.type = "button";
    moveBtn.className = "secondary";
    moveBtn.textContent = "迁移";
    moveBtn.title = "迁移至其他知识库目录";
    moveBtn.addEventListener("click", async () => {
      const targetLibraryId = await chooseTargetLibraryForMigration(d, gid);
      if (!targetLibraryId) return;
      await migrateDocument(d, gid, targetLibraryId);
    });
    const del = document.createElement("button");
    del.type = "button";
    del.className = "secondary";
    del.textContent = "删除";
    del.title = "从知识库移除此文档及其向量";
    del.addEventListener("click", async () => {
      if (!api.kbDeleteDocument) {
        return;
      }
      if (!window.confirm(`确定从知识库删除「${d.name}」？`)) {
        return;
      }
      setStatus("正在删除…");
      try {
        if (g.id && g.id !== activeLibraryId && typeof api.kbLibrarySetActive === "function") {
          await api.kbLibrarySetActive(g.id);
        }
        await api.kbDeleteDocument(d.id);
        await refreshState();
      } catch (err) {
        setStatus(err.message || String(err), true);
      }
    });
    act.appendChild(moveBtn);
    act.appendChild(del);

    row.appendChild(libCell);
    row.appendChild(nameCell);
    row.appendChild(timeCell);
    row.appendChild(act);
    container.appendChild(row);
  }

  function renderIngestSummary(groups) {
    if (!el.docSummary) {
      return;
    }
    el.docSummary.innerHTML = "";
    const list = Array.isArray(groups) ? groups : [];
    if (!list.length) {
      el.docSummary.innerHTML = `<p class="field-hint kb-ingest-empty">暂无目录汇总数据。</p>`;
      return;
    }
    list.forEach((g) => {
      const gid = String(g?.id || "");
      if (!gid) return;
      const docs = Array.isArray(g.documents) ? g.documents : [];
      const row = document.createElement("div");
      row.className = "kb-ingest-summary-row";
      row.setAttribute("role", "row");
      const libCell = document.createElement("span");
      libCell.className = "kb-ingest-summary-row__lib";
      libCell.textContent = g.name || gid || "—";
      const countCell = document.createElement("span");
      countCell.className = "kb-ingest-summary-row__count";
      countCell.textContent = String(docs.length || g.docCount || 0);
      const timeCell = document.createElement("span");
      timeCell.className = "kb-ingest-summary-row__time";
      timeCell.textContent = getLibraryLastUpdated(docs);
      row.appendChild(libCell);
      row.appendChild(countCell);
      row.appendChild(timeCell);
      el.docSummary.appendChild(row);
    });
  }

  function renderIngestedDocsFull(groups, activeLibraryId) {
    if (!el.docList) {
      return;
    }
    el.docList.innerHTML = "";
    const list = Array.isArray(groups) ? groups : [];
    const rows = [];
    list.forEach((g) => {
      const gid = String(g?.id || "");
      if (!gid) return;
      (Array.isArray(g.documents) ? g.documents : []).forEach((d) => {
        rows.push({ d, gid, g });
      });
    });
    if (!rows.length) {
      el.docList.innerHTML = `<p class="field-hint kb-ingest-empty">暂无入库文档，请在目录行操作中选择「选择文件入库」。</p>`;
      return;
    }
    rows.forEach(({ d, gid, g }) => {
      appendIngestDocRow(el.docList, d, gid, g, activeLibraryId, list);
    });
  }

  function renderDocs(groups, activeLibraryId) {
    rerenderLibraryViews(groups, activeLibraryId);
  }

  function createSvgEl(tag) {
    return document.createElementNS("http://www.w3.org/2000/svg", tag);
  }

  function graphSvgPointFromClient(svg, clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    const vb = svg.viewBox?.baseVal;
    const w = vb && vb.width ? vb.width : 820;
    const h = vb && vb.height ? vb.height : 520;
    return {
      x: ((clientX - rect.left) * w) / Math.max(1, rect.width),
      y: ((clientY - rect.top) * h) / Math.max(1, rect.height),
    };
  }

  function graphWorldPointFromClient(svg, clientX, clientY) {
    const p = graphSvgPointFromClient(svg, clientX, clientY);
    return {
      x: (p.x - graphViewState.tx) / Math.max(0.0001, graphViewState.scale),
      y: (p.y - graphViewState.ty) / Math.max(0.0001, graphViewState.scale),
    };
  }

  function applyGraphTransform() {
    const vp = graphViewState.viewportEl;
    if (!vp) {
      return;
    }
    vp.setAttribute(
      "transform",
      `translate(${graphViewState.tx.toFixed(2)} ${graphViewState.ty.toFixed(2)}) scale(${graphViewState.scale.toFixed(4)})`
    );
  }

  function resetGraphTransform() {
    graphViewState.scale = 1;
    graphViewState.tx = 0;
    graphViewState.ty = 0;
    applyGraphTransform();
  }

  function stopGraphSimulation() {
    if (graphViewState.simulationRaf) {
      cancelAnimationFrame(graphViewState.simulationRaf);
      graphViewState.simulationRaf = 0;
    }
  }

  function runGraphSimulationTick() {
    const scene = graphViewState.scene;
    if (!scene || !scene.nodes.length) {
      stopGraphSimulation();
      return;
    }
    const forceOn = el.graphForceEnabled?.checked !== false;
    if (!forceOn && graphViewState.dragMode !== "node") {
      stopGraphSimulation();
      paintGraphScene();
      return;
    }
    const nodes = scene.nodes;
    const edges = scene.edges;
    const alpha = Math.max(graphViewState.simulationAlpha, graphViewState.dragMode === "node" ? 0.16 : 0.01);
    const damping = 0.88;
    const repulseK = 2400 * alpha;
    const springK = 0.012 * alpha;
    const centerK = 0.003 * alpha;
    const collisionR = 16;
    const width = scene.width;
    const height = scene.height;

    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i];
      if (graphViewState.dragMode === "node" && graphViewState.dragNodeId === n.id) {
        n.x = graphViewState.dragWorldX;
        n.y = graphViewState.dragWorldY;
        n.vx = 0;
        n.vy = 0;
        continue;
      }
      n.vx *= damping;
      n.vy *= damping;
      n.vx += (width / 2 - n.x) * centerK;
      n.vy += (height / 2 - n.y) * centerK;
    }

    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist2 = dx * dx + dy * dy;
        if (dist2 < 0.01) {
          dx = (Math.random() - 0.5) * 0.2;
          dy = (Math.random() - 0.5) * 0.2;
          dist2 = dx * dx + dy * dy;
        }
        const dist = Math.sqrt(dist2);
        const repulse = repulseK / Math.max(36, dist2);
        const ux = dx / dist;
        const uy = dy / dist;
        a.vx -= ux * repulse;
        a.vy -= uy * repulse;
        b.vx += ux * repulse;
        b.vy += uy * repulse;
        if (dist < collisionR) {
          const push = (collisionR - dist) * 0.12;
          a.vx -= ux * push;
          a.vy -= uy * push;
          b.vx += ux * push;
          b.vy += uy * push;
        }
      }
    }

    edges.forEach((e) => {
      const a = scene.nodeMap.get(e.source);
      const b = scene.nodeMap.get(e.target);
      if (!a || !b) {
        return;
      }
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const target = 88 - Math.min(28, e.weight * 4);
      const f = (dist - target) * springK * Math.max(0.7, Math.min(2, e.weight));
      const ux = dx / dist;
      const uy = dy / dist;
      a.vx += ux * f;
      a.vy += uy * f;
      b.vx -= ux * f;
      b.vy -= uy * f;
    });

    nodes.forEach((n) => {
      if (graphViewState.dragMode === "node" && graphViewState.dragNodeId === n.id) {
        return;
      }
      n.x += n.vx;
      n.y += n.vy;
      const margin = 18;
      if (n.x < margin) {
        n.x = margin;
        n.vx *= -0.4;
      } else if (n.x > width - margin) {
        n.x = width - margin;
        n.vx *= -0.4;
      }
      if (n.y < margin) {
        n.y = margin;
        n.vy *= -0.4;
      } else if (n.y > height - margin) {
        n.y = height - margin;
        n.vy *= -0.4;
      }
    });
    graphViewState.positions = new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
    paintGraphScene();

    if (graphViewState.dragMode === "node") {
      graphViewState.simulationAlpha = 0.24;
    } else {
      graphViewState.simulationAlpha *= 0.965;
    }
    if (graphViewState.simulationAlpha < 0.008 && graphViewState.dragMode !== "node") {
      stopGraphSimulation();
      return;
    }
    graphViewState.simulationRaf = requestAnimationFrame(runGraphSimulationTick);
  }

  function scheduleGraphSimulation(alpha) {
    graphViewState.simulationAlpha = Math.max(graphViewState.simulationAlpha, Number(alpha) || 0.22);
    if (graphViewState.simulationRaf) {
      return;
    }
    graphViewState.simulationRaf = requestAnimationFrame(runGraphSimulationTick);
  }

  function paintGraphScene() {
    const scene = graphViewState.scene;
    if (!scene) {
      return;
    }
    scene.edges.forEach((e) => {
      const line = scene.edgeElMap.get(e.id);
      const a = scene.nodeMap.get(e.source);
      const b = scene.nodeMap.get(e.target);
      if (!line || !a || !b) {
        return;
      }
      line.setAttribute("x1", String(a.x));
      line.setAttribute("y1", String(a.y));
      line.setAttribute("x2", String(b.x));
      line.setAttribute("y2", String(b.y));
    });
    scene.nodes.forEach((n) => {
      const group = scene.nodeGroupMap.get(n.id);
      if (group) {
        group.setAttribute("transform", `translate(${n.x} ${n.y})`);
      }
    });
    const focusId = graphViewState.hoveredNodeId;
    if (focusId && graphViewState.tooltipEl) {
      const node = scene.nodeMap.get(focusId);
      if (node) {
        graphViewState.tooltipEl.setAttribute("transform", `translate(${node.x} ${node.y - 18})`);
      }
    }
  }

  function bindGraphInteractions() {
    if (!el.graphCanvas || el.graphCanvas.dataset.interactiveBound === "1") {
      return;
    }
    const svg = el.graphCanvas;
    svg.dataset.interactiveBound = "1";

    svg.addEventListener("mouseleave", () => {
      setGraphHover("");
    });

    svg.addEventListener(
      "mouseover",
      (ev) => {
        const nodeEl = ev.target && ev.target.closest ? ev.target.closest(".kb-graph-node-group") : null;
        if (nodeEl) {
          setGraphHover(String(nodeEl.dataset.nodeId || ""));
        }
      },
      true
    );

    svg.addEventListener(
      "wheel",
      (ev) => {
        if (!graphViewState.viewportEl) {
          return;
        }
        ev.preventDefault();
        const p = graphSvgPointFromClient(svg, ev.clientX, ev.clientY);
        const factor = ev.deltaY < 0 ? 1.12 : 0.89;
        const oldScale = graphViewState.scale;
        const nextScale = Math.max(graphViewState.minScale, Math.min(graphViewState.maxScale, oldScale * factor));
        if (Math.abs(nextScale - oldScale) < 1e-6) {
          return;
        }
        const worldX = (p.x - graphViewState.tx) / oldScale;
        const worldY = (p.y - graphViewState.ty) / oldScale;
        graphViewState.scale = nextScale;
        graphViewState.tx = p.x - worldX * nextScale;
        graphViewState.ty = p.y - worldY * nextScale;
        applyGraphTransform();
      },
      { passive: false }
    );

    svg.addEventListener("mousedown", (ev) => {
      if (!graphViewState.viewportEl || ev.button !== 0) {
        return;
      }
      const nodeEl = ev.target && ev.target.closest ? ev.target.closest(".kb-graph-node-group") : null;
      if (nodeEl) {
        const nodeId = String(nodeEl.dataset.nodeId || "").trim();
        if (nodeId) {
          const wp = graphWorldPointFromClient(svg, ev.clientX, ev.clientY);
          graphViewState.dragMode = "node";
          graphViewState.dragNodeId = nodeId;
          graphViewState.dragWorldX = wp.x;
          graphViewState.dragWorldY = wp.y;
          graphViewState.dragging = true;
          svg.classList.add("is-dragging");
          scheduleGraphSimulation(0.24);
          return;
        }
      }
      graphViewState.dragMode = "pan";
      graphViewState.dragging = true;
      graphViewState.lastClientX = ev.clientX;
      graphViewState.lastClientY = ev.clientY;
      svg.classList.add("is-dragging");
    });

    window.addEventListener("mousemove", (ev) => {
      if (!graphViewState.dragging || !graphViewState.viewportEl) {
        return;
      }
      if (graphViewState.dragMode === "node") {
        const wp = graphWorldPointFromClient(svg, ev.clientX, ev.clientY);
        graphViewState.dragWorldX = wp.x;
        graphViewState.dragWorldY = wp.y;
        scheduleGraphSimulation(0.22);
        return;
      }
      const vb = svg.viewBox?.baseVal;
      const vbW = vb && vb.width ? vb.width : 820;
      const vbH = vb && vb.height ? vb.height : 520;
      const rect = svg.getBoundingClientRect();
      const dx = ev.clientX - graphViewState.lastClientX;
      const dy = ev.clientY - graphViewState.lastClientY;
      graphViewState.lastClientX = ev.clientX;
      graphViewState.lastClientY = ev.clientY;
      graphViewState.tx += (dx * vbW) / Math.max(1, rect.width);
      graphViewState.ty += (dy * vbH) / Math.max(1, rect.height);
      applyGraphTransform();
    });

    window.addEventListener("mouseup", () => {
      if (!graphViewState.dragging) {
        return;
      }
      if (graphViewState.dragMode === "node") {
        graphViewState.dragNodeId = "";
        graphViewState.dragMode = "";
        graphViewState.dragging = false;
        svg.classList.remove("is-dragging");
        scheduleGraphSimulation(0.26);
        return;
      }
      graphViewState.dragging = false;
      graphViewState.dragMode = "";
      svg.classList.remove("is-dragging");
    });

    svg.addEventListener("dblclick", async (ev) => {
      const nodeEl = ev.target && ev.target.closest ? ev.target.closest(".kb-graph-node-group") : null;
      if (nodeEl) {
        const nodeId = String(nodeEl.dataset.nodeId || "").trim();
        const scene = graphViewState.scene;
        const node = scene?.nodeMap?.get?.(nodeId);
        if (node && node.type === "doc" && node.docId && typeof api.kbOpenDocument === "function") {
          try {
            const out = await runKbOpenWithLocateFlow({
              docId: node.docId,
              libraryId: String(node.libraryId || graphViewState.activeLibraryId || ""),
            }, { docName: node.label || node.name || "" });
            if (out?.canceled) {
              return;
            }
            if (!out?.ok) {
              setStatus(out?.error || "打开文档失败", true);
            } else {
              setStatus(
                out.relocated
                  ? `文档路径已自动更新，已打开：${out.path || ""}`
                  : "已打开对应文档。"
              );
            }
          } catch (err) {
            setStatus(err.message || String(err), true);
          }
          return;
        }
      }
      resetGraphTransform();
    });
  }

  function shortGraphLabel(text, max = 20) {
    const s = String(text || "").trim();
    if (!s) {
      return "未命名";
    }
    return s.length > max ? `${s.slice(0, max)}…` : s;
  }

  function ensureGraphDefs(svg) {
    let defs = svg.querySelector("defs.kb-graph-defs");
    if (defs) {
      return defs;
    }
    defs = createSvgEl("defs");
    defs.setAttribute("class", "kb-graph-defs");
    defs.innerHTML = [
      '<filter id="kbGraphGlowDoc" x="-80%" y="-80%" width="260%" height="260%">',
      '<feGaussianBlur stdDeviation="3.2" result="blur"/>',
      '<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>',
      "</filter>",
      '<filter id="kbGraphGlowSection" x="-60%" y="-60%" width="220%" height="220%">',
      '<feGaussianBlur stdDeviation="2" result="blur"/>',
      '<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>',
      "</filter>",
      '<linearGradient id="kbGraphGradDoc" x1="0%" y1="0%" x2="100%" y2="100%">',
      '<stop offset="0%" stop-color="#5eead4"/>',
      '<stop offset="55%" stop-color="#22d3ee"/>',
      '<stop offset="100%" stop-color="#0284c7"/>',
      "</linearGradient>",
      '<linearGradient id="kbGraphGradSection" x1="0%" y1="0%" x2="100%" y2="100%">',
      '<stop offset="0%" stop-color="#6ee7b7"/>',
      '<stop offset="100%" stop-color="#3d6b68"/>',
      "</linearGradient>",
      '<filter id="kbGraphGlowFolder" x="-70%" y="-70%" width="240%" height="240%">',
      '<feGaussianBlur stdDeviation="2.4" result="blur"/>',
      '<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>',
      "</filter>",
      '<filter id="kbGraphGlowConcept" x="-70%" y="-70%" width="240%" height="240%">',
      '<feGaussianBlur stdDeviation="2.4" result="blur"/>',
      '<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>',
      "</filter>",
      '<linearGradient id="kbGraphGradFolder" x1="0%" y1="0%" x2="100%" y2="100%">',
      '<stop offset="0%" stop-color="#fcd34d"/>',
      '<stop offset="100%" stop-color="#f59e0b"/>',
      "</linearGradient>",
      '<linearGradient id="kbGraphGradConcept" x1="0%" y1="0%" x2="100%" y2="100%">',
      '<stop offset="0%" stop-color="#c4b5fd"/>',
      '<stop offset="100%" stop-color="#7c3aed"/>',
      "</linearGradient>",
    ].join("");
    svg.insertBefore(defs, svg.firstChild);
    return defs;
  }

  function buildGraphAdjacency(edges) {
    const adj = new Map();
    (edges || []).forEach((e) => {
      if (!adj.has(e.source)) {
        adj.set(e.source, new Set());
      }
      if (!adj.has(e.target)) {
        adj.set(e.target, new Set());
      }
      adj.get(e.source).add(e.target);
      adj.get(e.target).add(e.source);
    });
    return adj;
  }

  function graphNodeIsNeighbor(nodeId, focusId, adjacency) {
    if (!focusId || nodeId === focusId) {
      return false;
    }
    return adjacency.get(focusId)?.has(nodeId) === true;
  }

  function setGraphHover(nodeId) {
    const scene = graphViewState.scene;
    const focusId = String(nodeId || "").trim();
    graphViewState.hoveredNodeId = focusId;
    if (!scene) {
      return;
    }
    const adjacency = scene.adjacency || new Map();
    scene.nodeGroupMap.forEach((group, id) => {
      const isFocus = id === focusId;
      const isNeighbor = graphNodeIsNeighbor(id, focusId, adjacency);
      group.classList.toggle("is-focused", isFocus);
      group.classList.toggle("is-neighbor", isNeighbor);
      group.classList.toggle("is-dimmed", Boolean(focusId) && !isFocus && !isNeighbor);
    });
    scene.edges.forEach((e) => {
      const line = scene.edgeElMap.get(e.id);
      if (!line) {
        return;
      }
      const active = focusId && (e.source === focusId || e.target === focusId);
      line.classList.toggle("is-active", Boolean(active));
      line.classList.toggle("is-dimmed", Boolean(focusId) && !active);
    });
    const tooltip = graphViewState.tooltipEl;
    if (!tooltip || !focusId) {
      tooltip?.classList.remove("is-visible");
      return;
    }
    const node = scene.nodeMap.get(focusId);
    if (!node) {
      tooltip.classList.remove("is-visible");
      return;
    }
    const labelText = shortGraphLabel(node.label, 28);
    const weight = Math.max(1, Number(node.weight || 1));
    const typeLabel =
      node.type === "doc"
        ? "文档"
        : node.type === "folder"
          ? "目录"
          : node.type === "concept"
            ? "协议码"
            : "章节";
    tooltip.querySelector(".kb-graph-tooltip__text").textContent = `${labelText} · ${typeLabel} · 权重 ${weight}`;
    tooltip.setAttribute("transform", `translate(${node.x} ${node.y - 18})`);
    const textEl = tooltip.querySelector(".kb-graph-tooltip__text");
    const bgEl = tooltip.querySelector(".kb-graph-tooltip__bg");
    if (textEl && bgEl) {
      try {
        const bbox = textEl.getBBox();
        bgEl.setAttribute("x", String(bbox.x - 8));
        bgEl.setAttribute("y", String(bbox.y - 2));
        bgEl.setAttribute("width", String(bbox.width + 16));
        bgEl.setAttribute("height", String(bbox.height + 6));
      } catch {
        /* getBBox may fail before attach */
      }
    }
    tooltip.classList.add("is-visible");
  }

  function updateGraphFullscreenButton() {
    const btn = el.graphFullscreenBtn;
    if (!btn) {
      return;
    }
    const active =
      document.fullscreenElement === el.graphStage ||
      el.graphStage?.classList.contains("is-graph-fullscreen");
    btn.textContent = active ? "退出全屏" : "全屏";
    btn.setAttribute("aria-label", active ? "退出全屏" : "全屏观看");
  }

  async function toggleGraphFullscreen() {
    const stage = el.graphStage;
    if (!stage) {
      return;
    }
    const isActive =
      document.fullscreenElement === stage || stage.classList.contains("is-graph-fullscreen");
    if (isActive) {
      if (document.fullscreenElement === stage && document.exitFullscreen) {
        await document.exitFullscreen();
      } else {
        stage.classList.remove("is-graph-fullscreen");
        document.body.classList.remove("kb-graph-fullscreen-open");
      }
      updateGraphFullscreenButton();
      scheduleGraphSimulation(0.12);
      return;
    }
    try {
      if (stage.requestFullscreen) {
        await stage.requestFullscreen();
      } else {
        stage.classList.add("is-graph-fullscreen");
        document.body.classList.add("kb-graph-fullscreen-open");
      }
    } catch {
      stage.classList.add("is-graph-fullscreen");
      document.body.classList.add("kb-graph-fullscreen-open");
    }
    updateGraphFullscreenButton();
    resetGraphTransform();
    scheduleGraphSimulation(0.18);
  }

  function graphEdgeRank(edge) {
    const rankByType = {
      "code-ref": 6,
      "same-protocol": 5,
      "shared-keyword": 4,
      "same-folder": 4,
      "folder-seq": 3,
      "has-code": 3,
      "wiki-link": 3,
      "md-link": 3,
      mention: 2,
      contains: 2,
      flow: 1,
    };
    return rankByType[String(edge?.type || "")] || 1;
  }

  function selectGraphDisplayNodes(allNodes, allEdges, onlyDocs) {
    const docNodes = allNodes.filter((n) => n.type === "doc").sort((a, b) => Number(b.weight || 0) - Number(a.weight || 0));
    const sectionNodes = allNodes.filter((n) => n.type === "section");
    const folderNodes = allNodes.filter((n) => n.type === "folder");
    const conceptNodes = allNodes.filter((n) => n.type === "concept");
    const pickedDocs = docNodes.slice(0, 36);
    const pickedDocIds = new Set(pickedDocs.map((d) => String(d.docId || "")));
    const picked = [...pickedDocs];
    if (!onlyDocs) {
      const sectionsByDoc = new Map();
      sectionNodes.forEach((section) => {
        const docId = String(section.docId || "");
        if (!pickedDocIds.has(docId)) {
          return;
        }
        if (!sectionsByDoc.has(docId)) {
          sectionsByDoc.set(docId, []);
        }
        sectionsByDoc.get(docId).push(section);
      });
      sectionsByDoc.forEach((sections) => {
        picked.push(...sections.slice(0, 4));
      });
    }
    picked.push(...folderNodes.slice(0, 8), ...conceptNodes.slice(0, 6));
    const nodeIdSet = new Set(picked.map((n) => n.id));
    const edges = allEdges
      .filter((edge) => nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target))
      .sort(
        (a, b) =>
          graphEdgeRank(b) - graphEdgeRank(a) ||
          Number(b.weight || 0) - Number(a.weight || 0)
      )
      .slice(0, 240);
    return { nodes: picked, edges };
  }

  function applyGraphGridLayout(nodes, width, height) {
    const list = Array.isArray(nodes) ? nodes : [];
    if (!list.length) {
      return;
    }
    const cols = Math.max(1, Math.ceil(Math.sqrt(list.length)));
    const rows = Math.max(1, Math.ceil(list.length / cols));
    const padX = 56;
    const padY = 48;
    const cellW = (width - padX * 2) / cols;
    const cellH = (height - padY * 2) / rows;
    list.forEach((node, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      node.x = padX + col * cellW + cellW / 2;
      node.y = padY + row * cellH + cellH / 2;
      node.vx = 0;
      node.vy = 0;
    });
  }

  function applyGraphClusterLayout(nodes, edges, width, height) {
    const list = Array.isArray(nodes) ? nodes : [];
    const edgeList = Array.isArray(edges) ? edges : [];
    if (!list.length) {
      return;
    }
    const parent = new Map(list.map((n) => [n.id, n.id]));
    const find = (id) => {
      let cur = id;
      while (parent.get(cur) && parent.get(cur) !== cur) {
        cur = parent.get(cur);
      }
      return cur;
    };
    const unite = (a, b) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) {
        parent.set(rb, ra);
      }
    };
    edgeList.forEach((edge) => unite(edge.source, edge.target));
    const groups = new Map();
    list.forEach((node) => {
      const root = find(node.id);
      if (!groups.has(root)) {
        groups.set(root, []);
      }
      groups.get(root).push(node);
    });
    const groupList = [...groups.values()].sort((a, b) => b.length - a.length);
    const pad = 48;
    const usableW = width - pad * 2;
    const usableH = height - pad * 2;
    const groupCols = Math.max(1, Math.ceil(Math.sqrt(groupList.length)));
    const groupRows = Math.max(1, Math.ceil(groupList.length / groupCols));
    const groupCellW = usableW / groupCols;
    const groupCellH = usableH / groupRows;
    groupList.forEach((group, groupIdx) => {
      const gx = groupIdx % groupCols;
      const gy = Math.floor(groupIdx / groupCols);
      const cx = pad + gx * groupCellW + groupCellW / 2;
      const cy = pad + gy * groupCellH + groupCellH / 2;
      const radius = Math.min(groupCellW, groupCellH) * 0.28;
      group.forEach((node, idx) => {
        const angle = (Math.PI * 2 * idx) / Math.max(1, group.length);
        node.x = cx + Math.cos(angle) * radius;
        node.y = cy + Math.sin(angle) * radius;
        node.vx = 0;
        node.vy = 0;
      });
    });
  }

  function renderGraphSnapshot(graph) {
    if (!el.graphCanvas) {
      return;
    }
    el.graphCanvas.innerHTML = "";
    stopGraphSimulation();
    graphViewState.scene = null;
    graphViewState.hoveredNodeId = "";
    graphViewState.tooltipEl = null;
    graphViewState.positions = new Map();
    bindGraphInteractions();
    ensureGraphDefs(el.graphCanvas);
    const g = graph && typeof graph === "object" ? graph : {};
    const allNodes = Array.isArray(g.nodes) ? g.nodes : [];
    const allEdges = Array.isArray(g.edges) ? g.edges : [];
    const onlyDocs = el.graphOnlyDocs?.checked === true;
    const picked = selectGraphDisplayNodes(allNodes, allEdges, onlyDocs);
    let nodes = picked.nodes;
    let edges = picked.edges;
    if (!nodes.length) {
      const empty = createSvgEl("text");
      empty.setAttribute("x", "24");
      empty.setAttribute("y", "36");
      empty.setAttribute("class", "kb-graph-empty");
      empty.textContent = "当前知识库暂无可展示的图谱节点。";
      el.graphCanvas.appendChild(empty);
      graphViewState.viewportEl = null;
      return;
    }
    const viewport = createSvgEl("g");
    viewport.setAttribute("class", "kb-graph-viewport");
    graphViewState.viewportEl = viewport;
    const width = 820;
    const height = 520;
    el.graphCanvas.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const cx = width / 2;
    const cy = height / 2;
    const ringBase = Math.min(width, height) * 0.34;
    const nodeMap = new Map();
    const edgeElMap = new Map();
    const nodeGroupMap = new Map();
    const keepLayout = el.graphKeepLayout?.checked !== false;
    const hasStructuralEdges = edges.some((edge) => graphEdgeRank(edge) >= 2);
    nodes.forEach((n, idx) => {
      const prev = keepLayout ? graphViewState.positions.get(n.id) : null;
      const np = {
        ...n,
        x: Number(prev?.x),
        y: Number(prev?.y),
        vx: 0,
        vy: 0,
      };
      if (!Number.isFinite(np.x) || !Number.isFinite(np.y)) {
        if (hasStructuralEdges) {
          const angle = (Math.PI * 2 * idx) / Math.max(1, nodes.length);
          const localWeight = Math.max(1, Number(n.weight || 1));
          const radiusBias = Math.min(22, Math.log(localWeight + 1) * 6);
          const r = ringBase - radiusBias + ((idx % 3) - 1) * 16;
          np.x = cx + Math.cos(angle) * r;
          np.y = cy + Math.sin(angle) * (r * 0.85);
        } else {
          np.x = cx;
          np.y = cy;
        }
      }
      nodeMap.set(np.id, np);
    });
    if (!keepLayout || [...nodeMap.values()].every((n) => !Number.isFinite(n.x) || !Number.isFinite(n.y))) {
      if (hasStructuralEdges) {
        applyGraphClusterLayout([...nodeMap.values()], edges, width, height);
      } else {
        applyGraphGridLayout([...nodeMap.values()], width, height);
      }
    }

    const edgeLayer = createSvgEl("g");
    edgeLayer.setAttribute("class", "kb-graph-edges");
    viewport.appendChild(edgeLayer);

    edges.forEach((e, edgeIdx) => {
      const p1 = nodeMap.get(e.source);
      const p2 = nodeMap.get(e.target);
      if (!p1 || !p2) {
        return;
      }
      const line = createSvgEl("line");
      line.setAttribute("x1", String(p1.x));
      line.setAttribute("y1", String(p1.y));
      line.setAttribute("x2", String(p2.x));
      line.setAttribute("y2", String(p2.y));
      line.setAttribute("class", `kb-graph-edge kb-graph-edge--${String(e.type || "link").replace(/[^a-z0-9-]/gi, "-")}`);
      line.setAttribute("stroke-dasharray", "6 4");
      line.style.animationDelay = `${(edgeIdx % 12) * 0.18}s`;
      line.setAttribute("stroke-width", String(Math.min(2.2, 0.65 + Number(e.weight || 1) * 0.18)));
      edgeLayer.appendChild(line);
      edgeElMap.set(e.id, line);
    });

    const nodeLayer = createSvgEl("g");
    nodeLayer.setAttribute("class", "kb-graph-nodes");
    viewport.appendChild(nodeLayer);

    [...nodeMap.values()].forEach((n) => {
      const p = n;
      if (!p) {
        return;
      }
      const weight = Math.max(1, Number(n.weight || 1));
      const radius = Math.min(13, 4.4 + Math.log(weight + 1) * 1.9);
      const isDoc = n.type === "doc";
      const isFolder = n.type === "folder";
      const isConcept = n.type === "concept";
      const group = createSvgEl("g");
      group.setAttribute("class", "kb-graph-node-group");
      group.dataset.nodeId = String(n.id || "");
      const halo = createSvgEl("circle");
      halo.setAttribute("r", String(radius + 5));
      halo.setAttribute("class", "kb-graph-node-halo");
      const circle = createSvgEl("circle");
      circle.setAttribute("r", String(radius));
      const nodeClass = isDoc
        ? "kb-graph-node-doc"
        : isFolder
          ? "kb-graph-node-folder"
          : isConcept
            ? "kb-graph-node-concept"
            : "kb-graph-node-section";
      circle.setAttribute("class", `kb-graph-node ${nodeClass}`);
      const glowId = isDoc
        ? "kbGraphGlowDoc"
        : isFolder
          ? "kbGraphGlowFolder"
          : isConcept
            ? "kbGraphGlowConcept"
            : "kbGraphGlowSection";
      const gradId = isDoc
        ? "kbGraphGradDoc"
        : isFolder
          ? "kbGraphGradFolder"
          : isConcept
            ? "kbGraphGradConcept"
            : "kbGraphGradSection";
      circle.setAttribute("filter", `url(#${glowId})`);
      circle.setAttribute("fill", `url(#${gradId})`);
      const typeLabel = isDoc ? "文档" : isFolder ? "目录" : isConcept ? "协议码" : "章节";
      const tip = createSvgEl("title");
      tip.textContent = `${n.label}（${typeLabel} · 权重 ${weight}）`;
      group.appendChild(tip);
      group.appendChild(halo);
      group.appendChild(circle);
      nodeLayer.appendChild(group);
      nodeGroupMap.set(n.id, group);
    });

    const tooltip = createSvgEl("g");
    tooltip.setAttribute("class", "kb-graph-tooltip");
    const tooltipBg = createSvgEl("rect");
    tooltipBg.setAttribute("class", "kb-graph-tooltip__bg");
    tooltipBg.setAttribute("rx", "6");
    tooltipBg.setAttribute("ry", "6");
    const tooltipText = createSvgEl("text");
    tooltipText.setAttribute("class", "kb-graph-tooltip__text");
    tooltipText.setAttribute("text-anchor", "middle");
    tooltipText.setAttribute("y", "4");
    tooltip.appendChild(tooltipBg);
    tooltip.appendChild(tooltipText);
    viewport.appendChild(tooltip);
    graphViewState.tooltipEl = tooltip;

    el.graphCanvas.appendChild(viewport);
    graphViewState.scene = {
      width,
      height,
      nodes: [...nodeMap.values()],
      edges,
      nodeMap,
      edgeElMap,
      nodeGroupMap,
      adjacency: buildGraphAdjacency(edges),
    };
    graphViewState.positions = new Map([...nodeMap.entries()].map(([id, n]) => [id, { x: n.x, y: n.y }]));
    resetGraphTransform();
    paintGraphScene();
    if (hasStructuralEdges && el.graphForceEnabled?.checked !== false) {
      scheduleGraphSimulation(0.32);
    }
  }

  async function refreshGraphSnapshot(forceRebuild = false) {
    if (!api || typeof api.kbGraphSnapshot !== "function" || !el.graphCanvas) {
      return;
    }
    const libraryId = String(el.librarySelect?.value || "").trim();
    graphViewState.activeLibraryId = libraryId;
    const graphScopeLibraryId = el.graphGlobalScope?.checked ? "__all__" : libraryId;
    const out =
      forceRebuild && typeof api.kbGraphRebuild === "function"
        ? await api.kbGraphRebuild({ libraryId: graphScopeLibraryId })
        : await api.kbGraphSnapshot({ libraryId: graphScopeLibraryId });
    if (!out?.ok) {
      if (el.graphMeta) {
        el.graphMeta.textContent = out?.error || "图谱数据获取失败。";
      }
      return;
    }
    const summary = out.graph?.summary || {};
    const onlyDocs = el.graphOnlyDocs?.checked === true;
    const pickedPreview = selectGraphDisplayNodes(out.graph?.nodes || [], out.graph?.edges || [], onlyDocs);
    if (el.graphMeta) {
      el.graphMeta.textContent =
        `节点 ${Number(summary.nodeCount || 0)}（文档 ${Number(summary.docNodeCount || 0)} / 章节 ${Number(
          summary.sectionNodeCount || 0
        )} / 目录 ${Number(summary.folderNodeCount || 0)}） · 关联线 ${Number(summary.edgeCount || 0)} · 预览 ${pickedPreview.nodes.length} 节点 / ${pickedPreview.edges.length} 线。`;
    }
    renderGraphSnapshot(out.graph);
  }

  el.rebuildEmbeddingsBtn?.addEventListener("click", async () => {
    if (typeof api.kbRebuildEmbeddings !== "function") {
      setStatus("当前环境不支持重建向量索引。", true);
      return;
    }
    const libId = String(el.librarySelect?.value || activeLibraryIdCache || "").trim();
    if (!window.confirm("将按当前嵌入模型与策略，重建当前知识库全部向量索引。文档较多时可能耗时数分钟，是否继续？")) {
      return;
    }
    setOpsButtonBusy(el.rebuildEmbeddingsBtn, true, "重建中…");
    setStatus("正在重建向量索引…");
    try {
      const out = await api.kbRebuildEmbeddings({ libraryId: libId || undefined });
      if (!out.ok) {
        setStatus(out.error || "重建失败", true);
        return;
      }
      setStatus(out.note || `已重建 ${out.rebuilt || 0} 条分片向量。`);
      await refreshState();
    } catch (err) {
      setStatus(err.message || String(err), true);
    } finally {
      setOpsButtonBusy(el.rebuildEmbeddingsBtn, false);
    }
  });

  el.rebuildFtsBtn?.addEventListener("click", async () => {
    if (typeof api.kbRebuildFtsIndex !== "function") {
      setStatus("当前环境不支持重建全文索引。", true);
      return;
    }
    const libId = String(el.librarySelect?.value || activeLibraryIdCache || "").trim();
    if (!window.confirm("将重建当前知识库全文倒排索引（BM25），是否继续？")) {
      return;
    }
    setOpsButtonBusy(el.rebuildFtsBtn, true, "重建中…");
    setStatus("正在重建全文索引…");
    try {
      const out = await api.kbRebuildFtsIndex({ libraryId: libId || undefined });
      if (!out.ok) {
        setStatus(out.error || "重建失败", true);
        return;
      }
      setStatus(out.note || `已重建 ${out.rebuilt || 0} 条全文索引。`);
      await refreshState();
    } catch (err) {
      setStatus(err.message || String(err), true);
    } finally {
      setOpsButtonBusy(el.rebuildFtsBtn, false);
    }
  });

  el.indexHealthBtn?.addEventListener("click", async () => {
    if (typeof api.kbIndexHealth !== "function") {
      setStatus("当前环境不支持索引健康检查。", true);
      return;
    }
    const libId = String(el.librarySelect?.value || activeLibraryIdCache || "").trim();
    setOpsButtonBusy(el.indexHealthBtn, true, "检查中…");
    setStatus("正在检查索引健康状态…");
    try {
      const out = await api.kbIndexHealth({ libraryId: libId || undefined });
      if (!out.ok) {
        setStatus(out.error || "检查失败", true);
        return;
      }
      const c = out.counts || {};
      const issueText = (out.issues || []).map((x) => x.message).join("；");
      const summary = out.healthy
        ? `索引健康：文档 ${c.documents || 0} · 分片 ${c.chunks || 0} · Lance ${out.lanceChunkCount} · FTS ${out.ftsChunkCount}`
        : `索引异常：${issueText || "请查看详情"}`;
      if (el.indexHealthHint) {
        el.indexHealthHint.textContent = `${summary}${out.sqlitePath ? ` · ${out.sqlitePath}` : ""}`;
      }
      setStatus(summary, !out.healthy);
    } catch (err) {
      setStatus(err.message || String(err), true);
    } finally {
      setOpsButtonBusy(el.indexHealthBtn, false);
    }
  });

  el.modelHealthBtn?.addEventListener("click", () => {
    void runModelHealthCheck({ openDialog: true });
  });

  el.modelHealthRecheckBtn?.addEventListener("click", () => {
    void runModelHealthCheck({ openDialog: true });
  });

  el.modelHealthCopyBtn?.addEventListener("click", async () => {
    if (!lastModelHealthDiagnostics) {
      setStatus("请先完成一次模型健康检测。", true);
      return;
    }
    try {
      await navigator.clipboard.writeText(lastModelHealthDiagnostics);
      setStatus("诊断信息已复制到剪贴板。");
    } catch (err) {
      setStatus(err.message || "复制失败", true);
    }
  });

  el.modelHealthOpenConfigBtn?.addEventListener("click", () => {
    scrollToKbModelConfigSection();
  });

  el.modelHealthCloseBtn?.addEventListener("click", closeModelHealthDialog);
  el.modelHealthCloseBtn2?.addEventListener("click", closeModelHealthDialog);

  el.saveBtn.addEventListener("click", async () => {
    await saveConfigSettings({ closeAfter: true });
  });

  el.opsSaveBtn?.addEventListener("click", () => {
    el.saveBtn?.click();
  });

  el.configCancelBtn?.addEventListener("click", () => closeConfigDialog());

  el.configRestoreDefaultsBtn?.addEventListener("click", () => {
    if (!window.confirm("确定将表单恢复为默认参数？不会立即写入，需保存后生效。")) {
      return;
    }
    applyConfigDefaultsToForm(KB_CONFIG_DEFAULTS);
    setStatus("已恢复默认参数，请保存设置。");
  });

  el.configVerifyBtn?.addEventListener("click", async () => {
    if (typeof api.kbIndexHealth !== "function") {
      return;
    }
    const libraryId = String(el.librarySelect?.value || activeLibraryIdCache || "").trim();
    setStatus("正在验证配置…");
    try {
      const out = await api.kbIndexHealth({ libraryId: libraryId || undefined });
      if (!out.ok) {
        setStatus(out.error || "验证失败", true);
        return;
      }
      const lines = [
        `存储后端：${out.storageBackend || "sqlite"}`,
        `文档 ${out.counts?.documents ?? "—"} · 分片 ${out.counts?.chunks ?? "—"}`,
        out.healthy === false ? `异常：${out.issues?.join("；") || "索引不一致"}` : "索引状态：健康",
      ];
      showCopyableResultDialog(lines.join("\n"), "配置验证结果");
      setStatus("配置验证完成。");
    } catch (err) {
      setStatus(err.message || String(err), true);
    }
  });

  el.configPreviewBtn?.addEventListener("click", () => {
    closeConfigDialog();
    el.trialQuery?.focus();
    el.trialQuery?.scrollIntoView({ behavior: "smooth", block: "center" });
    setStatus("已切换到检索试用，可输入问题预览召回效果。");
  });

  el.configNavItems.forEach((btn) => {
    btn.addEventListener("click", () => {
      const section = String(btn.dataset.section || "").trim();
      if (section) {
        scrollToConfigSection(section);
      }
    });
  });

  if (el.configSections) {
    const scrollRoot = document.querySelector("#kbConfigDialog .kb-main-scroll");
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) {
          return;
        }
        const section = visible.target?.dataset?.section;
        if (!section) {
          return;
        }
        const navItem = el.configNavItems.find((n) => n.dataset.section === section);
        if (navItem) {
          el.configNavItems.forEach((n) => n.classList.toggle("is-active", n === navItem));
        }
      },
      { root: scrollRoot || el.configSections, threshold: [0.35, 0.55, 0.75] }
    );
    el.configSections.querySelectorAll(".kb-card").forEach((panel) => observer.observe(panel));
  }

  bindConfigAutoSave();

  el.createLibraryBtn?.addEventListener("click", async () => {
    await handleCreateLibrary(String(el.newLibraryName?.value || "").trim(), () => {
      if (el.newLibraryName) {
        el.newLibraryName.value = "";
      }
    });
  });

  el.mainCreateLibraryBtn?.addEventListener("click", async () => {
    const name = window.prompt("新建知识库目录名称");
    if (!name) {
      return;
    }
    await handleCreateLibrary(String(name).trim());
  });

  async function handleCreateLibrary(name, onSuccess) {
    if (typeof api.kbLibraryCreate !== "function") {
      return;
    }
    if (!name) {
      setStatus("请填写新知识库目录名称。", true);
      return;
    }
    setStatus("正在创建知识库目录…");
    try {
      const out = await api.kbLibraryCreate({ name, setActive: true });
      if (!out.ok) {
        setStatus(out.error || "创建失败", true);
        return;
      }
      if (typeof onSuccess === "function") {
        onSuccess();
      }
      await refreshState();
      setStatus(`已创建并切换到「${out.library?.name || name}」。`);
    } catch (err) {
      setStatus(err.message || String(err), true);
    }
  }

  el.trialReset?.addEventListener("click", () => {
    clearTrialForm();
  });

  el.trialClear?.addEventListener("click", () => {
    clearTrialForm();
  });

  el.trialSettings?.addEventListener("click", () => {
    openConfigDialog();
    scrollToConfigSection("retrieval");
  });

  el.trialHistory?.addEventListener("click", () => {
    void openOpsLogDialog("search");
  });

  el.trialSelectAll?.addEventListener("change", () => {
    if (el.trialSearchAllLibraries?.checked) {
      return;
    }
    setAllTrialLibrariesChecked(el.trialSelectAll.checked);
  });

  el.trialQuery?.addEventListener("input", () => {
    updateTrialCharCount();
  });
  el.trialQuery?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && !ev.shiftKey) {
      ev.preventDefault();
      void runTrialSearch();
    }
  });
  updateTrialCharCount();

  let trialWarmTimer = null;
  el.trialQuery?.addEventListener("focus", () => {
    clearTimeout(trialWarmTimer);
    trialWarmTimer = setTimeout(() => {
      if (typeof api.kbWarmEmbedModel === "function") {
        void api.kbWarmEmbedModel({});
      }
    }, 400);
  });

  async function runTrialSearch() {
    if (typeof api.kbSearch !== "function") {
      setTrialStatus("当前环境不支持检索。", { isErr: true });
      setStatus("当前环境不支持检索。", true);
      return;
    }
    const q = String(el.trialQuery?.value || "").trim();
    if (!q) {
      setTrialStatus("请输入检索内容。", { isErr: true });
      setStatus("请输入检索内容。", true);
      el.trialQuery?.focus();
      return;
    }
    const topK = Math.max(1, Math.min(20, Number(el.searchTopK?.value) || 5));
    setTrialSearchBusy(true);
    setTrialStatus("正在检索，请稍候…", { busy: true });
    setStatus("正在检索…");
    renderTrialLoading(q);
    const useSearchDialog = shouldAutoOpenSearchResultDialog();
    if (useSearchDialog) {
      openSearchResultDialog(q);
      startSearchLoadingTimer();
    }
    stopSearchProgressListener();
    activeSearchProgressId = createSearchId();
    activeSearchQueryText = q;
    searchResultApplied = false;
    pendingFullSearchResult = null;
    if (typeof api.onKbSearchProgress === "function") {
      unsubSearchProgress = api.onKbSearchProgress(handleSearchProgress);
    }
    if (typeof api.onKbSearchResult === "function") {
      unsubSearchResult = api.onKbSearchResult(handleSearchResultPush);
    }
    if (el.trialDebug) {
      el.trialDebug.hidden = true;
      el.trialDebug.innerHTML = "";
    }
    try {
      const libIds = selectedTrialLibraryIds(String(el.librarySelect?.value || "").trim());
      const outRaw = await kbSearchWithTimeout({
        query: q,
        topK,
        libraryIds: libIds,
        searchId: activeSearchProgressId,
      });
      const out = resolveSearchOutput(outRaw, q);
      if (useSearchDialog) {
        ensureSearchResultDialogVisible();
      }
      if (!out?.ok) {
        const errText = out?.error || "检索失败";
        if (useSearchDialog) {
          renderSearchResultError(errText);
        }
        if (el.trialResults) {
          el.trialResults.innerHTML = "";
          const errBox = document.createElement("p");
          errBox.className = "field-hint kb-trial-error";
          errBox.textContent = errText;
          el.trialResults.appendChild(errBox);
          el.trialResults.classList.add("is-active");
        }
        setTrialStatus(errText, { isErr: true });
        setStatus(errText, true);
        return;
      }
      if (applySearchResultIfReady(q, "invoke")) {
        return;
      }
      const latency = Number(out.elapsedMs || 0);
      const hybridLabel = out.hybridSearch ? "混合" : "向量";
      const profileLabel = out.queryProfile ? ` · ${out.queryProfile}` : "";
      const modeLabel = out.searchMode ? ` · ${out.searchMode}` : "";
      const confLabel = out.lowConfidence ? " · 低置信" : "";
      const summary = `检索完成（${hybridLabel}${profileLabel}${modeLabel}${confLabel} · 模型 ${out.model || "—"} · ${latency}ms），命中 ${(out.hits || []).length} 条${formatEmbedDeviceSummary(out.embedDevice, out)}`;
      setTrialStatus(summary, { isErr: out.lowConfidence });
      setStatus(
        `${summary}（阈值 ≥ ${Number(out.minScore ?? 0.55).toFixed(2)}，候选池 ${out.searchCandidateK || "—"}）。`
      );
      if (useSearchDialog) {
        populateSearchResultDialog(out, q);
      } else {
        searchResultState = {
          hits: Array.isArray(out.hits) ? out.hits : [],
          out,
          selectedIndex: -1,
          query: q,
        };
      }
      renderTrialResultHint(summary, (out.hits || []).length, out.hits || [], q);
      if (out.debug && el.trialDebug) {
        const d = out.debug;
        el.trialDebug.hidden = false;
        el.trialDebug.innerHTML = [
          "<h4 class=\"kb-debug-title\">检索调试</h4>",
          `<div class="kb-debug-grid">`,
          `<span>问题类型</span><span>${out.queryType || d.queryType || "—"}</span>`,
          `<span>生效模式</span><span>${d.effectiveMode || out.searchMode || "—"}</span>`,
          `<span>向量召回</span><span>${d.recallStats?.vector ?? out.recallStats?.vector ?? 0} 条</span>`,
          `<span>关键词召回</span><span>${d.recallStats?.keyword ?? out.recallStats?.keyword ?? 0} 条</span>`,
          `<span>元数据召回</span><span>${d.recallStats?.metadata ?? out.recallStats?.metadata ?? 0} 条</span>`,
          `<span>全文召回</span><span>${d.recallStats?.fts ?? out.recallStats?.fts ?? 0} 条</span>`,
          `<span>RRF</span><span>${d.useRrf ? "开启" : "关闭"}</span>`,
          `<span>阈值</span><span>${Number(d.minScore ?? out.minScore ?? 0).toFixed(2)} / 拒答 ${Number(d.noAnswerThreshold ?? 0).toFixed(2)}</span>`,
          `<span>耗时</span><span>${latency} ms</span>`,
          `</div>`,
        ].join("");
      }
    } catch (err) {
      const errText = err.message || String(err);
      if (useSearchDialog) {
        ensureSearchResultDialogVisible();
        renderSearchResultError(errText);
      }
      if (el.trialResults) {
        el.trialResults.innerHTML = "";
        const errBox = document.createElement("p");
        errBox.className = "field-hint kb-trial-error";
        errBox.textContent = errText;
        el.trialResults.appendChild(errBox);
        el.trialResults.classList.add("is-active");
      }
      setTrialStatus(errText, { isErr: true });
      setStatus(errText, true);
    } finally {
      if (useSearchDialog) {
        stopSearchLoadingTimer();
      }
      stopSearchProgressListener();
      searchProgressLogEl = null;
      setTrialSearchBusy(false);
    }
  }

  el.librarySelect?.addEventListener("change", async () => {
    if (typeof api.kbLibrarySetActive !== "function") {
      return;
    }
    const id = String(el.librarySelect?.value || "").trim();
    if (!id) {
      return;
    }
    setStatus("正在切换知识库目录…");
    try {
      const out = await api.kbLibrarySetActive(id);
      if (!out.ok) {
        setStatus(out.error || "切换失败", true);
        return;
      }
      await refreshState();
    } catch (err) {
      setStatus(err.message || String(err), true);
    }
  });

  el.chooseStorageDirBtn?.addEventListener("click", handleChooseStorageDir);
  el.chooseStorageDirTextBtn?.addEventListener("click", handleChooseStorageDir);

  async function handleChooseStorageDir() {
    if (typeof api.kbStorageChooseDir !== "function" || typeof api.kbStorageSetDir !== "function") {
      return;
    }
    try {
      const picked = await api.kbStorageChooseDir();
      if (!picked.ok || picked.canceled) {
        return;
      }
      const ret = await api.kbStorageSetDir(picked.path);
      if (!ret.ok) {
        setStatus(ret.error || "设置目录失败", true);
        return;
      }
      await refreshState();
      setStatus(`已切换知识库存储目录：${ret.storageRoot}`);
    } catch (err) {
      setStatus(err.message || String(err), true);
    }
  }

  el.useDefaultStorageBtn?.addEventListener("click", async () => {
    if (!window.confirm("确定恢复为默认知识库存储目录？")) {
      return;
    }
    if (typeof api.kbStorageSetDir !== "function") {
      return;
    }
    try {
      const ret = await api.kbStorageSetDir("");
      if (!ret.ok) {
        setStatus(ret.error || "恢复默认目录失败", true);
        return;
      }
      await refreshState();
      setStatus("已恢复默认知识库存储目录。");
    } catch (err) {
      setStatus(err.message || String(err), true);
    }
  });

  el.configOpenDirBtn?.addEventListener("click", async () => {
    if (typeof api.kbOpenLibraryDir !== "function") {
      return;
    }
    const libraryId = String(el.librarySelect?.value || activeLibraryIdCache || "").trim();
    try {
      const out = await api.kbOpenLibraryDir({ libraryId });
      if (!out?.ok) {
        setStatus(out?.error || "打开目录失败", true);
      }
    } catch (err) {
      setStatus(err.message || String(err), true);
    }
  });

  el.trialSearch?.addEventListener("click", () => {
    void runTrialSearch();
  });

  el.graphFullscreenBtn?.addEventListener("click", () => {
    void toggleGraphFullscreen();
  });

  document.addEventListener("fullscreenchange", () => {
    updateGraphFullscreenButton();
    if (!document.fullscreenElement) {
      el.graphStage?.classList.remove("is-graph-fullscreen");
      document.body.classList.remove("kb-graph-fullscreen-open");
    }
    scheduleGraphSimulation(0.1);
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape") {
      return;
    }
    if (el.graphStage?.classList.contains("is-graph-fullscreen")) {
      void toggleGraphFullscreen();
    }
  });

  el.graphRefreshBtn?.addEventListener("click", async () => {
    setStatus("正在重建关系图谱…");
    try {
      await refreshGraphSnapshot(true);
      setStatus("关系图谱已重建。");
    } catch (err) {
      setStatus(err.message || String(err), true);
    }
  });

  el.graphOnlyDocs?.addEventListener("change", async () => {
    try {
      await refreshGraphSnapshot(false);
    } catch (err) {
      setStatus(err.message || String(err), true);
    }
  });

  el.graphGlobalScope?.addEventListener("change", async () => {
    try {
      await refreshGraphSnapshot(false);
    } catch (err) {
      setStatus(err.message || String(err), true);
    }
  });

  el.graphForceEnabled?.addEventListener("change", () => {
    if (el.graphForceEnabled.checked) {
      scheduleGraphSimulation(0.28);
      setStatus("已开启力导向布局。");
    } else {
      stopGraphSimulation();
      setStatus("已关闭力导向布局（保持当前布局）。");
    }
  });

  el.graphResetLayoutBtn?.addEventListener("click", async () => {
    try {
      graphViewState.positions = new Map();
      await refreshGraphSnapshot(true);
      setStatus("已重置为物理布局。");
    } catch (err) {
      setStatus(err.message || String(err), true);
    }
  });

  el.viewAllDocsBtn?.addEventListener("click", () => {
    ingestDocsExpanded = !ingestDocsExpanded;
    rerenderLibraryViews(latestDocGroups, activeLibraryIdCache);
  });

  el.statsOpsLogBtn?.addEventListener("click", () => {
    void openOpsLogDialog("all");
  });

  el.opsLogCloseBtn?.addEventListener("click", closeOpsLogDialog);
  el.opsLogCloseBtn2?.addEventListener("click", closeOpsLogDialog);
  el.searchResultCloseBtn?.addEventListener("click", closeSearchResultDialog);
  el.searchResultCloseBtn2?.addEventListener("click", closeSearchResultDialog);
  el.searchResultOpenDocBtn?.addEventListener("click", () => {
    void openSelectedSearchResultDoc();
  });
  el.searchResultRelocateBtn?.addEventListener("click", () => {
    void openSelectedSearchResultDoc({ forceLocate: true });
  });
  el.searchResultFollowUpBtn?.addEventListener("click", () => {
    const hit = searchResultState.hits?.[searchResultState.selectedIndex];
    followUpKbHit(hit, searchResultState.query);
  });
  sourceLocateUi.pickBtn?.addEventListener("click", async () => {
    if (!sourceLocateSession || typeof api.kbChooseRelocateFile !== "function") {
      return;
    }
    const ctx = sourceLocateSession.context || {};
    const out = await api.kbChooseRelocateFile({
      docName: ctx.docName || "",
      defaultDir: String(ctx.missingPath || "").replace(/[/\\][^/\\]+$/, ""),
    });
    if (out?.canceled) {
      return;
    }
    if (!out?.ok || !out.path) {
      setStatus(out?.error || "未选择文件", true);
      return;
    }
    sourceLocateSession.pickedPath = out.path;
    if (sourceLocateUi.pickedPath) {
      sourceLocateUi.pickedPath.textContent = `已选择：${out.path}`;
    }
    if (sourceLocateUi.confirmPickBtn) {
      sourceLocateUi.confirmPickBtn.disabled = false;
    }
  });
  sourceLocateUi.confirmPickBtn?.addEventListener("click", () => {
    if (!sourceLocateSession?.pickedPath) {
      return;
    }
    closeSourceLocateDialog({ manualPath: sourceLocateSession.pickedPath });
  });
  sourceLocateUi.startScanBtn?.addEventListener("click", async () => {
    const scanDrives = getSelectedSourceLocateDrives();
    if (!scanDrives.length) {
      setStatus("请至少选择一个磁盘。", true);
      return;
    }
    if (!sourceLocateSession?.context?.basePayload) {
      return;
    }
    showSourceLocateScanPanel(true);
    if (sourceLocateUi.cancelBtn) {
      sourceLocateUi.cancelBtn.disabled = true;
    }
    try {
      const out = await openKbDocumentWithPassword(
        {
          ...sourceLocateSession.context.basePayload,
          scanDrives,
          forceFullScan: true,
          allowFullDiskScan: true,
        },
        { progressMode: "locate-dialog" }
      );
      closeSourceLocateDialog({ openResult: out });
    } catch (err) {
      closeSourceLocateDialog({ openResult: { ok: false, error: err?.message || String(err) } });
    } finally {
      if (sourceLocateUi.cancelBtn) {
        sourceLocateUi.cancelBtn.disabled = false;
      }
    }
  });
  sourceLocateUi.cancelBtn?.addEventListener("click", () => {
    closeSourceLocateDialog(null);
  });
  sourceLocateUi.dialog?.addEventListener("cancel", (ev) => {
    ev.preventDefault();
    closeSourceLocateDialog(null);
  });
  el.searchResultCopyBtn?.addEventListener("click", () => {
    void copySearchResultSnippet();
  });
  el.searchResultLocateBtn?.addEventListener("click", () => {
    void locateSearchResultInTree();
  });
  el.opsLogRefreshBtn?.addEventListener("click", () => {
    void loadOpsLogList(opsLogCategory);
  });
  el.opsLogDialog?.addEventListener("click", (ev) => {
    if (ev.target === el.opsLogDialog) {
      closeOpsLogDialog();
    }
  });
  el.opsLogFilters.forEach((btn) => {
    btn.addEventListener("click", () => {
      const cat = String(btn.dataset.kbLogFilter || "all");
      el.opsLogFilters.forEach((b) => b.classList.toggle("is-active", b === btn));
      void loadOpsLogList(cat);
    });
  });

  el.configOpenBtn?.addEventListener("click", () => openConfigDialog());

  el.configCloseBtn?.addEventListener("click", () => closeConfigDialog());

  el.configDialog?.addEventListener("click", (ev) => {
    if (ev.target === el.configDialog) {
      closeConfigDialog();
    }
  });

  el.trialSearchAllLibraries?.addEventListener("change", () => {
    syncTrialLibrarySelectorState();
  });

  el.chooseWatchDirBtn?.addEventListener("click", async () => {
    if (typeof api.kbWatchChooseDir !== "function") {
      return;
    }
    try {
      const out = await api.kbWatchChooseDir();
      if (out.canceled) {
        return;
      }
      if (el.watchDirInput && out.path) {
        el.watchDirInput.value = out.path;
        el.watchDirInput.title = out.path;
      }
      if (el.watchDirEnabled) {
        el.watchDirEnabled.checked = true;
      }
      setStatus(`已选择监控目录：${out.path}`);
    } catch (err) {
      setStatus(err.message || String(err), true);
    }
  });

  el.watchScanNowBtn?.addEventListener("click", async () => {
    if (typeof api.kbWatchScanNow !== "function") {
      setStatus("当前环境不支持立即扫描。", true);
      return;
    }
    const libraryId = String(el.librarySelect?.value || activeLibraryIdCache || "").trim();
    const watchPath = String(el.watchDirInput?.value || "").trim();
    if (!watchPath) {
      setStatus("请先在左侧选择监控目录并保存设置，再执行立即扫描。", true);
      return;
    }
    setOpsButtonBusy(el.watchScanNowBtn, true, "扫描中…");
    setStatus("正在扫描监控目录…");
    try {
      const out = await api.kbWatchScanNow({ libraryId: libraryId || undefined });
      if (!out?.ok) {
        setStatus(out?.error || "扫描失败，请检查监控目录是否存在。", true);
        return;
      }
      const count = Number(out.scanned) || 0;
      if (count === 0) {
        setStatus("扫描完成：目录内未发现可入库的支持格式文件。");
      } else {
        setStatus(`扫描完成，已排队 ${count} 个文件等待入库。`);
      }
      await refreshState();
    } catch (err) {
      setStatus(err?.message || String(err) || "扫描失败", true);
    } finally {
      setOpsButtonBusy(el.watchScanNowBtn, false);
    }
  });

  el.autoLearnQueueRefreshBtn?.addEventListener("click", async () => {
    await refreshAutoLearnQueue(activeLibraryIdCache);
    void openOpsLogDialog("auto-learn");
  });

  if (typeof api.onKbDocumentPasswordRequest === "function") {
    api.onKbDocumentPasswordRequest(async (payload) => {
      if (!payload?.requestId) {
        return;
      }
      const result = await promptKbDocumentPassword(payload);
      try {
        if (result.canceled) {
          if (typeof api.kbCancelDocumentPassword === "function") {
            await api.kbCancelDocumentPassword({ requestId: payload.requestId });
          }
        } else if (typeof api.kbSubmitDocumentPassword === "function") {
          await api.kbSubmitDocumentPassword({
            requestId: payload.requestId,
            password: result.password,
            remember: result.remember,
          });
        }
      } catch (err) {
        setStatus(err.message || String(err), true);
      }
    });
  }

  if (typeof api.onKbIngestProgress === "function") {
    api.onKbIngestProgress((ev) => {
      handleKbIngestProgress(ev);
    });
  }

  if (typeof api.onKbWatchEvent === "function") {
    api.onKbWatchEvent((ev) => {
      if (!ev || ev.phase === "queued") {
        return;
      }
      if (ev.phase === "done") {
        const name = ev.name || (ev.filePath ? ev.filePath.split(/[/\\]/).pop() : "");
        if (ev.skipped) {
          const reason =
            ev.reason === "duplicate-md5"
              ? "重复文档"
              : ev.reason === "unchanged"
                ? "文件未变更"
                : ev.reason === "duplicate-batch"
                  ? "批次内重复"
                  : ev.reason || "重复";
          setStatus(`监控：已跳过 ${name}（${reason}）`);
        } else if (ev.locked) {
          setStatus(`监控：已登记加密文档 ${name}（待解锁）`);
        } else {
          setStatus(`监控：已入库 ${name}`);
        }
        void refreshState();
      } else if (ev.phase === "error") {
        setStatus(`监控入库失败：${ev.error || "未知错误"}`, true);
      } else if (ev.phase === "watching") {
        renderWatchStatus({ enabled: true, watching: true, dir: ev.dir, lastEvent: null }, null);
      }
    });
  }

  window.onKnowledgeBasePanelVisible = function onKnowledgeBasePanelVisible() {
    closeConfigDialog();
    void refreshState();
    if (typeof api.kbWarmEmbedModel === "function") {
      void api.kbWarmEmbedModel({});
    }
  };

  const kbPanel = document.getElementById("panel-knowledge-base");
  if (kbPanel && !kbPanel.hidden) {
    void window.onKnowledgeBasePanelVisible();
  }
})();
