const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile, spawn } = require("child_process");
const { shell, net } = require("electron");
const { readOllamaSettings, normalizeOllamaHost, buildOllamaHardwareRecommendPayload } = require("../ollamaRuntime.js");
const { probeOllamaApi, fetchOllamaModelTags } = require("./ollamaInstallProbe.js");
const { probeRerankReadiness } = require("./rerankCacheProbe.js");
const {
  REQUIRED_EMBED_MODEL,
  modelInstalled,
  findInstalledEmbedModel,
  findInstalledChatModel,
  findInstalledRerankModel,
  isEmbedModelName,
  isRerankModelName,
} = require("./requiredModels.js");
const { loadEnvironmentManifest, sortRemediationIssues } = require("./EnvironmentReadinessManager.js");
const { detectPythonVersion } = require("../../runtimePrerequisites.js");

const OLLAMA_DEPENDENT_ACTIONS = new Set(["ollama_pull", "ollama_pull_recommended", "powershell_fix"]);
const INSTALLER_OK_EXIT_CODES = new Set([0, 3010]);

function isInstallerSuccessExit(code) {
  return code === null || INSTALLER_OK_EXIT_CODES.has(Number(code));
}

function resolveDownloadUrls(spec) {
  const urls = [];
  if (spec?.downloadUrl) {
    urls.push(String(spec.downloadUrl).trim());
  }
  if (Array.isArray(spec?.downloadUrls)) {
    spec.downloadUrls.forEach((u) => {
      const t = String(u || "").trim();
      if (t) {
        urls.push(t);
      }
    });
  }
  return [...new Set(urls)];
}

function validateWindowsInstallerFile(filePath, minBytes = 5_000_000) {
  const stat = fs.statSync(filePath);
  if (stat.size < minBytes) {
    throw new Error(`安装包体积异常（${stat.size} 字节），可能被网络拦截或下载不完整`);
  }
  const fd = fs.openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(2);
    fs.readSync(fd, buf, 0, 2, 0);
    if (buf[0] !== 0x4d || buf[1] !== 0x5a) {
      throw new Error("下载内容不是有效的 Windows 安装程序（缺少 PE 头）");
    }
  } finally {
    fs.closeSync(fd);
  }
}

async function isWingetAvailable() {
  if (process.platform !== "win32") {
    return false;
  }
  const candidates = ["winget"];
  const localAppData = process.env.LOCALAPPDATA || "";
  if (localAppData) {
    candidates.push(path.join(localAppData, "Microsoft", "WindowsApps", "winget.exe"));
  }
  for (const cmd of candidates) {
    try {
      await execFilePromise(cmd, ["--version"], { timeout: 15000 });
      return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

async function waitForPythonReady(spec, onProgress) {
  const maxMs = Number(spec?.postInstallPollMs) || 120000;
  const intervalMs = Number(spec?.postInstallPollIntervalMs) || 3000;
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const py = await detectPythonVersion();
    if (py.found && py.major === 3 && py.minor >= 11 && py.minor <= 12) {
      onProgress?.({ stage: "python_ready", message: `Python ${py.versionStr} 已就绪` });
      return py;
    }
    onProgress?.({ stage: "poll", message: "等待 Python 安装完成…" });
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

async function spawnInstallerAndWait(exePath, args, onProgress, label) {
  onProgress?.({ stage: "install", message: `正在安装 ${label || "组件"}（可能需要 UAC 确认）…` });
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(exePath, args, { detached: false, windowsHide: false, stdio: "ignore" });
    child.on("error", reject);
    child.on("close", (code) => resolve(code));
  });
  if (!isInstallerSuccessExit(exitCode)) {
    throw new Error(`安装程序退出码 ${exitCode}`);
  }
  return exitCode;
}

async function isOllamaApiReachable() {
  const host = normalizeOllamaHost(readOllamaSettings().host);
  const api = await probeOllamaApi(host, 2500);
  return api.reachable === true;
}

async function downloadFile(url, destPath, onProgress) {
  onProgress?.({ stage: "download", message: `正在下载…`, url });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 900000);
  const headers = {
    "User-Agent": "JingluoAI-EnvSetup/1.0 (Windows; Electron)",
  };
  try {
    const fetchImpl = typeof net?.fetch === "function" ? net.fetch.bind(net) : fetch;
    const res = await fetchImpl(url, { redirect: "follow", signal: controller.signal, headers });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, buf);
    onProgress?.({ stage: "download_done", message: "下载完成", path: destPath, url });
    return destPath;
  } catch (err) {
    const msg = String(err?.message || err || "fetch failed");
    if (/fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|AbortError|aborted|network|证书|certificate/i.test(msg)) {
      throw new Error(`${msg}（请检查网络；若无法访问 ollama.com，将自动尝试 GitHub 镜像或 winget）`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function downloadInstallerFile(spec, destPath, onProgress) {
  const urls = resolveDownloadUrls(spec);
  if (!urls.length) {
    throw new Error("未配置安装包下载地址");
  }
  const minBytes = Number(spec?.minBytes) || 5_000_000;
  let lastErr = null;
  for (const url of urls) {
    try {
      await downloadFile(url, destPath, onProgress);
      validateWindowsInstallerFile(destPath, minBytes);
      return destPath;
    } catch (err) {
      lastErr = err;
      onProgress?.({
        stage: "download_retry",
        message: `下载失败（${url}）：${err?.message || err}，尝试下一镜像…`,
      });
      try {
        if (fs.existsSync(destPath)) {
          fs.unlinkSync(destPath);
        }
      } catch {
        /* ignore */
      }
    }
  }
  throw lastErr || new Error("所有下载镜像均失败。请配置系统代理/VPN 后重试，或在 PowerShell 执行：winget install -e --id Ollama.Ollama");
}

async function tryStartOllamaApp(onProgress) {
  if (process.platform !== "win32") {
    return false;
  }
  const localAppData = String(process.env.LOCALAPPDATA || "").trim();
  if (!localAppData) {
    return false;
  }
  const candidates = [
    path.join(localAppData, "Programs", "Ollama", "Ollama.exe"),
    path.join(localAppData, "Programs", "Ollama", "ollama app.exe"),
  ];
  for (const exe of candidates) {
    if (!fs.existsSync(exe)) {
      continue;
    }
    onProgress?.({ stage: "start_ollama", message: "正在启动 Ollama…" });
    spawn(exe, [], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    return true;
  }
  return false;
}

async function waitForOllamaAfterInstall(spec, onProgress) {
  const host = normalizeOllamaHost(readOllamaSettings().host);
  await pollOllamaReady(
    host,
    Number(spec?.postInstallPollMs) || 60000,
    Number(spec?.pollIntervalMs) || 2000,
    onProgress
  );
}

async function installOllamaWindows(issue, ctx, onProgress) {
  const manifest = loadEnvironmentManifest(ctx.appPath);
  const installerId = issue.plugin?.installerId || "ollama_setup";
  const spec = manifest.installers?.[installerId];
  const wingetId = String(issue.plugin?.wingetId || "Ollama.Ollama").trim();
  if (!spec || process.platform !== "win32") {
    await shell.openExternal(issue.remediateUrl || issue.plugin?.url || "https://github.com/ollama/ollama/releases/latest");
    return { ok: true, manual: true };
  }

  if (issue.id === "ollama_not_running") {
    const started = await tryStartOllamaApp(onProgress);
    if (started) {
      try {
        await waitForOllamaAfterInstall(spec, onProgress);
        return { ok: true, method: "start_app" };
      } catch {
        onProgress?.({ stage: "start_retry", message: "自动启动未成功，尝试重新安装/修复 Ollama…" });
      }
    }
  }

  if (wingetId && (await isWingetAvailable())) {
    onProgress?.({ stage: "winget", message: `正在通过 winget 安装 ${wingetId}（不依赖 ollama.com 下载）…` });
    try {
      await execFilePromise(
        "winget",
        [
          "install",
          "-e",
          "--id",
          wingetId,
          "--accept-package-agreements",
          "--accept-source-agreements",
          "--disable-interactivity",
        ],
        { timeout: 900000 }
      );
      await waitForOllamaAfterInstall(spec, onProgress);
      return { ok: true, method: "winget" };
    } catch (err) {
      onProgress?.({
        stage: "winget_fallback",
        message: `winget 安装失败（${err?.message || err}），改从 GitHub 等镜像下载安装包…`,
      });
    }
  } else if (wingetId) {
    onProgress?.({
      stage: "winget_fallback",
      message: "本机未安装 winget，改从 GitHub 等镜像下载 Ollama 安装包…",
    });
  }

  const tempDir = path.join(os.tmpdir(), "jingluo-env-setup");
  const dest = path.join(tempDir, spec.filename || "OllamaSetup.exe");
  try {
    await downloadInstallerFile(spec, dest, onProgress);
    const args = Array.isArray(spec.silentArgs) ? spec.silentArgs : ["/S"];
    await spawnInstallerAndWait(dest, args, onProgress, "Ollama");
    await waitForOllamaAfterInstall(spec, onProgress);
    return { ok: true, method: "silent_installer" };
  } catch (installErr) {
    onProgress?.({
      stage: "installer_fallback",
      message: `自动安装未完成：${installErr?.message || installErr}。正在打开 GitHub 发布页，可手动下载安装。`,
    });
    await shell.openExternal("https://github.com/ollama/ollama/releases/latest");
    return {
      ok: true,
      manual: true,
      needsUserAction: true,
      error: String(installErr?.message || installErr),
    };
  }
}

async function runSilentInstaller(spec, onProgress, label, options = {}) {
  if (!spec || process.platform !== "win32") {
    return false;
  }
  const tempDir = path.join(os.tmpdir(), "jingluo-env-setup");
  const dest = path.join(tempDir, spec.filename || "installer.exe");
  await downloadInstallerFile(spec, dest, onProgress);

  const argSets = [];
  if (Array.isArray(spec.silentArgs) && spec.silentArgs.length) {
    argSets.push(spec.silentArgs);
  }
  if (Array.isArray(spec.passiveArgs) && spec.passiveArgs.length) {
    argSets.push(spec.passiveArgs);
  }
  if (!argSets.length) {
    argSets.push(["/S"]);
  }

  let lastInstallErr = null;
  for (const args of argSets) {
    try {
      await spawnInstallerAndWait(dest, args, onProgress, label);
      lastInstallErr = null;
      break;
    } catch (err) {
      lastInstallErr = err;
      onProgress?.({
        stage: "install_retry",
        message: `静默安装失败（${err?.message || err}），尝试下一种安装方式…`,
      });
    }
  }
  if (lastInstallErr) {
    if (options.allowInteractive !== false) {
      onProgress?.({
        stage: "install_interactive",
        message: "正在打开安装程序窗口，请在本机完成 Python 安装并勾选 Add to PATH…",
      });
      await shell.openPath(dest);
      const py = await waitForPythonReady(spec, onProgress);
      if (py) {
        return { ok: true, method: "interactive_installer", path: dest };
      }
    }
    throw lastInstallErr;
  }

  const waitMs = Number(spec.postInstallWaitMs) || 0;
  if (waitMs > 0) {
    await new Promise((r) => setTimeout(r, waitMs));
  }
  if (options.verifyPython) {
    const py = await waitForPythonReady(spec, onProgress);
    if (!py) {
      if (options.allowInteractive !== false) {
        onProgress?.({
          stage: "install_interactive",
          message: "安装程序已执行但未检测到 Python，正在打开安装包供手动完成…",
        });
        await shell.openPath(dest);
        const manualPy = await waitForPythonReady(
          { ...spec, postInstallPollMs: Math.max(Number(spec.postInstallPollMs) || 0, 180000) },
          onProgress
        );
        if (manualPy) {
          return { ok: true, method: "interactive_installer", path: dest };
        }
      }
      throw new Error("安装后仍未检测到 Python 3.11–3.12");
    }
  }
  return { ok: true, method: "silent_installer", path: dest };
}

function execFilePromise(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true, ...opts }, (err, stdout, stderr) => {
      if (err) {
        reject(Object.assign(err, { stdout: String(stdout || ""), stderr: String(stderr || "") }));
        return;
      }
      resolve({ stdout: String(stdout || ""), stderr: String(stderr || "") });
    });
  });
}

async function pollOllamaReady(host, maxMs, intervalMs, onProgress) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const api = await probeOllamaApi(host, 2000);
    if (api.reachable) {
      onProgress?.({ stage: "ollama_ready", message: `Ollama 已就绪 ${api.version || ""}` });
      return api;
    }
    onProgress?.({ stage: "poll", message: "等待 Ollama 启动…" });
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Ollama 安装后未在预期时间内启动");
}

async function remediateDownloadInstaller(issue, ctx, onProgress) {
  const installerId = issue.plugin?.installerId || "ollama_setup";
  if (installerId === "ollama_setup" || issue.id === "ollama_missing" || issue.id === "ollama_not_running") {
    return installOllamaWindows(issue, ctx, onProgress);
  }
  const manifest = loadEnvironmentManifest(ctx.appPath);
  const spec = manifest.installers?.[installerId];
  if (!spec || process.platform !== "win32") {
    await shell.openExternal(issue.remediateUrl || issue.plugin?.url || "https://ollama.com/download");
    return { ok: true, manual: true };
  }
  const tempDir = path.join(os.tmpdir(), "jingluo-env-setup");
  const dest = path.join(tempDir, spec.filename || "OllamaSetup.exe");
  await downloadInstallerFile(spec, dest, onProgress);
  const args = Array.isArray(spec.silentArgs) ? spec.silentArgs : ["/S"];
  await spawnInstallerAndWait(dest, args, onProgress, "Ollama");
  const host = normalizeOllamaHost(readOllamaSettings().host);
  await pollOllamaReady(
    host,
    Number(spec.postInstallPollMs) || 60000,
    Number(spec.pollIntervalMs) || 2000,
    onProgress
  );
  return { ok: true };
}

async function resolveInstalledOllamaModel(host, modelName) {
  const name = String(modelName || "").trim();
  if (!name) {
    return { installed: false, resolved: "" };
  }
  let tags = null;
  try {
    tags = await fetchOllamaModelTags(host, { timeoutMs: 8000, retries: 3 });
  } catch {
    tags = null;
  }
  if (!tags) {
    return { installed: false, resolved: "" };
  }
  if (modelInstalled(tags, name)) {
    return { installed: true, resolved: name, tags };
  }
  if (isEmbedModelName(name)) {
    const found = findInstalledEmbedModel(tags);
    if (found) {
      return { installed: true, resolved: found, tags };
    }
  }
  if (isRerankModelName(name)) {
    const found = findInstalledRerankModel(tags);
    if (found) {
      return { installed: true, resolved: found, tags };
    }
  }
  return { installed: false, resolved: "", tags };
}

async function pullOllamaModelStream(modelName, onProgress) {
  const name = String(modelName || "").trim();
  if (!name) {
    throw new Error("模型名为空");
  }
  const host = normalizeOllamaHost(readOllamaSettings().host);
  const existing = await resolveInstalledOllamaModel(host, name);
  if (existing.installed) {
    const label = existing.resolved || name;
    onProgress?.({
      stage: "pull_skip",
      message: `本机已安装 ${label}，跳过下载`,
      model: label,
    });
    return { ok: true, model: label, skipped: true };
  }
  onProgress?.({ stage: "pull_start", message: `开始拉取 ${name}…` });
  const res = await fetch(`${host}/api/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, stream: true }),
  });
  if (!res.ok) {
    throw new Error(await res.text() || `HTTP ${res.status}`);
  }
  if (!res.body) {
    throw new Error("拉取失败：无响应流");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const t = line.trim();
      if (!t) {
        continue;
      }
      try {
        const j = JSON.parse(t);
        if (j.status) {
          onProgress?.({ stage: "pull", message: j.status, detail: j });
        }
      } catch {
        /* ignore */
      }
    }
  }
  onProgress?.({ stage: "pull_done", message: `${name} 拉取完成` });
  return { ok: true, model: name };
}

async function remediateOllamaPull(issue, _ctx, onProgress) {
  const model = issue.plugin?.model || REQUIRED_EMBED_MODEL;
  return pullOllamaModelStream(model, onProgress);
}

async function remediateOllamaPullRecommended(_issue, _ctx, onProgress) {
  let model = "llama3.2";
  try {
    const hw = await buildOllamaHardwareRecommendPayload();
    model = hw?.items?.[0]?.model || model;
  } catch {
    /* default */
  }
  const host = normalizeOllamaHost(readOllamaSettings().host);
  let tags = null;
  try {
    tags = await fetchOllamaModelTags(host, { timeoutMs: 8000, retries: 3 });
  } catch {
    tags = null;
  }
  const chatInstalled = tags ? findInstalledChatModel(tags) : "";
  if (chatInstalled) {
    onProgress?.({
      stage: "pull_skip",
      message: `本机已安装对话模型 ${chatInstalled}，跳过下载`,
      model: chatInstalled,
    });
    return { ok: true, model: chatInstalled, skipped: true };
  }
  const existing = await resolveInstalledOllamaModel(host, model);
  if (existing.installed) {
    onProgress?.({
      stage: "pull_skip",
      message: `本机已安装 ${existing.resolved || model}，跳过下载`,
      model: existing.resolved || model,
    });
    return { ok: true, model: existing.resolved || model, skipped: true };
  }
  onProgress?.({ stage: "recommend", message: `按硬件推荐拉取 ${model}…` });
  return pullOllamaModelStream(model, onProgress);
}

async function remediateHfPreloadRerank(_issue, ctx, onProgress) {
  onProgress?.({ stage: "rerank_preload", message: "正在预下载重排 ONNX 模型（约 570MB）…" });
  const { rerankDocuments } = require("../../utils/kbRerank.js");
  const out = await rerankDocuments({
    provider: "onnx",
    query: "warmup",
    documents: ["warmup passage for model download"],
    userDataPath: ctx.userDataPath,
    model: "bge-reranker-v2-m3",
  });
  onProgress?.({ stage: "rerank_done", message: `重排模型预加载完成（${out.provider}）` });
  return { ok: true, provider: out.provider };
}

async function remediatePowershellFix(_issue, ctx, onProgress) {
  if (process.platform !== "win32") {
    return { ok: false, error: "仅 Windows 支持路径修复脚本" };
  }
  const scriptPath = path.join(ctx.appPath, "scripts", "fix-ollama-models-path-win.ps1");
  if (!fs.existsSync(scriptPath)) {
    throw new Error("未找到 fix-ollama-models-path-win.ps1");
  }
  onProgress?.({ stage: "powershell", message: "正在修复 Ollama 模型路径…" });
  await execFilePromise(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
    { timeout: 600000 }
  );
  return { ok: true };
}

async function remediateWingetInstall(issue, ctx, onProgress) {
  const wingetId = issue.plugin?.wingetId;
  const manifest = loadEnvironmentManifest(ctx.appPath);
  const installerId = issue.plugin?.installerId;
  const spec = installerId ? manifest.installers?.[installerId] : null;
  const isPythonIssue = issue.id === "python_missing" || issue.id === "python_high_version";
  const isOllamaIssue = issue.id === "ollama_missing" || issue.id === "ollama_not_running";
  if (isOllamaIssue) {
    return installOllamaWindows(issue, ctx, onProgress);
  }
  if (!wingetId && !spec) {
    await shell.openExternal(issue.remediateUrl || issue.plugin?.url || "https://www.python.org/downloads/");
    return { ok: true, manual: true };
  }

  if (wingetId && (await isWingetAvailable())) {
    onProgress?.({ stage: "winget", message: `正在通过 winget 安装 ${wingetId}…` });
    try {
      await execFilePromise(
        "winget",
        [
          "install",
          "-e",
          "--id",
          wingetId,
          "--accept-package-agreements",
          "--accept-source-agreements",
          "--disable-interactivity",
        ],
        { timeout: 600000 }
      );
      if (isPythonIssue) {
        const py = await waitForPythonReady(spec || {}, onProgress);
        if (py) {
          return { ok: true, method: "winget" };
        }
      } else {
        return { ok: true, method: "winget" };
      }
    } catch (err) {
      onProgress?.({
        stage: "winget_fallback",
        message: `winget 安装失败（${err?.message || err}），改下载官方安装包…`,
      });
    }
  } else if (wingetId) {
    onProgress?.({
      stage: "winget_fallback",
      message: "本机未安装 winget（常见于精简版 Windows），改下载官方安装包…",
    });
  }

  if (spec) {
    try {
      const out = await runSilentInstaller(spec, onProgress, issue.plugin?.title || wingetId, {
        verifyPython: isPythonIssue,
        allowInteractive: true,
      });
      return { ok: true, method: out?.method || "silent_installer", path: out?.path };
    } catch (installErr) {
      onProgress?.({
        stage: "installer_fallback",
        message: `自动安装未完成：${installErr?.message || installErr}。请在已打开的安装窗口中手动完成，或从官网下载。`,
      });
      await shell.openExternal(issue.remediateUrl || issue.plugin?.url || "https://www.python.org/downloads/");
      return {
        ok: true,
        manual: true,
        needsUserAction: true,
        error: String(installErr?.message || installErr),
      };
    }
  }

  await shell.openExternal(issue.remediateUrl || "https://www.python.org/downloads/");
  return { ok: true, manual: true, needsUserAction: true };
}

async function remediateOpenUrl(issue) {
  const url = issue.remediateUrl || issue.plugin?.url;
  if (url) {
    await shell.openExternal(url);
  }
  return { ok: true, manual: true };
}

/**
 * 执行修复前预检：本机已有模型/重排就绪则跳过重复下载。
 */
async function shouldSkipRemediationIssue(issue, ctx) {
  const action = issue.remediateAction || issue.remediateType || "open_url";
  const host = normalizeOllamaHost(readOllamaSettings().host);

  if (issue.id === "rerank_cache_missing") {
    let tags = null;
    try {
      tags = await fetchOllamaModelTags(host, { timeoutMs: 8000, retries: 3 });
    } catch {
      tags = null;
    }
    const rerank = probeRerankReadiness(ctx.userDataPath, tags);
    if (rerank.ready) {
      const label =
        rerank.provider === "ollama" && rerank.ollamaRerankModel
          ? rerank.ollamaRerankModel
          : "重排模型";
      return {
        skip: true,
        message: `本机重排已就绪（${label}），跳过下载`,
        model: rerank.ollamaRerankModel || label,
      };
    }
    return { skip: false };
  }

  if (action === "ollama_pull") {
    const model = issue.plugin?.model || REQUIRED_EMBED_MODEL;
    const existing = await resolveInstalledOllamaModel(host, model);
    if (existing.installed) {
      return {
        skip: true,
        message: `本机已安装 ${existing.resolved || model}，跳过下载`,
        model: existing.resolved || model,
      };
    }
    return { skip: false };
  }

  if (action === "ollama_pull_recommended") {
    let tags = null;
    try {
      tags = await fetchOllamaModelTags(host, { timeoutMs: 8000, retries: 3 });
    } catch {
      tags = null;
    }
    const chatInstalled = tags ? findInstalledChatModel(tags) : "";
    if (chatInstalled) {
      return {
        skip: true,
        message: `本机已安装对话模型 ${chatInstalled}，跳过下载`,
        model: chatInstalled,
      };
    }
    return { skip: false };
  }

  return { skip: false };
}

/**
 * @param {object} issue enriched issue from evaluate
 * @param {{ appPath: string, userDataPath: string }} ctx
 * @param {(p: object) => void} [onProgress]
 */
async function executeRemediation(issue, ctx, onProgress) {
  const action = issue.remediateAction || issue.remediateType || "open_url";
  switch (action) {
    case "download_installer":
      return remediateDownloadInstaller(issue, ctx, onProgress);
    case "ollama_pull":
      return remediateOllamaPull(issue, ctx, onProgress);
    case "ollama_pull_recommended":
      return remediateOllamaPullRecommended(issue, ctx, onProgress);
    case "hf_preload_rerank":
      return remediateHfPreloadRerank(issue, ctx, onProgress);
    case "powershell_fix":
      return remediatePowershellFix(issue, ctx, onProgress);
    case "winget_install":
      return remediateWingetInstall(issue, ctx, onProgress);
    case "open_url":
    default:
      return remediateOpenUrl(issue);
  }
}

async function executeRemediationBatch(issues, ctx, onProgress) {
  const plan = sortRemediationIssues(issues);
  const results = [];
  let ollamaReady = await isOllamaApiReachable();

  for (const issue of plan) {
    const action = issue.remediateAction || issue.remediateType || "open_url";
    if (OLLAMA_DEPENDENT_ACTIONS.has(action) && !ollamaReady) {
      ollamaReady = await isOllamaApiReachable();
    }
    if (OLLAMA_DEPENDENT_ACTIONS.has(action) && !ollamaReady) {
      const msg = `${issue.title} → 已跳过（需先完成 Ollama 安装并启动）`;
      onProgress?.({ stage: "skip", issueId: issue.id, message: msg });
      results.push({ issueId: issue.id, ok: false, skipped: true, error: "Ollama 未就绪" });
      continue;
    }

    const preSkip = await shouldSkipRemediationIssue(issue, ctx);
    if (preSkip.skip) {
      onProgress?.({
        stage: "pull_skip",
        issueId: issue.id,
        message: `${issue.title} → ${preSkip.message}`,
        model: preSkip.model,
      });
      results.push({
        issueId: issue.id,
        ok: true,
        skipped: true,
        model: preSkip.model,
        message: preSkip.message,
      });
      continue;
    }

    onProgress?.({ stage: "issue_start", issueId: issue.id, message: issue.title });
    try {
      const out = await executeRemediation(issue, ctx, (p) =>
        onProgress?.({ ...p, issueId: issue.id })
      );
      results.push({ issueId: issue.id, ok: true, ...out });
      if (issue.id === "ollama_missing" || issue.id === "ollama_not_running") {
        ollamaReady = await isOllamaApiReachable();
      }
    } catch (err) {
      results.push({ issueId: issue.id, ok: false, error: String(err?.message || err) });
      if (issue.id === "ollama_missing" || issue.id === "ollama_not_running") {
        ollamaReady = false;
      }
    }
  }
  const hardFails = results.filter((r) => !r.ok && !r.skipped);
  return { ok: hardFails.length === 0, results };
}

module.exports = {
  executeRemediation,
  executeRemediationBatch,
  pullOllamaModelStream,
};
