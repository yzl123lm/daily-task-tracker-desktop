const { listVerificationScripts } = require("./packageScriptService.js");

const BUILTIN_PROFILES = [
  {
    id: "build",
    scriptName: "build",
    description: "构建项目",
    timeoutMs: 300000,
    network: "deny",
    allowedExitCodes: [0],
  },
  {
    id: "test",
    scriptName: "test",
    description: "运行测试",
    timeoutMs: 300000,
    network: "deny",
    allowedExitCodes: [0],
  },
  {
    id: "lint",
    scriptName: "lint",
    description: "Lint 检查",
    timeoutMs: 180000,
    network: "deny",
    allowedExitCodes: [0],
  },
  {
    id: "typecheck",
    scriptName: "typecheck",
    description: "类型检查",
    timeoutMs: 180000,
    network: "deny",
    allowedExitCodes: [0],
  },
  {
    id: "static-smoke",
    scriptName: "static-smoke",
    description: "静态页/无 npm 脚本项目的入口文件冒烟（BL-003，禁止 skip 当完成）",
    timeoutMs: 30000,
    network: "deny",
    allowedExitCodes: [0],
    kind: "static_smoke",
  },
  {
    id: "web-http-smoke",
    scriptName: "web-http-smoke",
    description: "启动本地 HTTP 服务并做页面加载/DOM 冒烟（BL-011 / VER-004）",
    timeoutMs: 60000,
    network: "deny",
    allowedExitCodes: [0],
    kind: "web_http_smoke",
  },
  {
    id: "fullstack-smoke",
    scriptName: "fullstack-smoke",
    description: "Compose/全栈冒烟：临时服务 + 健康检查（BL-011 / VER-005）",
    timeoutMs: 300000,
    network: "allowlist",
    allowedExitCodes: [0],
    kind: "fullstack_smoke",
  },
];

function listProfiles(root) {
  const available = new Set(
    (listVerificationScripts(root) || []).map((s) => String(s.scriptName || s.name || s).toLowerCase())
  );
  return BUILTIN_PROFILES.map((p) => {
    const always =
      p.kind === "static_smoke" ||
      p.kind === "web_http_smoke" ||
      p.kind === "fullstack_smoke";
    return {
      ...p,
      available: always ? true : available.size === 0 ? true : available.has(p.scriptName),
      version: 1,
    };
  });
}

function getProfile(profileId) {
  const id = String(profileId || "").trim().toLowerCase();
  const found = BUILTIN_PROFILES.find((p) => p.id === id || p.scriptName === id);
  if (!found) {
    const err = new Error(`未知验证 profile: ${profileId}`);
    err.code = "VERIFY_PROFILE_UNKNOWN";
    throw err;
  }
  return { ...found, version: 1 };
}

function resolveProfileId(input) {
  if (!input) return "build";
  const raw = String(input).trim();
  // Reject command injection attempts — only profile ids
  if (/[;&|`$<>]/.test(raw) || /\s/.test(raw) || raw.includes("npm") || raw.includes("cmd")) {
    const err = new Error("VERIFY 仅允许 profileId，禁止任意命令");
    err.code = "VERIFY_PROFILE_INVALID";
    throw err;
  }
  return getProfile(raw).id;
}

module.exports = {
  BUILTIN_PROFILES,
  listProfiles,
  getProfile,
  resolveProfileId,
};
