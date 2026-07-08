const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { getDb } = require("../main/workbench/db.js");
const { createProject, createTask } = require("../main/workbench/projectService.js");
const { recordErrorEvent } = require("../main/workbench/error-lessons/errorEventCollector.js");
const { getLessonRefsForSnapshot } = require("../main/workbench/error-lessons/lessonRetriever.js");
const { buildSnapshot } = require("../main/workbench/context-compression/snapshotBuilder.js");
const {
  validateSnapshot,
  validateLessonRefs,
} = require("../main/workbench/context-compression/snapshotValidator.js");
const compressionManager = require("../main/workbench/context-compression/contextCompressionManager.js");

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "wb-slr-"));
const getUserDataPath = () => userData;
getDb(getUserDataPath);

const uid = "local-user";
const project = createProject(getUserDataPath, uid, { name: "snapshot refs", localPath: os.tmpdir() });
const task = createTask(getUserDataPath, uid, project.id, { title: "snapshot task" });

const lesson = recordErrorEvent(getUserDataPath, uid, {
  projectId: project.id,
  taskId: task.id,
  source: "verify",
  stderr: "Error: expected true to be false in test/auth.test.js",
  message: "AssertionError: expected true to be false",
  file: "test/auth.test.js",
  ruleText: "update fixture expectations before changing auth logic",
});

const refs = getLessonRefsForSnapshot(getUserDataPath, uid, {
  projectId: project.id,
  taskId: task.id,
  message: "auth test assertion",
});
assert.ok(refs.length >= 1);
assert.ok(refs[0].lessonId);
assert.ok(refs[0].fingerprint);
assert.ok(refs[0].status);
assert.ok("ruleText" in refs[0]);
assert.ok(!("rawExcerpt" in refs[0]));
assert.ok(!("errorSignature" in refs[0]));

const snapshot = buildSnapshot({
  namespace: `task:${project.id}:${task.id}`,
  plan: { blocks: [{ role: "user", content: "修复 auth 测试", action: "keep_raw" }] },
  runtimeState: { mode: "normal", reason: "manual" },
  lessonRefs: refs,
});
assert.ok(Array.isArray(snapshot.lessonRefs));
assert.strictEqual(snapshot.lessonRefs[0].lessonId, lesson.lessonId);
assert.strictEqual(snapshot.lessonRefs[0].fingerprint, lesson.fingerprint);

const validation = validateSnapshot(snapshot, { scopeType: "task" });
assert.strictEqual(validation.valid, true);

const badRefs = [{ lessonId: "x" }];
assert.ok(validateLessonRefs(badRefs, { scopeType: "task" }).length > 0);

const result = compressionManager.applyCompression(getUserDataPath, uid, {
  namespace: `task:${project.id}:${task.id}`,
  messages: [
    { role: "user", content: "必须保留 JWT 登录方案。" },
    { role: "assistant", content: "将修复 auth 测试断言。" },
  ],
  reason: "manual",
});
assert.strictEqual(result.applied, true);
assert.ok(Array.isArray(result.snapshot?.snapshot?.lessonRefs));

console.log("wb-snapshot-lesson-refs-test: OK");
try {
  fs.rmSync(userData, { recursive: true, force: true });
} catch {
  /* sqlite lock */
}
