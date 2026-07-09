const { app, ipcMain } = require("electron");
const path = require("path");

// Boot real app modules by requiring main after setting userData
app.setPath("userData", path.join(process.env.APPDATA, "daily-task-tracker-desktop"));

app.whenReady().then(async () => {
  try {
    // Require after ready so electron APIs work
    require(path.join(__dirname, "..", "main.js"));
  } catch (e) {
    // main.js may start app lifecycle; ignore duplicate
    console.log("require main note:", e.message);
  }
  // Give handlers a moment
  setTimeout(async () => {
    try {
      const handlers = ipcMain._invokeHandlers || ipcMain._events;
      console.log("has ai-chat handler?", typeof ipcMain.listenerCount === "function" ? ipcMain.listenerCount("ai-chat") : "n/a");
      // Directly call by re-requiring pieces
      const { getActiveProfileCredentials } = require("../main/aiSessionStore.js");
      const cred = getActiveProfileCredentials();
      console.log("cred", { model: cred.model, baseUrl: cred.baseUrl, hasKey: !!cred.apiKey });
      // Call buildWebSearchBlock path via fetch to minimax? Instead invoke internal by evaluating
      // Use ipcMain.emit won't work for handle. Use webContents invoke from hidden window.
      const { BrowserWindow } = require("electron");
      const w = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, "..", "preload.js") } });
      await w.loadURL("about:blank");
      const result = await w.webContents.executeJavaScript(`
        (async () => {
          try {
            const r = await window.electronAPI.aiChat({
              messages: [{ role: "user", content: "南宁市中心有什么比较出名的美食吗？" }],
              webSearch: true,
              webSearchQuery: "南宁市中心有什么比较出名的美食吗？"
            });
            return { ok: true, content: String(r.content||"").slice(0,200) };
          } catch (e) {
            return { ok: false, message: e.message, name: e.name, stack: String(e.stack||"").slice(0,500) };
          }
        })()
      `);
      console.log("RESULT", JSON.stringify(result, null, 2));
    } catch (e) {
      console.log("PROBEERR", e.message, e.stack);
    } finally {
      app.exit(0);
    }
  }, 2500);
});
