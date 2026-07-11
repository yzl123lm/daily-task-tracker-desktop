const { getDb, nowIso, newId } = require("./db.js");
const { resolveUserId } = require("./projectService.js");
const { isDevToolName } = require("./namespace.js");
const { PERMISSION, normalizeToolName, getToolDef } = require("./toolRegistry.js");

const PROJECT_AGENT_TOOLS = new Set([
  "list_files",
  "read_file",
  "search_code",
  "find_symbols",
  "analyze_package",
  "write_task_memory",
  "git_status",
  "preview_diff",
  "stage_patch",
  "mock_echo",
  "list_project_files",
  "read_project_file",
  "search_project_code",
  "run_tests",
  "list_verification_profiles",
  "run_verification",
  "compress_context",
  "write_project_file",
  "restore_file_backup",
  "git_commit",
  "git_checkout_branch",
  "run_shell_command",
]);

const USER_APPROVAL_TOOLS = new Set([
  "write_project_file",
  "restore_file_backup",
  "git_commit",
  "git_checkout_branch",
  "run_shell_command",
  "run_tests",
]);

const LLM_FORBIDDEN_TOOLS = new Set([
  "write_project_file",
  "restore_file_backup",
  "git_commit",
  "git_checkout_branch",
  "run_shell_command",
]);

function permissionLevelForTool(toolName) {
  const def = getToolDef(normalizeToolName(toolName));
  return def?.permission || null;
}

function assertProjectAgentTool(toolName, { userApproved, fromLlm = false } = {}) {
  const name = normalizeToolName(toolName);
  if (fromLlm && LLM_FORBIDDEN_TOOLS.has(name)) {
    const err = new Error(`LLM 禁止调用: ${name}`);
    err.code = "TOOL_FORBIDDEN";
    err.status = 403;
    throw err;
  }
  if (USER_APPROVAL_TOOLS.has(name) && !userApproved) {
    const err = new Error(`工具 ${name} 需要用户确认`);
    err.code = "USER_APPROVAL_REQUIRED";
    err.status = 403;
    throw err;
  }
  if (!PROJECT_AGENT_TOOLS.has(name) && isDevToolName(name)) {
    const err = new Error(`ProjectAgent 不允许: ${name}`);
    err.code = "TOOL_FORBIDDEN";
    err.status = 403;
    throw err;
  }
}

function recordToolOperation(getUserDataPath, userId, payload) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const id = newId("tool");
  const ts = nowIso();
  const approved = payload?.approvedByUser ? 1 : 0;
  db.prepare(
    `INSERT INTO tool_operations (
      id, agent_run_id, user_id, project_id, task_id, tool_name, args_json,
      result_text, risk_level, approved_by_user, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    payload?.agentRunId || null,
    uid,
    payload?.projectId || null,
    payload?.taskId || null,
    String(payload?.toolName || ""),
    JSON.stringify(payload?.args || {}),
    String(payload?.resultText || "").slice(0, 16000),
    String(payload?.riskLevel || "LOW"),
    approved,
    ts
  );
  return { id, createdAt: ts, approvedByUser: Boolean(approved) };
}

function listToolOperations(getUserDataPath, userId, projectId, taskId, { limit = 20 } = {}) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const rows = db
    .prepare(
      `SELECT * FROM tool_operations
       WHERE user_id = ? AND project_id = ? AND (task_id = ? OR task_id IS NULL)
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(uid, projectId, taskId || null, Math.min(Math.max(limit, 1), 50));
  return rows.map((row) => ({
    id: row.id,
    toolName: row.tool_name,
    args: row.args_json ? JSON.parse(row.args_json) : {},
    resultText: row.result_text,
    riskLevel: row.risk_level,
    approvedByUser: Boolean(row.approved_by_user),
    createdAt: row.created_at,
  }));
}

module.exports = {
  assertProjectAgentTool,
  recordToolOperation,
  listToolOperations,
  permissionLevelForTool,
  PROJECT_AGENT_TOOLS,
  USER_APPROVAL_TOOLS,
  LLM_FORBIDDEN_TOOLS,
  PERMISSION,
};
