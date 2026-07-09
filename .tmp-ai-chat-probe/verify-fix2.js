const { app, BrowserWindow } = require("electron");
const path = require("path");
process.env.JINGLUO_SKIP_STARTUP = "1";
app.setPath("userData", path.join(process.env.APPDATA, "daily-task-tracker-desktop"));
let probeWin = null;
const windowMod = require("../main/window.js");
windowMod.createWindow = function () {
  const w = new BrowserWindow({
    width: 900, height: 700, show: false,
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
  await new Promise((r) => setTimeout(r, 2500));
  const checks = await probeWin.webContents.executeJavaScript(`(() => ({
    crypto: typeof crypto,
    uuid: (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : null,
    KbPromptSafety: typeof window.KbPromptSafety,
    KbPromptBuilder: typeof window.KbPromptBuilder,
    wrap: typeof window.KbPromptSafety?.wrapEvidenceBlocks
  }))()`);
  console.log("CHECKS=" + JSON.stringify(checks));
  const chat = await probeWin.webContents.executeJavaScript(`
    (async () => {
      try {
        const r = await window.electronAPI.aiChat({
          messages: [{ role: "user", content: "南宁有什么美食？一句话" }],
          webSearch: false,
          requestId: "p4-" + Date.now()
        });
        return { ok: true, content: String(r.content||"").slice(0,160) };
      } catch (e) {
        return { ok: false, message: e.message };
      }
    })()
  `);
  console.log("CHAT=" + JSON.stringify(chat));
  app.exit(checks.KbPromptSafety === "object" && chat.ok ? 0 : 1);
});
