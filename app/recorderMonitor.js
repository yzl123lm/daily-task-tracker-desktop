(function (global) {
  const STORAGE_KEY = "jl_recorder_monitor_geom_v4";
  const DEFAULT_W = 450;
  const DEFAULT_H = 600;
  const PINNED_Z = 9000;
  const RECORDER_LAYER_BASE_Z = 2000;

  let layerEl = null;
  let floatWin = null;
  let visible = false;
  let pinned = false;
  let collapsed = false;
  let inited = false;
  let zCounter = 2000;
  let activeTab = "record";
  let drawerOpen = false;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function viewportSize() {
    return {
      width: global.innerWidth || document.documentElement.clientWidth || DEFAULT_W,
      height: global.innerHeight || document.documentElement.clientHeight || DEFAULT_H,
    };
  }

  function readGeometry() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveGeometry() {
    if (!floatWin) {
      return;
    }
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          left: floatWin.offsetLeft,
          top: floatWin.offsetTop,
          width: floatWin.offsetWidth,
          height: floatWin.offsetHeight,
        })
      );
    } catch {
      /* ignore */
    }
  }

  function syncRecorderLayerZIndex(bump) {
    if (!layerEl) {
      return;
    }
    if (pinned) {
      if (typeof global.__jlFloatLayerTopZ !== "number") {
        global.__jlFloatLayerTopZ = 9100;
      }
      if (bump) {
        global.__jlFloatLayerTopZ += 1;
      }
      layerEl.style.zIndex = String(global.__jlFloatLayerTopZ);
      return;
    }
    layerEl.style.zIndex = String(RECORDER_LAYER_BASE_Z);
  }

  function bringToFront() {
    if (!floatWin) {
      return;
    }
    if (pinned) {
      floatWin.style.zIndex = String(PINNED_Z);
      syncRecorderLayerZIndex(true);
    } else {
      zCounter += 1;
      floatWin.style.zIndex = String(zCounter);
    }
    floatWin.classList.add("is-focused");
  }

  function applyGeometry() {
    if (!floatWin) {
      return;
    }
    const saved = readGeometry();
    const { width: cw, height: ch } = viewportSize();
    const w = saved?.width || DEFAULT_W;
    const h = saved?.height || DEFAULT_H;
    const left = saved?.left ?? Math.max(16, Math.round(cw - w - 24));
    const top = saved?.top ?? Math.max(16, Math.round((ch - h) / 2));
    floatWin.style.width = `${w}px`;
    floatWin.style.height = collapsed ? "auto" : `${h}px`;
    floatWin.style.left = `${clamp(left, 8, Math.max(8, cw - w - 8))}px`;
    floatWin.style.top = `${clamp(top, 8, Math.max(8, ch - (collapsed ? 56 : h) - 8))}px`;
  }

  function attachDrag() {
    const handle = floatWin?.querySelector(".recorder-monitor__titlebar");
    if (!handle || !floatWin) {
      return;
    }

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let originTop = 0;

    handle.addEventListener("pointerdown", (event) => {
      if (event.target.closest(".recorder-monitor__ctrl")) {
        return;
      }
      dragging = true;
      bringToFront();
      startX = event.clientX;
      startY = event.clientY;
      originLeft = floatWin.offsetLeft;
      originTop = floatWin.offsetTop;
      handle.setPointerCapture(event.pointerId);
      floatWin.classList.add("is-dragging");
      event.preventDefault();
    });

    handle.addEventListener("pointermove", (event) => {
      if (!dragging) {
        return;
      }
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      const { width: cw, height: ch } = viewportSize();
      const w = floatWin.offsetWidth;
      const h = floatWin.offsetHeight;
      floatWin.style.left = `${clamp(originLeft + dx, 0, Math.max(0, cw - w))}px`;
      floatWin.style.top = `${clamp(originTop + dy, 0, Math.max(0, ch - h))}px`;
    });

    const endDrag = (event) => {
      if (!dragging) {
        return;
      }
      dragging = false;
      floatWin.classList.remove("is-dragging");
      try {
        handle.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
      saveGeometry();
    };

    handle.addEventListener("pointerup", endDrag);
    handle.addEventListener("pointercancel", endDrag);
  }

  function setPinned(next) {
    pinned = !!next;
    floatWin?.classList.toggle("is-pinned", pinned);
    const pinBtn = floatWin?.querySelector('[data-action="pin"]');
    if (pinBtn) {
      pinBtn.classList.toggle("is-active", pinned);
      pinBtn.setAttribute("aria-pressed", pinned ? "true" : "false");
    }
    syncRecorderLayerZIndex(true);
    bringToFront();
  }

  function setCollapsed(next) {
    collapsed = !!next;
    floatWin?.classList.toggle("is-collapsed", collapsed);
    if (collapsed) {
      setDrawerOpen(false);
    }
    applyGeometry();
  }

  function setDrawerOpen(next) {
    drawerOpen = !!next;
    const drawer = floatWin?.querySelector("#recorderMonitorDrawer");
    if (drawer) {
      drawer.hidden = !drawerOpen;
    }
    floatWin?.classList.toggle("is-drawer-open", drawerOpen);
  }

  function activateTab(tab, openDrawer = true) {
    activeTab = tab || "record";
    const root = floatWin || document.getElementById("recorderFloatWin");
    if (!root) {
      return;
    }

    root.querySelectorAll("[data-recorder-drawer-tab]").forEach((btn) => {
      const active = btn.dataset.recorderDrawerTab === activeTab;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });

    root.querySelectorAll("[data-recorder-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.recorderPanel !== activeTab;
    });

    if (openDrawer) {
      setDrawerOpen(true);
    }
    bringToFront();
  }

  function bindTabs() {
    floatWin?.querySelectorAll("[data-recorder-drawer-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset.recorderDrawerTab || "record";
        if (activeTab === tab && drawerOpen) {
          setDrawerOpen(false);
          return;
        }
        activateTab(tab, true);
      });
    });
  }

  function bindControls() {
    floatWin?.querySelector('[data-action="pin"]')?.addEventListener("click", () => {
      setPinned(!pinned);
    });

    floatWin?.querySelector('[data-action="collapse"]')?.addEventListener("click", () => {
      setCollapsed(!collapsed);
    });

    floatWin?.querySelector('[data-action="close"]')?.addEventListener("click", () => {
      hide();
    });
  }

  function showLayer() {
    if (!layerEl) {
      return;
    }
    layerEl.hidden = false;
    layerEl.setAttribute("aria-hidden", "false");
    document.body.classList.add("jl-recorder-monitor-active");
    visible = true;
    applyGeometry();
    bringToFront();
    if (typeof global.onRecorderMonitorVisible === "function") {
      global.onRecorderMonitorVisible();
    }
  }

  function hideLayer() {
    if (!layerEl) {
      return;
    }
    layerEl.hidden = true;
    layerEl.setAttribute("aria-hidden", "true");
    document.body.classList.remove("jl-recorder-monitor-active");
    visible = false;
  }

  function show() {
    if (!inited) {
      init();
    }
    showLayer();
    syncNavActive(true);
  }

  function hide() {
    hideLayer();
    syncNavActive(false);
  }

  function toggle() {
    if (visible) {
      hide();
    } else {
      show();
    }
    return visible;
  }

  function isVisible() {
    return visible;
  }

  function syncNavActive(on) {
    const nav = document.getElementById("jlWorkbenchNav");
    nav?.querySelectorAll('[data-wb-route="record"], [data-wb-module="record"]').forEach((btn) => {
      btn.classList.toggle("is-active", !!on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function setRecording(v) {
    floatWin?.classList.toggle("is-recording", !!v);
    const badge = document.getElementById("recordLiveBadge");
    const indicator = document.getElementById("recordLiveIndicator");
    if (badge) {
      badge.textContent = v ? "LIVE" : "STANDBY";
    }
    indicator?.classList.toggle("is-live", !!v);
  }

  function init() {
    layerEl = document.getElementById("jlRecorderMonitorLayer");
    floatWin = document.getElementById("recorderFloatWin");
    if (!layerEl || !floatWin) {
      return;
    }

    if (inited) {
      applyGeometry();
      activateTab(activeTab);
      return;
    }
    inited = true;

    floatWin.classList.add("recorder-monitor");
    applyGeometry();
    attachDrag();
    bindControls();
    bindTabs();
    setDrawerOpen(false);
    activateTab("record", false);
    bringToFront();

    floatWin.addEventListener("pointerdown", () => {
      if (!pinned) {
        bringToFront();
      }
    });

    global.addEventListener("resize", () => {
      applyGeometry();
    });

    global.recordAssistantActivate = (legacyKey) => {
      const map = {
        capture: "record",
        record: "record",
        transcript: "transcribe",
        transcribe: "transcribe",
        summary: "summary",
        recent: "history",
        history: "history",
      };
      show();
      activateTab(map[legacyKey] || legacyKey || "record", true);
    };

    global.RecorderMonitor = api();
    global.RecorderWindow = global.RecorderMonitor;
  }

  function api() {
    return {
      init,
      show,
      hide,
      toggle,
      isVisible,
      setRecording,
      setPinned,
      bringToFront,
      activateTab,
      activateDrawer: (tab) => activateTab(tab, true),
      setDrawerOpen,
      isDrawerOpen: () => drawerOpen,
      getActiveTab: () => activeTab,
    };
  }

  global.RecorderMonitor = api();
  global.RecorderWindow = global.RecorderMonitor;
})(window);
