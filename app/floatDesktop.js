(function (global) {
  const DESKTOP_MODES = {
    workspace: {
      title: "工作台",
      hint: "拖拽窗口可重叠排列，点击窗口置顶",
      bodyClass: "jl-float-mode-workspace",
      windows: {
        workbench: {
          panelId: "panel-workbench-hub",
          panelKey: "WorkspaceStatusPanel",
          title: "工作台",
          desc: "模块入口与状态概览",
          icon: "⊞",
          width: 340,
          height: 400,
          minWidth: 300,
          minHeight: 320,
          isLauncher: true,
        },
        new: {
          panelId: "panel-new",
          panelKey: "AddTaskPanel",
          title: "新增事项",
          desc: "登记待处理任务",
          icon: "✏",
          width: 400,
          height: 520,
          minWidth: 340,
          minHeight: 380,
        },
        filter: {
          panelId: "panel-filter",
          panelKey: "TaskFilterPanel",
          title: "查询筛选",
          desc: "按条件筛选任务",
          icon: "⌕",
          width: 380,
          height: 440,
          minWidth: 320,
          minHeight: 340,
        },
        dashboard: {
          panelId: "panel-dashboard",
          panelKey: "DataDashboardPanel",
          title: "数据看板",
          desc: "统计与趋势分析",
          icon: "▤",
          width: 420,
          height: 480,
          minWidth: 340,
          minHeight: 360,
        },
        list: {
          panelId: "panel-list",
          panelKey: "TaskListPanel",
          title: "任务列表",
          desc: "查看全部跟进任务",
          icon: "☰",
          width: 440,
          height: 520,
          minWidth: 360,
          minHeight: 380,
        },
      },
      bootWindows: ["workbench"],
      overlayLayerId: "jlWorkspaceFloatLayer",
      overlayBodyClass: "jl-workspace-float-active",
      overlayRootId: "jlFloatDesktop-workspace",
    },
    knowledge: {
      title: "本地知识库",
      hint: "点击模块打开二级浮动面板",
      bodyClass: "jl-float-mode-knowledge",
      overlayLayerId: "jlKnowledgeFloatLayer",
      overlayBodyClass: "jl-knowledge-float-active",
      overlayRootId: "jlFloatDesktop-knowledge",
      windows: {
        "kb-launcher": {
          panelId: "panel-kb-hub",
          panelKey: "LocalKnowledgeHubPanel",
          title: "本地知识库",
          desc: "模块入口与状态概览",
          icon: "📚",
          width: 450,
          height: 400,
          minWidth: 450,
          minHeight: 400,
          fixedSize: true,
          isLauncher: true,
        },
        "kb-main": {
          panelId: "jlKbLauncher",
          panelKey: "KnowledgeBasePanel",
          title: "知识库",
          desc: "维护个人知识库",
          icon: "📚",
          width: 420,
          height: 480,
          minWidth: 360,
          minHeight: 380,
        },
        "kb-libraries": {
          panelId: "jlKbFloatLibraries",
          panelKey: "DirectoryImportPanel",
          title: "目录与入库",
          desc: "管理知识库目录与文档入库",
          icon: "📁",
          width: 550,
          height: 600,
          minWidth: 420,
          minHeight: 420,
        },
        "kb-graph": {
          panelId: "jlKbFloatGraph",
          panelKey: "KnowledgeGraphPanel",
          title: "知识图谱",
          desc: "可视化知识关系网络",
          icon: "🕸",
          width: 1080,
          height: 680,
          minWidth: 760,
          minHeight: 480,
        },
        "kb-search": {
          panelId: "jlKbFloatSearch",
          panelKey: "SearchTestPanel",
          title: "检索试用",
          desc: "多路召回检索测试",
          icon: "🔍",
          width: 760,
          height: 620,
          minWidth: 520,
          minHeight: 420,
        },
      },
      bootWindows: ["kb-launcher"],
    },
    record: {
      title: "记录助手",
      hint: "左侧切换模块，右侧窗口可拖拽叠放",
      bodyClass: "jl-float-mode-record",
      windows: {
        "record-main": {
          panelId: "jlRecordFloatMain",
          title: "录音",
          desc: "开始录制音频",
          icon: "🎙",
          width: 680,
          height: 720,
          minWidth: 520,
          minHeight: 560,
          isLauncher: true,
        },
        "record-transcript": {
          panelId: "jlRecordFloatTranscript",
          title: "转写",
          desc: "音频转文字",
          icon: "〰",
          width: 560,
          height: 480,
          minWidth: 420,
          minHeight: 340,
        },
        "record-summary": {
          panelId: "jlRecordFloatSummary",
          title: "纪要",
          desc: "智能生成纪要",
          icon: "📄",
          width: 560,
          height: 480,
          minWidth: 420,
          minHeight: 340,
        },
      },
      bootWindows: ["record-main"],
      dockRoutes: ["record-main", "record-transcript", "record-summary"],
    },
  };

  function createModeRuntime() {
    return {
      windows: new Map(),
      rootEl: null,
      dockEl: null,
      overlayVisible: false,
      zCounter: 30,
      pinnedRoutes: new Set(),
      routeHandler: null,
      panelVisibleHandler: null,
    };
  }

  /** @type {Map<string, ReturnType<typeof createModeRuntime>>} */
  const modeRuntimes = new Map();

  function rt(forMode) {
    const key = forMode || mode;
    if (!modeRuntimes.has(key)) {
      modeRuntimes.set(key, createModeRuntime());
    }
    return modeRuntimes.get(key);
  }

  function syncModeRefs(forMode) {
    const r = rt(forMode);
    rootEl = r.rootEl;
    dockEl = r.dockEl;
    overlayVisible = r.overlayVisible;
  }

  let mode = "";
  let overlayMode = false;
  let rootEl = null;
  let dockEl = null;
  let overlayVisible = false;
  let routeHandler = null;
  let panelVisibleHandler = null;

  function winMap(forMode) {
    return rt(forMode || mode).windows;
  }

  function getPinnedRoutes(forMode) {
    return rt(forMode).pinnedRoutes;
  }

  const PINNED_Z = 9000;
  const OVERLAY_LAYER_BASE_Z = 1800;

  function modeConfig() {
    return DESKTOP_MODES[mode] || null;
  }

  function cfg(route) {
    return modeConfig()?.windows?.[route] || null;
  }

  function allRoutes() {
    return Object.keys(modeConfig()?.windows || {});
  }

  function escapeHtml(text) {
    return String(text ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function storageKey(route) {
    return `jl_float_win_${mode}_${route}_v2`;
  }

  function windowSizeLimits(meta, winEl) {
    const { width: cw, height: ch } = canvasBounds();
    const minW = Number(winEl?.dataset?.minWidth) || meta?.minWidth || meta?.width || 320;
    const minH = Number(winEl?.dataset?.minHeight) || meta?.minHeight || meta?.height || 240;
    const maxW = Math.floor(cw * 0.92);
    const maxH = Math.floor(ch * 0.9);
    return { minW, minH, maxW, maxH };
  }

  function normalizeSavedGeometry(saved, meta) {
    if (!saved || typeof saved !== "object") {
      return null;
    }
    const limits = windowSizeLimits(meta);
    let width = Number(saved.width);
    let height = Number(saved.height);
    let left = Number(saved.left);
    let top = Number(saved.top);
    const widthInvalid = !Number.isFinite(width) || width > limits.maxW || width < limits.minW;
    const heightInvalid = !Number.isFinite(height) || height > limits.maxH || height < limits.minH;
    if (widthInvalid || heightInvalid) {
      width = meta.width;
      height = meta.height;
      left = NaN;
      top = NaN;
    }
    return {
      left: Number.isFinite(left) ? left : null,
      top: Number.isFinite(top) ? top : null,
      width: clamp(width, limits.minW, limits.maxW),
      height: clamp(height, limits.minH, limits.maxH),
    };
  }

  function applyWindowGeometry(winEl, meta, savedRaw, index) {
    const saved = normalizeSavedGeometry(savedRaw, meta);
    const limits = windowSizeLimits(meta, winEl);
    const width = saved?.width || meta.width;
    const height = saved?.height || meta.height;
    const pos =
      saved?.left != null && saved?.top != null
        ? (() => {
            const { width: cw, height: ch } = canvasBounds();
            return {
              x: clamp(saved.left, 8, Math.max(8, cw - width - 8)),
              y: clamp(saved.top, 8, Math.max(8, ch - height - 8)),
            };
          })()
        : defaultPosition(index, width, height);
    winEl.style.width = `${clamp(width, limits.minW, limits.maxW)}px`;
    winEl.style.height = `${clamp(height, limits.minH, limits.maxH)}px`;
    winEl.style.left = `${pos.x}px`;
    winEl.style.top = `${pos.y}px`;
  }

  function ensureReasonableWindowSize(entry, meta) {
    if (!entry?.el || !meta) {
      return;
    }
    const limits = windowSizeLimits(meta, entry.el);
    const tooWide = entry.el.offsetWidth > limits.maxW;
    const tooTall = entry.el.offsetHeight > limits.maxH;
    if (!tooWide && !tooTall) {
      return;
    }
    applyWindowGeometry(entry.el, meta, null, winMap().size);
  }

  function geometryStore() {
    try {
      return global.localStorage;
    } catch {
      return null;
    }
  }

  function readSavedGeometry(route) {
    const store = geometryStore();
    if (!store) {
      return null;
    }
    try {
      const key = storageKey(route);
      let raw = store.getItem(key);
      if (!raw) {
        raw = sessionStorage.getItem(key);
        if (raw) {
          store.setItem(key, raw);
          sessionStorage.removeItem(key);
        }
      }
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveGeometry(route, winEl) {
    const store = geometryStore();
    const meta = cfg(route);
    if (!store || !winEl) {
      return;
    }
    try {
      const limits = windowSizeLimits(meta, winEl);
      const width = clamp(winEl.offsetWidth, limits.minW, limits.maxW);
      const height = clamp(winEl.offsetHeight, limits.minH, limits.maxH);
      if (width !== winEl.offsetWidth) {
        winEl.style.width = `${width}px`;
      }
      if (height !== winEl.offsetHeight) {
        winEl.style.height = `${height}px`;
      }
      store.setItem(
        storageKey(route),
        JSON.stringify({
          left: winEl.offsetLeft,
          top: winEl.offsetTop,
          width,
          height,
        })
      );
    } catch {
      /* ignore */
    }
  }

  function flushAllGeometry() {
    modeRuntimes.forEach((runtime, modeKey) => {
      const prev = mode;
      mode = modeKey;
      runtime.windows.forEach((entry, route) => {
        if (isWindowOpen(entry)) {
          saveGeometry(route, entry.el);
        }
      });
      mode = prev;
      syncModeRefs(mode);
    });
  }

  let geometryFlushBound = false;

  function ensureGeometryFlushOnExit() {
    if (geometryFlushBound) {
      return;
    }
    geometryFlushBound = true;
    global.addEventListener("beforeunload", flushAllGeometry);
    global.addEventListener("pagehide", flushAllGeometry);
  }

  function syncOverlayLayerZIndex(modeKey, bump) {
    const conf = DESKTOP_MODES[modeKey];
    const layerId = conf?.overlayLayerId;
    if (!layerId) {
      return;
    }
    const layer = document.getElementById(layerId);
    if (!layer) {
      return;
    }
    const pins = getPinnedRoutes(modeKey);
    if (pins.size > 0) {
      if (typeof global.__jlFloatLayerTopZ !== "number") {
        global.__jlFloatLayerTopZ = 9100;
      }
      if (bump) {
        global.__jlFloatLayerTopZ += 1;
      }
      layer.style.zIndex = String(global.__jlFloatLayerTopZ);
      return;
    }
    layer.style.zIndex = String(OVERLAY_LAYER_BASE_Z);
  }

  function bringToFront(winEl, route) {
    const pins = getPinnedRoutes();
    const isPinned = route && pins.has(route);
    if (isPinned) {
      winEl.style.zIndex = String(PINNED_Z);
      syncOverlayLayerZIndex(mode, true);
    } else {
      const runtime = rt();
      runtime.zCounter += 1;
      winEl.style.zIndex = String(runtime.zCounter);
    }
    winEl.classList.add("is-focused");
    winEl.classList.toggle("is-pinned", !!isPinned);
    rootEl?.querySelectorAll(".jl-float-win").forEach((node) => {
      if (node !== winEl) {
        node.classList.remove("is-focused");
      }
    });
  }

  function togglePin(route) {
    const entry = winMap().get(route);
    if (!entry) {
      return;
    }
    const pins = getPinnedRoutes();
    if (pins.has(route)) {
      pins.delete(route);
    } else {
      pins.add(route);
    }
    const pinned = pins.has(route);
    entry.el.classList.toggle("is-pinned", pinned);
    const pinBtn = entry.el.querySelector('[data-action="pin"]');
    pinBtn?.classList.toggle("is-active", pinned);
    pinBtn?.setAttribute("aria-pressed", pinned ? "true" : "false");
    syncOverlayLayerZIndex(mode, true);
    bringToFront(entry.el, route);
  }

  function notifyPanelVisible(route) {
    if (typeof panelVisibleHandler === "function") {
      panelVisibleHandler(route);
    }
    if (typeof routeHandler === "function") {
      routeHandler(routeToAppRoute(route));
    }
    if (route === "list" && typeof global.onTaskListPanelVisible === "function") {
      void global.onTaskListPanelVisible();
    }
    if (route === "dashboard" && typeof global.renderDashboard === "function") {
      global.renderDashboard();
    }
    if (route === "workbench" && typeof global.refreshWorkbenchHubStatus === "function") {
      global.refreshWorkbenchHubStatus();
    }
    if ((route === "kb-main" || route === "kb-launcher") && typeof global.onKnowledgeBasePanelVisible === "function") {
      void global.onKnowledgeBasePanelVisible();
    }
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function canvasBounds() {
    if (overlayMode) {
      return {
        width: window.innerWidth || document.documentElement.clientWidth || 960,
        height: window.innerHeight || document.documentElement.clientHeight || 640,
      };
    }
    const rect = rootEl?.getBoundingClientRect();
    return {
      width: rect?.width || 960,
      height: rect?.height || 640,
    };
  }

  function defaultPosition(index, width, height) {
    const { width: cw, height: ch } = canvasBounds();
    if (overlayMode && mode === "knowledge" && index > 0) {
      const launcher = winMap().get("kb-launcher");
      if (launcher && isWindowOpen(launcher)) {
        const offsetX = launcher.el.offsetLeft + launcher.el.offsetWidth + 16;
        const offsetY = launcher.el.offsetTop + (index - 1) * 28;
        return {
          x: clamp(offsetX, 8, Math.max(8, cw - width - 8)),
          y: clamp(offsetY, 8, Math.max(8, ch - height - 8)),
        };
      }
    }
    const dockW = !overlayMode && dockEl && !dockEl.hidden ? dockEl.offsetWidth + 20 : 0;
    const baseX = dockW + 24 + (index % 4) * 36;
    const baseY = 24 + (index % 5) * 32;
    return {
      x: clamp(baseX, 8, Math.max(8, cw - width - 8)),
      y: clamp(baseY, 8, Math.max(8, ch - height - 8)),
    };
  }

  function attachDrag(winEl, handleEl, route) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let originTop = 0;

    handleEl.addEventListener("pointerdown", (event) => {
      if (event.target.closest(".jl-float-win__btn")) {
        return;
      }
      dragging = true;
      bringToFront(winEl, route);
      startX = event.clientX;
      startY = event.clientY;
      originLeft = winEl.offsetLeft;
      originTop = winEl.offsetTop;
      handleEl.setPointerCapture(event.pointerId);
      winEl.classList.add("is-dragging");
      event.preventDefault();
    });

    handleEl.addEventListener("pointermove", (event) => {
      if (!dragging || !rootEl) {
        return;
      }
      const { width: cw, height: ch } = canvasBounds();
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      winEl.style.left = `${clamp(originLeft + dx, 0, Math.max(0, cw - winEl.offsetWidth))}px`;
      winEl.style.top = `${clamp(originTop + dy, 0, Math.max(0, ch - winEl.offsetHeight))}px`;
    });

    const endDrag = (event) => {
      if (!dragging) {
        return;
      }
      dragging = false;
      winEl.classList.remove("is-dragging");
      saveGeometry(route, winEl);
      try {
        if (handleEl.hasPointerCapture?.(event.pointerId)) {
          handleEl.releasePointerCapture(event.pointerId);
        }
      } catch {
        /* ignore */
      }
    };

    handleEl.addEventListener("pointerup", endDrag);
    handleEl.addEventListener("pointercancel", endDrag);
  }

  function attachResize(winEl, gripEl, route) {
    let resizing = false;
    let startX = 0;
    let startY = 0;
    let startW = 0;
    let startH = 0;
    const minW = Number(winEl.dataset.minWidth) || 320;
    const minH = Number(winEl.dataset.minHeight) || 240;

    gripEl.addEventListener("pointerdown", (event) => {
      resizing = true;
      bringToFront(winEl, route);
      startX = event.clientX;
      startY = event.clientY;
      startW = winEl.offsetWidth;
      startH = winEl.offsetHeight;
      gripEl.setPointerCapture(event.pointerId);
      winEl.classList.add("is-resizing");
      event.preventDefault();
      event.stopPropagation();
    });

    gripEl.addEventListener("pointermove", (event) => {
      if (!resizing || !rootEl) {
        return;
      }
      const { width: cw, height: ch } = canvasBounds();
      const maxW = winEl.classList.contains("jl-float-win--fixed-size")
        ? minW
        : cw - winEl.offsetLeft - 8;
      const maxH = winEl.classList.contains("jl-float-win--fixed-size")
        ? minH
        : ch - winEl.offsetTop - 8;
      winEl.style.width = `${clamp(startW + (event.clientX - startX), minW, maxW)}px`;
      winEl.style.height = `${clamp(startH + (event.clientY - startY), minH, maxH)}px`;
    });

    const endResize = (event) => {
      if (!resizing) {
        return;
      }
      resizing = false;
      winEl.classList.remove("is-resizing");
      saveGeometry(route, winEl);
      try {
        gripEl.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    };

    gripEl.addEventListener("pointerup", endResize);
    gripEl.addEventListener("pointercancel", endResize);
  }

  function createWindowElement(route, meta) {
    const saved = readSavedGeometry(route);
    const index = winMap().size;
    const winEl = document.createElement("div");
    winEl.className = "jl-float-win";
    winEl.dataset.route = route;
    if (meta.panelKey) {
      winEl.dataset.panelKey = meta.panelKey;
    }
    const useFixedSize = !!meta.fixedSize;
    winEl.dataset.minWidth = String(meta.minWidth || meta.width || 320);
    winEl.dataset.minHeight = String(meta.minHeight || meta.height || 240);
    applyWindowGeometry(winEl, meta, useFixedSize ? null : saved, index);
    if (useFixedSize) {
      winEl.style.width = `${meta.width}px`;
      winEl.style.height = `${meta.height}px`;
      winEl.classList.add("jl-float-win--fixed-size");
      winEl.dataset.maxWidth = String(meta.width);
      winEl.dataset.maxHeight = String(meta.height);
    }

    winEl.innerHTML = `
      <header class="jl-float-win__header">
        <span class="jl-float-win__icon" aria-hidden="true">${escapeHtml(meta.icon || "◻")}</span>
        <span class="jl-float-win__title">${escapeHtml(meta.title)}</span>
        <div class="jl-float-win__actions jl-float-win__traffic" aria-label="窗口控制">
          <button type="button" class="jl-float-win__btn jl-float-win__btn--pin" data-action="pin" title="置顶" aria-label="置顶" aria-pressed="false">
            <svg class="jl-float-win__btn-star" width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 3.5l2.18 4.42 4.87.71-3.52 3.43.83 4.85L12 14.77l-4.36 2.29.83-4.85-3.52-3.43 4.87-.71L12 3.5z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
            </svg>
          </button>
          <button type="button" class="jl-float-win__btn jl-float-win__btn--minimize" data-action="minimize" title="最小化" aria-label="最小化"></button>
          <button type="button" class="jl-float-win__btn jl-float-win__btn--close" data-action="close" title="关闭" aria-label="关闭"></button>
        </div>
      </header>
      <div class="jl-float-win__body"></div>
      <div class="jl-float-win__resize" aria-hidden="true"></div>
    `;

    const header = winEl.querySelector(".jl-float-win__header");
    const body = winEl.querySelector(".jl-float-win__body");
    const resize = winEl.querySelector(".jl-float-win__resize");

    winEl.addEventListener("pointerdown", () => bringToFront(winEl, route));
    attachDrag(winEl, header, route);
    attachResize(winEl, resize, route);

    const bindCtrl = (selector, handler) => {
      const btn = header.querySelector(selector);
      if (!btn) {
        return;
      }
      btn.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        releaseWindowInteraction({ el: winEl });
        handler(event);
      });
    };

    bindCtrl('[data-action="pin"]', () => togglePin(route));
    bindCtrl('[data-action="minimize"]', () => toggleMinimize(route));
    bindCtrl('[data-action="close"]', () => {
      requestAnimationFrame(() => closeWindow(route));
    });

    rootEl.appendChild(winEl);
    return { el: winEl, body };
  }

  /** @type {HTMLElement | null} */
  let panelStashEl = null;

  function ensurePanelStash() {
    if (!panelStashEl) {
      panelStashEl = document.createElement("div");
      panelStashEl.id = "jlFloatPanelStash";
      panelStashEl.hidden = true;
      panelStashEl.setAttribute("aria-hidden", "true");
      document.body.appendChild(panelStashEl);
    }
    return panelStashEl;
  }

  function releaseWindowInteraction(entry) {
    if (!entry?.el) {
      return;
    }
    entry.el.classList.remove("is-dragging", "is-resizing");
  }

  function isWindowOpen(entry) {
    return !!entry?.el && !entry.el.hidden && !entry.el.classList.contains("is-closed") && !entry.minimized;
  }

  function countVisibleWindows() {
    let count = 0;
    winMap().forEach((entry) => {
      if (isWindowOpen(entry)) {
        count += 1;
      }
    });
    return count;
  }

  function maybeHideOverlay() {
    if (!overlayMode || countVisibleWindows() > 0) {
      return;
    }
    if (mode === "workspace") {
      global.WorkspaceFloatPanel?.hide?.();
    } else if (mode === "knowledge") {
      global.KnowledgeFloatPanel?.hide?.();
    }
  }

  function closeAllOverlayWindows(modeKey) {
    const saved = mode;
    mode = modeKey;
    syncModeRefs(modeKey);
    winMap(modeKey).forEach((entry, route) => {
      if (!entry?.el || entry.el.classList.contains("is-closed") || entry.el.hidden) {
        return;
      }
      releaseWindowInteraction(entry);
      setFloatWindowVisible(entry, false);
      stashPanel(route);
    });
    mode = saved;
    syncModeRefs(mode);
  }

  function syncKnowledgeNavActive(on) {
    document.getElementById("jlWorkbenchNav")?.querySelectorAll('[data-wb-module="knowledge-base"]').forEach((btn) => {
      btn.classList.toggle("is-active", !!on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    document.querySelector('.jl-side-rail__btn[data-jl-space="kb"]')?.classList.toggle("is-active", !!on);
  }

  function setFloatWindowVisible(entry, visible) {
    if (!entry?.el) {
      return;
    }
    if (visible) {
      entry.el.hidden = false;
      entry.el.removeAttribute("hidden");
      entry.el.setAttribute("aria-hidden", "false");
      entry.el.classList.remove("is-closed");
    } else {
      entry.el.hidden = true;
      entry.el.setAttribute("hidden", "");
      entry.el.setAttribute("aria-hidden", "true");
      entry.el.classList.add("is-closed");
    }
  }

  function stashPanel(route) {
    const meta = cfg(route);
    if (!meta) {
      return;
    }
    const panel = document.getElementById(meta.panelId);
    if (!panel) {
      return;
    }
    const stash = ensurePanelStash();
    if (panel.parentElement !== stash) {
      stash.appendChild(panel);
    }
    panel.hidden = true;
    panel.classList.remove("jl-float-panel-host");
  }

  function mountPanel(route, bodyEl) {
    const meta = cfg(route);
    if (!meta) {
      return null;
    }
    const panel = document.getElementById(meta.panelId);
    if (!panel) {
      return null;
    }
    panel.hidden = false;
    panel.classList.add("jl-float-panel-host");
    if (panel.parentElement !== bodyEl) {
      bodyEl.appendChild(panel);
    }
    return panel;
  }

  function focusOrOpen(route, options = {}) {
    const entry = winMap().get(route);
    if (entry && isWindowOpen(entry)) {
      bringToFront(entry.el, route);
      syncDockActive(route);
      notifyPanelVisible(route);
      return true;
    }
    return openWindow(route, options);
  }

  function openWindow(route, options = {}) {
    const meta = cfg(route);
    if (!meta || !rootEl) {
      return false;
    }

    let entry = winMap().get(route);
    if (!entry) {
      const created = createWindowElement(route, meta);
      entry = { el: created.el, body: created.body, minimized: false, route };
      winMap().set(route, entry);
    }
    mountPanel(route, entry.body);

    if (meta.fixedSize) {
      entry.el.style.width = `${meta.width}px`;
      entry.el.style.height = `${meta.height}px`;
    } else {
      ensureReasonableWindowSize(entry, meta);
    }

    setFloatWindowVisible(entry, true);
    entry.minimized = false;
    entry.el.classList.remove("is-minimized");
    if (options.focus !== false) {
      bringToFront(entry.el, route);
      entry.el.classList.add("jl-float-win--enter");
      window.setTimeout(() => entry.el.classList.remove("jl-float-win--enter"), 320);
    }
    syncDockActive(route);
    notifyPanelVisible(route);
    return true;
  }

  function closeWindow(route) {
    const entry = winMap().get(route);
    if (!entry || entry.el.classList.contains("is-closed") || entry.el.hidden) {
      return;
    }
    const meta = cfg(route);
    releaseWindowInteraction(entry);
    saveGeometry(route, entry.el);

    if (meta?.isLauncher) {
      if (overlayMode) {
        closeAllOverlayWindows(mode);
        setFloatWindowVisible(entry, false);
        entry.minimized = false;
        entry.el.classList.remove("is-minimized");
        stashPanel(route);
        if (mode === "workspace") {
          global.WorkspaceFloatPanel?.hide?.();
          syncNavActiveOverlay(false);
        } else if (mode === "knowledge") {
          global.KnowledgeFloatPanel?.hide?.();
          syncKnowledgeNavActive(false);
        }
        return;
      }
      entry.el.classList.add("is-minimized");
      entry.minimized = true;
      return;
    }

    setFloatWindowVisible(entry, false);
    entry.minimized = false;
    entry.el.classList.remove("is-minimized");
    stashPanel(route);
    syncDockActive("");
    maybeHideOverlay();
  }

  function syncNavActiveOverlay(on) {
    document.querySelector('.jl-side-rail__btn[data-jl-space="workbench"]')?.classList.toggle("is-active", !!on);
  }

  function toggleMinimize(route) {
    const entry = winMap().get(route);
    if (!entry) {
      return;
    }
    entry.minimized = !entry.minimized;
    entry.el.classList.toggle("is-minimized", entry.minimized);
    if (!entry.minimized) {
      bringToFront(entry.el, route);
    }
  }

  function syncDockActive(route) {
    if (!dockEl) {
      return;
    }
    dockEl.querySelectorAll("[data-float-route]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.floatRoute === route);
    });
  }

  function buildDock() {
    if (dockEl) {
      return;
    }
    const conf = modeConfig();
    dockEl = document.createElement("aside");
    dockEl.className = "jl-float-dock";
    dockEl.setAttribute("aria-label", `${conf?.title || "模块"}桌面`);

    dockEl.innerHTML = `
      <header class="jl-float-dock__head">
        <h2 class="jl-float-dock__title">${escapeHtml(conf?.title || "")}</h2>
        <p class="jl-float-dock__hint">${escapeHtml(conf?.hint || "")}</p>
      </header>
      <div class="jl-float-dock__list"></div>
    `;

    const list = dockEl.querySelector(".jl-float-dock__list");
    const dockRoutes = modeConfig()?.dockRoutes || allRoutes().filter((r) => !cfg(r)?.isLauncher);
    const routesForDock = [...new Set([...(modeConfig()?.bootWindows || []).filter((r) => cfg(r)), ...dockRoutes])];
    routesForDock.forEach((route) => {
      const meta = cfg(route);
      if (!meta) {
        return;
      }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "jl-float-dock__item" + (meta.isLauncher ? " jl-float-dock__item--home" : "");
      btn.dataset.floatRoute = route;
      btn.innerHTML = `
        <span class="jl-float-dock__item-icon" aria-hidden="true">${escapeHtml(meta.icon || "◻")}</span>
        <span class="jl-float-dock__item-text">
          <span class="jl-float-dock__item-label">${escapeHtml(meta.title)}</span>
          ${meta.desc ? `<span class="jl-float-dock__item-desc">${escapeHtml(meta.desc)}</span>` : ""}
        </span>
      `;
      btn.addEventListener("click", () => {
        focusOrOpen(route);
        if (typeof routeHandler === "function") {
          routeHandler(routeToAppRoute(route));
        }
      });
      list.appendChild(btn);
    });

    if (mode === "record") {
      const recentBtn = document.createElement("button");
      recentBtn.type = "button";
      recentBtn.className = "jl-float-dock__item";
      recentBtn.dataset.floatRoute = "record-recent";
      recentBtn.innerHTML = `
        <span class="jl-float-dock__item-icon" aria-hidden="true">🕐</span>
        <span class="jl-float-dock__item-text">
          <span class="jl-float-dock__item-label">最近记录</span>
          <span class="jl-float-dock__item-desc">查看历史记录</span>
        </span>
      `;
      recentBtn.addEventListener("click", () => {
        focusOrOpen("record-main");
        syncDockActive("record-recent");
        const recentPanel = document.querySelector(".record-glass-panel--recent");
        recentPanel?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        if (typeof routeHandler === "function") {
          routeHandler("record");
        }
      });
      list.appendChild(recentBtn);
    }

    rootEl.parentElement?.insertBefore(dockEl, rootEl);
  }

  function routeToAppRoute(route) {
    if (mode === "workspace") {
      return route;
    }
    if (mode === "knowledge") {
      return "knowledge-base";
    }
    if (mode === "record") {
      return "record";
    }
    return route;
  }

  function bindHubTiles() {
    document.querySelectorAll("[data-wb-hub-route]").forEach((btn) => {
      if (btn.dataset.jlFloatHubBound === "1") {
        return;
      }
      btn.dataset.jlFloatHubBound = "1";
      btn.addEventListener("click", (event) => {
        if (mode !== "workspace" || (!overlayMode && !isActive())) {
          return;
        }
        const route = btn.dataset.wbHubRoute;
        if (!route) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        openWindow(route);
      });
    });
  }

  function bindKbHubTiles() {
    document.querySelectorAll("[data-kb-hub-route]").forEach((btn) => {
      if (btn.dataset.jlKbHubBound === "1") {
        return;
      }
      btn.dataset.jlKbHubBound = "1";
      btn.addEventListener("click", (event) => {
        if (mode !== "knowledge" || (!overlayMode && !isActive())) {
          return;
        }
        const route = btn.dataset.kbHubRoute;
        if (!route) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        openWindow(route);
      });
    });
  }

  function bindKbLauncher() {
    document.querySelectorAll("[data-kb-open]").forEach((btn) => {
      if (btn.dataset.jlKbOpenBound === "1") {
        return;
      }
      btn.dataset.jlKbOpenBound = "1";
      btn.addEventListener("click", (event) => {
        if (mode !== "knowledge") {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        const target = btn.dataset.kbOpen;
        if (target) {
          focusOrOpen(target);
        }
      });
    });
  }

  function handleRoute(route, options = {}) {
    if (!isActive()) {
      return false;
    }

    if (mode === "knowledge") {
      if (route === "knowledge-base") {
        const boots = modeConfig()?.bootWindows || ["kb-launcher"];
        boots.forEach((key, idx) => openWindow(key, { focus: idx === 0 }));
        if (typeof panelVisibleHandler === "function") {
          void panelVisibleHandler();
        }
        return true;
      }
      return false;
    }

    if (mode === "record") {
      if (route === "record") {
        const boots = modeConfig()?.bootWindows || ["record-main"];
        boots.forEach((key, idx) => openWindow(key, { focus: idx === 0 }));
        return true;
      }
      const recordKey =
        route === "record-capture" || route === "record-recent"
          ? "record-main"
          : route.startsWith("record-")
            ? route
            : null;
      if (recordKey && cfg(recordKey)) {
        focusOrOpen(recordKey);
        return true;
      }
      return false;
    }

    if (!cfg(route)) {
      return false;
    }

    if (route === "workbench") {
      openWindow("workbench");
    } else {
      openWindow(route);
    }

    if (route === "list" && typeof options.onList === "function") {
      options.onList();
    }
    if (route === "dashboard" && typeof options.onDashboard === "function") {
      options.onDashboard();
    }
    return true;
  }

  function hideLegacyChrome() {
    if (overlayMode) {
      const bodyClass = modeConfig()?.overlayBodyClass;
      if (bodyClass) {
        document.body.classList.add(bodyClass);
      }
      return;
    }
    document.body.classList.add("jl-float-desktop-active");
    const conf = modeConfig();
    if (conf?.bodyClass) {
      document.body.classList.add(conf.bodyClass);
    }
    ["jl-record-assistant-active"].forEach((cls) => document.body.classList.remove(cls));

    const topbar = document.querySelector(".topbar");
    const breadcrumb = document.getElementById("breadcrumb");
    const workbenchNav = document.getElementById("jlWorkbenchNav");
    const tabsStrip = document.getElementById("tabsStrip");
    const topStatus = document.getElementById("jlTopStatus");
    if (topStatus) {
      topStatus.hidden = true;
      topStatus.setAttribute("aria-hidden", "true");
    }
    if (topbar) {
      topbar.hidden = true;
    }
    if (breadcrumb) {
      breadcrumb.hidden = true;
    }
    if (workbenchNav) {
      workbenchNav.hidden = true;
    }
    if (tabsStrip) {
      tabsStrip.hidden = true;
    }
  }

  function ensureRoot(forMode) {
    const m = forMode || mode;
    const conf = DESKTOP_MODES[m];
    if (overlayMode) {
      const layerId = conf?.overlayLayerId || "jlWorkspaceFloatLayer";
      const layerClass =
        layerId === "jlKnowledgeFloatLayer" ? "jl-knowledge-float-layer" : "jl-workspace-float-layer";
      let layer = document.getElementById(layerId);
      if (!layer) {
        layer = document.createElement("div");
        layer.id = layerId;
        layer.className = layerClass;
        layer.hidden = true;
        layer.setAttribute("aria-hidden", "true");
        document.querySelector(".app-shell")?.appendChild(layer);
      }
      const rootId = conf?.overlayRootId || `jlFloatDesktop-${m}`;
      let root = layer.querySelector(`#${rootId}`);
      if (!root) {
        root = document.createElement("div");
        root.id = rootId;
        root.className = "jl-float-desktop jl-float-desktop--overlay";
        layer.appendChild(root);
      }
      root.hidden = false;
      root.removeAttribute("aria-hidden");
      rt(m).rootEl = root;
      if (m === mode) {
        rootEl = root;
      }
      return root;
    }

    let root = document.getElementById("jlFloatDesktop");
    if (!root) {
      root = document.createElement("div");
      root.id = "jlFloatDesktop";
      root.className = "jl-float-desktop";
      const canvas = document.getElementById("jlWorkspaceCanvas") || document.getElementById("jlWorkbenchStage");
      canvas?.appendChild(root);
    }
    root.hidden = false;
    root.removeAttribute("aria-hidden");
    rt(m).rootEl = root;
    rootEl = root;
    return root;
  }

  function setOverlayVisible(next, modeKey) {
    const m = modeKey || mode;
    const runtime = rt(m);
    runtime.overlayVisible = !!next;
    if (m === mode) {
      overlayVisible = runtime.overlayVisible;
    }
    const conf = DESKTOP_MODES[m];
    const layer = document.getElementById(conf?.overlayLayerId || "jlWorkspaceFloatLayer");
    if (layer) {
      layer.hidden = !next;
      layer.setAttribute("aria-hidden", next ? "false" : "true");
    }
    if (runtime.rootEl) {
      runtime.rootEl.hidden = !next;
    }
    const bodyClass = conf?.overlayBodyClass;
    if (bodyClass) {
      document.body.classList.toggle(bodyClass, !!next);
    }
    if (next) {
      syncOverlayLayerZIndex(m, false);
    }
  }

  function activateOverlayMode(modeKey) {
    mode = modeKey;
    overlayMode = true;
    syncModeRefs(modeKey);
    routeHandler = rt(modeKey).routeHandler || routeHandler;
    panelVisibleHandler = rt(modeKey).panelVisibleHandler || panelVisibleHandler;
    if (!rt(modeKey).rootEl) {
      ensureRoot(modeKey);
    } else {
      rootEl = rt(modeKey).rootEl;
    }
  }

  function isOverlayActive(modeKey) {
    const m = modeKey || mode;
    return !!rt(m).overlayVisible && !!rt(m).rootEl;
  }

  function bootDefaultWindows() {
    const boots = modeConfig()?.bootWindows || [];
    boots.forEach((key, idx) => {
      openWindow(key, { focus: idx === 0 });
    });
  }

  function init(nextMode, options = {}) {
    if (!DESKTOP_MODES[nextMode]) {
      return;
    }
    overlayMode = false;
    mode = nextMode;
    routeHandler = options.onRoute || null;
    panelVisibleHandler = options.onPanelVisible || null;
    rt(nextMode).routeHandler = routeHandler;
    rt(nextMode).panelVisibleHandler = panelVisibleHandler;
    ensureRoot(nextMode);
    ensureGeometryFlushOnExit();
    buildDock();
    hideLegacyChrome();
    bindHubTiles();
    bindKbHubTiles();
    bindKbLauncher();
    bootDefaultWindows();

    if (mode === "knowledge" && typeof panelVisibleHandler === "function") {
      void panelVisibleHandler();
    }
  }

  function initOverlay(nextMode, options = {}) {
    if (!DESKTOP_MODES[nextMode]) {
      return;
    }
    const savedMode = mode;
    mode = nextMode;
    overlayMode = true;
    if (options.onRoute) {
      rt(nextMode).routeHandler = options.onRoute;
    }
    if (options.onPanelVisible) {
      rt(nextMode).panelVisibleHandler = options.onPanelVisible;
    }
    routeHandler = rt(nextMode).routeHandler;
    panelVisibleHandler = rt(nextMode).panelVisibleHandler;
    ensureRoot(nextMode);
    ensureGeometryFlushOnExit();
    hideLegacyChrome();
    bindHubTiles();
    bindKbHubTiles();
    bindKbLauncher();
    if (!winMap(nextMode).size) {
      bootDefaultWindows();
    }
    setOverlayVisible(false, nextMode);
    mode = savedMode;
    syncModeRefs(savedMode || nextMode);
  }

  function isOverlayMode() {
    return overlayMode;
  }

  function isActive(modeKey) {
    const m = modeKey || mode;
    const runtime = rt(m);
    if (!DESKTOP_MODES[m]) {
      return false;
    }
    if (runtime.overlayVisible) {
      return !!runtime.rootEl;
    }
    return !!runtime.rootEl && !runtime.rootEl.hidden;
  }

  function getMode() {
    return mode;
  }

  global.FloatDesktop = {
    init,
    initOverlay,
    activateOverlayMode,
    isActive,
    isOverlayActive,
    isOverlayMode,
    getMode,
    handleRoute,
    openWindow,
    focusOrOpen,
    closeWindow,
    bringToFront,
    setOverlayVisible,
    togglePin,
  };
})(typeof window !== "undefined" ? window : globalThis);
