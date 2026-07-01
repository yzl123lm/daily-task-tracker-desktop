const { BrowserWindow } = require("electron");

function registerWindowChromeHandlers(ipcMain) {
  ipcMain.handle("window-chrome-minimize", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      win.minimize();
    }
    return { ok: true };
  });

  ipcMain.handle("window-chrome-maximize", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
    return { ok: true, maximized: win?.isMaximized?.() ?? false };
  });

  ipcMain.handle("window-chrome-close", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      win.close();
    }
    return { ok: true };
  });

  ipcMain.handle("window-chrome-is-maximized", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return { maximized: !!(win && !win.isDestroyed() && win.isMaximized()) };
  });
}

module.exports = { registerWindowChromeHandlers };
