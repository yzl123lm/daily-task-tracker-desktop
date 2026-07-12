/**
 * A3 trusted auto-apply for FixLoop WAITING_APPLY → APPLYING (opt-in).
 *
 * Scope rule: allowlist comes from taskSpec / plan / diagnosis / message — never from
 * the staged patch list itself (that would make the gate tautological).
 */
const { getProject } = require("./projectService.js");
const { getTaskSpec } = require("./taskSpecService.js");
const { getPlanSteps } = require("./planStepsService.js");
const { listStagedPatches, PATCH_STATUS } = require("./patchStagingService.js");
const {
  collectAllowedPaths,
  assertPatchesInScope,
} = require("./patchReviewerService.js");
const { applyAcceptedPatches } = require("./controlledDevService.js");
const { allowsAutoApplyFixPatches } = require("./projectPolicyService.js");
const { appendFixLoopEvent } = require("./fixLoopStateService.js");

/**
 * Attempt auto-apply of currently STAGED fix patches for a trusted workspace.
 * Returns { applied: true, applyResult, review, patchIds } or { applied: false, reason, review? }.
 */
function tryTrustedAutoApplyFixPatches(
  getUserDataPath,
  userId,
  {
    projectId,
    taskId,
    round,
    getDefaultProjectRoot,
    message,
    allowedFiles,
  } = {}
) {
  const project = getProject(getUserDataPath, userId, projectId);
  if (!allowsAutoApplyFixPatches(project)) {
    return { applied: false, reason: "not_trusted" };
  }

  const staged = listStagedPatches(getUserDataPath, userId, projectId, taskId, {
    status: PATCH_STATUS.STAGED,
  });
  if (!staged.length) {
    return { applied: false, reason: "no_staged_patches" };
  }

  const taskSpec = getTaskSpec(getUserDataPath, userId, projectId, taskId);
  const planSteps = getPlanSteps(getUserDataPath, userId, projectId, taskId);
  const scopeFiles = Array.isArray(allowedFiles)
    ? allowedFiles
    : Array.isArray(taskSpec?.affectedFiles)
      ? taskSpec.affectedFiles
      : [];
  const scope = {
    taskSpec,
    planSteps,
    message: message || taskSpec?.goal || "",
    affectedFiles: scopeFiles,
  };
  const allowed = collectAllowedPaths(scope);
  if (!allowed.length) {
    appendFixLoopEvent(getUserDataPath, userId, projectId, taskId, {
      action: "auto_apply_blocked",
      phase: "WAITING_APPLY",
      round: round || 0,
      code: "NO_SCOPE",
      message: "无规格/诊断范围，禁止自动应用",
      patchIds: staged.map((p) => p.id),
    });
    return {
      applied: false,
      reason: "no_scope",
      patchIds: staged.map((p) => p.id),
    };
  }

  let review;
  try {
    review = assertPatchesInScope(staged, scope, { userOverrideUnrelated: false });
  } catch (err) {
    appendFixLoopEvent(getUserDataPath, userId, projectId, taskId, {
      action: "auto_apply_blocked",
      phase: "WAITING_APPLY",
      round: round || 0,
      code: err.code || "PATCH_REVIEW_BLOCKED",
      message: err.message || "Patch Reviewer 阻止自动应用",
      patchIds: staged.map((p) => p.id),
      unrelatedFiles: err.review?.unrelatedFiles || [],
    });
    return {
      applied: false,
      reason: "reviewer_blocked",
      code: err.code,
      review: err.review || null,
      message: err.message,
      patchIds: staged.map((p) => p.id),
    };
  }

  if (review.reviewerVerdict !== "pass" || (review.blockers || []).length) {
    appendFixLoopEvent(getUserDataPath, userId, projectId, taskId, {
      action: "auto_apply_blocked",
      phase: "WAITING_APPLY",
      round: round || 0,
      code: "REVIEWER_NOT_PASS",
      message: "Patch Reviewer 未通过，保留人工 Diff",
      patchIds: staged.map((p) => p.id),
      verdict: review.reviewerVerdict,
    });
    return {
      applied: false,
      reason: "reviewer_not_pass",
      review,
      patchIds: staged.map((p) => p.id),
    };
  }

  const patchIds = staged.map((p) => p.id);
  const approvalId = `auto-trusted:${taskId}:r${round || 0}:${Date.now()}`;
  const applyResult = applyAcceptedPatches(
    getUserDataPath,
    userId,
    {
      projectId,
      taskId,
      patchIds,
      userApproved: true,
      approvalId,
      requestId: approvalId,
      createGitBranch: false,
    },
    { getDefaultProjectRoot }
  );

  if (!applyResult?.ok) {
    appendFixLoopEvent(getUserDataPath, userId, projectId, taskId, {
      action: "auto_apply_failed",
      phase: "WAITING_APPLY",
      round: round || 0,
      message: applyResult?.error || "自动应用失败",
      patchIds,
    });
    return {
      applied: false,
      reason: "apply_failed",
      applyResult,
      patchIds,
    };
  }

  appendFixLoopEvent(getUserDataPath, userId, projectId, taskId, {
    action: "auto_apply_fix_patches",
    phase: "APPLYING",
    round: round || 0,
    patchIds,
    approvalId,
    autoApproved: true,
    message: `受信工作区自动应用 ${patchIds.length} 个修复补丁`,
  });

  return {
    applied: true,
    applyResult,
    review,
    patchIds,
    approvalId,
  };
}

module.exports = {
  tryTrustedAutoApplyFixPatches,
};
