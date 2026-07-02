const path = require("path");
const { BrowserWindow } = require("electron");
const { resolveAppIconPath } = require("./window.js");
const { getMainWindow } = require("./startup/bootstrapApplication.js");

/** @type {Record<string, import("electron").BrowserWindow | null>} */
const moduleWindowRefs = {
  workspace: null,
  knowledge: null,
  record: null,
};

const MODULE_META = {
  workspace: {
    title: "鲸落AI · 工作台",
    defaultRoute: "workbench",
    windowMode: "workspace",
    backgroundColor: "#dbeafe",
  },
  knowledge: {
    title: "鲸落AI · 本地知识库",
    defaultRoute: "knowledge-base",
    windowMode: "knowledge",
    backgroundColor: "#dbeafe",
  },
  record: {
    title: "鲸落AI · 会议记录",
    defaultRoute: "record",
    windowMode: "record",
    backgroundColor: "#eff6ff",
    width: 420,
    height: 600,
    minWidth: 380,
    minHeight: 480,
    frameless: true,
  },
};

const WORKSPACE_ROUTES = new Set([
  "workbench",
  "new",
  "filter",
  "dashboard",
  "list",
  "capability",
  "local-models",
]);

function resolveModuleKey(routeOrModule) {
  const raw = String(routeOrModule || "").trim();
  if (raw === "knowledge-base" || raw === "knowledge") {
    return "knowledge";
  }
  if (raw === "record" || raw === "recorder") {
    return "record";
  }
  if (MODULE_META[raw]) {
    return raw;
  }
  if (WORKSPACE_ROUTES.has(raw)) {
    return "workspace";
  }
  return "workspace";
}

function getModuleWindow(moduleKey) {
  const ref = moduleWindowRefs[moduleKey];
  return ref && !ref.isDestroyed() ? ref : null;
}

function createModuleBrowserWindow(moduleKey, meta) {
  const iconPath = resolveAppIconPath();
  const win = new BrowserWindow({
    width: meta.width || 1280,
    height: meta.height || 860,
    minWidth: meta.minWidth || 960,
    minHeight: meta.minHeight || 640,
    backgroundColor: meta.backgroundColor || "#dbeafe",
    autoHideMenuBar: true,
    title: meta.title,
    show: false,
    frame: !meta.frameless,
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "..", "preload.js"),
    },
  });

  win.once("ready-to-show", () => {
    if (!win.isDestroyed()) {
      win.show();
    }
  });

  win.on("closed", () => {
    if (moduleWindowRefs[moduleKey] === win) {
      moduleWindowRefs[moduleKey] = null;
    }
  });

  return win;
}

function openModuleWindow(options = {}) {
  const route = String(options.route || options.module || "workbench").trim() || "workbench";
  const moduleKey = resolveModuleKey(options.module || route);

  if (moduleKey === "record") {
    const legacyRecordWin = getModuleWindow("record");
    if (legacyRecordWin) {
      legacyRecordWin.close();
      moduleWindowRefs.record = null;
    }
    const host =
      BrowserWindow.getFocusedWindow()
      || getModuleWindow("workspace")
      || getMainWindow()
      || BrowserWindow.getAllWindows().find((win) => !win.isDestroyed());
    if (host) {
      if (host.isMinimized()) {
        host.restore();
      }
      host.focus();
      host.webContents.send("module-navigate", { module: "record", route: "record", overlay: true });
      return host;
    }
  }

  const meta = MODULE_META[moduleKey] || MODULE_META.workspace;
  const existing = getModuleWindow(moduleKey);

  if (existing) {
    if (existing.isMinimized()) {
      existing.restore();
    }
    existing.focus();
    existing.webContents.send("module-navigate", { module: moduleKey, route });
    return existing;
  }

  const win = createModuleBrowserWindow(moduleKey, meta);
  moduleWindowRefs[moduleKey] = win;

  win.loadFile(path.join(__dirname, "..", "index.html"), {
    query: {
      window: meta.windowMode,
      route: WORKSPACE_ROUTES.has(route) || moduleKey === "workspace" ? route : meta.defaultRoute,
    },
  });

  return win;
}

/** @deprecated 兼容旧调用 */
function openWorkbenchWindow(options = {}) {
  return openModuleWindow(options);
}

function getWorkbenchWindow() {
  return getModuleWindow("workspace");
}

function registerWorkbenchWindowIpc(ipcMain) {
  ipcMain.handle("workbench-window-open", (_event, payload) => {
    openModuleWindow(payload || {});
    return { ok: true };
  });
  ipcMain.handle("module-window-open", (_event, payload) => {
    openModuleWindow(payload || {});
    return { ok: true };
  });
  ipcMain.handle("module-window-fit-content", (event, payload) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) {
      return { ok: false };
    }
    const width = Math.min(1200, Math.max(380, Number(payload?.width) || 420));
    const height = Math.min(800, Math.max(480, Number(payload?.height) || 600));
    win.setContentSize(width, height);
    win.center();
    return { ok: true, width, height };
  });
}

module.exports = {
  openModuleWindow,
  openWorkbenchWindow,
  getModuleWindow,
  getWorkbenchWindow,
  registerWorkbenchWindowIpc,
};
