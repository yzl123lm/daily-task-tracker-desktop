const { resolveScriptCommand, listVerificationScripts } = require("./packageScriptService.js");
const { assertCommandAllowed } = require("./commandPolicyService.js");
const { runWhitelistedCommand } = require("./testRunnerService.js");
const { parseBuildError } = require("./parseBuildError.js");
const { resolveProjectRoot } = require("./projectCodeService.js");
const { getProject } = require("./projectService.js");
const { resolveUserId } = require("./projectService.js");
const {
  assertProjectAgentTool,
  recordToolOperation,
} = require("./toolPermissionService.js");
const { runStaticSmokeVerification } = require("./staticSmokeVerification.js");
const { runWebHttpSmokeVerification } = require("./webHttpSmokeVerification.js");
const { runFullstackSmokeVerification } = require("./fullstackSmokeVerification.js");

async function runVerification(
  getUserDataPath,
  userId,
  { projectId, taskId, scriptName = "build", profileId, userApproved },
  { getDefaultProjectRoot } = {}
) {
  if (!userApproved) {
    const err = new Error("验证命令需要用户授权 auto_verify");
    err.code = "USER_APPROVAL_REQUIRED";
    throw err;
  }
  const uid = resolveUserId(userId);
  const project = getProject(getUserDataPath, uid, projectId);
  if (!project) {
    throw new Error("项目不存在");
  }
  const root = resolveProjectRoot(project, getDefaultProjectRoot);
  if (!root) {
    throw new Error("未配置项目代码目录");
  }

  let resolvedName = scriptName;
  let useStaticSmoke = false;
  let useWebHttpSmoke = false;
  let useFullstackSmoke = false;
  if (profileId) {
    const { resolveProfileId, getProfile } = require("./verificationProfileRegistry.js");
    const id = resolveProfileId(profileId);
    const profile = getProfile(id);
    if (profile.kind === "static_smoke" || id === "static-smoke") {
      useStaticSmoke = true;
      resolvedName = "static-smoke";
    } else if (profile.kind === "web_http_smoke" || id === "web-http-smoke") {
      useWebHttpSmoke = true;
      resolvedName = "web-http-smoke";
    } else if (profile.kind === "fullstack_smoke" || id === "fullstack-smoke") {
      useFullstackSmoke = true;
      resolvedName = "fullstack-smoke";
    } else {
      resolvedName = profile.scriptName;
    }
  }
  const lowerName = String(resolvedName).toLowerCase();
  if (lowerName === "static-smoke") useStaticSmoke = true;
  if (lowerName === "web-http-smoke") useWebHttpSmoke = true;
  if (lowerName === "fullstack-smoke") useFullstackSmoke = true;

  if (useStaticSmoke) {
    const smoke = runStaticSmokeVerification(root);
    recordToolOperation(getUserDataPath, uid, {
      projectId,
      taskId,
      toolName: "run_tests",
      args: { profileId: "static-smoke", scriptName: "static-smoke" },
      resultText: smoke.message,
      riskLevel: "LOW",
      approvedByUser: true,
    });
    return smoke;
  }

  if (useWebHttpSmoke) {
    const smoke = await runWebHttpSmokeVerification(root);
    recordToolOperation(getUserDataPath, uid, {
      projectId,
      taskId,
      toolName: "run_tests",
      args: { profileId: "web-http-smoke", scriptName: "web-http-smoke" },
      resultText: smoke.message,
      riskLevel: "LOW",
      approvedByUser: true,
    });
    return smoke;
  }

  if (useFullstackSmoke) {
    const smoke = await runFullstackSmokeVerification(root, {
      taskId,
      userApproved: true,
    });
    recordToolOperation(getUserDataPath, uid, {
      projectId,
      taskId,
      toolName: "run_tests",
      args: { profileId: "fullstack-smoke", scriptName: "fullstack-smoke" },
      resultText: smoke.message,
      riskLevel: "MEDIUM",
      approvedByUser: true,
    });
    return smoke;
  }

  const resolved = resolveScriptCommand(root, resolvedName);
  if (!resolved.ok) {
    // BL-003: 禁止把「无脚本」当成验证通过；自动降级为静态冒烟（真实证据）
    const smoke = runStaticSmokeVerification(root);
    recordToolOperation(getUserDataPath, uid, {
      projectId,
      taskId,
      toolName: "run_tests",
      args: {
        profileId: "static-smoke",
        scriptName: resolvedName,
        fallbackFrom: resolved.message || "no_script",
      },
      resultText: smoke.message,
      riskLevel: "LOW",
      approvedByUser: true,
    });
    return {
      ...smoke,
      fallbackFrom: resolvedName,
      originalSkipReason: resolved.message || "已跳过验证",
    };
  }
  assertCommandAllowed(resolved.command);
  assertProjectAgentTool("run_tests", { userApproved: true });
  const result = await runWhitelistedCommand(root, resolved.command);
  const parsed = parseBuildError(`${result.stderr || ""}\n${result.stdout || ""}`);
  recordToolOperation(getUserDataPath, uid, {
    projectId,
    taskId,
    toolName: "run_tests",
    args: { command: resolved.command, scriptName: resolvedName, profileId: profileId || resolvedName },
    resultText: result.success ? "验证通过" : parsed.summary,
    riskLevel: "MEDIUM",
    approvedByUser: true,
  });
  if (!result.success && taskId) {
    try {
      const { recordErrorEvent } = require("./error-lessons/errorEventCollector.js");
      recordErrorEvent(getUserDataPath, uid, {
        projectId,
        taskId,
        source: "verify",
        stdout: result.stdout,
        stderr: result.stderr,
        parsed,
        verifyCommand: resolved.command,
        message: parsed.summary,
      });
    } catch {
      /* optional */
    }
  }
  return {
    ok: result.success,
    skipped: false,
    exitCode: result.exitCode,
    command: resolved.command,
    scriptName: resolvedName,
    profileId: profileId || resolvedName,
    stdout: result.stdout,
    stderr: result.stderr,
    parsed,
    evidence: result.success
      ? [
          {
            type: "command_exit",
            command: resolved.command,
            exitCode: result.exitCode,
            at: new Date().toISOString(),
          },
        ]
      : [],
  };
}

function listAvailableVerifications(getUserDataPath, userId, projectId, { getDefaultProjectRoot } = {}) {
  const uid = resolveUserId(userId);
  const project = getProject(getUserDataPath, uid, projectId);
  if (!project) {
    return [];
  }
  const root = resolveProjectRoot(project, getDefaultProjectRoot);
  if (!root) {
    return [];
  }
  const scripts = listVerificationScripts(root) || [];
  const extras = [
    {
      scriptName: "static-smoke",
      name: "static-smoke",
      profileId: "static-smoke",
      description: "静态入口冒烟",
    },
    {
      scriptName: "web-http-smoke",
      name: "web-http-smoke",
      profileId: "web-http-smoke",
      description: "HTTP/DOM 冒烟",
    },
    {
      scriptName: "fullstack-smoke",
      name: "fullstack-smoke",
      profileId: "fullstack-smoke",
      description: "全栈/Compose 冒烟",
    },
  ];
  if (scripts.length) {
    return [
      ...scripts.map((s) => ({
        ...s,
        scriptName: s.scriptName || s.name,
        profileId: s.profileId || s.name || s.scriptName,
      })),
      ...extras,
    ];
  }
  return extras;
}

module.exports = {
  runVerification,
  listAvailableVerifications,
};
