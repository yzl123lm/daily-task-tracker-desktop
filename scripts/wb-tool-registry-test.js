const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  assertToolAllowed,
  dispatchTool,
  getToolDef,
} = require("../main/workbench/toolRegistry.js");
const { getDb } = require("../main/workbench/db.js");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wb-tr-"));
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "wb-tr-ud-"));
const getUserDataPath = () => userData;
getDb(getUserDataPath);

const ctx = {
  getUserDataPath,
  userId: "local-user",
  projectId: "proj_tr",
  taskId: "task_tr",
  agentRunId: "ars_test",
  mode: "PLAN_ONLY",
  root: tmpRoot,
};

try {
  assertToolAllowed("unknown_tool_xyz", "PLAN_ONLY");
  assert.fail("unknown tool should throw");
} catch (err) {
  assert.strictEqual(err.code, "TOOL_UNKNOWN");
}

try {
  assertToolAllowed("stage_patch", "PLAN_ONLY");
  assert.fail("stage_patch should be forbidden in PLAN_ONLY");
} catch (err) {
  assert.strictEqual(err.code, "TOOL_FORBIDDEN");
}

assert.doesNotThrow(() => assertToolAllowed("mock_echo", "PLAN_ONLY"));

(async () => {
  const result = await dispatchTool(ctx, "mock_echo", { text: "hello" });
  assert.strictEqual(result.echo, "hello");

  const db = getDb(getUserDataPath);
  const row = db.prepare("SELECT * FROM tool_operations ORDER BY created_at DESC LIMIT 1").get();
  assert.ok(row);
  assert.strictEqual(row.tool_name, "mock_echo");
  assert.strictEqual(row.project_id, "proj_tr");

  console.log("wb-tool-registry-test: OK");
})().catch((err) => {
  console.error(err);
  process.exit(1);
}).finally(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  try {
    fs.rmSync(userData, { recursive: true, force: true });
  } catch {
    /* sqlite lock */
  }
});
