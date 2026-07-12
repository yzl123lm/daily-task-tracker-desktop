/**
 * BL-014 / STATE-002: Versioned checkpoint get/merge + green snapshots.
 */
const { getDb, nowIso, newId } = require("./db.js");
const { resolveUserId, getTask } = require("./projectService.js");

const CHECKPOINT_VERSION = 1;

function getCheckpoint(getUserDataPath, userId, projectId, taskId) {
  const task = getTask(getUserDataPath, userId, projectId, taskId);
  if (!task?.checkpoint) return null;
  try {
    return typeof task.checkpoint === "string" ? JSON.parse(task.checkpoint) : task.checkpoint;
  } catch {
    return null;
  }
}

function readRawCheckpoint(getUserDataPath, userId, projectId, taskId) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const row = db
    .prepare(
      `SELECT checkpoint_json FROM project_tasks
       WHERE id = ? AND project_id = ? AND user_id = ?`
    )
    .get(taskId, projectId, uid);
  if (!row?.checkpoint_json) return null;
  try {
    return JSON.parse(row.checkpoint_json);
  } catch {
    return null;
  }
}

/**
 * Deep-ish merge: arrays for planEvents/completedIds/idempotencyKeys are unioned;
 * nested objects (fixLoop/plan/budget) are shallow-merged.
 */
function mergeCheckpoint(getUserDataPath, userId, projectId, taskId, patch = {}) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const ts = nowIso();
  const prev = readRawCheckpoint(getUserDataPath, uid, projectId, taskId) || {};
  const next = {
    version: CHECKPOINT_VERSION,
    ...prev,
    ...patch,
    version: CHECKPOINT_VERSION,
    updatedAt: ts,
  };

  if (patch.fixLoop || prev.fixLoop) {
    next.fixLoop = { ...(prev.fixLoop || {}), ...(patch.fixLoop || {}) };
  }
  if (patch.plan || prev.plan) {
    next.plan = { ...(prev.plan || {}), ...(patch.plan || {}) };
  }
  if (patch.budget || prev.budget) {
    next.budget = { ...(prev.budget || {}), ...(patch.budget || {}) };
  }
  if (patch.env || prev.env) {
    next.env = { ...(prev.env || {}), ...(patch.env || {}) };
  }

  const mergeUnique = (a, b) => [...new Set([...(a || []), ...(b || [])])];
  if (patch.completedIds || prev.completedIds) {
    next.completedIds = mergeUnique(prev.completedIds, patch.completedIds);
  }
  if (patch.appliedPatchIds || prev.appliedPatchIds) {
    next.appliedPatchIds = mergeUnique(prev.appliedPatchIds, patch.appliedPatchIds);
  }
  if (patch.idempotencyKeys || prev.idempotencyKeys) {
    next.idempotencyKeys = mergeUnique(prev.idempotencyKeys, patch.idempotencyKeys).slice(-100);
  }
  // planEvents: caller passes the authoritative trimmed list (appendPlanEvent)
  if (Object.prototype.hasOwnProperty.call(patch, "planEvents")) {
    next.planEvents = Array.isArray(patch.planEvents) ? patch.planEvents.slice(-200) : [];
  }

  db.prepare(
    `UPDATE project_tasks SET checkpoint_json = ?, updated_at = ?
     WHERE id = ? AND project_id = ? AND user_id = ?`
  ).run(JSON.stringify(next), ts, taskId, projectId, uid);
  return next;
}

function createGreenCheckpoint(
  getUserDataPath,
  userId,
  projectId,
  taskId,
  {
    phase = "GREEN",
    gitHead = null,
    appliedPatchIds = [],
    verify = null,
    fixLoop = null,
    plan = null,
    budget = null,
    env = null,
    label = "green",
  } = {}
) {
  const id = newId("ckpt");
  const snapshot = {
    checkpointId: id,
    label,
    phase,
    gitHead,
    appliedPatchIds,
    verify: verify
      ? {
          ok: Boolean(verify.ok),
          profileId: verify.profileId || verify.scriptName || null,
          at: new Date().toISOString(),
        }
      : null,
    fixLoop: fixLoop || null,
    plan: plan || null,
    budget: budget || null,
    env: env || null,
    isGreen: true,
  };
  return mergeCheckpoint(getUserDataPath, userId, projectId, taskId, {
    phase,
    lastGreen: snapshot,
    gitHead,
    appliedPatchIds,
    verify: snapshot.verify,
    fixLoop,
    plan,
    budget,
    env,
  });
}

function saveCheckpointCompat(getUserDataPath, userId, projectId, taskId, checkpoint) {
  return mergeCheckpoint(getUserDataPath, userId, projectId, taskId, checkpoint || {});
}

module.exports = {
  CHECKPOINT_VERSION,
  getCheckpoint,
  mergeCheckpoint,
  createGreenCheckpoint,
  saveCheckpointCompat,
  readRawCheckpoint,
};
