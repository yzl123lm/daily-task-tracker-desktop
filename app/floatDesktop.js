(function (global) {
  const WORKSPACE_WINDOWS = {
    workbench: {
      panelId: "panel-workbench-hub",
      title: "工作台",
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
      icon: "✏",
      width: 780,
      height: 680,
      minWidth: 560,
      minHeight: 480,
    },
    filter: {
      panelId: "panel-filter",
      title: "查询筛选",
      icon: "⌕",
      width: 640,
      height: 520,
      minWidth: 480,
      minHeight: 360,
    },
    dashboard: {
      panelId: "panel-dashboard",
      title: "数据看板",
      icon: "▤",
      width: 860,
      height: 620,
      minWidth: 560,
      minHeight: 420,
    },
    list: {
      panelId: "panel-list",
      title: "任务列表",
      icon: "☰",
      width: 980,
      height: 680,
      minWidth: 720,
      minHeight: 480,
    },
  };

  const RECORD_WINDOWS = {
    "record-capture": {
      panelId: "jlRecordWinCapture",
      title: "录音",
      icon: "🎙",
      width: 520,
      height: 420,
      minWidth: 400,
      minHeight: 320,
    },
    "record-transcript": {
      panelId: "jlRecordWinTranscript",
      title: "转写",
      icon: "〰",
      width: 520,
      height: 380,
      minWidth: 400,
      minHeight: 280,
    },
    "record-summary": {
      panelId: "jlRecordWinSummary",
      title: "纪要",
      icon: "📄",
      width: 520,
      height: 380,
      minWidth: 400,
      minHeight: 280,
    },
    "record-recent": {
      panelId: "jlRecordWinRecent",
      title: "最近记录",
      icon: "🕐",
      width: 480,
      height: 360,
      minWidth: 360,
      minHeight: 260,
    },
  };

  const RECORD_ROUTE = "record-capture";

  let mode = "";
  let rootEl = null;
  let dockEl = null;
  let zCounter = 20;
  /** @type {Map<string, { el: HTMLElement, route: string, minimized: boolean }>} */
  const windows = new Map();
  let routeHandler = null;

  function cfg(route) {
    const map = mode === "record" ? RECORD_WINDOWS : WORKSPACE_WINDOWS;
    return map[route] || null;
  }

  function allRoutes() {
    return mode === "record" ? Object.keys(RECORD_WINDOWS) : Object.keys(WORKSPACE_WINDOWS);
  }

  function escapeHtml(text) {
    return String(text ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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
    const dockW = dockEl && !dockEl.hidden ? dockEl.offsetWidth + 24 : 0;
    const baseX = dockW + 32 + (index % 3) * 36;
    const baseY = 28 + (index % 4) * 32;
    return {
      x: clamp(baseX, 12, Math.max(12, cw - width - 12)),
      y: clamp(baseY, 12, Math.max(12, ch - height - 12)),
    };
  }

  function attachDrag(winEl, handleEl) {
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
      if (!dragging) {
        return;
      }
      const canvas = rootEl.getBoundingClientRect();
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      const nextLeft = clamp(originLeft + dx, 0, Math.max(0, canvas.width - winEl.offsetWidth));
      const nextTop = clamp(originTop + dy, 0, Math.max(0, canvas.height - winEl.offsetHeight));
      winEl.style.left = `${nextLeft}px`;
      winEl.style.top = `${nextTop}px`;
    });

    const endDrag = (event) => {
      if (!dragging) {
        return;
      }
      dragging = false;
      winEl.classList.remove("is-dragging");
      try {
        handleEl.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    };

    handleEl.addEventListener("pointerup", endDrag);
    handleEl.addEventListener("pointercancel", endDrag);
  }

  function attachResize(winEl, gripEl) {
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
      if (!resizing) {
        return;
      }
      const canvas = rootEl.getBoundingClientRect();
      const maxW = canvas.width - winEl.offsetLeft - 8;
      const maxH = canvas.height - winEl.offsetTop - 8;
      const w = clamp(startW + (event.clientX - startX), minW, maxW);
      const h = clamp(startH + (event.clientY - startY), minH, maxH);
      winEl.style.width = `${w}px`;
      winEl.style.height = `${h}px`;
    });

    const endResize = (event) => {
      if (!resizing) {
        return;
      }
      resizing = false;
      winEl.classList.remove("is-resizing");
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
    const index = windows.size;
    const pos = defaultPosition(index, meta.width, meta.height);
    const winEl = document.createElement("div");
    winEl.className = "jl-float-win";
    winEl.dataset.route = route;
    winEl.style.width = `${meta.width}px`;
    winEl.style.height = `${meta.height}px`;
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
    attachDrag(winEl, header);
    attachResize(winEl, resize);

    header.querySelector('[data-action="minimize"]')?.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleMinimize(route);
    });
    header.querySelector('[data-action="close"]')?.addEventListener("click", (e) => {
      e.stopPropagation();
      closeWindow(route);
    });

    rootEl.appendChild(winEl);
    return { el: winEl, body, minimized: false };
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
    bringToFront(entry.el);
    if (options.focus !== false) {
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
    dockEl = document.createElement("aside");
    dockEl.className = "jl-float-dock";
    dockEl.setAttribute("aria-label", mode === "record" ? "会议记录模块" : "工作台模块");

    const title = mode === "record" ? "会议记录" : "工作台";
    const hint =
      mode === "record"
        ? "点击模块卡片打开或置顶对应窗口"
        : "从桌面打开任务模块，窗口可重叠与拖拽";

    dockEl.innerHTML = `
      <header class="jl-float-dock__head">
        <h2 class="jl-float-dock__title">${escapeHtml(title)}</h2>
        <p class="jl-float-dock__hint">${escapeHtml(hint)}</p>
      </header>
      <div class="jl-float-dock__list"></div>
    `;

    const list = dockEl.querySelector(".jl-float-dock__list");
    const routes = allRoutes();
    routes.forEach((route) => {
      const meta = cfg(route);
      if (!meta || meta.isLauncher) {
        return;
      }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "jl-float-dock__item";
      btn.dataset.floatRoute = route;
      btn.innerHTML = `
        <span class="jl-float-dock__item-icon" aria-hidden="true">${escapeHtml(meta.icon || "◻")}</span>
        <span class="jl-float-dock__item-text">
          <span class="jl-float-dock__item-label">${escapeHtml(meta.title)}</span>
        </span>
      `;
      btn.addEventListener("click", () => {
        if (windows.has(route) && !windows.get(route).minimized) {
          bringToFront(windows.get(route).el);
          syncDockActive(route);
          return;
        }
        openWindow(route);
        if (mode === "record" && typeof routeHandler === "function") {
          routeHandler("record");
        }
      });
      list.appendChild(btn);
    });

    if (mode === "workspace") {
      const homeBtn = document.createElement("button");
      homeBtn.type = "button";
      homeBtn.className = "jl-float-dock__item jl-float-dock__item--home";
      homeBtn.dataset.floatRoute = "workbench";
      homeBtn.innerHTML = `
        <span class="jl-float-dock__item-icon" aria-hidden="true">⊞</span>
        <span class="jl-float-dock__item-text">
          <span class="jl-float-dock__item-label">桌面首页</span>
        </span>
      `;
      homeBtn.addEventListener("click", () => {
        openWindow("workbench");
        if (typeof routeHandler === "function") {
          routeHandler("workbench");
        }
      });
      list.prepend(homeBtn);
    }

    rootEl.parentElement?.insertBefore(dockEl, rootEl);
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

  function handleRoute(route, options = {}) {
    if (!isActive()) {
      return false;
    }
    if (mode === "record") {
      if (route === "record") {
        openWindow("record-capture");
        openWindow("record-transcript", { focus: false });
        openWindow("record-summary", { focus: false });
        openWindow("record-recent", { focus: false });
        bringToFront(windows.get("record-capture")?.el);
        syncDockActive("record-capture");
        if (typeof options.onRecord === "function") {
          options.onRecord();
        }
        return true;
      }
      return false;
    }

    if (!WORKSPACE_WINDOWS[route]) {
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
    const topbar = document.querySelector(".topbar");
    const breadcrumb = document.getElementById("breadcrumb");
    const workbenchNav = document.getElementById("jlWorkbenchNav");
    const tabsStrip = document.getElementById("tabsStrip");
    const topStatus = document.getElementById("jlTopStatus");
    if (topStatus) {
      topStatus.hidden = true;
      topStatus.setAttribute("aria-hidden", "true");
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

  function init(nextMode, options = {}) {
    if (nextMode !== "workspace" && nextMode !== "record") {
      return;
    }
    mode = nextMode;
    routeHandler = options.onRoute || null;
    ensureRoot();
    buildDock();
    hideLegacyChrome();
    bindHubTiles();

    if (mode === "workspace") {
      openWindow("workbench");
    } else {
      handleRoute("record", options);
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
    closeWindow,
    bringToFront,
  };
})(typeof window !== "undefined" ? window : globalThis);
