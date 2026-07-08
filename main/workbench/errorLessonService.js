const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { writeMemory, searchMemories } = require("./contextMemoryService.js");
const { buildTaskNamespace } = require("./namespace.js");
const { resolveUserId } = require("./projectService.js");
const { getDb, newId, nowIso } = require("./db.js");
const {
  pipelineEnabled,
  recordErrorEvent,
} = require("./error-lessons/errorEventCollector.js");
const { markVerifiedForTask } = require("./error-lessons/lessonStatusUpdater.js");

function lessonsRoot(getUserDataPath, projectId) {
  return path.join(String(getUserDataPath() || ""), ".jl-ai", "projects", projectId, "lessons");
}

function errorsMdPath(getUserDataPath, projectId) {
  return path.join(lessonsRoot(getUserDataPath, projectId), "errors.md");
}

function taskErrorsMdPath(getUserDataPath, projectId, taskId) {
  return path.join(lessonsRoot(getUserDataPath, projectId), "tasks", `${taskId}-error-lessons.md`);
}

function messageHash(text) {
  return crypto.createHash("sha1").update(String(text || "")).digest("hex").slice(0, 12);
}

function buildFingerprint({ category, file, message }) {
  return `${category || "unknown"}:${file || "*"}:${messageHash(message)}`;
}

function formatLessonMarkdown(lesson) {
  const title = lesson.title || "未命名错误";
  return [
    `## 错误记录：${title}`,
    "",
    `- 时间：${lesson.createdAt || nowIso()}`,
    `- 项目：${lesson.projectId || ""}`,
    `- 任务：${lesson.taskId || ""}`,
    `- 来源：${lesson.source || "verify"}`,
    `- 错误类型：${lesson.category || ""}`,
    `- 相关文件：${lesson.file || ""}`,
    `- 错误摘要：${lesson.summary || ""}`,
    `- 根因分析：${lesson.rootCause || lesson.summary || ""}`,
    `- 修复方案：${lesson.fixPlan || ""}`,
    `- 验证结果：${lesson.verifyResult || ""}`,
    `- 经验规则：${lesson.rule || ""}`,
    `- 标签：${(lesson.tags || []).join(", ")}`,
    `- 指纹：${lesson.fingerprint || ""}`,
    "",
  ].join("\n");
}

function appendMarkdown(filePath, block) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const header = fs.existsSync(filePath) ? "\n" : "# 错误经验库\n\n";
  fs.appendFileSync(filePath, header + block, "utf8");
}

function recordErrorLessonLegacy(getUserDataPath, userId, lessonInput) {
  const uid = resolveUserId(userId);
  const projectId = String(lessonInput?.projectId || "").trim();
  const taskId = String(lessonInput?.taskId || "").trim();
  if (!projectId) {
    return null;
  }
  const fingerprint = buildFingerprint({
    category: lessonInput.category,
    file: lessonInput.file,
    message: lessonInput.summary || lessonInput.message,
  });
  const ns = taskId ? buildTaskNamespace(projectId, taskId) : `project:${projectId}`;
  const existing = searchMemories(getUserDataPath, uid, {
    namespace: ns,
    query: fingerprint,
    limit: 5,
  });
  if (existing.some((m) => m.content.includes(fingerprint))) {
    return { deduped: true, fingerprint };
  }
  const lesson = {
    title: lessonInput.title || lessonInput.summary?.slice(0, 60) || "编程错误",
    projectId,
    taskId,
    source: lessonInput.source || "verify",
    category: lessonInput.category || "build_error",
    file: lessonInput.file || "",
    summary: String(lessonInput.summary || "").slice(0, 500),
    rootCause: String(lessonInput.rootCause || lessonInput.summary || "").slice(0, 500),
    fixPlan: String(lessonInput.fixPlan || "").slice(0, 500),
    verifyResult: String(lessonInput.verifyResult || "").slice(0, 300),
    rule: String(lessonInput.rule || "").slice(0, 300),
    tags: Array.isArray(lessonInput.tags) ? lessonInput.tags : ["build-error"],
    fingerprint,
    createdAt: nowIso(),
  };
  const md = formatLessonMarkdown(lesson);
  appendMarkdown(errorsMdPath(getUserDataPath, projectId), md);
  if (taskId) {
    appendMarkdown(taskErrorsMdPath(getUserDataPath, projectId, taskId), md);
  }
  writeMemory(getUserDataPath, uid, {
    namespace: ns,
    scopeType: taskId ? "task" : "project",
    scopeId: taskId || projectId,
    memoryType: "error_lesson",
    content: `[${fingerprint}] ${lesson.summary} | 规则: ${lesson.rule}`,
    source: "ErrorLessonService",
    importance: 5,
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
    JSON.stringify({ fingerprint, title: lesson.title }),
    lesson.createdAt
  );
  return lesson;
}

function recordErrorLesson(getUserDataPath, userId, lessonInput) {
  if (pipelineEnabled()) {
    const result = recordErrorEvent(getUserDataPath, userId, {
      projectId: lessonInput?.projectId,
      taskId: lessonInput?.taskId,
      source: lessonInput?.source || "manual",
      message: lessonInput?.summary || lessonInput?.message,
      summary: lessonInput?.summary,
      file: lessonInput?.file,
      rootCause: lessonInput?.rootCause,
      fixPlan: lessonInput?.fixPlan,
      rule: lessonInput?.rule,
      ruleText: lessonInput?.rule,
      tags: lessonInput?.tags,
      stdout: lessonInput?.stdout,
      stderr: lessonInput?.stderr,
    });
    if (result) {
      return result;
    }
  }
  return recordErrorLessonLegacy(getUserDataPath, userId, lessonInput);
}

function recordVerifyFailureLesson(getUserDataPath, userId, { projectId, taskId, verify }) {
  const parsed = verify?.parsed;
  const first = parsed?.issues?.[0];
  if (pipelineEnabled()) {
    return recordErrorEvent(getUserDataPath, userId, {
      projectId,
      taskId,
      source: "verify",
      stdout: verify?.stdout,
      stderr: verify?.stderr,
      parsed,
      file: first?.file || "",
      summary: parsed?.summary || verify?.stderr?.slice(0, 200) || "",
      rootCause: parsed?.summary || "",
      ruleText: first?.file
        ? `修复前先检查 ${first.file}:${first.line || "?"}`
        : "修复前先阅读 stderr 首个 error 行",
      verifyCommand: verify?.command,
      tags: ["build-error", "verify"],
    });
  }
  return recordErrorLessonLegacy(getUserDataPath, userId, {
    projectId,
    taskId,
    source: "verify",
    category: "build_error",
    title: parsed?.summary?.slice(0, 80) || "构建/测试失败",
    file: first?.file || "",
    summary: parsed?.summary || verify?.stderr?.slice(0, 200) || "",
    rootCause: parsed?.summary || "",
    rule: first?.file ? `修复前先检查 ${first.file}:${first.line || "?"}` : "修复前先阅读 stderr 首个 error 行",
    tags: ["build-error", "verify"],
  });
}

function recordFixSuccessLesson(getUserDataPath, userId, { projectId, taskId, round, scriptName }) {
  if (pipelineEnabled()) {
    return markVerifiedForTask(getUserDataPath, userId, {
      projectId,
      taskId,
      verifyCommand: scriptName || "build",
      verifiedBy: "fix_loop",
    });
  }
  return recordErrorLessonLegacy(getUserDataPath, userId, {
    projectId,
    taskId,
    source: "fix_loop",
    category: "fix_success",
    title: `第 ${round || "?"} 轮修复后验证通过`,
    summary: `${scriptName || "build"} 验证通过`,
    verifyResult: "passed",
    rule: "同类 build 错误可参照 errors.md 历史修复路径",
    tags: ["verify-pass", "fix-loop"],
  });
}

module.exports = {
  recordErrorLesson,
  recordVerifyFailureLesson,
  recordFixSuccessLesson,
  buildFingerprint,
  pipelineEnabled,
};
