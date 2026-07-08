const { getDb, nowIso, newId } = require("./db.js");
const { resolveUserId, getTask } = require("./projectService.js");
const { writeMemory } = require("./contextMemoryService.js");
const { buildTaskNamespace } = require("./namespace.js");

const FIX_LOOP_VERSION = "v2";
const MAX_FIX_ROUNDS = 3;

const FIX_LOOP_PHASE = {
  IDLE: "IDLE",
  VERIFYING: "VERIFYING",
  AGENT_FIXING: "AGENT_FIXING",
  WAITING_APPLY: "WAITING_APPLY",
  APPLYING: "APPLYING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELED: "CANCELED",
};

function fixLoopV2Enabled() {
  return String(process.env.WB_FIX_LOOP_V2 || "1") !== "0";
}

function parseFixLoopState(raw) {
  if (!raw) {
    return null;
  }
  try {
    const state = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!state || typeof state !== "object") {
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

function getFixLoopState(getUserDataPath, userId, projectId, taskId) {
  const task = getTask(getUserDataPath, userId, projectId, taskId);
  return parseFixLoopState(task?.fixLoopState);
}

function saveFixLoopState(getUserDataPath, userId, projectId, taskId, state) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const ts = nowIso();
  const next = {
    version: FIX_LOOP_VERSION,
    updatedAt: ts,
    ...(state || {}),
  };
  db.prepare(
    `UPDATE project_tasks SET fix_loop_json = ?, updated_at = ?
     WHERE id = ? AND project_id = ? AND user_id = ?`
  ).run(JSON.stringify(next), ts, taskId, projectId, uid);
  return next;
}

function clearFixLoopState(getUserDataPath, userId, projectId, taskId) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const ts = nowIso();
  db.prepare(
    `UPDATE project_tasks SET fix_loop_json = NULL, updated_at = ?
     WHERE id = ? AND project_id = ? AND user_id = ?`
  ).run(ts, taskId, projectId, uid);
}

function createInitialFixLoopState({ projectId, taskId, scriptName, agentRunId }) {
  const ts = Date.now();
  return {
    version: FIX_LOOP_VERSION,
    active: true,
    projectId,
    taskId,
    agentRunId: agentRunId || null,
    phase: FIX_LOOP_PHASE.VERIFYING,
    round: 0,
    maxRounds: MAX_FIX_ROUNDS,
    scriptName: String(scriptName || "build"),
    verifyAttemptId: newId("verify"),
    lastStagedPatchIds: [],
    lastAppliedPatchIds: [],
    lastVerifySummary: null,
    startedAt: ts,
    updatedAt: ts,
  };
}

function appendFixLoopEvent(getUserDataPath, userId, projectId, taskId, event) {
  const uid = resolveUserId(userId);
  const ns = buildTaskNamespace(projectId, taskId);
  const ts = nowIso();
  const detail = {
    ...(event || {}),
    ts,
  };
  writeMemory(getUserDataPath, uid, {
    namespace: ns,
    scopeType: "task",
    scopeId: taskId,
    memoryType: "fix_loop_event",
    content: `[${detail.phase || detail.action || "event"}] round=${detail.round ?? "?"} ${detail.message || ""}`.trim(),
    source: "FixLoop",
    importance: 5,
  });
  const db = getDb(getUserDataPath);
  db.prepare(
    `INSERT INTO audit_logs (id, user_id, scope_type, scope_id, action, detail_json, created_at)
     VALUES (?, ?, 'task', ?, 'fix_loop.event', ?, ?)`
  ).run(newId("audit"), uid, taskId, JSON.stringify(detail), ts);
}

function assertFixLoopResume(state, { patchIds, agentRunId } = {}) {
  if (!state?.active) {
    const err = new Error("当前任务无进行中的 fixLoop");
    err.code = "FIX_LOOP_INACTIVE";
    throw err;
  }
  if (agentRunId && state.agentRunId && state.agentRunId !== agentRunId) {
    const err = new Error("fixLoop agentRunId 不匹配，忽略过期回调");
    err.code = "FIX_LOOP_STALE";
    throw err;
  }
  const allowedPhases = [FIX_LOOP_PHASE.WAITING_APPLY, FIX_LOOP_PHASE.APPLYING];
  if (!allowedPhases.includes(state.phase)) {
    const err = new Error(`fixLoop 当前 phase=${state.phase}，不可 resume`);
    err.code = "FIX_LOOP_BAD_PHASE";
    throw err;
  }
  if (Array.isArray(patchIds) && patchIds.length && Array.isArray(state.lastStagedPatchIds)) {
    const staged = new Set(state.lastStagedPatchIds);
    const mismatch = patchIds.some((id) => !staged.has(id));
    if (mismatch && state.lastStagedPatchIds.length) {
      const err = new Error("patchIds 与 fixLoop lastStagedPatchIds 不匹配");
      err.code = "FIX_LOOP_PATCH_MISMATCH";
      throw err;
    }
  }
}

module.exports = {
  FIX_LOOP_VERSION,
  MAX_FIX_ROUNDS,
  FIX_LOOP_PHASE,
  fixLoopV2Enabled,
  parseFixLoopState,
  getFixLoopState,
  saveFixLoopState,
  clearFixLoopState,
  createInitialFixLoopState,
  appendFixLoopEvent,
  assertFixLoopResume,
};
