const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * 授信工作区根目录：新建项目默认落在此目录下。
 * 可通过环境变量 WB_TRUSTED_WORKSPACE_ROOT 覆盖。
 */
function getTrustedWorkspaceBase(getUserDataPath) {
  const envRoot = String(process.env.WB_TRUSTED_WORKSPACE_ROOT || "").trim();
  if (envRoot) {
    return path.resolve(envRoot);
  }
  const fromUserData = path.join(
    typeof getUserDataPath === "function" ? getUserDataPath() : "",
    "trusted-workspace"
  );
  const candidates = [
    path.join("D:", "项目"),
    path.join(os.homedir(), "Documents", "项目"),
    fromUserData,
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return path.resolve(candidate);
    }
  }
  return path.resolve(candidates[0] || fromUserData);
}

function sanitizeProjectDirName(name) {
  const cleaned = String(name || "")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 80);
  return cleaned || "新项目";
}

function resolveNewProjectPath(base, projectName) {
  return path.join(path.resolve(base), sanitizeProjectDirName(projectName));
}

function ensureProjectDirectory(dir) {
  const resolved = path.resolve(String(dir || "").trim());
  if (!resolved) {
    throw new Error("项目路径无效");
  }
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

module.exports = {
  getTrustedWorkspaceBase,
  sanitizeProjectDirName,
  resolveNewProjectPath,
  ensureProjectDirectory,
};
