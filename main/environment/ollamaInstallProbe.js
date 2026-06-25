const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { readOllamaSettings, normalizeOllamaHost } = require("../ollamaRuntime.js");

function execFilePromise(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true, ...opts }, (err, stdout) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(String(stdout || ""));
    });
  });
}

function hasNonAscii(str) {
  return /[^\x00-\x7F]/.test(String(str || ""));
}

function detectOllamaInstallPaths() {
  const candidates = [];
  if (process.platform === "win32") {
    candidates.push(
      path.join(process.env.LOCALAPPDATA || "", "Programs", "Ollama", "ollama.exe"),
      path.join(process.env.ProgramFiles || "", "Ollama", "ollama.exe"),
      path.join(process.env["ProgramFiles(x86)"] || "", "Ollama", "ollama.exe")
    );
  } else if (process.platform === "darwin") {
    candidates.push("/Applications/Ollama.app/Contents/Resources/ollama");
  } else {
    candidates.push("/usr/local/bin/ollama", "/usr/bin/ollama");
  }
  for (const p of candidates) {
    if (p && fs.existsSync(p)) {
      return { installed: true, path: p };
    }
  }
  return { installed: false, path: "" };
}

async function detectOllamaOnPath() {
  try {
    const cmd = process.platform === "win32" ? "where.exe" : "which";
    const arg = process.platform === "win32" ? ["ollama"] : ["ollama"];
    const out = await execFilePromise(cmd, arg, { timeout: 5000 });
    const line = out.split(/\r?\n/).find(Boolean);
    return line ? { onPath: true, path: line.trim() } : { onPath: false, path: "" };
  } catch {
    return { onPath: false, path: "" };
  }
}

async function probeOllamaApi(host, timeoutMs = 2500) {
  const base = normalizeOllamaHost(host || readOllamaSettings().host);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/api/version`, { signal: controller.signal });
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    if (!res.ok) {
      return { reachable: false, host: base, version: "", error: text || `HTTP ${res.status}` };
    }
    return { reachable: true, host: base, version: data?.version || "", error: "" };
  } catch (err) {
    return { reachable: false, host: base, version: "", error: String(err?.message || err) };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchOllamaTags(host, timeoutMs = 3000) {
  const base = normalizeOllamaHost(host);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/api/tags`, { signal: controller.signal });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(text || `HTTP ${res.status}`);
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

function probeOllamaModelsPathUnsafe() {
  const modelsPath = String(process.env.OLLAMA_MODELS || "").trim();
  if (modelsPath && hasNonAscii(modelsPath)) {
    return { unsafe: true, path: modelsPath, reason: "OLLAMA_MODELS 含非 ASCII 字符" };
  }
  if (process.platform === "win32") {
    const logPath = path.join(process.env.LOCALAPPDATA || "", "Ollama", "server.log");
    if (fs.existsSync(logPath)) {
      try {
        const tail = fs.readFileSync(logPath, "utf8").slice(-8000);
        const m = tail.match(/OLLAMA_MODELS:([^\s\]]+)/);
        if (m && hasNonAscii(m[1])) {
          return { unsafe: true, path: m[1], reason: "Ollama 日志中的模型路径含非 ASCII 字符" };
        }
      } catch {
        /* ignore */
      }
    }
  }
  return { unsafe: false, path: modelsPath, reason: "" };
}

async function probeOllamaEnvironment(options = {}) {
  const install = detectOllamaInstallPaths();
  const onPath = await detectOllamaOnPath();
  const api = await probeOllamaApi(options.host, options.apiTimeoutMs);
  const pathUnsafe = probeOllamaModelsPathUnsafe();
  let tags = null;
  if (api.reachable) {
    try {
      tags = await fetchOllamaTags(api.host, options.tagsTimeoutMs || 3000);
    } catch {
      tags = null;
    }
  }
  return {
    installed: install.installed || onPath.onPath,
    installPath: install.path || onPath.path,
    api,
    pathUnsafe,
    tags,
  };
}

module.exports = {
  probeOllamaEnvironment,
  probeOllamaApi,
  fetchOllamaTags,
  detectOllamaInstallPaths,
  probeOllamaModelsPathUnsafe,
};
