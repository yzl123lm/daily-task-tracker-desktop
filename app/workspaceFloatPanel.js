(function (global) {
  let layerEl = null;
  let visible = false;
  let inited = false;
  let routeHandler = null;
  let panelVisibleHandler = null;

  function syncNavActive(on) {
    const nav = document.getElementById("jlWorkbenchNav");
    nav?.querySelectorAll('[data-wb-route="workbench"], [data-wb-module="workbench"]').forEach((btn) => {
      btn.classList.toggle("is-active", !!on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    document.querySelector('.jl-side-rail__btn[data-jl-space="workbench"]')?.classList.toggle("is-active", !!on);
  }

  function fireRoute(route) {
    if (typeof routeHandler === "function") {
      routeHandler(route);
    }
  }

  function ensureDesktop() {
    if (!global.FloatDesktop) {
      return;
    }
    if (!global.FloatDesktop.isActive() || !global.FloatDesktop.isOverlayMode()) {
      global.FloatDesktop.initOverlay("workspace", {
        onRoute: (route) => fireRoute(route),
        onPanelVisible: (route) => {
          if (typeof panelVisibleHandler === "function") {
            panelVisibleHandler(route);
          }
        },
      });
    }
  }

  function show() {
    if (!inited) {
      init();
    }
    ensureDesktop();
    if (!layerEl) {
      return;
    }
    layerEl.hidden = false;
    layerEl.setAttribute("aria-hidden", "false");
    document.body.classList.add("jl-workspace-float-active");
    visible = true;
    global.FloatDesktop?.setOverlayVisible?.(true);
    global.FloatDesktop?.openWindow("workbench");
    fireRoute("workbench");
    syncNavActive(true);
  }

  function hide() {
    if (layerEl) {
      layerEl.hidden = true;
      layerEl.setAttribute("aria-hidden", "true");
    }
    document.body.classList.remove("jl-workspace-float-active");
    visible = false;
    global.FloatDesktop?.setOverlayVisible?.(false);
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

  function openRoute(route) {
    if (!inited) {
      init();
    }
    ensureDesktop();
    if (!visible) {
      show();
    }
    const key = String(route || "workbench").trim() || "workbench";
    if (key === "workbench") {
      global.FloatDesktop?.focusOrOpen("workbench");
    } else {
      global.FloatDesktop?.openWindow(key);
    }
    fireRoute(key);
  }

  function init(options = {}) {
    layerEl = document.getElementById("jlWorkspaceFloatLayer");
    if (!layerEl) {
      return;
    }
    routeHandler = options.onRoute || routeHandler;
    panelVisibleHandler = options.onPanelVisible || panelVisibleHandler;
    inited = true;
  }

  function isVisible() {
    return visible;
  }

  global.WorkspaceFloatPanel = {
    init,
    show,
    hide,
    toggle,
    openRoute,
    isVisible,
  };
  global.toggleWorkspaceFloatPanel = toggle;
})(typeof window !== "undefined" ? window : globalThis);
