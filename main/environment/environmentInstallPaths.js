const fs = require("fs");
const path = require("path");
const os = require("os");

const PATHS_FILENAME = "environment-install-paths.json";

function listFixedDriveRoots() {
  const roots = [];
  if (process.platform === "win32") {
    for (let code = 65; code <= 90; code += 1) {
      const letter = String.fromCharCode(code);
      const root = `${letter}:\\`;
      try {
        if (fs.existsSync(root) && fs.statSync(root).isDirectory()) {
          roots.push(root);
        }
      } catch {
        /* ignore */
      }
    }
    return roots;
  }
  const home = os.homedir();
  if (home) {
    roots.push(home);
  }
  return roots;
}

function pickPreferredBaseDir() {
  const drives = listFixedDriveRoots();
  const nonC = drives.find((d) => !/^c:\\$/i.test(d));
  if (nonC) {
    return path.join(nonC, "JingluoAI");
  }
  const home = os.homedir();
  if (home) {
    return path.join(home, "JingluoAI");
  }
  return "D:\\JingluoAI";
}

function normalizeInstallDir(raw) {
  const t = String(raw || "").trim();
  if (!t) {
    return "";
  }
  return path.normalize(t.replace(/[/\\]+$/, ""));
}

function hasNonAsciiPathSegment(dirPath) {
  return /[^\x00-\x7f]/.test(String(dirPath || ""));
}

function getPathsFile(userDataPath) {
  return path.join(String(userDataPath || ""), PATHS_FILENAME);
}

function readInstallPathsFile(userDataPath) {
  const p = getPathsFile(userDataPath);
  if (!fs.existsSync(p)) {
    return null;
  }
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return j && typeof j === "object" ? j : null;
  } catch {
    return null;
  }
}

function buildDefaultInstallPaths() {
  const base = pickPreferredBaseDir();
  return {
    pythonInstallDir: path.join(base, "Python312"),
    ollamaInstallDir: path.join(base, "Ollama"),
    ollamaModelsDir: path.join(base, "OllamaModels"),
    baseDir: base,
    onSystemDrive: /^[cC]:/.test(base),
  };
}

function mergeInstallPaths(saved) {
  const defaults = buildDefaultInstallPaths();
  const merged = {
    pythonInstallDir: normalizeInstallDir(saved?.pythonInstallDir) || defaults.pythonInstallDir,
    ollamaInstallDir: normalizeInstallDir(saved?.ollamaInstallDir) || defaults.ollamaInstallDir,
    ollamaModelsDir: normalizeInstallDir(saved?.ollamaModelsDir) || defaults.ollamaModelsDir,
    baseDir: defaults.baseDir,
    onSystemDrive:
      /^[cC]:/.test(saved?.pythonInstallDir || "") ||
      /^[cC]:/.test(saved?.ollamaInstallDir || "") ||
      /^[cC]:/.test(saved?.ollamaModelsDir || "") ||
      defaults.onSystemDrive,
    confirmedAt: saved?.confirmedAt || "",
  };
  return merged;
}

function readInstallPaths(userDataPath) {
  return mergeInstallPaths(readInstallPathsFile(userDataPath));
}

function writeInstallPaths(userDataPath, paths) {
  const merged = mergeInstallPaths(paths);
  const payload = {
    pythonInstallDir: merged.pythonInstallDir,
    ollamaInstallDir: merged.ollamaInstallDir,
    ollamaModelsDir: merged.ollamaModelsDir,
    confirmedAt: paths?.confirmedAt || new Date().toISOString(),
  };
  const p = getPathsFile(userDataPath);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(payload, null, 2), "utf8");
  return readInstallPaths(userDataPath);
}

function validateInstallPath(dirPath, { label = "目录", allowNonAscii = false } = {}) {
  const normalized = normalizeInstallDir(dirPath);
  if (!normalized) {
    throw new Error(`${label}不能为空`);
  }
  if (!path.isAbsolute(normalized)) {
    throw new Error(`${label}必须是绝对路径`);
  }
  if (process.platform === "win32" && !/^[a-zA-Z]:[\\/]/.test(normalized)) {
    throw new Error(`${label}格式无效，请使用如 D:\\JingluoAI\\Models 的路径`);
  }
  if (!allowNonAscii && hasNonAsciiPathSegment(normalized)) {
    throw new Error(`${label}请使用英文字符，避免中文路径导致 Ollama 无法读取模型`);
  }
  return normalized;
}

function validateInstallPaths(paths, kinds = {}) {
  const out = {};
  if (kinds.python) {
    out.pythonInstallDir = validateInstallPath(paths?.pythonInstallDir, {
      label: "Python 安装目录",
      allowNonAscii: true,
    });
  }
  if (kinds.ollama) {
    out.ollamaInstallDir = validateInstallPath(paths?.ollamaInstallDir, {
      label: "Ollama 安装目录",
      allowNonAscii: true,
    });
  }
  if (kinds.models) {
    out.ollamaModelsDir = validateInstallPath(paths?.ollamaModelsDir, {
      label: "大模型存储目录",
      allowNonAscii: false,
    });
  }
  return out;
}

function deriveInstallPathKinds(profile) {
  const issues = Array.isArray(profile?.issues) ? profile.issues : [];
  const ids = new Set(issues.map((i) => i.id));
  return {
    python: ids.has("python_missing") || ids.has("python_high_version"),
    ollama: ids.has("ollama_missing") || ids.has("ollama_not_running"),
    models:
      ids.has("bge_m3_missing") ||
      ids.has("chat_model_missing") ||
      ids.has("rerank_cache_missing") ||
      ids.has("ollama_models_path_unsafe"),
  };
}

function ensureInstallDirectories(paths, kinds = {}) {
  const created = [];
  const entries = [
    kinds.python && paths.pythonInstallDir,
    kinds.ollama && paths.ollamaInstallDir,
    kinds.models && paths.ollamaModelsDir,
  ].filter(Boolean);
  for (const dir of entries) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      created.push(dir);
    }
  }
  return created;
}

module.exports = {
  PATHS_FILENAME,
  listFixedDriveRoots,
  pickPreferredBaseDir,
  buildDefaultInstallPaths,
  readInstallPaths,
  writeInstallPaths,
  validateInstallPaths,
  deriveInstallPathKinds,
  ensureInstallDirectories,
  normalizeInstallDir,
  hasNonAsciiPathSegment,
};
