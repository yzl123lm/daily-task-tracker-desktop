const path = require("path");
const fs = require("fs");
const { BrowserWindow } = require("electron");

function resolveAppIconPath() {
  const candidates = [
    path.join(__dirname, "..", "build", "icon.ico"),
    path.join(process.resourcesPath, "icon.ico"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return "";
}

const { KB_CONFIG_LAYOUT } = require("../utils/kbConfigLayout.js");

function createWindow(options = {}) {
  const showOnReady = options.showOnReady !== false;
  const windowMode = options.windowMode === "workbench" ? "workbench" : "ai";
  const iconPath = resolveAppIconPath();
  const mainWindow = new BrowserWindow({
    width: KB_CONFIG_LAYOUT.window.defaultWidth,
    height: KB_CONFIG_LAYOUT.window.defaultHeight,
    minWidth: KB_CONFIG_LAYOUT.window.minWidth,
    minHeight: KB_CONFIG_LAYOUT.window.minHeight,
    backgroundColor: KB_CONFIG_LAYOUT.window.backgroundColor,
    autoHideMenuBar: true,
    title: windowMode === "workbench" ? "鲸落AI · 工作台" : "鲸落AI",
    show: false,
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "..", "preload.js"),
    },
  });

  mainWindow.once("ready-to-show", () => {
    if (showOnReady && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });

  mainWindow.webContents.on("did-fail-load", (_event, code, desc, url) => {
    console.error(`[window] did-fail-load ${code} ${desc} ${url}`);
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error(`[window] render-process-gone ${details.reason || ""} exit=${details.exitCode}`);
  });

  if (process.env.JINGLUO_DEVTOOLS === "1") {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.loadFile(path.join(__dirname, "..", "index.html"), {
    query: { window: windowMode },
  });
  return mainWindow;
}

module.exports = { createWindow, resolveAppIconPath };
