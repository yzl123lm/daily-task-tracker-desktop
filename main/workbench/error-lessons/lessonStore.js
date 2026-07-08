const { getDb, newId, nowIso } = require("../db.js");
const { buildTaskNamespace } = require("../namespace.js");
const { resolveUserId } = require("../projectService.js");

function rowToLesson(row) {
  if (!row) {
    return null;
  }
  let parsedIssues = [];
  let relatedFiles = [];
  let tags = [];
  let fixSteps = [];
  try {
    parsedIssues = row.parsed_issues_json ? JSON.parse(row.parsed_issues_json) : [];
  } catch {
    parsedIssues = [];
  }
  try {
    relatedFiles = row.related_files_json ? JSON.parse(row.related_files_json) : [];
  } catch {
    relatedFiles = [];
  }
  try {
    tags = row.tags_json ? JSON.parse(row.tags_json) : [];
  } catch {
    tags = [];
  }
  try {
    fixSteps = row.fix_steps_json ? JSON.parse(row.fix_steps_json) : [];
  } catch {
    fixSteps = [];
  }
  return {
    lessonId: row.lesson_id,
    userId: row.user_id,
    projectId: row.project_id,
    taskId: row.task_id || null,
    namespace: row.namespace,
    fingerprint: row.fingerprint,
    fingerprintVersion: row.fingerprint_version,
    category: row.category,
    source: row.source,
    severity: row.severity,
    errorSignature: row.error_signature || "",
    rawExcerpt: row.raw_excerpt || "",
    parsedIssues,
    relatedFiles,
    tags,
    rootCause: row.root_cause || "",
    fixSummary: row.fix_summary || "",
    fixSteps,
    ruleText: row.rule_text || "",
    preventionPrompt: row.prevention_prompt || "",
    status: row.status,
    verifiedBy: row.verified_by || null,
    verifyCommand: row.verify_command || null,
    recurrenceCount: row.recurrence_count,
    confidence: row.confidence,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    updatedAt: row.updated_at,
  };
}

function findByFingerprint(getUserDataPath, projectId, fingerprint) {
  const db = getDb(getUserDataPath);
  const row = db
    .prepare(
      `SELECT * FROM error_lessons WHERE project_id = ? AND fingerprint = ? LIMIT 1`
    )
    .get(String(projectId), String(fingerprint));
  return rowToLesson(row);
}

function createCandidate(getUserDataPath, userId, payload) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const projectId = String(payload.projectId || "").trim();
  const taskId = payload.taskId ? String(payload.taskId).trim() : null;
  if (!projectId) {
    throw new Error("缺少 projectId");
  }
  const ts = nowIso();
  const lessonId = newId("lesson");
  const namespace = taskId
    ? buildTaskNamespace(projectId, taskId)
    : `project:${projectId}`;
  db.prepare(
    `INSERT INTO error_lessons (
      lesson_id, user_id, project_id, task_id, namespace, fingerprint, fingerprint_version,
      category, source, severity, error_signature, raw_excerpt, parsed_issues_json,
      related_files_json, tags_json, root_cause, fix_summary, fix_steps_json,
      rule_text, prevention_prompt, status, verified_by, verify_command,
      recurrence_count, confidence, first_seen_at, last_seen_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 1, ?, ?, ?, ?)`
  ).run(
    lessonId,
    uid,
    projectId,
    taskId,
    namespace,
    payload.fingerprint,
    payload.fingerprintVersion || 1,
    payload.category || "unknown",
    payload.source || "unknown",
    payload.severity || "medium",
    payload.errorSignature || "",
    payload.rawExcerpt || "",
    JSON.stringify(payload.parsedIssues || payload.parsed?.issues || []),
    JSON.stringify(payload.relatedFiles || []),
    JSON.stringify(payload.tags || []),
    payload.rootCause || "",
    payload.fixSummary || "",
    JSON.stringify(payload.fixSteps || []),
    payload.ruleText || "",
    payload.preventionPrompt || "",
    payload.status || "candidate",
    payload.verifyCommand || null,
    payload.confidence ?? 0.5,
    ts,
    ts,
    ts
  );
  return findByFingerprint(getUserDataPath, projectId, payload.fingerprint);
}

function bumpRecurrence(getUserDataPath, lessonId, updates = {}) {
  const db = getDb(getUserDataPath);
  const ts = nowIso();
  const existing = db
    .prepare(`SELECT * FROM error_lessons WHERE lesson_id = ?`)
    .get(String(lessonId));
  if (!existing) {
    return null;
  }
  db.prepare(
    `UPDATE error_lessons SET
      recurrence_count = recurrence_count + 1,
      last_seen_at = ?,
      updated_at = ?,
      task_id = COALESCE(?, task_id),
      namespace = COALESCE(?, namespace),
      error_signature = COALESCE(?, error_signature),
      raw_excerpt = COALESCE(?, raw_excerpt),
      parsed_issues_json = COALESCE(?, parsed_issues_json),
      related_files_json = COALESCE(?, related_files_json),
      tags_json = COALESCE(?, tags_json),
      root_cause = COALESCE(?, root_cause),
      fix_summary = COALESCE(?, fix_summary),
      rule_text = COALESCE(?, rule_text)
     WHERE lesson_id = ?`
  ).run(
    ts,
    ts,
    updates.taskId || null,
    updates.namespace || null,
    updates.errorSignature || null,
    updates.rawExcerpt || null,
    updates.parsedIssuesJson || null,
    updates.relatedFilesJson || null,
    updates.tagsJson || null,
    updates.rootCause || null,
    updates.fixSummary || null,
    updates.ruleText || null,
    String(lessonId)
  );
  return rowToLesson(
    db.prepare(`SELECT * FROM error_lessons WHERE lesson_id = ?`).get(String(lessonId))
  );
}

function updateStatus(getUserDataPath, lessonId, status, extras = {}) {
  const db = getDb(getUserDataPath);
  const ts = nowIso();
  db.prepare(
    `UPDATE error_lessons SET
      status = ?,
      verified_by = COALESCE(?, verified_by),
      verify_command = COALESCE(?, verify_command),
      confidence = COALESCE(?, confidence),
      updated_at = ?,
      last_seen_at = ?
     WHERE lesson_id = ?`
  ).run(
    String(status),
    extras.verifiedBy || null,
    extras.verifyCommand || null,
    extras.confidence ?? null,
    ts,
    ts,
    String(lessonId)
  );
  return rowToLesson(
    db.prepare(`SELECT * FROM error_lessons WHERE lesson_id = ?`).get(String(lessonId))
  );
}

function listForProject(getUserDataPath, projectId, { status, limit = 50 } = {}) {
  const db = getDb(getUserDataPath);
  let sql = `SELECT * FROM error_lessons WHERE project_id = ?`;
  const params = [String(projectId)];
  if (status) {
    sql += ` AND status = ?`;
    params.push(String(status));
  }
  sql += ` ORDER BY last_seen_at DESC LIMIT ?`;
  params.push(Number(limit) || 50);
  return db.prepare(sql).all(...params).map(rowToLesson);
}

module.exports = {
  findByFingerprint,
  createCandidate,
  bumpRecurrence,
  updateStatus,
  listForProject,
  rowToLesson,
};
