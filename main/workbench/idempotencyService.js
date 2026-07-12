/**
 * BL-014 / STATE-003: Idempotency keys for side effects (apply/verify/plan step).
 */
const { getDb, nowIso, newId } = require("./db.js");
const { resolveUserId } = require("./projectService.js");
const { mergeCheckpoint, getCheckpoint } = require("./checkpointService.js");

/**
 * Returns { duplicate: true, record } if key already seen for this task scope.
 * Otherwise records and returns { duplicate: false, record }.
 */
function claimIdempotencyKey(
  getUserDataPath,
  userId,
  { projectId, taskId, key, action, meta = {} } = {}
) {
  const uid = resolveUserId(userId);
  const normalized = String(key || "").trim();
  if (!normalized) {
    const err = new Error("idempotency key 不能为空");
    err.code = "IDEMPOTENCY_KEY_REQUIRED";
    throw err;
  }

  const ckpt = getCheckpoint(getUserDataPath, uid, projectId, taskId) || {};
  const seen = new Set(ckpt.idempotencyKeys || []);
  if (seen.has(normalized)) {
    return {
      duplicate: true,
      record: {
        key: normalized,
        action,
        reused: true,
        at: nowIso(),
      },
    };
  }

  const record = {
    id: newId("idemp"),
    key: normalized,
    action: String(action || "unknown"),
    meta,
    at: nowIso(),
  };

  mergeCheckpoint(getUserDataPath, uid, projectId, taskId, {
    idempotencyKeys: [normalized],
    lastIdempotency: record,
  });

  // Also append-only audit for replay
  try {
    const db = getDb(getUserDataPath);
    db.prepare(
      `INSERT INTO audit_logs (id, user_id, scope_type, scope_id, action, detail_json, created_at)
       VALUES (?, ?, 'task', ?, 'idempotency.claim', ?, ?)`
    ).run(newId("audit"), uid, taskId, JSON.stringify(record), record.at);
  } catch {
    /* optional */
  }

  return { duplicate: false, record };
}

function hasIdempotencyKey(getUserDataPath, userId, projectId, taskId, key) {
  const ckpt = getCheckpoint(getUserDataPath, userId, projectId, taskId);
  return Boolean(ckpt?.idempotencyKeys?.includes(String(key || "").trim()));
}

module.exports = {
  claimIdempotencyKey,
  hasIdempotencyKey,
};
