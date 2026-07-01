const path = require("path");
const { BrowserWindow } = require("electron");
const { resolveAppIconPath } = require("./window.js");

/** @type {import("electron").BrowserWindow | null} */
let workbenchWindowRef = null;

function getWorkbenchWindow() {
  return workbenchWindowRef && !workbenchWindowRef.isDestroyed() ? workbenchWindowRef : null;
}

function openWorkbenchWindow(options = {}) {
  const route = String(options.route || options.module || "list").trim() || "list";
  const existing = getWorkbenchWindow();
  if (existing) {
    if (existing.isMinimized()) {
      existing.restore();
    }
    existing.focus();
    existing.webContents.send("workbench-navigate", { route });
    return existing;
  }

  const iconPath = resolveAppIconPath();
  workbenchWindowRef = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#06080f",
    autoHideMenuBar: true,
    title: "鲸落AI · 工作台",
    show: false,
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "..", "preload.js"),
    },
  });

  workbenchWindowRef.once("ready-to-show", () => {
    if (!workbenchWindowRef?.isDestroyed()) {
      workbenchWindowRef.show();
    }
  });

  workbenchWindowRef.on("closed", () => {
    workbenchWindowRef = null;
  });

  workbenchWindowRef.loadFile(path.join(__dirname, "..", "index.html"), {
    query: { window: "workbench", route },
  });

  return workbenchWindowRef;
}

function registerWorkbenchWindowIpc(ipcMain) {
  ipcMain.handle("workbench-window-open", (_event, payload) => {
    openWorkbenchWindow(payload || {});
    return { ok: true };
  });
}

module.exports = {
  openWorkbenchWindow,
  getWorkbenchWindow,
  registerWorkbenchWindowIpc,
};
