const { app, BrowserWindow } = require("electron");
const path = require("path");
process.env.JINGLUO_SKIP_STARTUP = "1";
app.setPath("userData", path.join(process.env.APPDATA, "daily-task-tracker-desktop"));
let probeWin = null;
const windowMod = require("../main/window.js");
windowMod.createWindow = function () {
  const w = new BrowserWindow({
    width: 1100, height: 800, show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "..", "preload.js"),
    },
  });
  w.loadFile(path.join(__dirname, "..", "index.html"), { query: { window: "ai" } });
  probeWin = w;
  return w;
};
app.whenReady().then(async () => {
  require("../main.js");
  for (let i = 0; i < 100 && !probeWin; i++) await new Promise((r) => setTimeout(r, 100));
  await new Promise((resolve) => {
    probeWin.webContents.once("did-finish-load", resolve);
    setTimeout(resolve, 20000);
  });
  await new Promise((r) => setTimeout(r, 3000));
  const checks = await probeWin.webContents.executeJavaScript(`(() => {
    const o = {};
    o.typeofCrypto = typeof crypto;
    try { o.uuid = crypto.randomUUID(); } catch (e) { o.uuidErr = e.message; }
    o.KbPromptSafety = typeof window.KbPromptSafety;
    o.KbPromptBuilder = typeof window.KbPromptBuilder;
    o.hasAiChat = !!(window.electronAPI && window.electronAPI.aiChat);
    return o;
  })()`);
  console.log("CHECKS=" + JSON.stringify(checks));
  const chat = await probeWin.webContents.executeJavaScript(`
    (async () => {
      try {
        const r = await window.electronAPI.aiChat({
          messages: [
            { role: "system", content: "一句话回答" },
            { role: "user", content: "南宁有什么美食？" }
          ],
          webSearch: false,
          requestId: "p3-" + Date.now()
        });
        return { ok: true, content: String(r.content||"").slice(0,200) };
      } catch (e) {
        return { ok: false, message: e.message, stack: String(e.stack||"").slice(0,500) };
      }
    })()
  `);
  console.log("CHAT=" + JSON.stringify(chat));
  app.exit(chat && chat.ok ? 0 : 1);
});
