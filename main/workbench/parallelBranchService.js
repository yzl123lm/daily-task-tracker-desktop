/**
 * REQ-011: Parallel branch runner — independent workspaces + merge preview/apply.
 */
const { createWorkspaceSession, destroyWorkspaceSession } = require("./sandbox/workspaceSessionManager.js");
const { detectPatchMergeConflicts, planMergedPatches } = require("./parallelMergeService.js");
const { createStagedPatch, listStagedPatches, PATCH_STATUS } = require("./patchStagingService.js");
const { applyAcceptedPatches } = require("./controlledDevService.js");
const { getProject } = require("./projectService.js");
const { resolveProjectRoot } = require("./projectCodeService.js");

/** @type {Map<string, object>} */
const parallelGroups = new Map();

function createParallelGroup({ projectId, taskId, branches = [] } = {}) {
  const id = `par_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const group = {
    id,
    projectId,
    taskId,
    createdAt: new Date().toISOString(),
    branches: [],
    status: "OPEN",
  };
  for (const b of branches) {
    group.branches.push({
      branchId: b.branchId || `b${group.branches.length + 1}`,
      label: b.label || b.branchId || `branch-${group.branches.length + 1}`,
      purpose: b.purpose || "explore",
      workspaceSessionId: null,
      workspaceRoot: null,
      patchIds: [],
      status: "READY",
    });
  }
  parallelGroups.set(id, group);
  return group;
}

function getParallelGroup(groupId) {
  return parallelGroups.get(groupId) || null;
}

function allocateBranchWorkspaces(getUserDataPath, userId, groupId, { getDefaultProjectRoot } = {}) {
  const group = parallelGroups.get(groupId);
  if (!group) throw new Error("并行组不存在");
  const project = getProject(getUserDataPath, userId, group.projectId);
  const sourceRoot = resolveProjectRoot(project, getDefaultProjectRoot);
  for (const branch of group.branches) {
    if (branch.workspaceSessionId) continue;
    const session = createWorkspaceSession({
      projectId: group.projectId,
      taskId: group.taskId,
      sourceRoot,
      getUserDataPath,
    });
    branch.workspaceSessionId = session.id;
    branch.workspaceRoot = session.root;
    branch.status = "ISOLATED";
  }
  group.status = "RUNNING";
  return group;
}

function registerBranchPatches(groupId, branchId, patchIds = []) {
  const group = parallelGroups.get(groupId);
  if (!group) throw new Error("并行组不存在");
  const branch = group.branches.find((b) => b.branchId === branchId);
  if (!branch) throw new Error("分支不存在");
  branch.patchIds = [...new Set([...(branch.patchIds || []), ...patchIds])];
  branch.status = "PATCHED";
  return branch;
}

/**
 * Collect staged patches tagged by branch (via summary prefix or explicit map).
 */
function collectBranchPatchSets(getUserDataPath, userId, group) {
  const all = listStagedPatches(getUserDataPath, userId, group.projectId, group.taskId, {
    statuses: [PATCH_STATUS.STAGED, PATCH_STATUS.ACCEPTED],
  });
  return group.branches.map((branch) => {
    const byId = new Set(branch.patchIds || []);
    const patches = all.filter(
      (p) =>
        byId.has(p.id) ||
        String(p.summary || "").includes(`[branch:${branch.branchId}]`) ||
        String(p.agentRunId || "") === String(branch.agentRunId || "")
    );
    return { branchId: branch.branchId, patches };
  });
}

function previewParallelMerge(getUserDataPath, userId, groupId) {
  const group = parallelGroups.get(groupId);
  if (!group) throw new Error("并行组不存在");
  const branchSets = collectBranchPatchSets(getUserDataPath, userId, group);
  const plan = planMergedPatches(branchSets);
  group.lastMergePreview = {
    at: new Date().toISOString(),
    mergeStatus: plan.mergeStatus,
    conflictCount: plan.conflictCount,
  };
  if (!plan.ok) group.status = "MERGE_CONFLICT";
  return { groupId, ...plan, branches: branchSets.map((b) => ({ branchId: b.branchId, patchCount: b.patches.length })) };
}

function applyParallelMerge(
  getUserDataPath,
  userId,
  { groupId, userApproved, approvalId, requestId, forcePreferBranchId, getDefaultProjectRoot } = {}
) {
  if (!userApproved) {
    const err = new Error("并行合并需要用户确认");
    err.code = "USER_APPROVAL_REQUIRED";
    throw err;
  }
  const group = parallelGroups.get(groupId);
  if (!group) throw new Error("并行组不存在");
  const preview = previewParallelMerge(getUserDataPath, userId, groupId);
  if (!preview.ok && !forcePreferBranchId) {
    return { ok: false, ...preview };
  }
  const plan = planMergedPatches(
    collectBranchPatchSets(getUserDataPath, userId, group),
    { forcePreferBranchId }
  );
  const patchIds = plan.mergedPatches.map((p) => p.id).filter(Boolean);
  if (!patchIds.length) {
    return { ok: false, reason: "no_patches", ...plan };
  }
  const applyResult = applyAcceptedPatches(
    getUserDataPath,
    userId,
    {
      projectId: group.projectId,
      taskId: group.taskId,
      patchIds,
      userApproved: true,
      approvalId: approvalId || requestId,
      requestId: requestId || approvalId,
      createGitBranch: false,
    },
    { getDefaultProjectRoot }
  );
  group.status = applyResult?.ok ? "MERGED" : "MERGE_FAILED";
  // cleanup workspaces
  for (const branch of group.branches) {
    if (branch.workspaceSessionId) {
      try {
        destroyWorkspaceSession(branch.workspaceSessionId);
      } catch {
        /* ignore */
      }
      branch.workspaceSessionId = null;
    }
  }
  return { ok: Boolean(applyResult?.ok), applyResult, ...plan, groupStatus: group.status };
}

/** Stage a synthetic patch under a branch (for tests / harness). */
function stageBranchPatch(getUserDataPath, userId, { projectId, taskId, branchId, filePath, content, originalContent = "" }) {
  return createStagedPatch(getUserDataPath, userId, {
    projectId,
    taskId,
    filePath,
    originalContent,
    proposedContent: content,
    unifiedDiff: `--- a/${filePath}\n+++ b/${filePath}\n@@ -1,1 +1,1 @@\n-${originalContent.split("\n")[0] || ""}\n+${String(content).split("\n")[0] || ""}`,
    summary: `[branch:${branchId}] ${filePath}`,
  });
}

function _resetParallelGroupsForTests() {
  parallelGroups.clear();
}

module.exports = {
  createParallelGroup,
  getParallelGroup,
  allocateBranchWorkspaces,
  registerBranchPatches,
  previewParallelMerge,
  applyParallelMerge,
  stageBranchPatch,
  collectBranchPatchSets,
  detectPatchMergeConflicts,
  _resetParallelGroupsForTests,
};
