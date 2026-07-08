const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  startAgentRun,
  cancelAgentRun,
  isCurrentRun,
  assertCurrentRun,
  getActiveRunForTask,
} = require("../main/workbench/agentRunStore.js");
const { getDb } = require("../main/workbench/db.js");

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "wb-ars-"));
const getUserDataPath = () => userData;
getDb(getUserDataPath);

const uid = "local-user";
const projectId = "proj_ars";
const taskId = "task_ars";

const first = startAgentRun(getUserDataPath, uid, {
  projectId,
  taskId,
  mode: "PLAN_ONLY",
  inputText: "test",
  timeoutMs: 5000,
});
assert.ok(first.runId);
assert.strictEqual(getActiveRunForTask(getUserDataPath, uid, projectId, taskId).id, first.runId);

try {
  startAgentRun(getUserDataPath, uid, { projectId, taskId, mode: "PLAN_ONLY", inputText: "dup" });
  assert.fail("mutex expected");
} catch (err) {
  assert.strictEqual(err.code, "AGENT_RUN_MUTEX");
}

cancelAgentRun(getUserDataPath, uid, {
  projectId,
  taskId,
  agentRunId: first.runId,
  reason: "test-cancel",
});

assert.strictEqual(isCurrentRun(getUserDataPath, uid, projectId, taskId, first.runId), false);

try {
  assertCurrentRun(getUserDataPath, uid, projectId, taskId, first.runId);
  assert.fail("stale run should fail");
} catch (err) {
  assert.strictEqual(err.code, "AGENT_RUN_STALE");
}

console.log("wb-agent-run-store-test: OK");
try {
  fs.rmSync(userData, { recursive: true, force: true });
} catch {
  /* sqlite lock */
}
