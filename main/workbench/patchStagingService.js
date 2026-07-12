const { getDb, nowIso, newId } = require("./db.js");
const { resolveUserId } = require("./projectService.js");

const PATCH_STATUS = {
  STAGED: "STAGED",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
  APPLIED: "APPLIED",
  FAILED: "FAILED",
  REVISION_REQUESTED: "REVISION_REQUESTED",
  SUPERSEDED: "SUPERSEDED",
  EXPIRED: "EXPIRED",
};

const VALID_TRANSITIONS = {
  STAGED: ["ACCEPTED", "REJECTED", "REVISION_REQUESTED", "EXPIRED"],
  ACCEPTED: ["APPLIED", "REJECTED", "FAILED"],
  REJECTED: [],
  APPLIED: [],
  FAILED: [],
  REVISION_REQUESTED: ["SUPERSEDED", "REJECTED", "EXPIRED"],
  SUPERSEDED: [],
  EXPIRED: [],
};

function rowToPatch(row) {
  if (!row) {
    return null;
  }
  let patchEdits = [];
  try {
    patchEdits = row.patch_edits_json ? JSON.parse(row.patch_edits_json) : [];
  } catch {
    patchEdits = [];
  }
  let patchQuality = null;
  try {
    patchQuality = row.patch_quality_json ? JSON.parse(row.patch_quality_json) : null;
  } catch {
    patchQuality = null;
  }
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    taskId: row.task_id,
    agentRunId: row.agent_run_id || null,
    filePath: row.file_path,
    originalContent: row.original_content || "",
    proposedContent: row.proposed_content || "",
    unifiedDiff: row.unified_diff || "",
    summary: row.summary || "",
    status: row.status,
    patchEdits,
    patchQuality,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createStagedPatch(getUserDataPath, userId, payload) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const id = newId("patch");
  const ts = nowIso();
  db.prepare(
    `INSERT INTO staged_patches (
      id, user_id, project_id, task_id, agent_run_id, file_path,
      original_content, proposed_content, unified_diff, summary,
      status, patch_edits_json, patch_quality_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    uid,
    payload.projectId,
    payload.taskId,
    payload.agentRunId || null,
    payload.filePath,
    payload.originalContent ?? "",
    payload.proposedContent ?? "",
    payload.unifiedDiff ?? "",
    payload.summary ?? "",
    PATCH_STATUS.STAGED,
    JSON.stringify(payload.patchEdits || []),
    payload.patchQuality ? JSON.stringify(payload.patchQuality) : null,
    ts,
    ts
  );
  return getStagedPatch(getUserDataPath, uid, payload.projectId, payload.taskId, id);
}

function getStagedPatch(getUserDataPath, userId, projectId, taskId, patchId) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const row = db
    .prepare(
      `SELECT * FROM staged_patches
       WHERE id = ? AND user_id = ? AND project_id = ? AND task_id = ?`
    )
    .get(patchId, uid, projectId, taskId);
  return rowToPatch(row);
}

function listStagedPatches(getUserDataPath, userId, projectId, taskId, { status, statuses } = {}) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  let sql = `SELECT * FROM staged_patches
             WHERE user_id = ? AND project_id = ? AND task_id = ?`;
  const params = [uid, projectId, taskId];
  const statusList = Array.isArray(statuses)
    ? statuses.map((s) => String(s || "").toUpperCase()).filter(Boolean)
    : status
      ? [String(status).toUpperCase()]
      : [];
  if (statusList.length === 1) {
    sql += " AND status = ?";
    params.push(statusList[0]);
  } else if (statusList.length > 1) {
    sql += ` AND status IN (${statusList.map(() => "?").join(", ")})`;
    params.push(...statusList);
  }
  sql += " ORDER BY updated_at DESC";
  const rows = db.prepare(sql).all(...params);
  return rows.map(rowToPatch);
}

function updatePatchStatus(getUserDataPath, userId, projectId, taskId, patchId, nextStatus) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const patch = getStagedPatch(getUserDataPath, uid, projectId, taskId, patchId);
  if (!patch) {
    throw new Error("补丁不存在");
  }
  const target = String(nextStatus || "").toUpperCase();
  // 幂等：已是目标状态则直接返回，避免 UI 重复「接受」时报错
  if (patch.status === target) {
    return patch;
  }
  const allowed = VALID_TRANSITIONS[patch.status] || [];
  if (!allowed.includes(target)) {
    const err = new Error(`不允许状态流转 ${patch.status} → ${target}`);
    err.code = "INVALID_PATCH_TRANSITION";
    throw err;
  }
  const ts = nowIso();
  db.prepare(
    `UPDATE staged_patches SET status = ?, updated_at = ?
     WHERE id = ? AND user_id = ? AND project_id = ? AND task_id = ?`
  ).run(target, ts, patchId, uid, projectId, taskId);
  return getStagedPatch(getUserDataPath, uid, projectId, taskId, patchId);
}

function patchToDiffPreview(patch) {
  if (!patch) {
    return null;
  }
  const review = patch.patchQuality?.review || null;
  return {
    stagedPatchId: patch.id,
    filePath: patch.filePath,
    originalContent: patch.originalContent,
    proposedContent: patch.proposedContent,
    unifiedDiff: patch.unifiedDiff,
    summary: patch.summary,
    status: patch.status,
    linesAdded: (patch.unifiedDiff.match(/^\+[^+]/gm) || []).length,
    linesRemoved: (patch.unifiedDiff.match(/^-[^-]/gm) || []).length,
    writeApplied: patch.status === PATCH_STATUS.APPLIED,
    patchQuality: patch.patchQuality || null,
    review,
    reviewFindings: review?.findings || [],
    reviewVerdict: review?.verdict || null,
  };
}

module.exports = {
  PATCH_STATUS,
  createStagedPatch,
  getStagedPatch,
  listStagedPatches,
  updatePatchStatus,
  patchToDiffPreview,
};
