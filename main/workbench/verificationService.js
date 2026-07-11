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
  if (profileId) {
    const { resolveProfileId, getProfile } = require("./verificationProfileRegistry.js");
    const id = resolveProfileId(profileId);
    resolvedName = getProfile(id).scriptName;
  }
  const resolved = resolveScriptCommand(root, resolvedName);
  if (!resolved.ok) {
    // 无 package.json / 无对应脚本：对静态页等项目视为可跳过，不算验证失败
    return {
      ok: true,
      skipped: true,
      message: resolved.message || "已跳过验证",
      scriptName: resolvedName,
      profileId: profileId || resolvedName,
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
    exitCode: result.exitCode,
    command: resolved.command,
    scriptName: resolvedName,
    profileId: profileId || resolvedName,
    stdout: result.stdout,
    stderr: result.stderr,
    parsed,
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
  return listVerificationScripts(root);
}

module.exports = {
  runVerification,
  listAvailableVerifications,
};
