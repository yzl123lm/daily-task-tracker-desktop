const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { getDb } = require("../main/workbench/db.js");
const { createProject, createTask } = require("../main/workbench/projectService.js");
const { recordErrorEvent } = require("../main/workbench/error-lessons/errorEventCollector.js");
const lessonStore = require("../main/workbench/error-lessons/lessonStore.js");
const { markVerifiedByFingerprint } = require("../main/workbench/error-lessons/lessonStatusUpdater.js");
const { retrieveLessonsForContext } = require("../main/workbench/error-lessons/lessonRetriever.js");

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "wb-lret-"));
const getUserDataPath = () => userData;
getDb(getUserDataPath);

const uid = "local-user";
const project = createProject(getUserDataPath, uid, { name: "retriever", localPath: os.tmpdir() });
const task = createTask(getUserDataPath, uid, project.id, { title: "retriever task" });

const lessonA = recordErrorEvent(getUserDataPath, uid, {
  projectId: project.id,
  taskId: task.id,
  source: "verify",
  message: "Build failed: missing export in auth.service.ts",
  file: "src/auth.service.ts",
  ruleText: "export all public service methods",
});
const lessonB = recordErrorEvent(getUserDataPath, uid, {
  projectId: project.id,
  taskId: task.id,
  source: "patch",
  message: "Patch context mismatch near duplicate function block",
  file: "src/patchTarget.js",
  ruleText: "use unique patch anchors",
});

for (let i = 0; i < 3; i += 1) {
  recordErrorEvent(getUserDataPath, uid, {
    projectId: project.id,
    taskId: task.id,
    source: "verify",
    message: "Build failed: missing export in auth.service.ts",
    file: "src/auth.service.ts",
  });
}
const bumped = lessonStore.findByFingerprint(getUserDataPath, project.id, lessonA.fingerprint);
assert.ok(bumped.recurrenceCount >= 4);

markVerifiedByFingerprint(getUserDataPath, uid, {
  projectId: project.id,
  fingerprint: lessonA.fingerprint,
  verifyCommand: "npm run build",
});

const pack = retrieveLessonsForContext(getUserDataPath, uid, {
  projectId: project.id,
  taskId: task.id,
  message: "fix auth.service export issue",
  relatedFiles: ["src/auth.service.ts"],
  tokenBudget: 2000,
});
assert.ok(pack.verified.length >= 1);
assert.ok(pack.candidate.length >= 1);
assert.ok(pack.formattedText.includes("必须优先遵守"));
assert.ok(pack.formattedText.includes("参考"));
assert.ok(pack.estimatedTokens >= 1);
assert.ok(pack.lessonRefs.every((r) => r.lessonId && r.fingerprint && r.status && "ruleText" in r));

const otherProject = createProject(getUserDataPath, uid, { name: "other", localPath: os.tmpdir() });
recordErrorEvent(getUserDataPath, uid, {
  projectId: otherProject.id,
  taskId: task.id,
  source: "test",
  message: "Should not leak across projects",
});
const scoped = retrieveLessonsForContext(getUserDataPath, uid, {
  projectId: project.id,
  taskId: task.id,
  message: "auth.service",
});
assert.ok(scoped.verified.every((l) => l.projectId === project.id));
assert.ok(scoped.candidate.every((l) => l.projectId === project.id));

console.log("wb-lesson-retriever-test: OK");
try {
  fs.rmSync(userData, { recursive: true, force: true });
} catch {
  /* sqlite lock */
}
