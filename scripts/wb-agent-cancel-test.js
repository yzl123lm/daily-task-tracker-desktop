const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { getDb } = require("../main/workbench/db.js");
const { createProject, createTask } = require("../main/workbench/projectService.js");
const {
  startAgentRun,
  cancelAgentRun,
  isRunCanceled,
  getRunAbortSignal,
  RUN_STATUS,
} = require("../main/workbench/agentRunStore.js");

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "wb-ac-"));
const getUserDataPath = () => userData;
getDb(getUserDataPath);

const uid = "local-user";
const project = createProject(getUserDataPath, uid, { name: "cancel", localPath: os.tmpdir() });
const task = createTask(getUserDataPath, uid, project.id, { title: "cancel task" });

const started = startAgentRun(getUserDataPath, uid, {
  projectId: project.id,
  taskId: task.id,
  mode: "PLAN_ONLY",
  inputText: "test",
  timeoutMs: 60_000,
});
assert.ok(started.runId);
assert.ok(started.signal);
assert.strictEqual(started.signal.aborted, false);
assert.strictEqual(isRunCanceled(started.runId), false);

let aborted = false;
started.signal.addEventListener("abort", () => {
  aborted = true;
});

const canceled = cancelAgentRun(getUserDataPath, uid, {
  projectId: project.id,
  taskId: task.id,
  agentRunId: started.runId,
  reason: "user_stop",
});
assert.strictEqual(canceled.status, RUN_STATUS.CANCELED);
assert.ok(canceled.canceledAt);
assert.strictEqual(canceled.wasLLMAborted, true);
assert.strictEqual(aborted, true);
assert.strictEqual(isRunCanceled(started.runId), false);
assert.strictEqual(getRunAbortSignal(started.runId), null);

// mutex after cancel allows new run
const started2 = startAgentRun(getUserDataPath, uid, {
  projectId: project.id,
  taskId: task.id,
  mode: "PLAN_ONLY",
  inputText: "again",
  timeoutMs: 60_000,
});
assert.ok(started2.runId);
assert.notStrictEqual(started2.runId, started.runId);
cancelAgentRun(getUserDataPath, uid, {
  projectId: project.id,
  taskId: task.id,
  agentRunId: started2.runId,
  reason: "cleanup",
});

console.log("wb-agent-cancel-test: OK");
try {
  fs.rmSync(userData, { recursive: true, force: true });
} catch {
  /* ignore */
}
