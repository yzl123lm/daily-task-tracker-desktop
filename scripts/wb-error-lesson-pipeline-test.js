const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { getDb } = require("../main/workbench/db.js");
const { createProject, createTask } = require("../main/workbench/projectService.js");
const { recordErrorEvent } = require("../main/workbench/error-lessons/errorEventCollector.js");
const lessonStore = require("../main/workbench/error-lessons/lessonStore.js");
const { markVerifiedForTask } = require("../main/workbench/error-lessons/lessonStatusUpdater.js");
const { lessonFilePath, indexFilePath } = require("../main/workbench/error-lessons/lessonMarkdownWriter.js");

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "wb-elp-"));
const getUserDataPath = () => userData;
const db = getDb(getUserDataPath);

const uid = "local-user";
const project = createProject(getUserDataPath, uid, { name: "elp", localPath: os.tmpdir() });
const task = createTask(getUserDataPath, uid, project.id, { title: "elp task" });

// schema v7 tables exist
const tables = db
  .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name IN ('error_lessons','error_lesson_events')`)
  .all()
  .map((r) => r.name);
assert.deepStrictEqual(tables.sort(), ["error_lesson_events", "error_lessons"]);

const meta = db.prepare(`SELECT value FROM wb_meta WHERE key='schema_version'`).get();
assert.strictEqual(Number(meta.value), 7);

const first = recordErrorEvent(getUserDataPath, uid, {
  projectId: project.id,
  taskId: task.id,
  source: "test",
  stderr: "TypeError: cannot read property 'x' of undefined at src/demo.js:12:4",
  message: "TypeError: cannot read property 'x' of undefined",
  file: "src/demo.js",
  ruleText: "add null check before property access",
});
assert.ok(first.lessonId);
assert.ok(first.fingerprint);
assert.strictEqual(first.fingerprint.length, 16);
assert.strictEqual(first.status, "candidate");
assert.strictEqual(first.recurrenceCount, 1);

const second = recordErrorEvent(getUserDataPath, uid, {
  projectId: project.id,
  taskId: task.id,
  source: "test",
  stderr: "TypeError: cannot read property 'x' of undefined at src/demo.js:15:4",
  message: "TypeError: cannot read property 'x' of undefined",
  file: "src/demo.js",
});
assert.strictEqual(second.lessonId, first.lessonId);
assert.strictEqual(second.recurrenceCount, 2);
assert.ok(second.deduped);

const events = db
  .prepare(`SELECT COUNT(*) AS c FROM error_lesson_events WHERE project_id = ?`)
  .get(project.id);
assert.ok(events.c >= 2);

const mdPath = lessonFilePath(getUserDataPath, project.id, first.fingerprint);
assert.ok(fs.existsSync(mdPath), "per-fingerprint markdown should exist");
const md1 = fs.readFileSync(mdPath, "utf8");
const md2 = fs.readFileSync(mdPath, "utf8");
assert.strictEqual(md1, md2, "markdown upsert should overwrite same file");

recordErrorEvent(getUserDataPath, uid, {
  projectId: project.id,
  taskId: task.id,
  source: "test",
  stderr: "TypeError: cannot read property 'x' of undefined at src/demo.js:20:4",
  message: "TypeError: cannot read property 'x' of undefined",
  file: "src/demo.js",
});
const mdUpdated = fs.readFileSync(mdPath, "utf8");
assert.ok(mdUpdated.includes("Recurrence: 3"));

const idxPath = indexFilePath(getUserDataPath, project.id);
assert.ok(fs.existsSync(idxPath));
const indexText = fs.readFileSync(idxPath, "utf8");
assert.ok(indexText.includes(first.fingerprint));

const verified = markVerifiedForTask(getUserDataPath, uid, {
  projectId: project.id,
  taskId: task.id,
  verifyCommand: "npm test",
  verifiedBy: "test",
});
assert.ok(verified.length >= 1);
const stored = lessonStore.findByFingerprint(getUserDataPath, project.id, first.fingerprint);
assert.strictEqual(stored.status, "verified");

console.log("wb-error-lesson-pipeline-test: OK");
try {
  fs.rmSync(userData, { recursive: true, force: true });
} catch {
  /* sqlite lock */
}
