const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

function execFilePromise(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true, ...opts }, (err, stdout, stderr) => {
      if (err) {
        reject(err);
        return;
      }
      resolve({ stdout: String(stdout || ""), stderr: String(stderr || "") });
    });
  });
}

function parsePythonVersionOutput(stdout, command) {
  const lines = String(stdout || "")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  if (lines.length < 2) {
    return null;
  }
  const major = parseInt(lines[0], 10);
  const minor = parseInt(lines[1], 10);
  const micro = parseInt(lines[2] || "0", 10);
  if (!Number.isFinite(major)) {
    return null;
  }
  return {
    found: true,
    command,
    major,
    minor: Number.isFinite(minor) ? minor : 0,
    micro: Number.isFinite(micro) ? micro : 0,
    versionStr: `${major}.${Number.isFinite(minor) ? minor : 0}.${Number.isFinite(micro) ? micro : 0}`,
  };
}

async function detectPythonVersion() {
  const script = "import sys;print(sys.version_info[0]);print(sys.version_info[1]);print(sys.version_info[2])";
  const candidates =
    process.platform === "win32"
      ? [
          ["py", ["-3", "-c", script]],
          ["python", ["-c", script]],
          ["python3", ["-c", script]],
        ]
      : [
          ["python3", ["-c", script]],
          ["python", ["-c", script]],
        ];
  for (const [cmd, args] of candidates) {
    try {
      const { stdout } = await execFilePromise(cmd, args, { timeout: 12000 });
      const parsed = parsePythonVersionOutput(stdout, cmd);
      if (parsed) {
        return parsed;
      }
    } catch {
      /* try next */
    }
  }
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || "";
    const programFiles = process.env.ProgramFiles || "C:\\Program Files";
    const extraExes = [
      path.join(localAppData, "Programs", "Python", "Python312", "python.exe"),
      path.join(localAppData, "Programs", "Python", "Python311", "python.exe"),
      path.join(programFiles, "Python312", "python.exe"),
      path.join(programFiles, "Python311", "python.exe"),
    ];
    for (const exe of extraExes) {
      if (!fs.existsSync(exe)) {
        continue;
      }
      try {
        const { stdout } = await execFilePromise(exe, ["-c", script], { timeout: 12000 });
        const parsed = parsePythonVersionOutput(stdout, exe);
        if (parsed) {
          return parsed;
        }
      } catch {
        /* try next */
      }
    }
  }
  return { found: false, command: "", major: 0, minor: 0, micro: 0, versionStr: "" };
}

function loadPrerequisitesManifest(appRoot) {
  const roots = [appRoot, process.cwd()].filter(Boolean);
  for (const root of roots) {
    const p = path.join(root, "prerequisites-manifest.json");
    if (fs.existsSync(p)) {
      try {
        const j = JSON.parse(fs.readFileSync(p, "utf8"));
        return j && typeof j === "object" ? j : { version: 1, plugins: [] };
      } catch {
        return { version: 1, plugins: [], parseError: p };
      }
    }
  }
  return { version: 1, plugins: [] };
}

/**
 * @param {{ appPath: string }} ctx
 */
async function evaluateRuntimePrerequisites(ctx) {
  const manifest = loadPrerequisitesManifest(ctx.appPath);
  const issues = [];
  const python = await detectPythonVersion();

  if (!python.found) {
    issues.push({
      id: "python_missing",
      severity: "warn",
      title: "未检测到 Python",
      detail:
        "本机未在 PATH 中找到 Python 3.11–3.12。无 winget 时将自动下载安装包（含国内镜像）；若静默安装失败会弹出安装窗口，请勾选 Add to PATH 后点「重新检测」。",
      remediateType: "winget_install",
      remediateUrl: "https://www.python.org/downloads/release/python-31211/",
      autoAvailable: false,
    });
  } else if (python.major === 3 && python.minor >= 13) {
    issues.push({
      id: "python_high_version",
      severity: "warn",
      title: `Python ${python.versionStr} 版本偏高`,
      detail:
        "Python 3.13 上许多带 C/Cython 扩展的包尚无预编译 wheel，pip 容易编译失败。建议安装 Python 3.12。",
      remediateType: "winget_install",
      remediateUrl: "https://www.python.org/downloads/release/python-31211/",
      autoAvailable: false,
    });
  }

  return {
    ok: true,
    evaluatedAt: new Date().toISOString(),
    healthy: issues.length === 0,
    manifestVersion: manifest.version || 1,
    python,
    issues,
    plugins: Array.isArray(manifest.plugins) ? manifest.plugins : [],
  };
}

module.exports = {
  evaluateRuntimePrerequisites,
  loadPrerequisitesManifest,
  detectPythonVersion,
};
