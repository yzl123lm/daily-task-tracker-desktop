const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { getDb } = require("../main/workbench/db.js");
const { createProject, createTask } = require("../main/workbench/projectService.js");
const {
  FIX_LOOP_PHASE,
  MAX_FIX_ROUNDS,
  createInitialFixLoopState,
  saveFixLoopState,
  getFixLoopState,
  clearFixLoopState,
  assertFixLoopResume,
  appendFixLoopEvent,
} = require("../main/workbench/fixLoopStateService.js");
const {
  PATCH_STATUS,
  updatePatchStatus,
  createStagedPatch,
} = require("../main/workbench/patchStagingService.js");

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "wb-fl-"));
const getUserDataPath = () => userData;
getDb(getUserDataPath);

const uid = "local-user";
const project = createProject(getUserDataPath, uid, { name: "fixLoop test", localPath: os.tmpdir() });
const task = createTask(getUserDataPath, uid, project.id, { title: "fix loop task" });

// T1: initial state + phase persistence
const initial = createInitialFixLoopState({
  projectId: project.id,
  taskId: task.id,
  scriptName: "build",
  agentRunId: "run_test_1",
});
assert.strictEqual(initial.phase, FIX_LOOP_PHASE.VERIFYING);
assert.strictEqual(initial.maxRounds, MAX_FIX_ROUNDS);
assert.ok(initial.verifyAttemptId);
saveFixLoopState(getUserDataPath, uid, project.id, task.id, initial);
const loaded = getFixLoopState(getUserDataPath, uid, project.id, task.id);
assert.strictEqual(loaded.phase, FIX_LOOP_PHASE.VERIFYING);
assert.strictEqual(loaded.agentRunId, "run_test_1");

// T2: assertFixLoopResume guards
const waiting = {
  ...loaded,
  phase: FIX_LOOP_PHASE.WAITING_APPLY,
  lastStagedPatchIds: ["patch_a"],
};
saveFixLoopState(getUserDataPath, uid, project.id, task.id, waiting);
assert.doesNotThrow(() => {
  assertFixLoopResume(getFixLoopState(getUserDataPath, uid, project.id, task.id), {
    patchIds: ["patch_a"],
    agentRunId: "run_test_1",
  });
});
try {
  assertFixLoopResume(getFixLoopState(getUserDataPath, uid, project.id, task.id), {
    agentRunId: "stale_run",
  });
  assert.fail("stale agentRunId should throw");
} catch (err) {
  assert.strictEqual(err.code, "FIX_LOOP_STALE");
}
try {
  assertFixLoopResume({ active: true, phase: FIX_LOOP_PHASE.VERIFYING });
  assert.fail("bad phase should throw");
} catch (err) {
  assert.strictEqual(err.code, "FIX_LOOP_BAD_PHASE");
}

// T3: idempotent verifyAttemptId on re-save
const beforeId = waiting.verifyAttemptId;
waiting.phase = FIX_LOOP_PHASE.APPLYING;
saveFixLoopState(getUserDataPath, uid, project.id, task.id, waiting);
const afterApply = getFixLoopState(getUserDataPath, uid, project.id, task.id);
assert.strictEqual(afterApply.verifyAttemptId, beforeId);

appendFixLoopEvent(getUserDataPath, uid, project.id, task.id, {
  action: "verify_start",
  phase: FIX_LOOP_PHASE.VERIFYING,
  round: 0,
  message: "test event",
});
clearFixLoopState(getUserDataPath, uid, project.id, task.id);
assert.strictEqual(getFixLoopState(getUserDataPath, uid, project.id, task.id), null);

// patch status extension
const patch = createStagedPatch(getUserDataPath, uid, {
  projectId: project.id,
  taskId: task.id,
  filePath: "x.js",
  originalContent: "a",
  proposedContent: "b",
  summary: "rev",
});
const rev = updatePatchStatus(getUserDataPath, uid, project.id, task.id, patch.id, PATCH_STATUS.REVISION_REQUESTED);
assert.strictEqual(rev.status, PATCH_STATUS.REVISION_REQUESTED);
const superseded = updatePatchStatus(
  getUserDataPath,
  uid,
  project.id,
  task.id,
  patch.id,
  PATCH_STATUS.SUPERSEDED
);
assert.strictEqual(superseded.status, PATCH_STATUS.SUPERSEDED);

console.log("wb-fix-loop-test: OK");
try {
  fs.rmSync(userData, { recursive: true, force: true });
} catch {
  /* sqlite lock */
}
