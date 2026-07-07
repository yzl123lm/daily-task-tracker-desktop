const WB_PWS_LAYOUT_PREFS_KEY = "wb_pws_layout_prefs_v1";

const DEFAULT_PREFS = {
  projectWidthPx: 300,
  agentWidthPx: 360,
  terminalHeightPx: 220,
  diffHeightPct: 42,
};

const LIMITS = {
  projectMinPx: 240,
  projectMaxPx: 380,
  agentMinPx: 280,
  agentMaxPx: 480,
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
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_PREFS,
      projectWidthPx: parsed.projectWidthPx ?? parsed.agentWidthPct ? Math.round((parsed.agentWidthPct / 100) * 360) : DEFAULT_PREFS.agentWidthPx,
      agentWidthPx: parsed.agentWidthPx ?? (typeof parsed.agentWidthPct === "number" ? Math.round((parsed.agentWidthPct / 100) * 900) : DEFAULT_PREFS.agentWidthPx),
      terminalHeightPx: parsed.terminalHeightPx ?? DEFAULT_PREFS.terminalHeightPx,
      diffHeightPct: parsed.diffHeightPct ?? DEFAULT_PREFS.diffHeightPct,
    };
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
  layout.style.setProperty("--wb-pws-project-width", `${prefs.projectWidthPx}px`);
  layout.style.setProperty("--wb-pws-agent-width", `${prefs.agentWidthPx}px`);
  layout.style.setProperty("--wb-pws-terminal-height", `${prefs.terminalHeightPx}px`);
  layout.style.setProperty("--wb-pws-diff-height", `${prefs.diffHeightPct}%`);
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function ensureResizeEdge(col, side, className) {
  if (!col) {
    return null;
  }
  let edge = col.querySelector(className);
  if (edge) {
    return edge;
  }
  edge = document.createElement("div");
  edge.className = `wb-pws-col-resize-edge ${className}`;
  edge.dataset.side = side;
  col.style.position = "relative";
  col.appendChild(edge);
  return edge;
}

function bindColumnResizer() {
  const layout = getLayoutEl();
  const projectCol = document.getElementById("wbPwsProjectCol");
  const agentCol = document.getElementById("wbPwsAgentCol");
  const prefs = loadPrefs();
  if (!layout || !projectCol || !agentCol) {
    return;
  }

  const projectEdge = ensureResizeEdge(projectCol, "project", "wb-pws-col-resize-edge--project");
  const agentEdge = ensureResizeEdge(agentCol, "agent", "wb-pws-col-resize-edge--agent");

  const bindEdge = (edge, onMove) => {
    if (!edge || edge.dataset.bound === "1") {
      return;
    }
    edge.dataset.bound = "1";
    let dragging = false;
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
    edge.addEventListener("pointerdown", (ev) => {
      dragging = true;
      document.body.classList.add("wb-pws-resizing-col");
      edge.setPointerCapture?.(ev.pointerId);
      onMove(ev.clientX);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", stop);
    });
  };

  bindEdge(projectEdge, (clientX) => {
    const rect = layout.getBoundingClientRect();
    prefs.projectWidthPx = clamp(clientX - rect.left, LIMITS.projectMinPx, LIMITS.projectMaxPx);
    applyPrefs(prefs);
  });

  bindEdge(agentEdge, (clientX) => {
    const projectRight = projectCol.getBoundingClientRect().right;
    prefs.agentWidthPx = clamp(clientX - projectRight, LIMITS.agentMinPx, LIMITS.agentMaxPx);
    applyPrefs(prefs);
  });
}

function bindTerminalResizer() {
  const drawer = document.getElementById("wbPwsTerminalDrawer");
  if (!drawer) {
    return;
  }
  let edge = drawer.querySelector(".wb-pws-terminal-resize-edge");
  if (!edge) {
    edge = document.createElement("div");
    edge.className = "wb-pws-terminal-resize-edge";
    edge.setAttribute("aria-label", "调整终端高度");
    drawer.insertBefore(edge, drawer.firstChild);
  }
  if (edge.dataset.bound === "1") {
    return;
  }
  edge.dataset.bound = "1";
  const prefs = loadPrefs();
  let dragging = false;

  const onMove = (clientY) => {
    const rect = drawer.getBoundingClientRect();
    prefs.terminalHeightPx = clamp(rect.bottom - clientY, LIMITS.terminalMinPx, LIMITS.terminalMaxPx);
    drawer.dataset.collapsed = "0";
    drawer.classList.remove("is-collapsed");
    applyPrefs(prefs);
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

  edge.addEventListener("pointerdown", (ev) => {
    dragging = true;
    document.body.classList.add("wb-pws-resizing-terminal");
    edge.setPointerCapture?.(ev.pointerId);
    onMove(ev.clientY);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stop);
  });
}

function bindDiffResizer() {
  const panel = document.getElementById("wbDiffReviewPanel");
  const mount = document.getElementById("wbPwsCodeMount");
  if (!panel || panel.hidden || !mount) {
    return;
  }
  let handle = panel.querySelector(".wb-pws-resize-handle--diff");
  if (!handle) {
    handle = document.createElement("div");
    handle.className = "wb-pws-resize-handle wb-pws-resize-handle--diff";
    panel.appendChild(handle);
  }
  if (handle.dataset.bound === "1") {
    return;
  }
  handle.dataset.bound = "1";
  const prefs = loadPrefs();
  let dragging = false;
  const codeBody = document.getElementById("wbPwsCodeBody") || mount;

  const onMove = (clientY) => {
    const rect = codeBody.getBoundingClientRect();
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
