const path = require("path");
const fs = require("fs");
const { BrowserWindow, shell, dialog } = require("electron");
const { assertHttpUrl } = require("../../utils/ipcValidate.js");
const { EnvironmentReadinessManager } = require("../environment/EnvironmentReadinessManager.js");
const { executeRemediation, executeRemediationBatch } = require("../environment/remediationExecutor.js");
const { readRuntimeProfile } = require("../environment/runtimeProfile.js");
const { applyFeatureDegradation } = require("../environment/featureGates.js");
const { executeRemediation: execOne } = require("../environment/remediationExecutor.js");
const {
  readInstallPaths,
  writeInstallPaths,
  validateInstallPaths,
  deriveInstallPathKinds,
  ensureInstallDirectories,
  buildDefaultInstallPaths,
  listFixedDriveRoots,
} = require("../environment/environmentInstallPaths.js");

function createManager(app) {
  return new EnvironmentReadinessManager({
    appPath: app.getAppPath(),
    userDataPath: app.getPath("userData"),
  });
}

function broadcastProgress(event, payload) {
  if (event?.sender && !event.sender.isDestroyed()) {
    event.sender.send("environment-remediation-progress", payload);
  }
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed() && win.webContents !== event?.sender) {
      win.webContents.send("environment-remediation-progress", payload);
    }
  });
}

function registerEnvironmentHandlers(ipcMain, { app }) {
  const getCtx = () => ({
    appPath: app.getAppPath(),
    userDataPath: app.getPath("userData"),
  });

  function buildRemediationCtx(extra = {}) {
    const userDataPath = getCtx().userDataPath;
    const installPaths = extra.installPaths || readInstallPaths(userDataPath);
    return { ...getCtx(), installPaths, ...extra };
  }

  ipcMain.handle("environment-get-install-paths", () => {
    const userDataPath = getCtx().userDataPath;
    return {
      ok: true,
      paths: readInstallPaths(userDataPath),
      defaults: buildDefaultInstallPaths(),
      drives: listFixedDriveRoots(),
    };
  });

  ipcMain.handle("environment-choose-install-path", async (event, payload) => {
    const kind = String(payload?.kind || "").trim();
    const current = String(payload?.currentPath || "").trim();
    const win = BrowserWindow.fromWebContents(event.sender);
    const res = await dialog.showOpenDialog(win || undefined, {
      title:
        kind === "pythonInstallDir"
          ? "选择 Python 安装目录"
          : kind === "ollamaInstallDir"
            ? "选择 Ollama 安装目录"
            : "选择大模型存储目录",
      defaultPath: current || undefined,
      properties: ["openDirectory", "createDirectory"],
    });
    if (res.canceled || !res.filePaths?.length) {
      return { ok: false, canceled: true };
    }
    return { ok: true, path: res.filePaths[0], kind };
  });

  ipcMain.handle("environment-save-install-paths", (_event, payload) => {
    try {
      const kinds = payload?.kinds && typeof payload.kinds === "object" ? payload.kinds : {};
      const validated = validateInstallPaths(payload?.paths || {}, kinds);
      ensureInstallDirectories(validated, kinds);
      const saved = writeInstallPaths(getCtx().userDataPath, {
        ...validated,
        confirmedAt: new Date().toISOString(),
      });
      return { ok: true, paths: saved };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  });

  ipcMain.handle("runtime-prerequisites-open-url", async (_event, payload) => {
    try {
      const url = assertHttpUrl(payload?.url);
      await shell.openExternal(url);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e?.message || "无效 URL" };
    }
  });

  ipcMain.handle("environment-evaluate", async (_event, payload) => {
    const manager = createManager(app);
    const depth = payload?.depth === "full" ? "full" : "lite";
    const { report, profile } = await manager.evaluate({ depth });
    applyFeatureDegradation(profile, getCtx().userDataPath);
    return { report, profile };
  });

  ipcMain.handle("environment-get-profile", () => {
    const profile = readRuntimeProfile(getCtx().userDataPath);
    return profile;
  });

  ipcMain.handle("environment-should-show-wizard", () => {
    const userDataPath = getCtx().userDataPath;
    const skipFlag = path.join(userDataPath, "environment-wizard-skipped.json");
    if (fs.existsSync(skipFlag)) {
      return { show: false, reason: "skipped" };
    }
    const profile = readRuntimeProfile(userDataPath);
    if (!profile) {
      return { show: true, reason: "no_profile" };
    }
    if (profile.core?.knowledgeBaseEmbedReady !== true && profile.core?.ollamaRunning !== true) {
      return { show: true, reason: "not_ready" };
    }
    return { show: false, reason: "ready" };
  });

  ipcMain.handle("environment-wizard-skip", () => {
    const userDataPath = getCtx().userDataPath;
    const skipFlag = path.join(userDataPath, "environment-wizard-skipped.json");
    fs.writeFileSync(
      skipFlag,
      JSON.stringify({ skippedAt: new Date().toISOString() }, null, 2),
      "utf8"
    );
    return { ok: true };
  });

  ipcMain.handle("environment-remediate", async (event, payload) => {
    const issueId = String(payload?.issueId || "").trim();
    const manager = createManager(app);
    const { report } = await manager.evaluate({ depth: "lite" });
    const issue = (report.issues || []).find((i) => i.id === issueId);
    if (!issue) {
      return { ok: false, error: "未找到对应环境问题" };
    }
    try {
      const result = await executeRemediation(issue, buildRemediationCtx(payload), (p) =>
        broadcastProgress(event, p)
      );
      const after = await manager.evaluate({ depth: payload?.depth === "full" ? "full" : "lite" });
      applyFeatureDegradation(after.profile, getCtx().userDataPath);
      broadcastProgress(event, { stage: "done", issueId, result, profile: after.profile });
      return { ok: true, result, profile: after.profile };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  });

  ipcMain.handle("environment-remediate-batch", async (event, payload) => {
    const issueIds = Array.isArray(payload?.issueIds) ? payload.issueIds : [];
    const autoOnly = payload?.autoOnly !== false;
    const manager = createManager(app);
    const { report } = await manager.evaluate({ depth: "lite" });
    let plan = manager.buildRemediationPlan(issueIds.length ? issueIds : undefined);
    if (!plan.length) {
      plan = (report.issues || []).filter((i) => i.severity === "error" || i.severity === "warn");
    }
    if (autoOnly) {
      plan = plan.filter((i) => i.autoAvailable);
    }
    const batch = await executeRemediationBatch(plan, buildRemediationCtx(payload), (p) =>
      broadcastProgress(event, p)
    );
    const after = await manager.evaluate({ depth: "full" });
    applyFeatureDegradation(after.profile, getCtx().userDataPath);
    broadcastProgress(event, { stage: "batch_done", profile: after.profile, batch });
    return { ...batch, profile: after.profile };
  });

  ipcMain.handle("runtime-prerequisites-evaluate", async () => {
    const manager = createManager(app);
    const { report } = await manager.evaluate({ depth: "lite" });
    return {
      ok: report.ok,
      healthy: report.healthy,
      python: report.python,
      issues: report.issues,
      evaluatedAt: report.evaluatedAt,
      manifestVersion: report.manifestVersion,
      plugins: manager.getManifest().plugins || [],
    };
  });

  ipcMain.handle("runtime-prerequisites-remediate", async (event, payload) => {
    const issueId = String(payload?.issueId || "").trim();
    const manager = createManager(app);
    const { report } = await manager.evaluate({ depth: "lite" });
    const issue = (report.issues || []).find((i) => i.id === issueId);
    if (!issue) {
      return { ok: false, error: "未找到对应问题或请先执行环境评估" };
    }
    if (!issue.autoAvailable) {
      return { ok: false, error: "该问题需手动处理，请使用打开的说明页面。" };
    }
    try {
      const result = await execOne(issue, buildRemediationCtx(payload), (p) => broadcastProgress(event, p));
      const after = await manager.evaluate({ depth: "lite" });
      return { ok: true, result, after: after.report };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  });

  ipcMain.handle("runtime-prerequisites-remediate-auto", async (event) => {
    const manager = createManager(app);
    const before = await manager.evaluate({ depth: "lite" });
    let plan = manager.buildRemediationPlan();
    plan = plan.filter((i) => i.autoAvailable);
    const installResult =
      plan.length > 0
        ? await executeRemediationBatch(plan, buildRemediationCtx(), (p) => broadcastProgress(event, p))
        : null;
    const after = await manager.evaluate({ depth: "full" });
    applyFeatureDegradation(after.profile, getCtx().userDataPath);
    return { ok: true, before: before.report, after: after.report, installResult, profile: after.profile };
  });
}

module.exports = { registerEnvironmentHandlers };
