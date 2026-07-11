const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { getDb } = require("../main/workbench/db.js");
const { createProject, createTask, getTask } = require("../main/workbench/projectService.js");
const {
  createDraftSpec,
  saveTaskSpec,
  confirmTaskSpec,
  SPEC_STATUS,
} = require("../main/workbench/taskSpecService.js");
const { evaluateCompletion } = require("../main/workbench/completionGuardService.js");
const { tryMarkTaskCompleted } = require("../main/workbench/taskCompletionService.js");
const { createStagedPatch } = require("../main/workbench/patchStagingService.js");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wb-cg-"));
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "wb-cg-ud-"));
const getUserDataPath = () => userData;
getDb(getUserDataPath);

const project = createProject(getUserDataPath, "local-user", {
  name: "guard",
  localPath: tmpRoot,
});
const task = createTask(getUserDataPath, "local-user", project.id, {
  title: "guard task",
  description: "做一个贪吃蛇小游戏，纯 HTML/CSS/JS",
});

// Legacy path without spec: verify ok => complete
{
  const marked = tryMarkTaskCompleted(getUserDataPath, "local-user", project.id, task.id, {
    verifyResult: { ok: true, skipped: true, message: "skipped" },
    currentStep: "ok",
  });
  assert.ok(marked.completed);
  assert.strictEqual(getTask(getUserDataPath, "local-user", project.id, task.id).status, "COMPLETED");
}

const task2 = createTask(getUserDataPath, "local-user", project.id, {
  title: "with spec",
  description: "帮我开发一个团队任务管理系统，支持账号登录",
});
let draft = createDraftSpec({
  message: task2.description,
  project,
  task: task2,
  plan: ["a"],
});
saveTaskSpec(getUserDataPath, "local-user", project.id, task2.id, draft);
const blockedClarify = evaluateCompletion(getUserDataPath, "local-user", {
  projectId: project.id,
  taskId: task2.id,
  verifyResult: { ok: true, skipped: true },
});
assert.strictEqual(blockedClarify.ok, false);
assert.ok(blockedClarify.blockers.some((b) => b.code === "OPEN_CLARIFICATION"));

const answers = {};
for (const q of draft.openQuestions) answers[q.id] = "默认";
draft = confirmTaskSpec(getUserDataPath, "local-user", project.id, task2.id, { answers });
assert.strictEqual(draft.status, SPEC_STATUS.APPROVED);

fs.writeFileSync(path.join(tmpRoot, "app.js"), "function main() {\n  // TODO: implement\n  return null;\n}\n");
createStagedPatch(getUserDataPath, "local-user", {
  projectId: project.id,
  taskId: task2.id,
  filePath: "app.js",
  originalContent: "",
  proposedContent: fs.readFileSync(path.join(tmpRoot, "app.js"), "utf8"),
  unifiedDiff: "diff",
  summary: "add app",
});

const blockedStaged = evaluateCompletion(getUserDataPath, "local-user", {
  projectId: project.id,
  taskId: task2.id,
  verifyResult: { ok: true, skipped: true },
});
assert.strictEqual(blockedStaged.ok, false);
assert.ok(blockedStaged.blockers.some((b) => b.code === "STAGED_PATCHES_PENDING"));

console.log("wb-completion-guard-test: OK");
try {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
} catch {
  /* ignore */
}
try {
  fs.rmSync(userData, { recursive: true, force: true });
} catch {
  /* sqlite lock */
}
