/**
 * BL-009 / TOOL-004: Environment bootstrapper — lockfile-aware install, no silent upgrades.
 */
const fs = require("fs");
const path = require("path");
const { detectRepoProfile } = require("./repoProfileService.js");
const { assertCommandAllowed } = require("./commandPolicyService.js");
const { runInSandbox } = require("./sandbox/index.js");

function resolveInstallPlan(profile) {
  const pm = profile?.packageManager?.id;
  if (!pm) {
    if (profile?.python) {
      const req = profile.python.evidence?.find((e) => e.path === "requirements.txt");
      if (req) {
        return {
          ok: true,
          kind: "python-pip",
          argv: ["python", "-m", "pip", "install", "-r", "requirements.txt"],
          network: "allowlist",
          note: "使用 requirements.txt，不升级未锁定依赖以外的包",
        };
      }
      return { ok: false, code: "BOOTSTRAP_UNSUPPORTED", message: "Python 项目缺少 requirements.txt" };
    }
    return { ok: false, code: "BOOTSTRAP_NO_PM", message: "未检测到包管理器" };
  }

  if (pm === "pnpm") {
    return {
      ok: true,
      kind: "pnpm",
      argv: ["pnpm", "install", "--frozen-lockfile"],
      network: "allowlist",
      note: "frozen-lockfile：禁止静默升级",
    };
  }
  if (pm === "yarn") {
    return {
      ok: true,
      kind: "yarn",
      argv: ["yarn", "install", "--frozen-lockfile"],
      network: "allowlist",
      note: "frozen-lockfile：禁止静默升级",
    };
  }
  if (pm === "bun") {
    return {
      ok: true,
      kind: "bun",
      argv: ["bun", "install", "--frozen-lockfile"],
      network: "allowlist",
      note: "frozen-lockfile：禁止静默升级",
    };
  }
  // npm: prefer ci when lockfile present
  const hasLock = (profile.packageManager?.evidence || []).some((e) => e.path === "package-lock.json");
  return {
    ok: true,
    kind: "npm",
    argv: hasLock ? ["npm", "ci"] : ["npm", "install", "--no-save", "--no-package-lock"],
    network: "allowlist",
    note: hasLock ? "npm ci：严格按 package-lock.json" : "无 lockfile：install 且不写回 lock（避免静默升级）",
  };
}

/**
 * Bootstrap dependencies for a repo. Requires userApproved.
 * Network uses allowlist (registry hosts) — not open internet.
 */
async function bootstrapEnvironment(rootDir, { userApproved = false, timeoutMs = 600000 } = {}) {
  if (!userApproved) {
    const err = new Error("环境引导需要用户授权");
    err.code = "USER_APPROVAL_REQUIRED";
    throw err;
  }
  const root = path.resolve(String(rootDir || ""));
  if (!root || !fs.existsSync(root)) {
    const err = new Error("仓库目录不存在");
    err.code = "BOOTSTRAP_ROOT";
    throw err;
  }

  const profile = detectRepoProfile(root);
  const plan = resolveInstallPlan(profile);
  if (!plan.ok) {
    return { ok: false, skipped: false, profile, plan, message: plan.message };
  }

  const display = plan.argv.join(" ");
  assertCommandAllowed(display, { allowDangerous: true });

  // Ensure registry allowlist for bootstrap
  const prevPolicy = process.env.WB_NETWORK_POLICY;
  const prevAllow = process.env.WB_NETWORK_ALLOWLIST;
  if (!prevAllow) {
    process.env.WB_NETWORK_POLICY = "allowlist";
    process.env.WB_NETWORK_ALLOWLIST = [
      "registry.npmjs.org",
      "registry.npmmirror.com",
      "pypi.org",
      "files.pythonhosted.org",
      "repo.yarnpkg.com",
      "registry.yarnpkg.com",
    ].join(",");
  }

  try {
    const result = await runInSandbox({
      argv: plan.argv,
      cwd: root,
      network: "allowlist",
      timeoutMs,
    });
    return {
      ok: result.exitCode === 0,
      skipped: false,
      profile,
      plan,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      message:
        result.exitCode === 0
          ? `依赖已按锁文件恢复（${plan.kind}）`
          : `依赖安装失败 exit=${result.exitCode}`,
      evidence: [
        {
          type: "bootstrap_install",
          command: display,
          exitCode: result.exitCode,
          lockfilePolicy: plan.note,
          at: new Date().toISOString(),
        },
      ],
    };
  } finally {
    if (prevPolicy === undefined) delete process.env.WB_NETWORK_POLICY;
    else process.env.WB_NETWORK_POLICY = prevPolicy;
    if (prevAllow === undefined) delete process.env.WB_NETWORK_ALLOWLIST;
    else process.env.WB_NETWORK_ALLOWLIST = prevAllow;
  }
}

module.exports = {
  resolveInstallPlan,
  bootstrapEnvironment,
};
