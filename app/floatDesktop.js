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
    },
    knowledge: {
      title: "本地知识库",
      hint: "各功能独立浮窗，可自由拖拽与叠放",
      bodyClass: "jl-float-mode-knowledge",
      windows: {
        "kb-launcher": {
          panelId: "jlKbLauncher",
          title: "知识库",
          desc: "模块入口与概览",
          icon: "📚",
          width: 480,
          height: 420,
          minWidth: 380,
          minHeight: 320,
          isLauncher: true,
        },
        "kb-libraries": {
          panelId: "jlKbFloatLibraries",
          title: "目录与入库",
          desc: "管理知识库目录",
          icon: "📁",
          width: 440,
          height: 680,
          minWidth: 360,
          minHeight: 420,
        },
        "kb-graph": {
          panelId: "jlKbFloatGraph",
          title: "知识图谱",
          desc: "可视化关系网络",
          icon: "🕸",
          width: 760,
          height: 560,
          minWidth: 520,
          minHeight: 400,
        },
        "kb-search": {
          panelId: "jlKbFloatSearch",
          title: "检索试用",
          desc: "多路召回检索调试",
          icon: "🔍",
          width: 760,
          height: 620,
          minWidth: 520,
          minHeight: 420,
        },
      },
      bootWindows: ["kb-launcher", "kb-libraries", "kb-graph", "kb-search"],
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

  let mode = "";
  let overlayMode = false;
  let overlayVisible = false;
  let rootEl = null;
  let dockEl = null;
  let zCounter = 30;
  const PINNED_Z = 9000;
  const WORKSPACE_LAYER_BASE_Z = 1800;
  /** @type {Set<string>} */
  const pinnedRoutes = new Set();
  /** @type {Map<string, { el: HTMLElement, body: HTMLElement, route: string, minimized: boolean }>} */
  const windows = new Map();
  let routeHandler = null;
  let panelVisibleHandler = null;

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
    return `jl_float_win_${mode}_${route}`;
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
    if (!store || !winEl) {
      return;
    }
    try {
      store.setItem(
        storageKey(route),
        JSON.stringify({
          left: winEl.offsetLeft,
          top: winEl.offsetTop,
          width: winEl.offsetWidth,
          height: winEl.offsetHeight,
        })
      );
    } catch {
      /* ignore */
    }
  }

  function flushAllGeometry() {
    windows.forEach((entry, route) => {
      if (entry?.el && !entry.el.hidden) {
        saveGeometry(route, entry.el);
      }
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

  function syncWorkspaceLayerZIndex(bump) {
    const layer = document.getElementById("jlWorkspaceFloatLayer");
    if (!layer) {
      return;
    }
    if (pinnedRoutes.size > 0) {
      if (typeof global.__jlFloatLayerTopZ !== "number") {
        global.__jlFloatLayerTopZ = 9100;
      }
      if (bump) {
        global.__jlFloatLayerTopZ += 1;
      }
      layer.style.zIndex = String(global.__jlFloatLayerTopZ);
      return;
    }
    layer.style.zIndex = String(WORKSPACE_LAYER_BASE_Z);
  }

  function bringToFront(winEl, route) {
    const isPinned = route && pinnedRoutes.has(route);
    if (isPinned) {
      winEl.style.zIndex = String(PINNED_Z);
      syncWorkspaceLayerZIndex(true);
    } else {
      zCounter += 1;
      winEl.style.zIndex = String(zCounter);
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
    const entry = windows.get(route);
    if (!entry) {
      return;
    }
    if (pinnedRoutes.has(route)) {
      pinnedRoutes.delete(route);
    } else {
      pinnedRoutes.add(route);
    }
    const pinned = pinnedRoutes.has(route);
    entry.el.classList.toggle("is-pinned", pinned);
    const pinBtn = entry.el.querySelector('[data-action="pin"]');
    pinBtn?.classList.toggle("is-active", pinned);
    pinBtn?.setAttribute("aria-pressed", pinned ? "true" : "false");
    syncWorkspaceLayerZIndex(true);
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
      const maxW = cw - winEl.offsetLeft - 8;
      const maxH = ch - winEl.offsetTop - 8;
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
    const index = windows.size;
    const pos = saved
      ? { x: saved.left, y: saved.top }
      : defaultPosition(index, meta.width, meta.height);
    const winEl = document.createElement("div");
    winEl.className = "jl-float-win";
    winEl.dataset.route = route;
    if (meta.panelKey) {
      winEl.dataset.panelKey = meta.panelKey;
    }
    winEl.style.width = `${saved?.width || meta.width}px`;
    winEl.style.height = `${saved?.height || meta.height}px`;
    winEl.style.left = `${pos.x}px`;
    winEl.style.top = `${pos.y}px`;
    winEl.dataset.minWidth = String(meta.minWidth || 320);
    winEl.dataset.minHeight = String(meta.minHeight || 240);

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
    bindCtrl('[data-action="close"]', () => closeWindow(route));

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

  function countVisibleWindows() {
    let count = 0;
    windows.forEach((entry) => {
      if (!entry.el.hidden && !entry.minimized) {
        count += 1;
      }
    });
    return count;
  }

  function maybeHideWorkspaceOverlay() {
    if (!overlayMode || countVisibleWindows() > 0) {
      return;
    }
    global.WorkspaceFloatPanel?.hide?.();
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
    panel.hidden = true;
    ensurePanelStash().appendChild(panel);
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
    bodyEl.appendChild(panel);
    return panel;
  }

  function focusOrOpen(route, options = {}) {
    const entry = windows.get(route);
    if (entry && !entry.el.hidden && !entry.minimized) {
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

    let entry = windows.get(route);
    if (!entry) {
      const created = createWindowElement(route, meta);
      entry = { el: created.el, body: created.body, minimized: false, route };
      windows.set(route, entry);
    }
    mountPanel(route, entry.body);

    entry.el.hidden = false;
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
    const entry = windows.get(route);
    if (!entry) {
      return;
    }
    const meta = cfg(route);
    releaseWindowInteraction(entry);

    if (meta?.isLauncher) {
      if (overlayMode) {
        entry.el.hidden = true;
        entry.minimized = false;
        entry.el.classList.remove("is-minimized");
        stashPanel(route);
        global.WorkspaceFloatPanel?.hide?.();
        syncNavActiveOverlay(false);
        return;
      }
      entry.el.classList.add("is-minimized");
      entry.minimized = true;
      return;
    }

    entry.el.hidden = true;
    entry.minimized = false;
    entry.el.classList.remove("is-minimized");
    stashPanel(route);
    syncDockActive("");
    maybeHideWorkspaceOverlay();
  }

  function syncNavActiveOverlay(on) {
    document.querySelector('.jl-side-rail__btn[data-jl-space="workbench"]')?.classList.toggle("is-active", !!on);
  }

  function toggleMinimize(route) {
    const entry = windows.get(route);
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

  function bindKbLauncher() {
    document.querySelectorAll("[data-kb-open]").forEach((btn) => {
      if (btn.dataset.jlKbOpenBound === "1") {
        return;
      }
      btn.dataset.jlKbOpenBound = "1";
      btn.addEventListener("click", () => {
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
      document.body.classList.add("jl-workspace-float-active");
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

  function ensureRoot() {
    if (overlayMode) {
      let layer = document.getElementById("jlWorkspaceFloatLayer");
      if (!layer) {
        layer = document.createElement("div");
        layer.id = "jlWorkspaceFloatLayer";
        layer.className = "jl-workspace-float-layer";
        layer.hidden = true;
        layer.setAttribute("aria-hidden", "true");
        document.querySelector(".app-shell")?.appendChild(layer);
      }
      let root = layer.querySelector("#jlFloatDesktop");
      if (!root) {
        root = document.createElement("div");
        root.id = "jlFloatDesktop";
        root.className = "jl-float-desktop jl-float-desktop--overlay";
        layer.appendChild(root);
      }
      root.hidden = false;
      root.removeAttribute("aria-hidden");
      rootEl = root;
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
    rootEl = root;
    return root;
  }

  function setOverlayVisible(next) {
    overlayVisible = !!next;
    const layer = document.getElementById("jlWorkspaceFloatLayer");
    if (layer) {
      layer.hidden = !overlayVisible;
      layer.setAttribute("aria-hidden", overlayVisible ? "false" : "true");
    }
    if (rootEl) {
      rootEl.hidden = !overlayVisible;
    }
    if (overlayVisible) {
      syncWorkspaceLayerZIndex(false);
    }
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
    ensureRoot();
    ensureGeometryFlushOnExit();
    buildDock();
    hideLegacyChrome();
    bindHubTiles();
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
    if (mode === nextMode && overlayMode && rootEl) {
      routeHandler = options.onRoute || routeHandler;
      panelVisibleHandler = options.onPanelVisible || panelVisibleHandler;
      bindHubTiles();
      return;
    }
    overlayMode = true;
    mode = nextMode;
    routeHandler = options.onRoute || null;
    panelVisibleHandler = options.onPanelVisible || null;
    ensureRoot();
    ensureGeometryFlushOnExit();
    hideLegacyChrome();
    bindHubTiles();
    bindKbLauncher();
    if (!windows.size) {
      bootDefaultWindows();
    }
    setOverlayVisible(false);
  }

  function isOverlayMode() {
    return overlayMode;
  }

  function isActive() {
    return !!mode && !!rootEl && (overlayMode ? overlayVisible : !rootEl.hidden);
  }

  function getMode() {
    return mode;
  }

  global.FloatDesktop = {
    init,
    initOverlay,
    isActive,
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
