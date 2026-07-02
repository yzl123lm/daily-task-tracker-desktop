(function (global) {
  const DESKTOP_MODES = {
    workspace: {
      title: "工作台",
      hint: "拖拽窗口可重叠排列，点击窗口置顶",
      bodyClass: "jl-float-mode-workspace",
      windows: {
        workbench: {
          panelId: "panel-workbench-hub",
          title: "工作台",
          desc: "模块入口与快捷操作",
          icon: "⊞",
          width: 520,
          height: 460,
          minWidth: 420,
          minHeight: 360,
          isLauncher: true,
        },
        new: {
          panelId: "panel-new",
          title: "新增事项",
          desc: "登记待处理任务",
          icon: "✏",
          width: 800,
          height: 700,
          minWidth: 560,
          minHeight: 480,
        },
        filter: {
          panelId: "panel-filter",
          title: "查询筛选",
          desc: "按条件筛选任务",
          icon: "⌕",
          width: 660,
          height: 540,
          minWidth: 480,
          minHeight: 360,
        },
        dashboard: {
          panelId: "panel-dashboard",
          title: "数据看板",
          desc: "统计与趋势分析",
          icon: "▤",
          width: 880,
          height: 640,
          minWidth: 560,
          minHeight: 420,
        },
        list: {
          panelId: "panel-list",
          title: "任务列表",
          desc: "查看全部跟进任务",
          icon: "☰",
          width: 1000,
          height: 700,
          minWidth: 720,
          minHeight: 480,
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
  let rootEl = null;
  let dockEl = null;
  let zCounter = 30;
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

  function readSavedGeometry(route) {
    try {
      const raw = sessionStorage.getItem(storageKey(route));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveGeometry(route, winEl) {
    try {
      sessionStorage.setItem(
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

  function bringToFront(winEl) {
    zCounter += 1;
    winEl.style.zIndex = String(zCounter);
    winEl.classList.add("is-focused");
    rootEl?.querySelectorAll(".jl-float-win").forEach((node) => {
      if (node !== winEl) {
        node.classList.remove("is-focused");
      }
    });
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function defaultPosition(index, width, height) {
    const canvas = rootEl?.getBoundingClientRect();
    const cw = canvas?.width || 960;
    const ch = canvas?.height || 640;
    const dockW = dockEl && !dockEl.hidden ? dockEl.offsetWidth + 20 : 0;
    const baseX = dockW + 24 + (index % 4) * 32;
    const baseY = 20 + (index % 5) * 28;
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
      bringToFront(winEl);
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
      const canvas = rootEl.getBoundingClientRect();
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      winEl.style.left = `${clamp(originLeft + dx, 0, Math.max(0, canvas.width - winEl.offsetWidth))}px`;
      winEl.style.top = `${clamp(originTop + dy, 0, Math.max(0, canvas.height - winEl.offsetHeight))}px`;
    });

    const endDrag = (event) => {
      if (!dragging) {
        return;
      }
      dragging = false;
      winEl.classList.remove("is-dragging");
      saveGeometry(route, winEl);
      try {
        handleEl.releasePointerCapture(event.pointerId);
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
      bringToFront(winEl);
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
      const canvas = rootEl.getBoundingClientRect();
      const maxW = canvas.width - winEl.offsetLeft - 8;
      const maxH = canvas.height - winEl.offsetTop - 8;
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
        <div class="jl-float-win__actions">
          <button type="button" class="jl-float-win__btn" data-action="minimize" title="最小化" aria-label="最小化">—</button>
          <button type="button" class="jl-float-win__btn jl-float-win__btn--close" data-action="close" title="关闭" aria-label="关闭">×</button>
        </div>
      </header>
      <div class="jl-float-win__body"></div>
      <div class="jl-float-win__resize" aria-hidden="true"></div>
    `;

    const header = winEl.querySelector(".jl-float-win__header");
    const body = winEl.querySelector(".jl-float-win__body");
    const resize = winEl.querySelector(".jl-float-win__resize");

    winEl.addEventListener("pointerdown", () => bringToFront(winEl));
    attachDrag(winEl, header, route);
    attachResize(winEl, resize, route);

    header.querySelector('[data-action="minimize"]')?.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleMinimize(route);
    });
    header.querySelector('[data-action="close"]')?.addEventListener("click", (e) => {
      e.stopPropagation();
      closeWindow(route);
    });

    rootEl.appendChild(winEl);
    return { el: winEl, body };
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
      bringToFront(entry.el);
      syncDockActive(route);
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
      mountPanel(route, entry.body);
    }

    entry.el.hidden = false;
    entry.minimized = false;
    entry.el.classList.remove("is-minimized");
    if (options.focus !== false) {
      bringToFront(entry.el);
      entry.el.classList.add("jl-float-win--enter");
      window.setTimeout(() => entry.el.classList.remove("jl-float-win--enter"), 320);
    }
    syncDockActive(route);
    return true;
  }

  function closeWindow(route) {
    const entry = windows.get(route);
    if (!entry) {
      return;
    }
    const meta = cfg(route);
    if (meta?.isLauncher) {
      entry.el.classList.add("is-minimized");
      entry.minimized = true;
      return;
    }
    entry.el.hidden = true;
    entry.minimized = true;
    const panel = meta ? document.getElementById(meta.panelId) : null;
    if (panel) {
      panel.hidden = true;
    }
    syncDockActive("");
  }

  function toggleMinimize(route) {
    const entry = windows.get(route);
    if (!entry) {
      return;
    }
    entry.minimized = !entry.minimized;
    entry.el.classList.toggle("is-minimized", entry.minimized);
    if (!entry.minimized) {
      bringToFront(entry.el);
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
        if (!isActive() || mode !== "workspace") {
          return;
        }
        const route = btn.dataset.wbHubRoute;
        if (!route) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        openWindow(route);
        if (typeof routeHandler === "function") {
          routeHandler(route);
        }
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
    mode = nextMode;
    routeHandler = options.onRoute || null;
    panelVisibleHandler = options.onPanelVisible || null;
    ensureRoot();
    buildDock();
    hideLegacyChrome();
    bindHubTiles();
    bindKbLauncher();
    bootDefaultWindows();

    if (mode === "knowledge" && typeof panelVisibleHandler === "function") {
      void panelVisibleHandler();
    }
  }

  function isActive() {
    return !!mode && !!rootEl && !rootEl.hidden;
  }

  function getMode() {
    return mode;
  }

  global.FloatDesktop = {
    init,
    isActive,
    getMode,
    handleRoute,
    openWindow,
    focusOrOpen,
    closeWindow,
    bringToFront,
  };
})(typeof window !== "undefined" ? window : globalThis);
