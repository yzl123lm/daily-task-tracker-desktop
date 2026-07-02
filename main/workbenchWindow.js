const path = require("path");
const { BrowserWindow } = require("electron");
const { resolveAppIconPath } = require("./window.js");

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
  },
  knowledge: {
    title: "鲸落AI · 本地知识库",
    defaultRoute: "knowledge-base",
    windowMode: "knowledge",
  },
  record: {
    title: "鲸落AI · 记录助手",
    defaultRoute: "record",
    windowMode: "record",
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
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#dbeafe",
    autoHideMenuBar: true,
    title: meta.title,
    show: false,
    frame: true,
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
}

module.exports = {
  openModuleWindow,
  openWorkbenchWindow,
  getModuleWindow,
  getWorkbenchWindow,
  registerWorkbenchWindowIpc,
};
