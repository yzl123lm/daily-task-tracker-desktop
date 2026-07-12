/**
 * A3: trusted workspace auto-apply + Draft PR smoke tests.
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { getDb } = require("../main/workbench/db.js");
const { createProject, createTask, updateProject } = require("../main/workbench/projectService.js");
const {
  PERMISSION_MODE,
  isTrustedWorkspace,
  allowsAutoApplyFixPatches,
} = require("../main/workbench/projectPolicyService.js");
const { tryTrustedAutoApplyFixPatches } = require("../main/workbench/trustedAutoApplyService.js");
const { createStagedPatch, listStagedPatches, PATCH_STATUS } = require("../main/workbench/patchStagingService.js");
const { getDraftPrForTask, createDraftPr } = require("../main/workbench/draftPrService.js");
const { buildPrDraftMeta } = require("../main/workbench/gitService.js");
const { createDraftSpec, saveTaskSpec, confirmTaskSpec, SPEC_STATUS } = require("../main/workbench/taskSpecService.js");

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "wb-a3-"));
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "wb-a3-ws-"));
const getUserDataPath = () => userData;
getDb(getUserDataPath);
const uid = "local-user";

// --- Policy ---
assert.strictEqual(isTrustedWorkspace({ permissionMode: "ASSISTED_DEV" }), false);
assert.strictEqual(isTrustedWorkspace({ permissionMode: "TRUSTED_WORKSPACE" }), true);
assert.strictEqual(allowsAutoApplyFixPatches({ permissionMode: "ASSISTED_DEV" }), false);
assert.strictEqual(allowsAutoApplyFixPatches({ permissionMode: PERMISSION_MODE.TRUSTED_WORKSPACE }), true);

const assisted = createProject(getUserDataPath, uid, {
  name: "a3-assisted",
  localPath: workspace,
  permissionMode: "ASSISTED_DEV",
});
assert.strictEqual(assisted.permissionMode, "ASSISTED_DEV");

const trusted = createProject(getUserDataPath, uid, {
  name: "a3-trusted",
  localPath: workspace,
  permissionMode: "TRUSTED_WORKSPACE",
});
assert.strictEqual(trusted.permissionMode, "TRUSTED_WORKSPACE");
assert.ok(allowsAutoApplyFixPatches(trusted));

const task = createTask(getUserDataPath, uid, trusted.id, {
  title: "fix cli.js",
  description: "Repair cli.js build failure",
});

// Approve a minimal spec (executionReady)
let draft = createDraftSpec({
  message: "fix cli.js syntax error",
  project: trusted,
  task,
  plan: ["fix cli.js"],
});
saveTaskSpec(getUserDataPath, uid, trusted.id, task.id, draft);
if (draft.status !== SPEC_STATUS.APPROVED) {
  const answers = {};
  for (const q of draft.openQuestions || []) answers[q.id] = "a3-test";
  draft = confirmTaskSpec(getUserDataPath, uid, trusted.id, task.id, { answers });
}

fs.writeFileSync(path.join(workspace, "cli.js"), "module.exports = { ok: false };\n", "utf8");

// Staged in-scope patch
createStagedPatch(getUserDataPath, uid, {
  projectId: trusted.id,
  taskId: task.id,
  filePath: "cli.js",
  originalContent: "module.exports = { ok: false };\n",
  proposedContent: "module.exports = { ok: true };\n",
  unifiedDiff: "--- a/cli.js\n+++ b/cli.js\n@@\n-module.exports = { ok: false };\n+module.exports = { ok: true };\n",
  summary: "fix cli.js export",
});

// Assisted project must not auto-apply
const taskAssisted = createTask(getUserDataPath, uid, assisted.id, { title: "no auto" });
createStagedPatch(getUserDataPath, uid, {
  projectId: assisted.id,
  taskId: taskAssisted.id,
  filePath: "cli.js",
  originalContent: "",
  proposedContent: "x",
  unifiedDiff: "+x",
  summary: "x",
});
const blocked = tryTrustedAutoApplyFixPatches(getUserDataPath, uid, {
  projectId: assisted.id,
  taskId: taskAssisted.id,
  round: 1,
  getDefaultProjectRoot: () => workspace,
  message: "fix cli.js",
  allowedFiles: ["cli.js"],
});
assert.strictEqual(blocked.applied, false);
assert.strictEqual(blocked.reason, "not_trusted");

// Trusted + in-scope → apply
const applied = tryTrustedAutoApplyFixPatches(getUserDataPath, uid, {
  projectId: trusted.id,
  taskId: task.id,
  round: 1,
  getDefaultProjectRoot: () => workspace,
  message: "fix cli.js syntax error",
  allowedFiles: ["cli.js"],
});
assert.strictEqual(applied.applied, true, JSON.stringify(applied));
assert.ok(applied.patchIds?.length >= 1);
const after = listStagedPatches(getUserDataPath, uid, trusted.id, task.id, {
  status: PATCH_STATUS.APPLIED,
});
assert.ok(after.length >= 1);
assert.ok(fs.readFileSync(path.join(workspace, "cli.js"), "utf8").includes("ok: true"));

// Unrelated file → blocked
const task2 = createTask(getUserDataPath, uid, trusted.id, { title: "unrelated" });
createStagedPatch(getUserDataPath, uid, {
  projectId: trusted.id,
  taskId: task2.id,
  filePath: "secrets.env",
  originalContent: "",
  proposedContent: "KEY=1",
  unifiedDiff: "+KEY=1",
  summary: "leak",
});
const unrelated = tryTrustedAutoApplyFixPatches(getUserDataPath, uid, {
  projectId: trusted.id,
  taskId: task2.id,
  round: 1,
  getDefaultProjectRoot: () => workspace,
  message: "fix cli.js only",
  allowedFiles: ["cli.js"],
});
assert.strictEqual(unrelated.applied, false);
assert.ok(["reviewer_blocked", "reviewer_not_pass"].includes(unrelated.reason), unrelated.reason);

// No scope → blocked
const task3 = createTask(getUserDataPath, uid, trusted.id, { title: "noscope" });
createStagedPatch(getUserDataPath, uid, {
  projectId: trusted.id,
  taskId: task3.id,
  filePath: "cli.js",
  originalContent: "",
  proposedContent: "y",
  unifiedDiff: "+y",
  summary: "y",
});
const noscope = tryTrustedAutoApplyFixPatches(getUserDataPath, uid, {
  projectId: trusted.id,
  taskId: task3.id,
  round: 1,
  getDefaultProjectRoot: () => workspace,
  message: "generic fix without path hints",
  allowedFiles: [],
});
assert.strictEqual(noscope.applied, false);
assert.strictEqual(noscope.reason, "no_scope");

// Draft PR meta
const prMeta = buildPrDraftMeta({
  branch: "wb/demo",
  title: "A3 delivery",
  body: "## Summary\nok",
  agentRunId: "run_a3",
});
assert.ok(prMeta.commands.createDraftPr.includes("gh pr create --draft"));
assert.ok(prMeta.commands.push.includes("git push"));

// Init git repo for draft get
const { spawnSync } = require("child_process");
spawnSync("git", ["init"], { cwd: workspace, encoding: "utf8", windowsHide: true });
spawnSync("git", ["config", "user.email", "a3@test.local"], { cwd: workspace, windowsHide: true });
spawnSync("git", ["config", "user.name", "a3"], { cwd: workspace, windowsHide: true });
spawnSync("git", ["add", "-A"], { cwd: workspace, windowsHide: true });
spawnSync("git", ["commit", "-m", "init"], { cwd: workspace, windowsHide: true });
spawnSync("git", ["checkout", "-b", "wb/a3-test"], { cwd: workspace, windowsHide: true });

updateProject(getUserDataPath, uid, trusted.id, { localPath: workspace });
const draftGet = getDraftPrForTask(getUserDataPath, uid, {
  projectId: trusted.id,
  taskId: task.id,
  getDefaultProjectRoot: () => workspace,
});
assert.strictEqual(draftGet.ok, true, JSON.stringify(draftGet));
assert.ok(draftGet.draft?.commands?.createDraftPr);

// create requires approval
let threw = false;
try {
  createDraftPr(getUserDataPath, uid, {
    projectId: trusted.id,
    taskId: task.id,
    userApproved: false,
    getDefaultProjectRoot: () => workspace,
  });
} catch (err) {
  threw = err.code === "USER_APPROVAL_REQUIRED";
}
assert.ok(threw, "createDraftPr must require userApproved");

// Missing approval id
threw = false;
try {
  createDraftPr(getUserDataPath, uid, {
    projectId: trusted.id,
    taskId: task.id,
    userApproved: true,
    getDefaultProjectRoot: () => workspace,
  });
} catch (err) {
  threw = err.code === "APPROVAL_ID_REQUIRED";
}
assert.ok(threw, "createDraftPr must require approvalId");

console.log("wb-a3-trusted-autoapply-test: OK");
