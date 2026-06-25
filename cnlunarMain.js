const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

function resolveBundledCnlunarScript(appPathGetter) {
  const roots = [process.cwd(), typeof appPathGetter === "function" ? appPathGetter() : "", path.dirname(process.execPath || "")]
    .filter(Boolean);
  for (const root of roots) {
    const p = path.join(root, "scripts", "cnlunar_query.py");
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

/**
 * 将脚本复制到 userData 真实路径，避免安装包在 app.asar 内时 Python 无法读取。
 */
function ensureCnlunarRuntimeScript(ctx) {
  const src = resolveBundledCnlunarScript(ctx?.getAppPath);
  if (!src) {
    return null;
  }
  const ud = typeof ctx?.getUserDataPath === "function" ? ctx.getUserDataPath() : "";
  if (!ud) {
    return src;
  }
  const dir = path.join(ud, "cnlunar-runtime");
  const dest = path.join(dir, "cnlunar_query.py");
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(src, dest);
    return dest;
  } catch {
    return src;
  }
}

function pythonCommandAndArgs(scriptPath) {
  if (process.platform === "win32") {
    return { cmd: "py", args: ["-3", scriptPath] };
  }
  return { cmd: "python3", args: [scriptPath] };
}

/**
 * @param {object} payload { year, month, day, hour?, minute?, second?, godType? }
 * @param {{ getAppPath: () => string }} ctx
 * @param {{ timeoutMs?: number }} opts
 */
function runCnlunarQuery(payload, ctx, { timeoutMs = 45000 } = {}) {
  const scriptPath = ensureCnlunarRuntimeScript(ctx);
  if (!scriptPath) {
    return Promise.resolve({
      ok: false,
      error: "未找到 scripts/cnlunar_query.py（请确认应用包内包含该脚本）。",
    });
  }
  const { cmd, args } = pythonCommandAndArgs(scriptPath);
  const input = JSON.stringify(payload && typeof payload === "object" ? payload : {});

  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    let settled = false;
    const t = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      resolve({ ok: false, error: `cnlunar 查询超时（>${timeoutMs}ms）` });
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (c) => {
      out += c;
    });
    child.stderr.on("data", (c) => {
      err += c;
    });
    child.on("error", (e) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(t);
      resolve({
        ok: false,
        error: `无法启动 Python（${cmd}）：${e?.message || e}。请安装 Python 3 并执行 pip install cnlunar。`,
        stderr: err.trim(),
      });
    });
    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(t);
      const trimmed = out.trim();
      try {
        const j = JSON.parse(trimmed || "{}");
        if (j && typeof j === "object" && ("ok" in j || j.result)) {
          resolve(j);
          return;
        }
      } catch (e) {
        resolve({
          ok: false,
          error: `解析 cnlunar 输出失败：${e?.message || e}`,
          raw: trimmed.slice(0, 2000),
          stderr: err.trim(),
        });
        return;
      }
      resolve({
        ok: false,
        error: `cnlunar 无有效输出（exit ${code}）`,
        stderr: err.trim(),
      });
    });
    child.stdin.write(input, "utf8");
    child.stdin.end();
  });
}

module.exports = { runCnlunarQuery, resolveBundledCnlunarScript, ensureCnlunarRuntimeScript };
