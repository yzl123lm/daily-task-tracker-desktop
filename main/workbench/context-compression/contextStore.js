const { getDb, nowIso, newId } = require("../db.js");
const { parseNamespace } = require("../namespace.js");
const { resolveUserId } = require("../projectService.js");
const { estimateTokens } = require("./types.js");

function rowToSnapshot(row) {
  if (!row) {
    return null;
  }
  let snapshot = null;
  try {
    snapshot = JSON.parse(row.snapshot_json);
  } catch {
    snapshot = null;
  }
  return {
    id: row.id,
    userId: row.user_id,
    namespace: row.namespace,
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    revision: row.revision,
    snapshot,
    validationStatus: row.validation_status,
    riskLevel: row.risk_level,
    isLatest: Boolean(row.is_latest),
    tokensBefore: row.tokens_before,
    tokensAfter: row.tokens_after,
    createdAt: row.created_at,
  };
}

function getNextRevision(db, namespace) {
  const row = db
    .prepare("SELECT MAX(revision) AS maxRev FROM context_snapshots WHERE namespace = ?")
    .get(namespace);
  return (Number(row?.maxRev) || 0) + 1;
}

function clearLatestFlag(db, namespace) {
  db.prepare("UPDATE context_snapshots SET is_latest = 0 WHERE namespace = ? AND is_latest = 1").run(
    namespace
  );
}

function saveSnapshot(getUserDataPath, userId, payload) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const namespace = String(payload?.namespace || "").trim();
  const parsed = parseNamespace(namespace);
  const scopeType = parsed.type === "task" ? "task" : parsed.type;
  const scopeId = parsed.taskId || parsed.projectId || parsed.chatId;
  const snapshot = payload?.snapshot;
  if (!snapshot) {
    throw new Error("缺少 snapshot");
  }
  const validation = payload?.validation || { valid: true, errors: [], riskFlags: [] };
  if (!validation.valid) {
    throw new Error("快照验证失败，不得保存为 latest");
  }
  const id = newId("snap");
  const ts = nowIso();
  const revision = getNextRevision(db, namespace);
  snapshot.meta = { ...(snapshot.meta || {}), revision };
  if (payload?.enableVersioning !== false) {
    clearLatestFlag(db, namespace);
  }
  const riskLevel =
    (validation.riskFlags || []).some((r) => r.level === "high")
      ? "HIGH"
      : (validation.riskFlags || []).some((r) => r.level === "medium")
        ? "MEDIUM"
        : "LOW";
  db.prepare(
    `INSERT INTO context_snapshots (
      id, user_id, namespace, scope_type, scope_id, revision, snapshot_json,
      validation_status, risk_level, is_latest, tokens_before, tokens_after, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'VALID', ?, 1, ?, ?, ?)`
  ).run(
    id,
    uid,
    namespace,
    scopeType,
    scopeId,
    revision,
    JSON.stringify(snapshot),
    riskLevel,
    Number(payload?.tokensBefore) || 0,
    Number(payload?.tokensAfter) || estimateTokens(JSON.stringify(snapshot)),
    ts
  );
  return rowToSnapshot(
    db.prepare("SELECT * FROM context_snapshots WHERE id = ?").get(id)
  );
}

function saveCompressionEvent(getUserDataPath, userId, payload) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const id = newId("cevt");
  const ts = nowIso();
  db.prepare(
    `INSERT INTO compression_events (
      id, snapshot_id, user_id, namespace, reason, mode,
      tokens_before, tokens_after, blocks_kept, blocks_summarized, blocks_dropped,
      validation_result_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    payload?.snapshotId || null,
    uid,
    String(payload?.namespace || ""),
    String(payload?.reason || "manual"),
    String(payload?.mode || "normal"),
    Number(payload?.tokensBefore) || 0,
    Number(payload?.tokensAfter) || 0,
    Number(payload?.blocksKept) || 0,
    Number(payload?.blocksSummarized) || 0,
    Number(payload?.blocksDropped) || 0,
    JSON.stringify(payload?.validation || {}),
    ts
  );
  return { id, createdAt: ts };
}

function getLatestValidSnapshot(getUserDataPath, userId, namespace) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const row = db
    .prepare(
      `SELECT * FROM context_snapshots
       WHERE user_id = ? AND namespace = ? AND validation_status = 'VALID' AND is_latest = 1
       ORDER BY revision DESC LIMIT 1`
    )
    .get(uid, namespace);
  return rowToSnapshot(row);
}

function listSnapshots(getUserDataPath, userId, namespace, { limit = 20 } = {}) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const rows = db
    .prepare(
      `SELECT * FROM context_snapshots
       WHERE user_id = ? AND namespace = ?
       ORDER BY revision DESC LIMIT ?`
    )
    .all(uid, namespace, Math.min(Math.max(limit, 1), 50));
  return rows.map(rowToSnapshot);
}

function getSnapshotById(getUserDataPath, userId, snapshotId) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const row = db
    .prepare("SELECT * FROM context_snapshots WHERE id = ? AND user_id = ?")
    .get(snapshotId, uid);
  return rowToSnapshot(row);
}

function restoreSnapshot(getUserDataPath, userId, snapshotId) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const snap = getSnapshotById(getUserDataPath, uid, snapshotId);
  if (!snap) {
    throw new Error("快照不存在");
  }
  clearLatestFlag(db, snap.namespace);
  db.prepare("UPDATE context_snapshots SET is_latest = 1 WHERE id = ?").run(snapshotId);
  db.prepare(
    `INSERT INTO audit_logs (id, user_id, scope_type, scope_id, action, detail_json, created_at)
     VALUES (?, ?, ?, ?, 'snapshot.restore', ?, ?)`
  ).run(
    newId("audit"),
    uid,
    snap.scopeType,
    snap.scopeId,
    JSON.stringify({ snapshotId, revision: snap.revision }),
    nowIso()
  );
  return snap;
}

module.exports = {
  saveSnapshot,
  saveCompressionEvent,
  getLatestValidSnapshot,
  listSnapshots,
  getSnapshotById,
  restoreSnapshot,
  rowToSnapshot,
};
