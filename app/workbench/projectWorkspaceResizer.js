const WB_PWS_LAYOUT_PREFS_KEY = "wb_pws_layout_prefs_v3";

const DEFAULT_PREFS = {
  projectWidthPx: 300,
  agentWidthPx: 360,
  terminalHeightPx: 220,
  diffHeightPct: 42,
};

const LIMITS = {
  projectMinPx: 260,
  projectMaxPx: 380,
  agentMinPx: 320,
  agentMaxPx: 420,
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
  layout.style.setProperty("--wb-pws-agent-width", `${prefs.agentWidthPx}px`);
  layout.style.setProperty("--wb-pws-terminal-height", `${prefs.terminalHeightPx}px`);
  layout.style.setProperty("--wb-pws-diff-height", `${prefs.diffHeightPct}%`);
  document.documentElement.style.setProperty("--wb-sidepanel-width", `${prefs.projectWidthPx}px`);
  document.documentElement.style.setProperty("--wb-sidebar-width", `${prefs.projectWidthPx}px`);
  positionResizeHandles(prefs);
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function ensureOverlayHandle(id, className) {
  const layout = getLayoutEl();
  if (!layout) {
    return null;
  }
  let handle = document.getElementById(id);
  if (handle) {
    return handle;
  }
  handle = document.createElement("div");
  handle.id = id;
  handle.className = `wb-pws-resize-handle ${className}`;
  handle.setAttribute("role", "separator");
  layout.appendChild(handle);
  return handle;
}

function isProjectColInSidebar() {
  return (
    document.body.classList.contains("wb-pws-sidebar-mounted") ||
    Boolean(document.getElementById("jlWorkbenchSplit")?.querySelector(".wb-pws-project-col"))
  );
}

function positionResizeHandles(prefs = loadPrefs()) {
  const layout = getLayoutEl();
  const projectHandle = document.getElementById("wbPwsResizeProject");
  const agentHandle = document.getElementById("wbPwsResizeAgent");
  const terminalHandle = document.getElementById("wbPwsResizeTerminal");
  if (!layout) {
    return;
  }
  const top = 48;
  const terminalH =
    layout.dataset.terminalCollapsed === "1" ? 40 : prefs.terminalHeightPx;
  const sidebarProject = isProjectColInSidebar();
  const railWidth = 64;
  if (projectHandle) {
    if (sidebarProject) {
      projectHandle.hidden = false;
      projectHandle.style.display = "";
      projectHandle.style.top = `${top}px`;
      projectHandle.style.bottom = `${terminalH}px`;
      projectHandle.style.left = `calc(${railWidth}px + ${prefs.projectWidthPx}px - 3px)`;
      projectHandle.style.right = "auto";
    } else {
      projectHandle.hidden = true;
      projectHandle.style.display = "none";
    }
  }
  if (agentHandle) {
    agentHandle.hidden = false;
    agentHandle.style.display = "";
    agentHandle.style.top = `${top}px`;
    agentHandle.style.bottom = `${terminalH}px`;
    agentHandle.style.left = "auto";
    agentHandle.style.right = `calc(${prefs.agentWidthPx}px - 3px)`;
  }
  if (terminalHandle) {
    terminalHandle.style.height = "8px";
    terminalHandle.style.bottom = `calc(${terminalH}px - 4px)`;
  }
}

function bindDragHandle(handle, onMove) {
  if (!handle || handle.dataset.bound === "1") {
    return;
  }
  handle.dataset.bound = "1";
  const prefs = loadPrefs();
  let dragging = false;

  const stop = () => {
    if (!dragging) {
      return;
    }
    dragging = false;
    handle.classList.remove("is-dragging");
    document.body.classList.remove("wb-pws-resizing");
    savePrefs(prefs);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", stop);
  };

  const onPointerMove = (ev) => {
    if (!dragging) {
      return;
    }
    onMove(ev, prefs);
    applyPrefs(prefs);
  };

  handle.addEventListener("pointerdown", (ev) => {
    dragging = true;
    handle.classList.add("is-dragging");
    document.body.classList.add("wb-pws-resizing");
    handle.setPointerCapture?.(ev.pointerId);
    onMove(ev, prefs);
    applyPrefs(prefs);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stop);
  });
}

function bindWorkspaceResizers() {
  applyPrefs();
  const layout = getLayoutEl();
  if (!layout) {
    return;
  }

  const projectHandle = ensureOverlayHandle(
    "wbPwsResizeProject",
    "wb-pws-resize-handle--project"
  );
  projectHandle?.setAttribute("aria-label", "调整项目栏宽度");
  bindDragHandle(projectHandle, (ev, prefs) => {
    const split = document.getElementById("jlWorkbenchSplit");
    const rect = split?.getBoundingClientRect() || layout.getBoundingClientRect();
    prefs.projectWidthPx = clamp(
      ev.clientX - rect.left - 64,
      LIMITS.projectMinPx,
      LIMITS.projectMaxPx
    );
  });

  const agentHandle = ensureOverlayHandle(
    "wbPwsResizeAgent",
    "wb-pws-resize-handle--col"
  );
  agentHandle?.setAttribute("aria-label", "调整 Agent 栏宽度");
  bindDragHandle(agentHandle, (ev, prefs) => {
    const rect = layout.getBoundingClientRect();
    prefs.agentWidthPx = clamp(
      rect.right - ev.clientX,
      LIMITS.agentMinPx,
      LIMITS.agentMaxPx
    );
  });

  const terminalHandle = ensureOverlayHandle(
    "wbPwsResizeTerminal",
    "wb-pws-resize-handle--terminal"
  );
  terminalHandle?.setAttribute("aria-orientation", "horizontal");
  terminalHandle?.setAttribute("aria-label", "调整终端高度");
  if (terminalHandle && terminalHandle.dataset.bound !== "1") {
    terminalHandle.dataset.bound = "1";
    const prefs = loadPrefs();
    let dragging = false;
    const stop = () => {
      dragging = false;
      terminalHandle.classList.remove("is-dragging");
      document.body.classList.remove("wb-pws-resizing-terminal");
      savePrefs(prefs);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", stop);
    };
    const onMove = (ev) => {
      if (!dragging) {
        return;
      }
      const rect = layout.getBoundingClientRect();
      prefs.terminalHeightPx = clamp(
        rect.bottom - ev.clientY,
        LIMITS.terminalMinPx,
        LIMITS.terminalMaxPx
      );
      const drawer = document.getElementById("wbPwsTerminalDrawer");
      if (drawer) {
        drawer.dataset.collapsed = "0";
        drawer.classList.remove("is-collapsed");
        layout.dataset.terminalCollapsed = "0";
      }
      applyPrefs(prefs);
    };
    terminalHandle.addEventListener("pointerdown", (ev) => {
      dragging = true;
      terminalHandle.classList.add("is-dragging");
      document.body.classList.add("wb-pws-resizing-terminal");
      terminalHandle.setPointerCapture?.(ev.pointerId);
      onMove(ev);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", stop);
    });
  }

  bindDiffResizer();
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
  const stop = () => {
    dragging = false;
    handle.classList.remove("is-dragging");
    document.body.classList.remove("wb-pws-resizing-diff");
    savePrefs(prefs);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", stop);
  };
  const onPointerMove = (ev) => {
    if (!dragging) {
      return;
    }
    const rect = mount.getBoundingClientRect();
    prefs.diffHeightPct = clamp(
      ((ev.clientY - rect.top) / rect.height) * 100,
      LIMITS.diffMinPct,
      LIMITS.diffMaxPct
    );
    applyPrefs(prefs);
  };
  handle.addEventListener("pointerdown", (ev) => {
    dragging = true;
    handle.classList.add("is-dragging");
    document.body.classList.add("wb-pws-resizing-diff");
    handle.setPointerCapture?.(ev.pointerId);
    onPointerMove(ev);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stop);
  });
}

function resetLayoutPrefs() {
  savePrefs({ ...DEFAULT_PREFS });
  applyPrefs({ ...DEFAULT_PREFS });
}

window.__wbBindWorkspaceResizers = bindWorkspaceResizers;
window.__wbBindDiffResizer = bindDiffResizer;
window.__wbResetPwsLayout = resetLayoutPrefs;
window.__wbApplyPwsLayoutPrefs = applyPrefs;
