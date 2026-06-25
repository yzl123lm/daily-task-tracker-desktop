const path = require("path");
const { BrowserWindow } = require("electron");
const { resolveAppIconPath } = require("../window.js");

/** @type {import("electron").BrowserWindow | null} */
let splashWindow = null;

function createSplashWindow(options = {}) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    return splashWindow;
  }
  const iconPath = resolveAppIconPath();
  const width = Number(options.width) || 520;
  const height = Number(options.height) || 400;
  splashWindow = new BrowserWindow({
    width,
    height,
    frame: false,
    resizable: false,
    center: true,
    show: false,
    alwaysOnTop: true,
    backgroundColor: "#07111f",
    title: "鲸落AI",
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "..", "..", "splash-preload.js"),
    },
  });
  splashWindow.loadFile(path.join(__dirname, "..", "..", "splash.html"));
  splashWindow.once("ready-to-show", () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.show();
    }
  });
  splashWindow.on("closed", () => {
    splashWindow = null;
  });
  return splashWindow;
}

/**
 * @param {import("electron").BrowserWindow | null | undefined} win
 * @param {object} payload
 */
function sendSplashProgress(win, payload) {
  const target = win && !win.isDestroyed() ? win : splashWindow;
  if (!target || target.isDestroyed()) {
    return;
  }
  target.webContents.send("startup-progress", payload || {});
}

function destroySplashWindow(win) {
  const target = win && !win.isDestroyed() ? win : splashWindow;
  if (target && !target.isDestroyed()) {
    target.close();
  }
  splashWindow = null;
}

function getSplashWindow() {
  return splashWindow;
}

module.exports = {
  createSplashWindow,
  sendSplashProgress,
  destroySplashWindow,
  getSplashWindow,
};
