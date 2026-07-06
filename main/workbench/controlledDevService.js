const { getProject, getTask, updateTask } = require("./projectService.js");
const { resolveProjectRoot } = require("./projectCodeService.js");
const { writeProjectFile } = require("./projectWriteService.js");
const { gitStatus, createTaskBranch, gitCommit } = require("./gitService.js");
const { buildFixSuggestions } = require("./fixSuggestionService.js");
const { runWhitelistedCommand } = require("./testRunnerService.js");
const { runCommand, classifyCommand } = require("./shellRunnerService.js");
const { writeMemory } = require("./contextMemoryService.js");
const { resolveUserId } = require("./projectService.js");
const {
  assertProjectAgentTool,
  recordToolOperation,
} = require("./toolPermissionService.js");

function requireUserApproval(payload) {
  if (!payload?.userApproved) {
    const err = new Error("受控写入需要用户明确确认（userApproved: true）");
    err.code = "USER_APPROVAL_REQUIRED";
    err.status = 403;
    throw err;
  }
}

function applyControlledPatch(
  getUserDataPath,
  userId,
  { projectId, taskId, path: relPath, content, userApproved, createGitBranch },
  { getDefaultProjectRoot } = {}
) {
  requireUserApproval({ userApproved });
  assertProjectAgentTool("write_project_file", { userApproved: true });
  const uid = resolveUserId(userId);
  const project = getProject(getUserDataPath, uid, projectId);
  if (!project) {
    throw new Error("项目不存在");
  }
  const task = getTask(getUserDataPath, uid, projectId, taskId);
  if (!task) {
    throw new Error("任务不存在");
  }
  const root = resolveProjectRoot(project, getDefaultProjectRoot);
  if (!root) {
    throw new Error("未配置项目代码目录");
  }
  let gitBranch = null;
  if (createGitBranch) {
    assertProjectAgentTool("git_checkout_branch", { userApproved: true });
    gitBranch = createTaskBranch(root, taskId);
    recordToolOperation(getUserDataPath, uid, {
      projectId,
      taskId,
      toolName: "git_checkout_branch",
      args: { branch: gitBranch.branchName },
      resultText: gitBranch.created ? `已创建分支 ${gitBranch.branchName}` : gitBranch.reason,
      riskLevel: "MEDIUM",
      approvedByUser: true,
    });
  }
  const writeResult = writeProjectFile(getUserDataPath, uid, root, relPath, content, {
    projectId,
    taskId,
    summary: "用户确认后写入",
  });
  recordToolOperation(getUserDataPath, uid, {
    projectId,
    taskId,
    toolName: "write_project_file",
    args: { path: relPath, bytes: writeResult.bytesWritten },
    resultText: `已写入 ${relPath}，备份 ${writeResult.backup.id}`,
    riskLevel: "HIGH",
    approvedByUser: true,
  });
  const taskNs = `task:${projectId}:${taskId}`;
  writeMemory(getUserDataPath, uid, {
    namespace: taskNs,
    scopeType: "task",
    scopeId: taskId,
    memoryType: "change_log",
    content: `写入 ${relPath}（${writeResult.bytesWritten} 字节），备份 ${writeResult.backup.id}`,
    source: "ControlledDev",
    importance: 5,
  });
  updateTask(getUserDataPath, uid, projectId, taskId, {
    status: "DEVELOPING",
    currentStep: `已写入 ${relPath}`,
  });
  return {
    writeResult,
    gitBranch,
    codeRoot: root,
  };
}

async function runTestWithFixSuggestions(
  getUserDataPath,
  userId,
  { projectId, taskId, command, userApproved },
  { getDefaultProjectRoot } = {}
) {
  if (userApproved) {
    assertProjectAgentTool("run_tests", { userApproved: true });
  } else {
    assertProjectAgentTool("run_tests");
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
  const result = await runWhitelistedCommand(root, command);
  const fix = buildFixSuggestions(result);
  recordToolOperation(getUserDataPath, uid, {
    projectId,
    taskId,
    toolName: "run_tests",
    args: { command },
    resultText: `exit=${result.exitCode} success=${result.success}`,
    riskLevel: result.success ? "LOW" : "MEDIUM",
    approvedByUser: Boolean(userApproved),
  });
  if (!result.success && taskId) {
    const taskNs = `task:${projectId}:${taskId}`;
    writeMemory(getUserDataPath, uid, {
      namespace: taskNs,
      scopeType: "task",
      scopeId: taskId,
      memoryType: "test_failure",
      content: fix.suggestions.map((s) => s.text).join(" "),
      source: "ControlledDev",
      importance: 4,
    });
    updateTask(getUserDataPath, uid, projectId, taskId, {
      status: "TESTING",
      currentStep: "测试失败，待修复",
    });
  } else if (result.success && taskId) {
    updateTask(getUserDataPath, uid, projectId, taskId, {
      status: "TESTING",
      currentStep: "测试通过",
    });
  }
  return { ...result, fixSuggestions: fix, codeRoot: root };
}

function getGitStatusForProject(getUserDataPath, userId, projectId, { getDefaultProjectRoot } = {}) {
  assertProjectAgentTool("git_status");
  const uid = resolveUserId(userId);
  const project = getProject(getUserDataPath, uid, projectId);
  if (!project) {
    throw new Error("项目不存在");
  }
  const root = resolveProjectRoot(project, getDefaultProjectRoot);
  if (!root) {
    return { isRepo: false, codeRoot: null };
  }
  const status = gitStatus(root);
  recordToolOperation(getUserDataPath, uid, {
    projectId,
    taskId: null,
    toolName: "git_status",
    args: {},
    resultText: status.isRepo ? `branch=${status.branch} clean=${status.clean}` : "not a repo",
    riskLevel: "LOW",
  });
  return { ...status, codeRoot: root };
}

function commitWithApproval(
  getUserDataPath,
  userId,
  { projectId, taskId, message, userApproved },
  { getDefaultProjectRoot } = {}
) {
  requireUserApproval({ userApproved });
  assertProjectAgentTool("git_commit", { userApproved: true });
  const uid = resolveUserId(userId);
  const project = getProject(getUserDataPath, uid, projectId);
  if (!project) {
    throw new Error("项目不存在");
  }
  const root = resolveProjectRoot(project, getDefaultProjectRoot);
  if (!root) {
    throw new Error("未配置项目代码目录");
  }
  const preStatus = gitStatus(root);
  const commitResult = gitCommit(root, message, { userApproved: true });
  recordToolOperation(getUserDataPath, uid, {
    projectId,
    taskId: taskId || null,
    toolName: "git_commit",
    args: { message: String(message || "").slice(0, 120) },
    resultText: commitResult.committed
      ? `commit ${commitResult.shortHash}`
      : commitResult.reason || "nothing to commit",
    riskLevel: "HIGH",
    approvedByUser: true,
  });
  if (taskId && commitResult.committed) {
    writeMemory(getUserDataPath, uid, {
      namespace: `task:${projectId}:${taskId}`,
      scopeType: "task",
      scopeId: taskId,
      memoryType: "git_commit",
      content: `Git commit ${commitResult.shortHash}: ${message}`,
      source: "ControlledDev",
      importance: 4,
    });
  }
  return { commitResult, preStatus, codeRoot: root };
}

async function runControlledShell(
  getUserDataPath,
  userId,
  { projectId, taskId, command, userApproved },
  { getDefaultProjectRoot } = {}
) {
  requireUserApproval({ userApproved });
  assertProjectAgentTool("run_shell_command", { userApproved: true });
  const uid = resolveUserId(userId);
  const project = getProject(getUserDataPath, uid, projectId);
  if (!project) {
    throw new Error("项目不存在");
  }
  const root = resolveProjectRoot(project, getDefaultProjectRoot);
  if (!root) {
    throw new Error("未配置项目代码目录");
  }
  const classified = classifyCommand(command);
  const result = await runCommand(root, classified.cmd);
  const fix = buildFixSuggestions(result);
  recordToolOperation(getUserDataPath, uid, {
    projectId,
    taskId: taskId || null,
    toolName: "run_shell_command",
    args: { command: classified.cmd, tier: classified.tier },
    resultText: `exit=${result.exitCode} success=${result.success}\n${result.stdout}\n${result.stderr}`,
    riskLevel: result.success ? "MEDIUM" : "HIGH",
    approvedByUser: true,
  });
  if (taskId) {
    const taskNs = `task:${projectId}:${taskId}`;
    writeMemory(getUserDataPath, uid, {
      namespace: taskNs,
      scopeType: "task",
      scopeId: taskId,
      memoryType: result.success ? "shell_result" : "shell_failure",
      content: `${classified.cmd} → exit ${result.exitCode}`,
      source: "ControlledShell",
      importance: result.success ? 3 : 4,
    });
    if (!result.success) {
      updateTask(getUserDataPath, uid, projectId, taskId, {
        status: "TESTING",
        currentStep: "Shell 命令失败，待修复",
      });
    }
  }
  return { ...result, classified, fixSuggestions: fix, codeRoot: root };
}

function proposeContentFromDiffPreview(diffPreview) {
  if (diffPreview?.proposedContent) {
    return diffPreview.proposedContent;
  }
  return null;
}

function contentFromUnifiedDiff(unifiedDiff, originalContent) {
  const diff = String(unifiedDiff || "");
  if (!diff.trim()) {
    return originalContent;
  }
  const lines = diff.split(/\r?\n/);
  const out = [];
  let inHunk = false;
  for (const line of lines) {
    if (line.startsWith("@@")) {
      inHunk = true;
      continue;
    }
    if (!inHunk) {
      continue;
    }
    if (line.startsWith("+")) {
      out.push(line.slice(1));
    } else if (line.startsWith(" ")) {
      out.push(line.slice(1));
    } else if (line.startsWith("-")) {
      /* removed line skipped */
    }
  }
  if (out.length) {
    return out.join("\n");
  }
  return originalContent;
}

module.exports = {
  applyControlledPatch,
  runTestWithFixSuggestions,
  getGitStatusForProject,
  commitWithApproval,
  runControlledShell,
  proposeContentFromDiffPreview,
  contentFromUnifiedDiff,
};
