const assert = require("assert");
const {
  classifyCommand,
  isControlledShellCommand,
  isWhitelistedTestCommand,
  runCommand,
} = require("../main/workbench/shellRunnerService.js");
const { assertProjectAgentTool } = require("../main/workbench/toolPermissionService.js");

assert.strictEqual(isWhitelistedTestCommand("node scripts/wb-namespace-test.js"), true);
assert.strictEqual(isControlledShellCommand("npm run build"), true);
assert.strictEqual(isControlledShellCommand("git status"), true);

try {
  classifyCommand("npm run build && del /f");
  assert.fail("should block chaining");
} catch (err) {
  assert.ok(/禁止片段/.test(err.message));
}

try {
  classifyCommand("git push origin main");
  assert.fail("should block git push");
} catch (err) {
  assert.ok(/Git 写操作|白名单/.test(err.message));
}

try {
  assertProjectAgentTool("run_shell_command");
  assert.fail("should require approval");
} catch (err) {
  assert.strictEqual(err.code, "USER_APPROVAL_REQUIRED");
}

assert.doesNotThrow(() => {
  assertProjectAgentTool("run_shell_command", { userApproved: true });
});

(async () => {
  const result = await runCommand(process.cwd(), "node scripts/wb-manage-test.js");
  assert.strictEqual(result.success, true);
  console.log("wb-shell-test: OK");
})();
