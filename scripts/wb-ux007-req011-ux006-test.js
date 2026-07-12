/**
 * Combined smoke tests: UX-007 + REQ-011 + UX-006
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { getDb } = require("../main/workbench/db.js");
const { createProject, createTask } = require("../main/workbench/projectService.js");
const {
  enqueueAgentRun,
  listAsyncJobs,
  pauseAsyncJob,
  cancelAsyncJob,
  getAsyncJob,
  _resetAsyncJobsForTests,
  asyncEnabled,
} = require("../main/workbench/asyncAgentQueue.js");
const {
  detectPatchMergeConflicts,
  planMergedPatches,
} = require("../main/workbench/parallelMergeService.js");
const {
  createParallelGroup,
  allocateBranchWorkspaces,
  registerBranchPatches,
  previewParallelMerge,
  stageBranchPatch,
  _resetParallelGroupsForTests,
} = require("../main/workbench/parallelBranchService.js");
const {
  listInstructionCatalog,
  setCatalogItemEnabled,
  filterInstructionsByPrefs,
  loadCatalogPrefs,
} = require("../main/workbench/instructionCatalogService.js");
const { discoverInstructionFiles } = require("../main/workbench/instructionContextService.js");

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "wb-ux-bundle-"));
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "wb-ux-ws-"));
const getUserDataPath = () => userData;
getDb(getUserDataPath);
_resetAsyncJobsForTests();
_resetParallelGroupsForTests();

const uid = "local-user";
const project = createProject(getUserDataPath, uid, {
  name: "ux-bundle",
  localPath: workspace,
});
const task = createTask(getUserDataPath, uid, project.id, { title: "bundle task" });

// --- UX-007 ---
assert.ok(asyncEnabled());
let resolveRun;
const runPromise = new Promise((r) => {
  resolveRun = r;
});
const fakeRunner = async () => {
  await new Promise((r) => setTimeout(r, 30));
  resolveRun();
  return { output: { summary: "ok", replayTrace: { totals: { totalTokens: 12 } } } };
};
(async () => {
  const started = await enqueueAgentRun(fakeRunner, getUserDataPath, uid, {
    projectId: project.id,
    taskId: task.id,
    message: "async hello",
    mode: "PLAN_ONLY",
  });
  assert.ok(started.agentRunId);
  assert.strictEqual(started.status, "RUNNING");
  const listed = listAsyncJobs({ projectId: project.id });
  assert.ok(listed.some((j) => j.runId === started.agentRunId));

  await runPromise;
  await new Promise((r) => setTimeout(r, 80));
  const done = getAsyncJob(started.agentRunId);
  assert.ok(["COMPLETED", "BUDGET_EXCEEDED"].includes(done.status), done.status);

  const task2 = createTask(getUserDataPath, uid, project.id, { title: "pause task" });
  const fakeSlow = async () => {
    await new Promise((r) => setTimeout(r, 5000));
    return { output: { summary: "late" } };
  };
  const slow = await enqueueAgentRun(fakeSlow, getUserDataPath, uid, {
    projectId: project.id,
    taskId: task2.id,
    message: "slow",
    mode: "PLAN_ONLY",
  });
  const paused = pauseAsyncJob(getUserDataPath, uid, {
    projectId: project.id,
    taskId: task2.id,
    runId: slow.agentRunId,
  });
  assert.strictEqual(paused.status, "PAUSED");

  const canceled = cancelAsyncJob(getUserDataPath, uid, {
    projectId: project.id,
    taskId: task2.id,
    runId: slow.agentRunId,
    reason: "test cancel",
  });
  assert.strictEqual(canceled.status, "CANCELED");

  // --- REQ-011 ---
  fs.writeFileSync(path.join(workspace, "shared.js"), "const x = 1;\n", "utf8");
  const group = createParallelGroup({
    projectId: project.id,
    taskId: task.id,
    branches: [
      { branchId: "a", label: "A" },
      { branchId: "b", label: "B" },
    ],
  });
  allocateBranchWorkspaces(getUserDataPath, uid, group.id, {
    getDefaultProjectRoot: () => workspace,
  });
  const g2 = createParallelGroup({
    projectId: project.id,
    taskId: task.id,
    branches: [{ branchId: "x" }, { branchId: "y" }],
  });
  allocateBranchWorkspaces(getUserDataPath, uid, g2.id, {
    getDefaultProjectRoot: () => workspace,
  });
  assert.ok(g2.branches.every((b) => b.workspaceSessionId));
  assert.notStrictEqual(g2.branches[0].workspaceSessionId, g2.branches[1].workspaceSessionId);

  const pA = stageBranchPatch(getUserDataPath, uid, {
    projectId: project.id,
    taskId: task.id,
    branchId: "a",
    filePath: "shared.js",
    originalContent: "const x = 1;\n",
    content: "const x = 2;\n",
  });
  const pB = stageBranchPatch(getUserDataPath, uid, {
    projectId: project.id,
    taskId: task.id,
    branchId: "b",
    filePath: "shared.js",
    originalContent: "const x = 1;\n",
    content: "const x = 3;\n",
  });
  registerBranchPatches(group.id, "a", [pA.id]);
  registerBranchPatches(group.id, "b", [pB.id]);
  const preview = previewParallelMerge(getUserDataPath, uid, group.id);
  assert.strictEqual(preview.ok, false);
  assert.ok(preview.conflictCount >= 1);

  const clean = detectPatchMergeConflicts([
    {
      branchId: "a",
      patches: [
        {
          filePath: "a.js",
          unifiedDiff: "@@ -1,1 +1,1 @@\n-a\n+A\n",
        },
      ],
    },
    {
      branchId: "b",
      patches: [
        {
          filePath: "b.js",
          unifiedDiff: "@@ -1,1 +1,1 @@\n-b\n+B\n",
        },
      ],
    },
  ]);
  assert.strictEqual(clean.ok, true);
  const plan = planMergedPatches([
    { branchId: "a", patches: [{ id: "1", filePath: "a.js", unifiedDiff: "@@ -1,1 +1,1 @@\n-a\n+A\n" }] },
    { branchId: "b", patches: [{ id: "2", filePath: "b.js", unifiedDiff: "@@ -1,1 +1,1 @@\n-b\n+B\n" }] },
  ]);
  assert.strictEqual(plan.mergeStatus, "CLEAN");
  assert.strictEqual(plan.mergedPatches.length, 2);

  // --- UX-006 ---
  fs.writeFileSync(path.join(workspace, "AGENTS.md"), "# Agent rules\nBe careful.\n", "utf8");
  fs.mkdirSync(path.join(workspace, ".cursor", "rules"), { recursive: true });
  fs.writeFileSync(path.join(workspace, ".cursor", "rules", "style.md"), "Use 2 spaces.\n", "utf8");
  const discovered = discoverInstructionFiles(workspace);
  assert.ok(discovered.some((d) => d.path === "AGENTS.md"));

  const catalog = listInstructionCatalog(getUserDataPath, {
    projectRoot: workspace,
    appRoot: path.join(__dirname, ".."),
  });
  assert.ok(catalog.items.some((i) => i.kind === "project_instruction"));
  assert.ok(catalog.counts.total >= 1);

  const agentsItem = catalog.items.find((i) => i.path === "AGENTS.md");
  assert.ok(agentsItem);
  setCatalogItemEnabled(getUserDataPath, {
    id: agentsItem.id,
    path: agentsItem.path,
    kind: agentsItem.kind,
    enabled: false,
  });
  const prefs = loadCatalogPrefs(getUserDataPath);
  assert.ok(prefs.disabledIds.includes(agentsItem.id) || prefs.disabledPaths.includes("AGENTS.md"));
  const filtered = filterInstructionsByPrefs(getUserDataPath, [
    { path: "AGENTS.md", content: "x" },
    { path: ".cursor/rules/style.md", content: "y" },
  ]);
  assert.ok(!filtered.some((f) => f.path === "AGENTS.md"));
  assert.ok(filtered.some((f) => f.path === ".cursor/rules/style.md"));

  console.log("wb-ux007-req011-ux006-test: OK");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
