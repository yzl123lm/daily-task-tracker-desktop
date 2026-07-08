const fs = require("fs");
const path = require("path");
const { listForProject } = require("./lessonStore.js");

function lessonsRoot(getUserDataPath, projectId) {
  return path.join(String(getUserDataPath() || ""), "workbench", "lessons", String(projectId));
}

function lessonFilePath(getUserDataPath, projectId, fingerprint) {
  return path.join(lessonsRoot(getUserDataPath, projectId), "errors", `${fingerprint}.md`);
}

function indexFilePath(getUserDataPath, projectId) {
  return path.join(lessonsRoot(getUserDataPath, projectId), "index.md");
}

function formatLessonFile(lesson) {
  const tags = (lesson.tags || []).join(", ");
  const related = (lesson.relatedFiles || []).join(", ");
  const fixSteps = (lesson.fixSteps || [])
    .map((step, idx) => `${idx + 1}. ${step}`)
    .join("\n");
  return [
    `# Error Lesson: ${lesson.category || "unknown"}`,
    "",
    `- Lesson ID: ${lesson.lessonId}`,
    `- Fingerprint: ${lesson.fingerprint}`,
    `- Project: ${lesson.projectId}`,
    `- Task: ${lesson.taskId || ""}`,
    `- Source: ${lesson.source}`,
    `- Status: ${lesson.status}`,
    `- Severity: ${lesson.severity || "medium"}`,
    `- First Seen: ${lesson.firstSeenAt}`,
    `- Last Seen: ${lesson.lastSeenAt}`,
    `- Recurrence: ${lesson.recurrenceCount || 1}`,
    `- Tags: ${tags}`,
    `- Related Files: ${related}`,
    "",
    "## 错误摘要",
    lesson.errorSignature || "",
    "",
    "## 根因",
    lesson.rootCause || lesson.errorSignature || "",
    "",
    "## 修复步骤",
    fixSteps || lesson.fixSummary || "待补充",
    "",
    "## 经验规则",
    lesson.ruleText || "待补充",
    "",
    "## 验证",
    lesson.verifyCommand ? `- Command: ${lesson.verifyCommand}` : "- Command: (未记录)",
    `- Result: ${lesson.status === "verified" ? "passed" : "pending"}`,
    "",
  ].join("\n");
}

function formatIndex(lessons) {
  const lines = [
    "# Error Lessons Index",
    "",
    `> Generated from DB · ${lessons.length} lessons`,
    "",
    "| Fingerprint | Status | Category | Recurrence | Last Seen | Rule |",
    "|---|---|---|---:|---|---|",
  ];
  for (const lesson of lessons) {
    const rule = String(lesson.ruleText || "").replace(/\|/g, "/").slice(0, 80);
    lines.push(
      `| ${lesson.fingerprint} | ${lesson.status} | ${lesson.category} | ${lesson.recurrenceCount || 1} | ${lesson.lastSeenAt || ""} | ${rule} |`
    );
  }
  lines.push("");
  return lines.join("\n");
}

function upsertLessonMarkdown(getUserDataPath, lesson) {
  if (!lesson?.projectId || !lesson?.fingerprint) {
    return null;
  }
  const filePath = lessonFilePath(getUserDataPath, lesson.projectId, lesson.fingerprint);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, formatLessonFile(lesson), "utf8");
  return filePath;
}

function regenerateIndexFromDb(getUserDataPath, projectId) {
  const lessons = listForProject(getUserDataPath, projectId, { limit: 200 });
  const indexPath = indexFilePath(getUserDataPath, projectId);
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  fs.writeFileSync(indexPath, formatIndex(lessons), "utf8");
  return { indexPath, count: lessons.length };
}

function syncLessonArtifacts(getUserDataPath, lesson) {
  const filePath = upsertLessonMarkdown(getUserDataPath, lesson);
  const index = regenerateIndexFromDb(getUserDataPath, lesson.projectId);
  return { filePath, indexPath: index.indexPath, indexCount: index.count };
}

module.exports = {
  lessonsRoot,
  lessonFilePath,
  indexFilePath,
  upsertLessonMarkdown,
  regenerateIndexFromDb,
  syncLessonArtifacts,
};
