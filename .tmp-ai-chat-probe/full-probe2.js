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
  w.webContents.on("console-message", (_e, _l, msg, line, source) => {
    console.log("RENDER:", msg, String(source) + ":" + line);
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
  await new Promise((r) => setTimeout(r, 5000));
  const checks = await probeWin.webContents.executeJavaScript(`(() => {
    const o = {};
    o.typeofCrypto = typeof crypto;
    o.typeofWindowCrypto = typeof window.crypto;
    o.typeofGlobalThisCrypto = typeof globalThis.crypto;
    try { o.uuid = crypto.randomUUID(); } catch (e) { o.uuidErr = e.name + ": " + e.message; }
    try { o.gtUuid = globalThis.crypto.randomUUID(); } catch (e) { o.gtErr = e.name + ": " + e.message; }
    o.hasElectronAPI = !!window.electronAPI;
    o.hasAiChat = !!(window.electronAPI && window.electronAPI.aiChat);
    o.KbPromptSafety = typeof window.KbPromptSafety;
    o.getAISkillTools = typeof window.getAISkillTools;
    return o;
  })()`);
  console.log("CHECKS=" + JSON.stringify(checks, null, 2));
  const chat = await probeWin.webContents.executeJavaScript(`
    (async () => {
      try {
        const r = await window.electronAPI.aiChat({
          messages: [
            { role: "system", content: "一句话回答" },
            { role: "user", content: "你好" }
          ],
          webSearch: false,
          requestId: "p2-" + Date.now()
        });
        return { ok: true, content: String(r.content||"").slice(0,200) };
      } catch (e) {
        return { ok: false, message: e.message, stack: String(e.stack||"").slice(0,800) };
      }
    })()
  `);
  console.log("CHAT=" + JSON.stringify(chat, null, 2));
  app.exit(0);
});
