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
const { runStaticSmokeVerification } = require("../main/workbench/staticSmokeVerification.js");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wb-cg-"));
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "wb-cg-ud-"));
const getUserDataPath = () => userData;
getDb(getUserDataPath);

const project = createProject(getUserDataPath, "local-user", {
  name: "guard",
  localPath: tmpRoot,
});

// BL-003: legacy + skipped must NOT complete
{
  const task = createTask(getUserDataPath, "local-user", project.id, {
    title: "legacy skip",
    description: "x",
  });
  const marked = tryMarkTaskCompleted(getUserDataPath, "local-user", project.id, task.id, {
    verifyResult: { ok: true, skipped: true, message: "skipped" },
    currentStep: "ok",
    persistEvidence: false,
  });
  assert.strictEqual(marked.completed, false);
  assert.ok(marked.guard.blockers.some((b) => b.code === "VERIFY_SKIPPED" || b.code === "VERIFY_REQUIRED"));
  assert.strictEqual(getTask(getUserDataPath, "local-user", project.id, task.id).status, "BLOCKED");
}

// BL-003: legacy + real verify ok can complete
{
  const task = createTask(getUserDataPath, "local-user", project.id, {
    title: "legacy ok",
    description: "x",
  });
  const marked = tryMarkTaskCompleted(getUserDataPath, "local-user", project.id, task.id, {
    verifyResult: {
      ok: true,
      skipped: false,
      profileId: "build",
      evidence: [{ type: "command_exit", exitCode: 0 }],
    },
    persistEvidence: false,
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
  verifyResult: { ok: true, skipped: false, evidence: [{ type: "x" }] },
});
assert.strictEqual(blockedClarify.ok, false);
assert.ok(blockedClarify.blockers.some((b) => b.code === "OPEN_CLARIFICATION" || b.code === "SPEC_NOT_APPROVED"));

const answers = {};
for (const q of draft.openQuestions) answers[q.id] = "默认";
draft = confirmTaskSpec(getUserDataPath, "local-user", project.id, task2.id, { answers });
assert.strictEqual(draft.status, SPEC_STATUS.APPROVED);

// skipped still blocked after approve
{
  const skipped = evaluateCompletion(getUserDataPath, "local-user", {
    projectId: project.id,
    taskId: task2.id,
    verifyResult: { ok: true, skipped: true },
  });
  assert.strictEqual(skipped.ok, false);
  assert.ok(skipped.blockers.some((b) => b.code === "VERIFY_SKIPPED"));
}

fs.writeFileSync(path.join(tmpRoot, "index.html"), "<!doctype html><html><body>ok</body></html>\n");
fs.writeFileSync(path.join(tmpRoot, "app.js"), "function main() {\n  return 1;\n}\n");

const smoke = runStaticSmokeVerification(tmpRoot);
assert.ok(smoke.ok);
assert.strictEqual(smoke.skipped, false);

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
  verifyResult: smoke,
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
