const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { writeProjectFile } = require("../main/workbench/projectWriteService.js");
const { buildFixSuggestions } = require("../main/workbench/fixSuggestionService.js");
const { assertProjectAgentTool } = require("../main/workbench/toolPermissionService.js");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wb-ctrl-"));
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "wb-ud-"));
const getUserDataPath = () => userData;

try {
  assertProjectAgentTool("write_project_file");
  assert.fail("should require approval");
} catch (err) {
  assert.strictEqual(err.code, "USER_APPROVAL_REQUIRED");
}

assert.doesNotThrow(() => {
  assertProjectAgentTool("write_project_file", { userApproved: true });
});

const rel = "sample.txt";
const abs = path.join(tmpRoot, rel);
fs.writeFileSync(abs, "before\n", "utf8");

const writeRes = writeProjectFile(getUserDataPath, "local-user", tmpRoot, rel, "after\n", {
  projectId: "proj_test",
  taskId: "task_test",
});
assert.strictEqual(fs.readFileSync(abs, "utf8"), "after\n");
assert.ok(writeRes.patch.writeApplied);
assert.ok(fs.existsSync(writeRes.backup.backupPath));

const fix = buildFixSuggestions({ success: false, exitCode: 1, stderr: "AssertionError: expected true" });
assert.ok(fix.suggestions.some((s) => /断言/.test(s.text)));

fs.rmSync(tmpRoot, { recursive: true, force: true });
try {
  fs.rmSync(userData, { recursive: true, force: true });
} catch {
  /* sqlite lock on Windows */
}

console.log("wb-controlled-dev-test: OK");
