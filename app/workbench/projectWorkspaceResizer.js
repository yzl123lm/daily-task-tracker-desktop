const WB_PWS_LAYOUT_PREFS_KEY = "wb_pws_layout_prefs_v1";

const DEFAULT_PREFS = {
  agentWidthPct: 36,
  terminalHeightPx: 220,
  diffHeightPct: 42,
};

const LIMITS = {
  agentMinPct: 24,
  agentMaxPct: 48,
  terminalMinPx: 120,
  terminalMaxPx: 480,
  diffMinPct: 20,
  diffMaxPct: 65,
};

function loadPrefs() {
  try {
    const raw = localStorage.getItem(WB_PWS_LAYOUT_PREFS_KEY);
    if (!raw) {
      return { ...DEFAULT_PREFS };
    }
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function savePrefs(prefs) {
  try {
    localStorage.setItem(WB_PWS_LAYOUT_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

function getLayoutEl() {
  return document.querySelector(".wb-pws-layout");
}

function applyPrefs(prefs = loadPrefs()) {
  const layout = getLayoutEl();
  if (!layout) {
    return;
  }
  layout.style.setProperty("--wb-pws-agent-width", `${prefs.agentWidthPct}%`);
  layout.style.setProperty("--wb-pws-terminal-height", `${prefs.terminalHeightPx}px`);
  layout.style.setProperty("--wb-pws-diff-height", `${prefs.diffHeightPct}%`);
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function ensureColumnHandle() {
  const main = document.querySelector(".wb-pws-main");
  const agent = document.querySelector(".wb-pws-agent-col");
  if (!main || !agent) {
    return null;
  }
  let handle = main.querySelector(".wb-pws-resize-handle--col");
  if (handle) {
    return handle;
  }
  handle = document.createElement("div");
  handle.className = "wb-pws-resize-handle wb-pws-resize-handle--col";
  handle.setAttribute("role", "separator");
  handle.setAttribute("aria-orientation", "vertical");
  handle.setAttribute("aria-label", "调整 Agent 区宽度");
  handle.title = "拖拽调整左右栏宽度";
  const codeCol = main.querySelector(".wb-pws-code-col");
  if (codeCol) {
    main.insertBefore(handle, codeCol);
  } else {
    agent.insertAdjacentElement("afterend", handle);
  }
  return handle;
}

function ensureTerminalHandle() {
  const layout = getLayoutEl();
  const drawer = document.getElementById("wbPwsTerminalDrawer");
  if (!layout || !drawer) {
    return null;
  }
  let handle = layout.querySelector(".wb-pws-resize-handle--terminal");
  if (handle) {
    return handle;
  }
  handle = document.createElement("div");
  handle.className = "wb-pws-resize-handle wb-pws-resize-handle--terminal";
  handle.setAttribute("role", "separator");
  handle.setAttribute("aria-orientation", "horizontal");
  handle.setAttribute("aria-label", "调整终端抽屉高度");
  handle.title = "拖拽调整终端高度";
  layout.insertBefore(handle, drawer);
  return handle;
}

function bindColumnResizer() {
  const handle = ensureColumnHandle();
  const main = document.querySelector(".wb-pws-main");
  if (!handle || !main || handle.dataset.bound === "1") {
    return;
  }
  handle.dataset.bound = "1";
  const prefs = loadPrefs();
  let dragging = false;

  const onMove = (clientX) => {
    const rect = main.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    prefs.agentWidthPct = clamp(pct, LIMITS.agentMinPct, LIMITS.agentMaxPct);
    applyPrefs(prefs);
  };

  const stop = () => {
    if (!dragging) {
      return;
    }
    dragging = false;
    document.body.classList.remove("wb-pws-resizing-col");
    savePrefs(prefs);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", stop);
  };

  const onPointerMove = (ev) => {
    if (!dragging) {
      return;
    }
    onMove(ev.clientX);
  };

  handle.addEventListener("pointerdown", (ev) => {
    dragging = true;
    document.body.classList.add("wb-pws-resizing-col");
    handle.setPointerCapture?.(ev.pointerId);
    onMove(ev.clientX);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stop);
  });
}

function bindTerminalResizer() {
  const handle = ensureTerminalHandle();
  const layout = getLayoutEl();
  const drawer = document.getElementById("wbPwsTerminalDrawer");
  if (!handle || !layout || !drawer || handle.dataset.bound === "1") {
    return;
  }
  handle.dataset.bound = "1";
  const prefs = loadPrefs();
  let dragging = false;

  const onMove = (clientY) => {
    const rect = layout.getBoundingClientRect();
    const drawerRect = drawer.getBoundingClientRect();
    const height = drawerRect.bottom - clientY;
    prefs.terminalHeightPx = clamp(height, LIMITS.terminalMinPx, LIMITS.terminalMaxPx);
    drawer.dataset.collapsed = "0";
    applyPrefs(prefs);
    const toggle = document.getElementById("wbPwsTerminalToggle");
    if (toggle) {
      toggle.textContent = "收起";
      toggle.setAttribute("aria-expanded", "true");
    }
  };

  const stop = () => {
    if (!dragging) {
      return;
    }
    dragging = false;
    document.body.classList.remove("wb-pws-resizing-terminal");
    savePrefs(prefs);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", stop);
  };

  const onPointerMove = (ev) => {
    if (!dragging) {
      return;
    }
    onMove(ev.clientY);
  };

  handle.addEventListener("pointerdown", (ev) => {
    dragging = true;
    document.body.classList.add("wb-pws-resizing-terminal");
    handle.setPointerCapture?.(ev.pointerId);
    onMove(ev.clientY);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stop);
  });
}

function ensureDiffHandle() {
  const panel = document.getElementById("wbDiffReviewPanel");
  if (!panel || panel.hidden) {
    return null;
  }
  let handle = panel.querySelector(".wb-pws-resize-handle--diff");
  if (handle) {
    return handle;
  }
  handle = document.createElement("div");
  handle.className = "wb-pws-resize-handle wb-pws-resize-handle--diff";
  handle.setAttribute("role", "separator");
  handle.setAttribute("aria-orientation", "horizontal");
  handle.setAttribute("aria-label", "调整 Diff 审阅区高度");
  handle.title = "拖拽调整 Diff 区高度";
  panel.appendChild(handle);
  return handle;
}

function bindDiffResizer() {
  const panel = document.getElementById("wbDiffReviewPanel");
  const mount = document.getElementById("wbPwsCodeMount");
  if (!panel || panel.hidden || !mount) {
    return;
  }
  const handle = ensureDiffHandle();
  if (!handle || handle.dataset.bound === "1") {
    return;
  }
  handle.dataset.bound = "1";
  const prefs = loadPrefs();
  let dragging = false;

  const onMove = (clientY) => {
    const rect = mount.getBoundingClientRect();
    const pct = ((clientY - rect.top) / rect.height) * 100;
    prefs.diffHeightPct = clamp(pct, LIMITS.diffMinPct, LIMITS.diffMaxPct);
    applyPrefs(prefs);
  };

  const stop = () => {
    if (!dragging) {
      return;
    }
    dragging = false;
    document.body.classList.remove("wb-pws-resizing-diff");
    savePrefs(prefs);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", stop);
  };

  const onPointerMove = (ev) => {
    if (!dragging) {
      return;
    }
    onMove(ev.clientY);
  };

  handle.addEventListener("pointerdown", (ev) => {
    dragging = true;
    document.body.classList.add("wb-pws-resizing-diff");
    handle.setPointerCapture?.(ev.pointerId);
    onMove(ev.clientY);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stop);
  });
}

function bindWorkspaceResizers() {
  applyPrefs();
  bindColumnResizer();
  bindTerminalResizer();
  bindDiffResizer();
}

function resetLayoutPrefs() {
  savePrefs({ ...DEFAULT_PREFS });
  applyPrefs({ ...DEFAULT_PREFS });
}

window.__wbBindWorkspaceResizers = bindWorkspaceResizers;
window.__wbBindDiffResizer = bindDiffResizer;
window.__wbResetPwsLayout = resetLayoutPrefs;
window.__wbApplyPwsLayoutPrefs = applyPrefs;
