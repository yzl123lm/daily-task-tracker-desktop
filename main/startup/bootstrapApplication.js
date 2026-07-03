const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const { createWindow } = require("../window.js");
const { createSplashWindow, sendSplashProgress, destroySplashWindow } = require("./splashWindow.js");
const { StartupWarmupManager } = require("./StartupWarmupManager.js");
const { createWarmupTasks } = require("./warmupTasks.js");
const startupConfig = require("./startupConfig.js");
const { readOllamaSettings, warmOllamaEmbedModel } = require("../ollamaRuntime.js");
const {
  buildStartupReport,
  setLastStartupReport,
  getLastStartupReport,
} = require("./startupReport.js");
const { EnvironmentReadinessManager } = require("../environment/EnvironmentReadinessManager.js");
const { applyFeatureDegradation } = require("../environment/featureGates.js");
const { readRuntimeProfile } = require("../environment/runtimeProfile.js");

/** @type {import("electron").BrowserWindow | null} */
let mainWindowRef = null;

function getMainWindow() {
  return mainWindowRef && !mainWindowRef.isDestroyed() ? mainWindowRef : null;
}

function shouldSkipStartup() {
  return (
    process.env.JINGLUO_SKIP_STARTUP === "1" ||
    startupConfig.startup?.enabled === false
  );
}

function readBootstrapPayload() {
  let version = "";
  try {
    version = app.getVersion();
  } catch {
    /* ignore */
  }
  if (!version) {
    try {
      version = require("../../package.json").version || "";
    } catch {
      version = "";
    }
  }
  let logoDataUrl = "";
  const installRoot = process.resourcesPath
    ? path.dirname(process.resourcesPath)
    : path.join(__dirname, "..", "..");
  const logoCandidates = [
    path.join(installRoot, "icon.png"),
    path.join(__dirname, "..", "..", "build", "icon.png"),
    path.join(__dirname, "..", "..", "assets", "icons", "app-icon.png"),
  ];
  for (const iconPath of logoCandidates) {
    if (!fs.existsSync(iconPath)) {
      continue;
    }
    try {
      const buf = fs.readFileSync(iconPath);
      logoDataUrl = `data:image/png;base64,${buf.toString("base64")}`;
      break;
    } catch {
      logoDataUrl = "";
    }
  }
  return {
    productName: startupConfig.startup?.productName || "鲸落AI",
    tagline: startupConfig.startup?.tagline || "智能工作助手",
    version,
    logoDataUrl,
  };
}

function scheduleDeferredRerankWarm(config, userDataPath) {
  const deferMs = Number(config?.warmup?.deferredRerankWarmMs) || 0;
  if (deferMs <= 0) {
    return;
  }
  setTimeout(() => {
    try {
      const { rerankDocuments } = require("../../utils/kbRerank.js");
      void rerankDocuments({
        userDataPath,
        host: readOllamaSettings().host,
        provider: "ollama",
        model: "dengcao/bge-reranker-v2-m3",
        query: "startup warm",
        documents: ["preload"],
        topN: 1,
      }).catch(() => {});
    } catch {
      /* optional background warm */
    }
  }, deferMs);
}

function deliverEnvironmentProfile(win, profile) {
  if (win && !win.isDestroyed() && profile) {
    win.webContents.send("environment-profile", profile);
  }
}

function shouldShowEnvironmentWizard(userDataPath) {
  const skipFlag = path.join(userDataPath, "environment-wizard-skipped.json");
  if (fs.existsSync(skipFlag)) {
    return false;
  }
  const profile = readRuntimeProfile(userDataPath);
  if (!profile) {
    return true;
  }
  return profile.core?.knowledgeBaseEmbedReady !== true && profile.core?.ollamaRunning !== true;
}

function deliverStartupReport(win, report) {
  setLastStartupReport(report);
  if (win && !win.isDestroyed()) {
    win.webContents.send("startup-report", report);
  }
}

function scheduleDeferredEmbedWarm(config) {
  const deferMs = Number(config?.warmup?.deferredEmbedWarmMs) || 0;
  if (deferMs <= 0) {
    return;
  }
  setTimeout(() => {
    try {
      const settings = readOllamaSettings();
      void warmOllamaEmbedModel(settings.host, "bge-m3", settings).catch(() => {});
    } catch {
      /* optional background warm */
    }
  }, deferMs);
}

/**
 * @param {import("electron").IpcMain} ipcMain
 */
function registerStartupIpc(ipcMain) {
  ipcMain.handle("startup-bootstrap", () => readBootstrapPayload());
  ipcMain.handle("startup-get-report", () => getLastStartupReport());
}

async function bootstrapApplication() {
  if (shouldSkipStartup()) {
    mainWindowRef = createWindow();
    deliverStartupReport(mainWindowRef, buildStartupReport({ skipped: true }));
    try {
      const userDataPath = app.getPath("userData");
      const envMgr = new EnvironmentReadinessManager({ appPath: app.getAppPath(), userDataPath });
      const { profile } = await envMgr.evaluate({ depth: "lite" });
      applyFeatureDegradation(profile, userDataPath);
      deliverEnvironmentProfile(mainWindowRef, profile);
    } catch {
      /* optional */
    }
    return mainWindowRef;
  }

  const config = startupConfig;
  const userDataPath = app.getPath("userData");
  const splash = createSplashWindow({
    width: config.startup?.width,
    height: config.startup?.height,
  });

  mainWindowRef = createWindow({ showOnReady: false });

  const manager = new StartupWarmupManager({
    config,
    tasks: createWarmupTasks({
      app,
      getMainWindow,
      userDataPath: app.getPath("userData"),
    }),
  });
  manager.onProgress = (payload) => sendSplashProgress(splash, payload);

  const minMs = Math.max(0, Number(config.startup?.minDisplayTime) || 1800);
  const maxMs = Math.max(minMs, Number(config.startup?.maxWaitTime) || 8000);

  const minTimer = new Promise((resolve) => setTimeout(resolve, minMs));
  const warmupRun = manager.run();
  let timedOut = false;
  const cappedWarmup = Promise.race([
    warmupRun,
    new Promise((resolve) => {
      setTimeout(() => {
        timedOut = true;
        resolve({ timedOut: true });
      }, maxMs);
    }),
  ]);

  const warmupOutcome = await Promise.all([minTimer, cappedWarmup]).then(([, outcome]) => outcome);

  const warmupResult =
    warmupOutcome && typeof warmupOutcome === "object" && Array.isArray(warmupOutcome.results)
      ? warmupOutcome
      : { ok: !timedOut, results: manager.getResults(), timedOut };

  const report = buildStartupReport({
    results: warmupResult.results,
    timedOut: !!warmupResult.timedOut,
    status: timedOut ? "warning" : undefined,
    message: timedOut ? "启动预热已超时，部分检查可能尚未完成" : undefined,
  });

  destroySplashWindow(splash);

  const win = getMainWindow();
  if (win) {
    win.show();
    win.focus();
  }

  deliverStartupReport(win, report);

  try {
    const envMgr = new EnvironmentReadinessManager({ appPath: app.getAppPath(), userDataPath });
    const { profile } = await envMgr.evaluate({ depth: "lite" });
    applyFeatureDegradation(profile, userDataPath);
    deliverEnvironmentProfile(win, profile);
    if (win && shouldShowEnvironmentWizard(userDataPath)) {
      win.webContents.send("environment-show-wizard", { reason: "not_ready", profile });
    }
  } catch {
    /* optional post-start env sync */
  }

  scheduleDeferredEmbedWarm(config);
  scheduleDeferredRerankWarm(config, userDataPath);
  return win;
}

module.exports = {
  bootstrapApplication,
  registerStartupIpc,
  getMainWindow,
  shouldSkipStartup,
};
