(function (global) {
  let layerEl = null;
  let visible = false;
  let inited = false;
  let routeHandler = null;
  let panelVisibleHandler = null;

  function syncNavActive(on) {
    document.getElementById("jlWorkbenchNav")?.querySelectorAll('[data-wb-module="knowledge-base"]').forEach((btn) => {
      btn.classList.toggle("is-active", !!on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    document.querySelector('.jl-side-rail__btn[data-jl-space="kb"]')?.classList.toggle("is-active", !!on);
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
    if (!global.FloatDesktop.isOverlayActive?.("knowledge")) {
      global.FloatDesktop.initOverlay("knowledge", {
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
    layerEl = document.getElementById("jlKnowledgeFloatLayer");
    if (!layerEl) {
      return;
    }
    global.FloatDesktop?.activateOverlayMode?.("knowledge");
    layerEl.hidden = false;
    layerEl.setAttribute("aria-hidden", "false");
    visible = true;
    global.FloatDesktop?.setOverlayVisible?.(true, "knowledge");
    global.FloatDesktop?.openWindow("kb-launcher");
    fireRoute("knowledge-base");
    syncNavActive(true);
  }

  function hide() {
    layerEl = document.getElementById("jlKnowledgeFloatLayer");
    if (layerEl) {
      layerEl.hidden = true;
      layerEl.setAttribute("aria-hidden", "true");
    }
    document.body.classList.remove("jl-knowledge-float-active");
    visible = false;
    global.FloatDesktop?.activateOverlayMode?.("knowledge");
    global.FloatDesktop?.setOverlayVisible?.(false, "knowledge");
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
    global.FloatDesktop?.activateOverlayMode?.("knowledge");
    const key = String(route || "kb-launcher").trim() || "kb-launcher";
    if (key === "knowledge-base" || key === "kb-launcher") {
      global.FloatDesktop?.focusOrOpen("kb-launcher");
    } else {
      global.FloatDesktop?.openWindow(key);
    }
    fireRoute("knowledge-base");
  }

  function init(options = {}) {
    layerEl = document.getElementById("jlKnowledgeFloatLayer");
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

  global.KnowledgeFloatPanel = {
    init,
    show,
    hide,
    toggle,
    openRoute,
    isVisible,
  };
  global.toggleKnowledgeFloatPanel = toggle;
})(typeof window !== "undefined" ? window : globalThis);
