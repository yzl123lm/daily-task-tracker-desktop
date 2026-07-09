const { app, BrowserWindow } = require("electron");
const path = require("path");

process.env.JINGLUO_SKIP_STARTUP = "1";
app.setPath("userData", path.join(process.env.APPDATA, "daily-task-tracker-desktop"));

let probeWin = null;
const windowMod = require("../main/window.js");
windowMod.createWindow = function (options = {}) {
  const windowMode = options.windowMode === "workbench" ? "workbench" : "ai";
  const w = new BrowserWindow({
    width: 1100,
    height: 800,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "..", "preload.js"),
    },
  });
  w.loadFile(path.join(__dirname, "..", "index.html"), { query: { window: windowMode } });
  probeWin = w;
  return w;
};

app.whenReady().then(async () => {
  require("../main.js");
  for (let i = 0; i < 100 && !probeWin; i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!probeWin) {
    console.log("NO_WINDOW");
    app.exit(2);
    return;
  }
  await new Promise((resolve) => {
    if (!probeWin.webContents.isLoading()) return resolve();
    probeWin.webContents.once("did-finish-load", resolve);
    setTimeout(resolve, 20000);
  });
  await new Promise((r) => setTimeout(r, 4000));

  const result = await probeWin.webContents.executeJavaScript(`
    (async () => {
      const out = { steps: [] };
      try {
        out.steps.push("crypto=" + (typeof crypto));
        try { out.steps.push("uuid=" + crypto.randomUUID()); } catch (e) { out.steps.push("uuidERR=" + e.message); }
        out.steps.push("hasAPI=" + !!(window.electronAPI && window.electronAPI.aiChat));
        let tools = [];
        try { tools = window.getAISkillTools ? window.getAISkillTools() : []; } catch (e) { out.steps.push("toolsERR="+e.message); }
        out.steps.push("tools=" + tools.length);
        out.toolNames = tools.map(t => t && t.function && t.function.name).filter(Boolean).slice(0, 30);
        const r = await window.electronAPI.aiChat({
          messages: [
            { role: "system", content: "简短中文回答，不要调用工具" },
            { role: "user", content: "南宁市中心有什么比较出名的美食吗？" }
          ],
          webSearch: true,
          webSearchQuery: "南宁市中心有什么比较出名的美食吗？",
          tools,
          tool_choice: "auto",
          requestId: "probe-" + Date.now()
        });
        out.ok = true;
        out.content = String(r && r.content || "").slice(0, 300);
        const msg = r && r.raw && r.raw.choices && r.raw.choices[0] && r.raw.choices[0].message;
        out.toolCalls = msg && msg.tool_calls ? msg.tool_calls.map(t => t.function && t.function.name) : [];
        return out;
      } catch (e) {
        out.ok = false;
        out.message = e && e.message;
        out.name = e && e.name;
        out.stack = String(e && e.stack || "").slice(0, 1200);
        return out;
      }
    })()
  `);
  console.log("RESULT_JSON=" + JSON.stringify(result, null, 2));
  app.exit(0);
});
