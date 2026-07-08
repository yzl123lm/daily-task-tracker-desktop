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
  { projectId, taskId, scriptName = "build", userApproved },
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
  const resolved = resolveScriptCommand(root, scriptName);
  if (!resolved.ok) {
    return {
      ok: false,
      skipped: true,
      message: resolved.message,
      scriptName,
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
    args: { command: resolved.command, scriptName },
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
    scriptName,
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
