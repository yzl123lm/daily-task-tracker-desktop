const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { getDb } = require("../main/workbench/db.js");
const { createProject, createTask } = require("../main/workbench/projectService.js");
const { assertToolAllowed, dispatchTool } = require("../main/workbench/toolRegistry.js");
const { resolveProfileId } = require("../main/workbench/verificationProfileRegistry.js");
const { grantAutoVerify } = require("../main/workbench/fixLoopStateService.js");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wb-ver-"));
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "wb-ver-ud-"));
fs.writeFileSync(
  path.join(tmpRoot, "package.json"),
  JSON.stringify({ name: "t", scripts: { build: "node -e \"console.log(1)\"" } })
);
const getUserDataPath = () => userData;
getDb(getUserDataPath);

const project = createProject(getUserDataPath, "local-user", {
  name: "verify-tool",
  localPath: tmpRoot,
});
const task = createTask(getUserDataPath, "local-user", project.id, { title: "v" });

assert.strictEqual(resolveProfileId("build"), "build");
try {
  resolveProfileId("npm run build && rm -rf /");
  assert.fail("should reject command injection");
} catch (err) {
  assert.ok(err.code === "VERIFY_PROFILE_INVALID" || err.code === "VERIFY_PROFILE_UNKNOWN");
}

assert.doesNotThrow(() => assertToolAllowed("run_verification", "VERIFY_FIX"));
assert.doesNotThrow(() => assertToolAllowed("list_verification_profiles", "PATCH_PROPOSE"));
try {
  assertToolAllowed("run_verification", "PLAN_ONLY");
  assert.fail("PLAN_ONLY should forbid VERIFY");
} catch (err) {
  assert.strictEqual(err.code, "TOOL_FORBIDDEN");
}

const ctx = {
  getUserDataPath,
  userId: "local-user",
  projectId: project.id,
  taskId: task.id,
  agentRunId: "ars_test",
  mode: "VERIFY_FIX",
  root: tmpRoot,
  autoVerifyGranted: false,
};

(async () => {
  const denied = await dispatchTool(ctx, "run_verification", { profileId: "build" });
  assert.strictEqual(denied.ok, false);
  assert.strictEqual(denied.code, "USER_APPROVAL_REQUIRED");

  grantAutoVerify(getUserDataPath, "local-user", project.id, task.id, { scriptName: "build" });
  ctx.autoVerifyGranted = true;
  const listed = await dispatchTool(ctx, "list_verification_profiles", {});
  assert.ok(listed.ok);
  assert.ok(Array.isArray(listed.profiles));

  const ran = await dispatchTool(ctx, "run_verification", { profileId: "build" });
  if (!(ran.ok || ran.skipped)) {
    console.error("run_verification unexpected:", ran);
  }
  assert.ok(ran.ok || ran.skipped, ran.error || JSON.stringify(ran));

  console.log("wb-verify-tool-test: OK");
})()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
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
  });
