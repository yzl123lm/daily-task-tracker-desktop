const fs = require("fs");
const path = require("path");

function readPackageScripts(rootDir) {
  const pkgPath = path.join(rootDir, "package.json");
  if (!fs.existsSync(pkgPath)) {
    return { scripts: {}, hasPackageJson: false };
  }
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  } catch {
    return { scripts: {}, hasPackageJson: true, error: "package.json 解析失败" };
  }
  return { scripts: pkg.scripts || {}, hasPackageJson: true, name: pkg.name };
}

function resolveScriptCommand(rootDir, scriptName) {
  const name = String(scriptName || "").trim();
  const { scripts, hasPackageJson } = readPackageScripts(rootDir);
  if (!hasPackageJson) {
    return {
      ok: false,
      skipped: true,
      message: "当前为非 Node 项目（无 package.json），已跳过 npm 验证",
    };
  }
  if (!scripts[name]) {
    return {
      ok: false,
      skipped: true,
      message: `当前项目未配置脚本 ${name}，已跳过验证`,
    };
  }
  let pm = "npm";
  try {
    const { detectPackageManager } = require("./repoProfileService.js");
    pm = detectPackageManager(rootDir).id || "npm";
  } catch {
    pm = "npm";
  }
  const command =
    pm === "pnpm"
      ? `pnpm run ${name}`
      : pm === "yarn"
        ? `yarn ${name}`
        : pm === "bun"
          ? `bun run ${name}`
          : `npm run ${name}`;
  return { ok: true, command, scriptName: name, script: scripts[name], packageManager: pm };
}

function listVerificationScripts(rootDir) {
  const { scripts } = readPackageScripts(rootDir);
  const preferred = ["build", "test", "lint", "typecheck", "type-check"];
  return preferred
    .filter((n) => scripts[n])
    .map((n) => ({ name: n, command: `npm run ${n}` }));
}

module.exports = {
  readPackageScripts,
  resolveScriptCommand,
  listVerificationScripts,
};
