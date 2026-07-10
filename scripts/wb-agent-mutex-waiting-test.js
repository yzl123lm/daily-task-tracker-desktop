const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  startAgentRun,
  completeAgentRun,
  getActiveRunForTask,
  getOpenRunForTask,
  releaseStaleRunsForTask,
  RUN_STATUS,
} = require("../main/workbench/agentRunStore.js");
const { getDb } = require("../main/workbench/db.js");

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "wb-mutex-"));
const getUserDataPath = () => userData;
getDb(getUserDataPath);

const uid = "local-user";
const projectId = "proj_mutex";
const taskId = "task_mutex";

const first = startAgentRun(getUserDataPath, uid, {
  projectId,
  taskId,
  mode: "PATCH_PROPOSE",
  inputText: "snake",
  timeoutMs: 60_000,
});

completeAgentRun(getUserDataPath, uid, {
  projectId,
  taskId,
  agentRunId: first.runId,
  output: { summary: "diff ready" },
  status: RUN_STATUS.WAITING_APPROVAL,
});

assert.strictEqual(
  getActiveRunForTask(getUserDataPath, uid, projectId, taskId),
  null,
  "WAITING_APPROVAL must not hold mutex"
);
assert.ok(getOpenRunForTask(getUserDataPath, uid, projectId, taskId)?.id);

const second = startAgentRun(getUserDataPath, uid, {
  projectId,
  taskId,
  mode: "PLAN_ONLY",
  inputText: "regen",
  timeoutMs: 60_000,
});
assert.ok(second.runId);
assert.notStrictEqual(second.runId, first.runId);

const { cancelAgentRun } = require("../main/workbench/agentRunStore.js");
cancelAgentRun(getUserDataPath, uid, {
  projectId,
  taskId,
  agentRunId: second.runId,
  reason: "cleanup",
});

// Orphan WAITING_APPROVAL left in DB should be released automatically.
const db = getDb(getUserDataPath);
const orphanId = `ars_orphan_${Date.now()}`;
const ts = new Date().toISOString();
db.prepare(
  `INSERT INTO agent_run_sessions (
    id, user_id, project_id, task_id, mode, status, input_text,
    output_json, tool_trace_json, error_message,
    started_at, completed_at, created_at, updated_at
  ) VALUES (?, ?, ?, ?, 'PATCH_PROPOSE', 'WAITING_APPROVAL', 'orphan', '{}', '[]', NULL, ?, NULL, ?, ?)`
).run(orphanId, uid, projectId, taskId, ts, ts, ts);

releaseStaleRunsForTask(getUserDataPath, uid, projectId, taskId, { reason: "cleanup" });
assert.strictEqual(getActiveRunForTask(getUserDataPath, uid, projectId, taskId), null);

const third = startAgentRun(getUserDataPath, uid, {
  projectId,
  taskId,
  mode: "PLAN_ONLY",
  inputText: "again",
  timeoutMs: 60_000,
});
assert.ok(third.runId);

cancelAgentRun(getUserDataPath, uid, {
  projectId,
  taskId,
  agentRunId: third.runId,
  reason: "cleanup",
});

console.log("wb-agent-mutex-waiting-test: OK");
try {
  fs.rmSync(userData, { recursive: true, force: true });
} catch {
  /* ignore */
}
