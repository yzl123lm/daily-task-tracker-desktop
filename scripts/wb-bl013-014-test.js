/**
 * BL-013~014: Diagnosis, Fix Loop attempts, Checkpoint merge, idempotency, recovery
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { getDb } = require("../main/workbench/db.js");
const { createProject, createTask } = require("../main/workbench/projectService.js");
const {
  buildDiagnosis,
  buildDiagnosisFromVerify,
  formatDiagnosisForPrompt,
  FAILURE_CATEGORY,
} = require("../main/workbench/diagnosisService.js");
const {
  createInitialFixLoopState,
  saveFixLoopState,
  getFixLoopState,
  appendFixLoopAttempt,
  isDuplicateFailedAttempt,
  FIX_LOOP_PHASE,
} = require("../main/workbench/fixLoopStateService.js");
const {
  mergeCheckpoint,
  getCheckpoint,
  createGreenCheckpoint,
  CHECKPOINT_VERSION,
} = require("../main/workbench/checkpointService.js");
const { claimIdempotencyKey } = require("../main/workbench/idempotencyService.js");
const { recoverTaskState } = require("../main/workbench/taskRecoveryService.js");
const { pickBackupsForAttempt } = require("../main/workbench/fixLoopRollbackService.js");
const { savePlanSteps } = require("../main/workbench/planStepsService.js");
const { advancePlanStep } = require("../main/workbench/planExecutionService.js");

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "wb-bl013-"));
const getUserDataPath = () => userData;
getDb(getUserDataPath);
const uid = "local-user";
const project = createProject(getUserDataPath, uid, { name: "bl013", localPath: os.tmpdir() });
const task = createTask(getUserDataPath, uid, project.id, { title: "diag recover" });

// ——— Diagnosis ———
const typeDiag = buildDiagnosis({
  source: "verify",
  stderr: "error TS2322: Type 'number' is not assignable to type 'string'.",
  verifyCommand: "npm run typecheck",
});
assert.strictEqual(typeDiag.diagnosisVersion, 1);
assert.strictEqual(typeDiag.failureCategory, FAILURE_CATEGORY.TYPE);
assert.ok(typeDiag.falsifiableCheck?.description);
assert.ok(typeDiag.suggestedTools.includes("stage_patch"));
assert.ok(formatDiagnosisForPrompt(typeDiag).includes("Diagnosis"));

const depDiag = buildDiagnosis({
  source: "verify",
  stderr: "Error: Cannot find module 'missing-pkg'",
});
assert.strictEqual(depDiag.failureCategory, FAILURE_CATEGORY.DEPENDENCY);

const fromVerify = buildDiagnosisFromVerify({
  ok: false,
  stderr: "ECONNREFUSED",
  command: "npm test",
  parsed: { summary: "network down", issues: [] },
});
assert.strictEqual(fromVerify.failureCategory, FAILURE_CATEGORY.NETWORK);

// ——— Fix Loop attempts ———
const fl = createInitialFixLoopState({
  projectId: project.id,
  taskId: task.id,
  scriptName: "build",
  agentRunId: "run1",
});
appendFixLoopAttempt(fl, {
  round: 0,
  diagnosis: typeDiag,
  fingerprint: typeDiag.fingerprint,
  result: "verify_fail",
});
assert.strictEqual(fl.attempts.length, 1);
assert.strictEqual(fl.lastDiagnosis.failureCategory, FAILURE_CATEGORY.TYPE);
assert.strictEqual(isDuplicateFailedAttempt(fl, typeDiag.fingerprint), true);
assert.strictEqual(isDuplicateFailedAttempt(fl, "other-fp"), false);
saveFixLoopState(getUserDataPath, uid, project.id, task.id, fl);
const loaded = getFixLoopState(getUserDataPath, uid, project.id, task.id);
assert.strictEqual(loaded.attempts.length, 1);

// ——— Checkpoint merge + green ———
mergeCheckpoint(getUserDataPath, uid, project.id, task.id, {
  phase: "PLAN_RUNNING",
  completedIds: ["s1"],
  fixLoop: { round: 0 },
});
mergeCheckpoint(getUserDataPath, uid, project.id, task.id, {
  completedIds: ["s2"],
  fixLoop: { phase: FIX_LOOP_PHASE.WAITING_APPLY },
});
const ckpt = getCheckpoint(getUserDataPath, uid, project.id, task.id);
assert.strictEqual(ckpt.version, CHECKPOINT_VERSION);
assert.ok(ckpt.completedIds.includes("s1") && ckpt.completedIds.includes("s2"));
assert.strictEqual(ckpt.fixLoop.phase, FIX_LOOP_PHASE.WAITING_APPLY);
assert.strictEqual(ckpt.fixLoop.round, 0);

createGreenCheckpoint(getUserDataPath, uid, project.id, task.id, {
  label: "test_green",
  verify: { ok: true, scriptName: "build" },
  appliedPatchIds: ["p1"],
});
const green = getCheckpoint(getUserDataPath, uid, project.id, task.id);
assert.ok(green.lastGreen?.isGreen);
assert.ok(green.appliedPatchIds.includes("p1"));

// ——— Idempotency ———
const c1 = claimIdempotencyKey(getUserDataPath, uid, {
  projectId: project.id,
  taskId: task.id,
  key: "apply:p1:r1",
  action: "apply",
});
const c2 = claimIdempotencyKey(getUserDataPath, uid, {
  projectId: project.id,
  taskId: task.id,
  key: "apply:p1:r1",
  action: "apply",
});
assert.strictEqual(c1.duplicate, false);
assert.strictEqual(c2.duplicate, true);

// ——— Plan step idempotency ———
savePlanSteps(getUserDataPath, uid, project.id, task.id, [
  { id: "s1", text: "one", dependencies: [] },
  { id: "s2", text: "two", dependencies: ["s1"] },
]);
const a1 = advancePlanStep(getUserDataPath, uid, project.id, task.id, {
  stepId: "s1",
  status: "done",
});
assert.strictEqual(a1.ok, true);
const a2 = advancePlanStep(getUserDataPath, uid, project.id, task.id, {
  stepId: "s1",
  status: "done",
});
assert.strictEqual(a2.duplicate, true);

// ——— Recovery ———
loaded.phase = FIX_LOOP_PHASE.WAITING_APPLY;
loaded.active = true;
saveFixLoopState(getUserDataPath, uid, project.id, task.id, loaded);
const recovery = recoverTaskState(getUserDataPath, uid, {
  projectId: project.id,
  taskId: task.id,
});
assert.strictEqual(recovery.action, "resume_waiting_apply");

// ——— Rollback helper ———
const picked = pickBackupsForAttempt(
  [
    { id: "b1", createdAt: new Date().toISOString(), canRestore: true },
    { id: "b2", createdAt: "2020-01-01T00:00:00.000Z", canRestore: true },
  ],
  { backupIds: ["b1"], startedAt: new Date().toISOString() }
);
assert.strictEqual(picked.length, 1);
assert.strictEqual(picked[0].id, "b1");

console.log("wb-bl013-014-test: OK");
