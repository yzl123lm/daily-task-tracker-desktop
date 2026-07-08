const { getDb } = require("../db.js");
const { resolveUserId } = require("../projectService.js");
const { buildTaskNamespace } = require("../namespace.js");
const lessonStore = require("./lessonStore.js");
const { syncLessonArtifacts } = require("./lessonMarkdownWriter.js");

function listCandidateLessonsForTask(getUserDataPath, projectId, taskId) {
  const db = getDb(getUserDataPath);
  return db
    .prepare(
      `SELECT * FROM error_lessons
       WHERE project_id = ? AND task_id = ? AND status = 'candidate'
       ORDER BY last_seen_at DESC`
    )
    .all(String(projectId), String(taskId))
    .map(lessonStore.rowToLesson);
}

function markVerifiedByFingerprint(
  getUserDataPath,
  userId,
  { projectId, fingerprint, verifyCommand, verifiedBy = "verify" } = {}
) {
  const lesson = lessonStore.findByFingerprint(getUserDataPath, projectId, fingerprint);
  if (!lesson) {
    return null;
  }
  const updated = lessonStore.updateStatus(getUserDataPath, lesson.lessonId, "verified", {
    verifiedBy,
    verifyCommand,
    confidence: Math.max(lesson.confidence || 0.5, 0.85),
  });
  syncLessonArtifacts(getUserDataPath, updated);
  return updated;
}

function markVerifiedForTask(
  getUserDataPath,
  userId,
  { projectId, taskId, verifyCommand, verifiedBy = "verify" } = {}
) {
  const uid = resolveUserId(userId);
  const candidates = listCandidateLessonsForTask(getUserDataPath, projectId, taskId);
  const verified = [];
  for (const lesson of candidates) {
    const updated = lessonStore.updateStatus(getUserDataPath, lesson.lessonId, "verified", {
      verifiedBy,
      verifyCommand,
      confidence: Math.max(lesson.confidence || 0.5, 0.85),
    });
    syncLessonArtifacts(getUserDataPath, updated);
    verified.push(updated);
  }
  if (!verified.length) {
    const recent = lessonStore.listForProject(getUserDataPath, projectId, { limit: 5 });
    const fallback = recent.find((l) => l.taskId === taskId && l.status !== "verified");
    if (fallback) {
      const updated = lessonStore.updateStatus(getUserDataPath, fallback.lessonId, "verified", {
        verifiedBy,
        verifyCommand,
        confidence: Math.max(fallback.confidence || 0.5, 0.8),
      });
      syncLessonArtifacts(getUserDataPath, updated);
      verified.push(updated);
    }
  }
  const db = getDb(getUserDataPath);
  const ts = require("../db.js").nowIso();
  for (const lesson of verified) {
    db.prepare(
      `INSERT INTO error_lesson_events (
        event_id, user_id, project_id, task_id, lesson_id, fingerprint, source, category,
        event_type, detail_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'verified', ?, ?)`
    ).run(
      require("../db.js").newId("evt"),
      uid,
      projectId,
      taskId,
      lesson.lessonId,
      lesson.fingerprint,
      lesson.source,
      lesson.category,
      JSON.stringify({ verifyCommand, verifiedBy }),
      ts
    );
  }
  return verified;
}

module.exports = {
  markVerifiedByFingerprint,
  markVerifiedForTask,
  listCandidateLessonsForTask,
};
