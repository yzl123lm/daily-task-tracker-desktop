const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { getDb } = require("../main/workbench/db.js");
const { createProject, createTask } = require("../main/workbench/projectService.js");
const {
  createStagedPatch,
  updatePatchStatus,
  PATCH_STATUS,
  listStagedPatches,
} = require("../main/workbench/patchStagingService.js");
const { applyAcceptedPatches } = require("../main/workbench/controlledDevService.js");
const symbolIndexService = require("../main/workbench/symbolIndexService.js");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wb-apply-"));
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "wb-apply-ud-"));
const getUserDataPath = () => userData;
getDb(getUserDataPath);

const uid = "local-user";
const rel = "src/demo.js";
fs.mkdirSync(path.join(tmpRoot, "src"), { recursive: true });
fs.writeFileSync(path.join(tmpRoot, rel), "before\n", "utf8");

const project = createProject(getUserDataPath, uid, { name: "apply batch", localPath: tmpRoot });
const task = createTask(getUserDataPath, uid, project.id, { title: "apply task" });

const staged = createStagedPatch(getUserDataPath, uid, {
  projectId: project.id,
  taskId: task.id,
  filePath: rel,
  originalContent: "before\n",
  proposedContent: "after\n",
  summary: "batch apply",
});
updatePatchStatus(getUserDataPath, uid, project.id, task.id, staged.id, PATCH_STATUS.ACCEPTED);

const stagedOnly = createStagedPatch(getUserDataPath, uid, {
  projectId: project.id,
  taskId: task.id,
  filePath: "other.js",
  originalContent: "",
  proposedContent: "x",
  summary: "not accepted",
});

// T5: 403 without userApproved
try {
  applyAcceptedPatches(getUserDataPath, uid, {
    projectId: project.id,
    taskId: task.id,
    patchIds: [staged.id],
    userApproved: false,
    approvalId: "appr_1",
  });
  assert.fail("should require userApproved");
} catch (err) {
  assert.strictEqual(err.code, "USER_APPROVAL_REQUIRED");
  assert.strictEqual(err.status, 403);
}

try {
  applyAcceptedPatches(getUserDataPath, uid, {
    projectId: project.id,
    taskId: task.id,
    patchIds: [staged.id],
    userApproved: true,
  });
  assert.fail("should require approvalId");
} catch (err) {
  assert.strictEqual(err.code, "APPROVAL_ID_REQUIRED");
}

// T4: ACCEPTED-only batch apply
symbolIndexService.getCachedIndex(tmpRoot);
const first = symbolIndexService.getCachedIndex(tmpRoot);
const second = symbolIndexService.getCachedIndex(tmpRoot);
assert.strictEqual(first.fingerprint, second.fingerprint);

const batch = applyAcceptedPatches(
  getUserDataPath,
  uid,
  {
    projectId: project.id,
    taskId: task.id,
    patchIds: [staged.id],
    userApproved: true,
    approvalId: "appr_batch_1",
    requestId: "req_1",
  },
  { getDefaultProjectRoot: () => tmpRoot }
);
assert.strictEqual(batch.ok, true);
assert.strictEqual(fs.readFileSync(path.join(tmpRoot, rel), "utf8"), "after\n");
assert.ok(batch.appliedIds.includes(staged.id));

const patches = listStagedPatches(getUserDataPath, uid, project.id, task.id);
const applied = patches.find((p) => p.id === staged.id);
assert.strictEqual(applied.status, PATCH_STATUS.APPLIED);
const stillStaged = patches.find((p) => p.id === stagedOnly.id);
assert.strictEqual(stillStaged.status, PATCH_STATUS.STAGED);

symbolIndexService.invalidateCache(tmpRoot);
const afterInvalidate = symbolIndexService.getCachedIndex(tmpRoot);
assert.notStrictEqual(first.fingerprint, afterInvalidate.fingerprint);

console.log("wb-apply-approved-test: OK");
fs.rmSync(tmpRoot, { recursive: true, force: true });
try {
  fs.rmSync(userData, { recursive: true, force: true });
} catch {
  /* sqlite lock */
}
