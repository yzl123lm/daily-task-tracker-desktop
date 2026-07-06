const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  listTreeEntries,
  readProjectFile,
  searchProjectCode,
  analyzeProjectCode,
} = require("../main/workbench/projectCodeService.js");
const { buildPatchPreview } = require("../main/workbench/diffPreviewService.js");
const {
  isWhitelistedTestCommand,
  runWhitelistedCommand,
} = require("../main/workbench/testRunnerService.js");
const { assertProjectAgentTool } = require("../main/workbench/toolPermissionService.js");

async function main() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wb-code-"));
  const sampleFile = path.join(tmpRoot, "hello.js");
  fs.writeFileSync(sampleFile, "function greet() {\n  return 'hi';\n}\n", "utf8");

  const entries = listTreeEntries(tmpRoot);
  assert.ok(entries.some((e) => e.path === "hello.js" && e.type === "file"));

  const file = readProjectFile(tmpRoot, "hello.js");
  assert.ok(file.content.includes("greet"));

  const hits = searchProjectCode(tmpRoot, "greet");
  assert.ok(hits.length >= 1);

  const analysis = analyzeProjectCode({ localPath: tmpRoot }, "search greet function");
  assert.ok(analysis.relevantFiles.includes("hello.js"));

  const diff = buildPatchPreview({
    filePath: "hello.js",
    originalContent: file.content,
    proposedContent: `// plan\n${file.content}`,
  });
  assert.ok(diff.unifiedDiff.includes("+// plan"));
  assert.strictEqual(diff.writeApplied, false);

  assert.strictEqual(isWhitelistedTestCommand("node scripts/wb-code-read-test.js"), true);
  assert.strictEqual(isWhitelistedTestCommand("rm -rf /"), false);

try {
  assertProjectAgentTool("write_project_file");
  assert.fail("should require approval");
} catch (err) {
  assert.strictEqual(err.code, "USER_APPROVAL_REQUIRED");
}

try {
  assertProjectAgentTool("write_project_file");
  assert.fail("should forbid write without approval");
} catch (err) {
  assert.strictEqual(err.code, "USER_APPROVAL_REQUIRED");
}

  const projectRoot = path.resolve(__dirname, "..");
  const testResult = await runWhitelistedCommand(projectRoot, "node scripts/wb-namespace-test.js");
  assert.strictEqual(testResult.success, true);

  fs.rmSync(tmpRoot, { recursive: true, force: true });
  console.log("wb-code-read-test: OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

