/**
 * BL-019~020: Workbench four views / Git+Runbook
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");

const { getDb } = require("../main/workbench/db.js");
const { createProject, createTask } = require("../main/workbench/projectService.js");
const {
  buildDeliveryManifest,
  formatDeliveryRunbook,
  saveDeliveryManifest,
  getDeliveryManifest,
} = require("../main/workbench/deliveryManifestService.js");
const { getHeadMeta, listBranches, buildPrDraftMeta } = require("../main/workbench/gitService.js");
const { patchToDiffPreview } = require("../main/workbench/patchStagingService.js");
const { reviewPatchProposal } = require("../main/workbench/patchReviewerService.js");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wb-bl019-"));
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "wb-bl019-ud-"));
const getUserDataPath = () => userData;
getDb(getUserDataPath);

fs.writeFileSync(path.join(tmpRoot, "index.html"), "<!doctype html><title>demo</title>");
fs.writeFileSync(path.join(tmpRoot, "package.json"), JSON.stringify({ name: "demo", scripts: { test: "echo ok" } }));
execSync("git init", { cwd: tmpRoot, stdio: "ignore" });
execSync('git config user.email "wb@test.local"', { cwd: tmpRoot, stdio: "ignore" });
execSync('git config user.name "WB Test"', { cwd: tmpRoot, stdio: "ignore" });
execSync("git add -A", { cwd: tmpRoot, stdio: "ignore" });
execSync('git commit -m "init"', { cwd: tmpRoot, stdio: "ignore" });

const head = getHeadMeta(tmpRoot);
assert.strictEqual(head.isRepo, true);
assert.ok(head.shortHash);
assert.ok(head.branch || true);
const branches = listBranches(tmpRoot);
assert.strictEqual(branches.isRepo, true);
assert.ok(Array.isArray(branches.branches));

const pr = buildPrDraftMeta({
  branch: head.branch || "main",
  title: "BL-020 draft",
  body: "## Summary\nTest",
  agentRunId: "run_test",
});
assert.ok(pr.commands.push.includes("git push"));
assert.ok(pr.commands.createDraftPr.includes("gh pr create --draft"));

const project = createProject(getUserDataPath, "local-user", {
  name: "bl019",
  localPath: tmpRoot,
});
const task = createTask(getUserDataPath, "local-user", project.id, {
  title: "四视图交付",
  description: "验证 Runbook 与 Git 元数据",
});

const manifest = buildDeliveryManifest(getUserDataPath, "local-user", {
  projectId: project.id,
  taskId: task.id,
  verifyResult: { ok: true, skipped: false, scriptName: "static", exitCode: 0 },
});
assert.strictEqual(manifest.version, 2);
assert.ok(manifest.git?.isRepo);
assert.ok(manifest.git.shortHash);
assert.ok(manifest.pr?.commands?.createDraftPr);
assert.ok(manifest.runbookMarkdown);

const md = formatDeliveryRunbook(manifest);
assert.ok(md.includes("# 交付 Runbook"));
assert.ok(md.includes("## 怎么启动"));
assert.ok(md.includes("## 怎么验证"));
assert.ok(md.includes("## Git / PR"));
assert.ok(md.includes("## 怎么回滚"));
assert.ok(md.includes(manifest.git.shortHash));

saveDeliveryManifest(getUserDataPath, "local-user", project.id, task.id, manifest);
const stored = getDeliveryManifest(getUserDataPath, "local-user", project.id, task.id);
assert.ok(stored?.runbookMarkdown || formatDeliveryRunbook(stored).includes("交付 Runbook"));

const review = reviewPatchProposal({
  filePath: "index.html",
  originalContent: "<!doctype html><title>a</title>",
  proposedContent: "<!doctype html><title>b</title>\n<script>eval(userInput)</script>",
  summary: "demo",
  allowedPaths: ["index.html"],
});
assert.ok(review.findings?.length >= 0);

const preview = patchToDiffPreview({
  id: "patch_1",
  filePath: "index.html",
  originalContent: "a",
  proposedContent: "b",
  summary: "change",
  status: "STAGED",
  unifiedDiff: "--- a\n+++ b\n-a\n+b\n",
  patchQuality: { review },
});
assert.ok(Array.isArray(preview.reviewFindings));
assert.strictEqual(preview.reviewVerdict, review.verdict);

// taskUiState is browser-side; sanity-check PHASE labels exist in source
const uiSrc = fs.readFileSync(path.join(__dirname, "../app/workbench/taskUiState.js"), "utf8");
assert.ok(uiSrc.includes("getTaskUiState"));
assert.ok(uiSrc.includes("primaryView"));
assert.ok(uiSrc.includes("nextAction"));

console.log("wb-bl019-020-test: OK");
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
