const { getDb, newId, nowIso } = require("../db.js");
const { buildTaskNamespace } = require("../namespace.js");
const { resolveUserId } = require("../projectService.js");
const { writeMemory } = require("../contextMemoryService.js");
const { parseErrorEvent } = require("./errorParserService.js");
const { buildFingerprint } = require("./errorFingerprintService.js");
const lessonStore = require("./lessonStore.js");
const { syncLessonArtifacts } = require("./lessonMarkdownWriter.js");

function pipelineEnabled() {
  return String(process.env.WB_ERROR_LESSON_PIPELINE ?? "1") !== "0";
}

function recordLessonEvent(getUserDataPath, userId, event) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const ts = nowIso();
  const eventId = newId("evt");
  db.prepare(
    `INSERT INTO error_lesson_events (
      event_id, user_id, project_id, task_id, lesson_id, fingerprint, source, category,
      event_type, detail_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    eventId,
    uid,
    event.projectId,
    event.taskId || null,
    event.lessonId || null,
    event.fingerprint || null,
    event.source || "unknown",
    event.category || "unknown",
    event.eventType || "recorded",
    event.detailJson ? JSON.stringify(event.detailJson) : null,
    ts
  );
  return { eventId, createdAt: ts };
}

function writeLessonMemory(getUserDataPath, userId, lesson) {
  const uid = resolveUserId(userId);
  const ns = lesson.namespace || buildTaskNamespace(lesson.projectId, lesson.taskId || lesson.projectId);
  writeMemory(getUserDataPath, uid, {
    namespace: ns,
    scopeType: lesson.taskId ? "task" : "project",
    scopeId: lesson.taskId || lesson.projectId,
    memoryType: "error_lesson",
    content: `[${lesson.fingerprint}] ${lesson.errorSignature} | 规则: ${lesson.ruleText}`,
    source: "ErrorLessonPipeline",
    importance: lesson.status === "verified" ? 5 : 4,
  });
}

function recordErrorEvent(getUserDataPath, userId, input) {
  if (!pipelineEnabled()) {
    return null;
  }
  const uid = resolveUserId(userId);
  const projectId = String(input?.projectId || "").trim();
  if (!projectId) {
    return null;
  }
  const taskId = input?.taskId ? String(input.taskId).trim() : null;
  const parsedEvent = parseErrorEvent(input);
  const fp = buildFingerprint({
    source: parsedEvent.source,
    category: parsedEvent.category,
    message: parsedEvent.primaryMessage,
    file: parsedEvent.primaryFile,
    parsed: parsedEvent.parsed,
  });
  const namespace = taskId
    ? buildTaskNamespace(projectId, taskId)
    : `project:${projectId}`;
  let lesson = lessonStore.findByFingerprint(getUserDataPath, projectId, fp.fingerprint);
  let deduped = false;
  if (lesson) {
    lesson = lessonStore.bumpRecurrence(getUserDataPath, lesson.lessonId, {
      taskId,
      namespace,
      errorSignature: parsedEvent.errorSignature,
      rawExcerpt: parsedEvent.rawExcerpt,
      parsedIssuesJson: JSON.stringify(parsedEvent.parsed?.issues || []),
      relatedFilesJson: JSON.stringify(parsedEvent.relatedFiles || []),
      tagsJson: JSON.stringify(parsedEvent.tags || []),
      rootCause: parsedEvent.rootCause,
      fixSummary: parsedEvent.fixSummary,
      ruleText: parsedEvent.ruleText,
    });
    deduped = true;
  } else {
    lesson = lessonStore.createCandidate(getUserDataPath, uid, {
      projectId,
      taskId,
      namespace,
      fingerprint: fp.fingerprint,
      fingerprintVersion: fp.fingerprintVersion,
      category: parsedEvent.category,
      source: parsedEvent.source,
      severity: parsedEvent.severity,
      errorSignature: parsedEvent.errorSignature,
      rawExcerpt: parsedEvent.rawExcerpt,
      parsed: parsedEvent.parsed,
      relatedFiles: parsedEvent.relatedFiles,
      tags: parsedEvent.tags,
      rootCause: parsedEvent.rootCause,
      fixSummary: parsedEvent.fixSummary,
      ruleText: parsedEvent.ruleText,
      preventionPrompt: parsedEvent.preventionPrompt,
      verifyCommand: parsedEvent.verifyCommand,
      status: "candidate",
    });
  }
  syncLessonArtifacts(getUserDataPath, lesson);
  writeLessonMemory(getUserDataPath, uid, lesson);
  recordLessonEvent(getUserDataPath, uid, {
    projectId,
    taskId,
    lessonId: lesson.lessonId,
    fingerprint: lesson.fingerprint,
    source: parsedEvent.source,
    category: parsedEvent.category,
    eventType: deduped ? "recurred" : "recorded",
    detailJson: {
      deduped,
      errorSignature: parsedEvent.errorSignature,
      recurrenceCount: lesson.recurrenceCount,
    },
  });
  const db = getDb(getUserDataPath);
  db.prepare(
    `INSERT INTO audit_logs (id, user_id, scope_type, scope_id, action, detail_json, created_at)
     VALUES (?, ?, ?, ?, 'error_lesson.record', ?, ?)`
  ).run(
    newId("audit"),
    uid,
    taskId ? "task" : "project",
    taskId || projectId,
    JSON.stringify({
      fingerprint: lesson.fingerprint,
      lessonId: lesson.lessonId,
      deduped,
      recurrenceCount: lesson.recurrenceCount,
    }),
    nowIso()
  );
  return { ...lesson, deduped, fingerprintMeta: fp };
}

module.exports = {
  pipelineEnabled,
  recordErrorEvent,
  recordLessonEvent,
  writeLessonMemory,
};
