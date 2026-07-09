const { getDb, nowIso, newId } = require("./db.js");
const { resolveUserId } = require("./projectService.js");

const RUN_STATUS = {
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  WAITING_APPROVAL: "WAITING_APPROVAL",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELED: "CANCELED",
};

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

/** In-memory cancel signals keyed by runId */
const cancelControllers = new Map();

function rowToSession(row) {
  if (!row) {
    return null;
  }
  let output = null;
  let toolTrace = [];
  try {
    output = row.output_json ? JSON.parse(row.output_json) : null;
  } catch {
    output = null;
  }
  try {
    toolTrace = row.tool_trace_json ? JSON.parse(row.tool_trace_json) : [];
  } catch {
    toolTrace = [];
  }
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    taskId: row.task_id,
    mode: row.mode,
    status: row.status,
    inputText: row.input_text || "",
    output,
    toolTrace,
    errorMessage: row.error_message || "",
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getActiveRunForTask(getUserDataPath, userId, projectId, taskId) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const row = db
    .prepare(
      `SELECT * FROM agent_run_sessions
       WHERE user_id = ? AND project_id = ? AND task_id = ?
         AND status IN ('PENDING', 'RUNNING', 'WAITING_APPROVAL')
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(uid, projectId, taskId);
  return rowToSession(row);
}

function getLatestRunForTask(getUserDataPath, userId, projectId, taskId) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const row = db
    .prepare(
      `SELECT * FROM agent_run_sessions
       WHERE user_id = ? AND project_id = ? AND task_id = ?
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(uid, projectId, taskId);
  return rowToSession(row);
}

function startAgentRun(getUserDataPath, userId, { projectId, taskId, mode, inputText, timeoutMs }) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const active = getActiveRunForTask(getUserDataPath, uid, projectId, taskId);
  if (active) {
    const err = new Error(`任务已有进行中的 Agent 运行 (${active.id})`);
    err.code = "AGENT_RUN_MUTEX";
    err.activeRunId = active.id;
    throw err;
  }
  const id = newId("ars");
  const ts = nowIso();
  db.prepare(
    `INSERT INTO agent_run_sessions (
      id, user_id, project_id, task_id, mode, status, input_text,
      output_json, tool_trace_json, error_message,
      started_at, completed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, '[]', NULL, ?, NULL, ?, ?)`
  ).run(id, uid, projectId, taskId, String(mode || "PLAN_ONLY").toUpperCase(), RUN_STATUS.RUNNING, String(inputText || ""), ts, ts, ts);

  const abortController = new AbortController();
  const controller = {
    canceled: false,
    runId: id,
    abortController,
    signal: abortController.signal,
  };
  cancelControllers.set(id, controller);
  const ms = Number(timeoutMs) > 0 ? Number(timeoutMs) : DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => {
    if (cancelControllers.has(id)) {
      try {
        cancelAgentRun(getUserDataPath, uid, { projectId, taskId, agentRunId: id, reason: "timeout" });
      } catch {
        /* ignore */
      }
    }
  }, ms);
  controller.timer = timer;

  return {
    runId: id,
    status: RUN_STATUS.RUNNING,
    cancelToken: controller,
    signal: abortController.signal,
  };
}

function getAgentRun(getUserDataPath, userId, projectId, taskId, agentRunId) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const row = db
    .prepare(
      `SELECT * FROM agent_run_sessions
       WHERE id = ? AND user_id = ? AND project_id = ? AND task_id = ?`
    )
    .get(agentRunId, uid, projectId, taskId);
  return rowToSession(row);
}

function isCurrentRun(getUserDataPath, userId, projectId, taskId, agentRunId) {
  const run = getAgentRun(getUserDataPath, userId, projectId, taskId, agentRunId);
  if (!run) {
    return false;
  }
  return [RUN_STATUS.PENDING, RUN_STATUS.RUNNING, RUN_STATUS.WAITING_APPROVAL].includes(run.status);
}

function assertCurrentRun(getUserDataPath, userId, projectId, taskId, agentRunId) {
  if (!isCurrentRun(getUserDataPath, userId, projectId, taskId, agentRunId)) {
    const err = new Error("Agent 运行已过期或已结束，结果已丢弃");
    err.code = "AGENT_RUN_STALE";
    throw err;
  }
}

function appendToolTrace(getUserDataPath, userId, projectId, taskId, agentRunId, entry) {
  assertCurrentRun(getUserDataPath, userId, projectId, taskId, agentRunId);
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const run = getAgentRun(getUserDataPath, uid, projectId, taskId, agentRunId);
  const trace = Array.isArray(run.toolTrace) ? [...run.toolTrace] : [];
  trace.push({ ...entry, at: nowIso() });
  const ts = nowIso();
  db.prepare(
    `UPDATE agent_run_sessions SET tool_trace_json = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`
  ).run(JSON.stringify(trace), ts, agentRunId, uid);
  return trace;
}

function completeAgentRun(getUserDataPath, userId, { projectId, taskId, agentRunId, output, status = RUN_STATUS.COMPLETED }) {
  assertCurrentRun(getUserDataPath, userId, projectId, taskId, agentRunId);
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const ts = nowIso();
  db.prepare(
    `UPDATE agent_run_sessions
     SET status = ?, output_json = ?, completed_at = ?, updated_at = ?
     WHERE id = ? AND user_id = ? AND project_id = ? AND task_id = ?`
  ).run(status, JSON.stringify(output || {}), ts, ts, agentRunId, uid, projectId, taskId);
  clearCancelController(agentRunId);
  return getAgentRun(getUserDataPath, uid, projectId, taskId, agentRunId);
}

function failAgentRun(getUserDataPath, userId, { projectId, taskId, agentRunId, errorMessage }) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const ts = nowIso();
  db.prepare(
    `UPDATE agent_run_sessions
     SET status = ?, error_message = ?, completed_at = ?, updated_at = ?
     WHERE id = ? AND user_id = ? AND project_id = ? AND task_id = ?`
  ).run(RUN_STATUS.FAILED, String(errorMessage || "未知错误"), ts, ts, agentRunId, uid, projectId, taskId);
  clearCancelController(agentRunId);
  return getAgentRun(getUserDataPath, uid, projectId, taskId, agentRunId);
}

function cancelAgentRun(getUserDataPath, userId, { projectId, taskId, agentRunId, reason }) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const run = getAgentRun(getUserDataPath, uid, projectId, taskId, agentRunId);
  if (!run) {
    throw new Error("Agent 运行不存在");
  }
  if ([RUN_STATUS.COMPLETED, RUN_STATUS.FAILED, RUN_STATUS.CANCELED].includes(run.status)) {
    return run;
  }
  const ctrl = cancelControllers.get(agentRunId);
  if (ctrl) {
    ctrl.canceled = true;
    try {
      ctrl.abortController?.abort?.(String(reason || "用户取消"));
    } catch {
      /* ignore */
    }
  }
  const ts = nowIso();
  db.prepare(
    `UPDATE agent_run_sessions
     SET status = ?, error_message = ?, completed_at = ?, updated_at = ?
     WHERE id = ? AND user_id = ? AND project_id = ? AND task_id = ?`
  ).run(RUN_STATUS.CANCELED, String(reason || "用户取消"), ts, ts, agentRunId, uid, projectId, taskId);
  const canceledAt = ts;
  clearCancelController(agentRunId);
  const result = getAgentRun(getUserDataPath, uid, projectId, taskId, agentRunId);
  return {
    ...result,
    canceledAt,
    wasLLMAborted: true,
    abortedTool: null,
  };
}

function isRunCanceled(agentRunId) {
  const ctrl = cancelControllers.get(agentRunId);
  return Boolean(ctrl?.canceled || ctrl?.signal?.aborted);
}

function getRunAbortSignal(agentRunId) {
  const ctrl = cancelControllers.get(agentRunId);
  return ctrl?.signal || null;
}

function clearCancelController(agentRunId) {
  const ctrl = cancelControllers.get(agentRunId);
  if (ctrl?.timer) {
    clearTimeout(ctrl.timer);
  }
  cancelControllers.delete(agentRunId);
}

module.exports = {
  RUN_STATUS,
  DEFAULT_TIMEOUT_MS,
  startAgentRun,
  getAgentRun,
  getActiveRunForTask,
  getLatestRunForTask,
  isCurrentRun,
  assertCurrentRun,
  appendToolTrace,
  completeAgentRun,
  failAgentRun,
  cancelAgentRun,
  isRunCanceled,
  getRunAbortSignal,
};
