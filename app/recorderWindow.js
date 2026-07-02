(function (global) {
  const STORAGE_KEY = "jl_recorder_float_win_geom";
  const DEFAULT_W = 640;
  const DEFAULT_H = 560;

  let activeTab = "record";
  let floatWin = null;
  let desktop = null;
  let maximized = false;
  let minimized = false;
  let inited = false;

  function useFlexLayout() {
    return document.body.classList.contains("jl-recorder-window-active")
      || document.getElementById("panel-record")?.classList.contains("recorder-panel-root");
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
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
    if (!floatWin || maximized) {
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

  function centerWindow() {
    if (!floatWin || !desktop) {
      return;
    }
    if (useFlexLayout()) {
      floatWin.style.left = "";
      floatWin.style.top = "";
      const saved = readGeometry();
      if (saved?.width && !maximized) {
        floatWin.style.width = `${Math.min(saved.width, desktop.clientWidth - 24)}px`;
      } else if (!maximized) {
        floatWin.style.width = "";
      }
      if (saved?.height && !maximized) {
        floatWin.style.height = `${Math.min(saved.height, desktop.clientHeight - 24)}px`;
      } else if (!maximized) {
        floatWin.style.height = "";
      }
      return;
    }
    const saved = readGeometry();
    const cw = desktop.clientWidth;
    const ch = desktop.clientHeight;
    const w = saved?.width || DEFAULT_W;
    const h = saved?.height || DEFAULT_H;
    const left = saved?.left ?? Math.max(12, Math.round((cw - w) / 2));
    const top = saved?.top ?? Math.max(12, Math.round((ch - h) / 2));
    floatWin.style.width = `${w}px`;
    floatWin.style.height = `${h}px`;
    floatWin.style.left = `${clamp(left, 8, Math.max(8, cw - w - 8))}px`;
    floatWin.style.top = `${clamp(top, 8, Math.max(8, ch - h - 8))}px`;
  }

  function attachDrag() {
    const handle = floatWin?.querySelector(".recorder-float-win__titlebar");
    if (!handle || !floatWin || !desktop || useFlexLayout()) {
      return;
    }

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let originTop = 0;

    handle.addEventListener("pointerdown", (event) => {
      if (event.target.closest(".recorder-float-win__ctrl") || maximized) {
        return;
      }
      dragging = true;
      floatWin.classList.add("is-focused");
      startX = event.clientX;
      startY = event.clientY;
      originLeft = floatWin.offsetLeft;
      originTop = floatWin.offsetTop;
      handle.setPointerCapture(event.pointerId);
    });

    handle.addEventListener("pointermove", (event) => {
      if (!dragging) {
        return;
      }
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      const cw = desktop.clientWidth;
      const ch = desktop.clientHeight;
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

  function bindWindowControls() {
    const api = global.electronAPI;
    floatWin?.querySelector('[data-action="minimize"]')?.addEventListener("click", () => {
      if (api?.windowChromeMinimize) {
        void api.windowChromeMinimize();
        return;
      }
      minimized = !minimized;
      floatWin?.classList.toggle("is-minimized", minimized);
    });

    floatWin?.querySelector('[data-action="maximize"]')?.addEventListener("click", async () => {
      if (api?.windowChromeMaximize) {
        const out = await api.windowChromeMaximize();
        maximized = !!out?.maximized;
      } else {
        maximized = !maximized;
      }
      floatWin?.classList.toggle("is-maximized", maximized);
      updateMaximizeIcon();
      if (!maximized) {
        centerWindow();
      }
    });

    floatWin?.querySelector('[data-action="close"]')?.addEventListener("click", () => {
      if (api?.windowChromeClose) {
        void api.windowChromeClose();
      } else {
        global.close();
      }
    });
  }

  async function updateMaximizeIcon() {
    const btn = floatWin?.querySelector('[data-action="maximize"]');
    if (!btn) {
      return;
    }
    let isMax = maximized;
    if (global.electronAPI?.windowChromeIsMaximized) {
      const out = await global.electronAPI.windowChromeIsMaximized();
      isMax = !!out?.maximized;
      maximized = isMax;
      floatWin?.classList.toggle("is-maximized", isMax);
    }
    btn.innerHTML = isMax ? "❐" : "□";
    btn.setAttribute("aria-label", isMax ? "还原" : "最大化");
  }

  function activateTab(tab) {
    activeTab = tab || "record";
    const root = floatWin || document.getElementById("recorderFloatWin");
    if (!root) {
      return;
    }

    root.querySelectorAll("[data-recorder-tab]").forEach((btn) => {
      const active = btn.dataset.recorderTab === activeTab;
      btn.classList.toggle("is-active", active);
      btn.toggleAttribute("aria-current", active ? "page" : false);
    });

    root.querySelectorAll("[data-recorder-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.recorderPanel !== activeTab;
    });

    root.classList.add("is-focused");
  }

  function bindTabs() {
    floatWin?.querySelectorAll("[data-recorder-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activateTab(btn.dataset.recorderTab || "record");
      });
    });
  }

  function init() {
    desktop = document.getElementById("recorderDesktop");
    floatWin = document.getElementById("recorderFloatWin");
    if (!desktop || !floatWin) {
      return;
    }

    if (inited) {
      centerWindow();
      activateTab(activeTab);
      return;
    }
    inited = true;

    centerWindow();
    attachDrag();
    bindWindowControls();
    bindTabs();
    activateTab("record");
    void updateMaximizeIcon();

    floatWin.addEventListener("pointerdown", () => {
      floatWin.classList.add("is-focused");
    });

    global.addEventListener("resize", () => {
      if (!maximized) {
        centerWindow();
      }
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
      activateTab(map[legacyKey] || legacyKey || "record");
    };

    global.RecorderWindow = {
      activateTab,
      getActiveTab: () => activeTab,
      setRecording: (v) => floatWin?.classList.toggle("is-recording", !!v),
    };
  }

  global.RecorderWindow = { init, activateTab };
})(window);
