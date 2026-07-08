const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  createStagedPatch,
  updatePatchStatus,
  PATCH_STATUS,
  listStagedPatches,
} = require("../main/workbench/patchStagingService.js");
const { getDb } = require("../main/workbench/db.js");

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "wb-ps-"));
const getUserDataPath = () => userData;
getDb(getUserDataPath);

const uid = "local-user";
const projectId = "proj_ps";
const taskId = "task_ps";

const patch = createStagedPatch(getUserDataPath, uid, {
  projectId,
  taskId,
  filePath: "src/demo.js",
  originalContent: "a\n",
  proposedContent: "b\n",
  unifiedDiff: "---\n+++",
  summary: "test patch",
});
assert.strictEqual(patch.status, PATCH_STATUS.STAGED);

const accepted = updatePatchStatus(
  getUserDataPath,
  uid,
  projectId,
  taskId,
  patch.id,
  PATCH_STATUS.ACCEPTED
);
assert.strictEqual(accepted.status, PATCH_STATUS.ACCEPTED);

const applied = updatePatchStatus(
  getUserDataPath,
  uid,
  projectId,
  taskId,
  patch.id,
  PATCH_STATUS.APPLIED
);
assert.strictEqual(applied.status, PATCH_STATUS.APPLIED);

const all = listStagedPatches(getUserDataPath, uid, projectId, taskId);
assert.strictEqual(all.length, 1);

try {
  updatePatchStatus(getUserDataPath, uid, projectId, taskId, patch.id, PATCH_STATUS.STAGED);
  assert.fail("invalid transition");
} catch (err) {
  assert.strictEqual(err.code, "INVALID_PATCH_TRANSITION");
}

console.log("wb-patch-staging-test: OK");
try {
  fs.rmSync(userData, { recursive: true, force: true });
} catch {
  /* sqlite lock */
}
