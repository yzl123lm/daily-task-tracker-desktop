const { runVerification } = require("./verificationService.js");
const { runProjectAgentLLM } = require("./projectAgentLLM.js");
const { updateTask } = require("./projectService.js");
const { resolveUserId } = require("./projectService.js");
const { resolveProjectRoot } = require("./projectCodeService.js");
const { getProject } = require("./projectService.js");
const { TASK_STATUS } = require("./taskStatus.js");
const { listStagedPatches, PATCH_STATUS } = require("./patchStagingService.js");
const {
  MAX_FIX_ROUNDS,
  FIX_LOOP_PHASE,
  fixLoopV2Enabled,
  getFixLoopState,
  saveFixLoopState,
  clearFixLoopState,
  createInitialFixLoopState,
  appendFixLoopAttempt,
  isDuplicateFailedAttempt,
  appendFixLoopEvent,
  assertFixLoopResume,
} = require("./fixLoopStateService.js");
const { buildDiagnosisFromVerify, formatDiagnosisForPrompt } = require("./diagnosisService.js");
const { mergeCheckpoint, createGreenCheckpoint } = require("./checkpointService.js");
const { claimIdempotencyKey } = require("./idempotencyService.js");
const { listFileBackups } = require("./backupRestoreService.js");

function buildVerifySummary(verify) {
  const parsed = verify?.parsed;
  const firstIssue = parsed?.issues?.[0];
  return {
    ok: Boolean(verify?.ok),
    skipped: Boolean(verify?.skipped),
    exitCode: verify?.exitCode,
    errorType: verify?.skipped
      ? "verify_skipped"
      : parsed?.summary?.slice(0, 80) || "build_error",
    file: firstIssue?.file || null,
    line: firstIssue?.line || null,
    summary:
      verify?.message ||
      parsed?.summary ||
      verify?.stderr?.slice(0, 200) ||
      "",
  };
}

async function runVerifyStep(getUserDataPath, uid, ctx, state, { getDefaultProjectRoot } = {}) {
  const verifyAttemptId = require("./db.js").newId("verify");
  const idemp = claimIdempotencyKey(getUserDataPath, uid, {
    projectId: ctx.projectId,
    taskId: ctx.taskId,
    key: `verify:${state.scriptName}:${verifyAttemptId}`,
    action: "verify",
  });
  state.phase = FIX_LOOP_PHASE.VERIFYING;
  state.verifyAttemptId = verifyAttemptId;
  state.updatedAt = Date.now();
  saveFixLoopState(getUserDataPath, uid, ctx.projectId, ctx.taskId, state);
  updateTask(getUserDataPath, uid, ctx.projectId, ctx.taskId, {
    status: TASK_STATUS.TESTING,
    currentStep: `验证 ${state.scriptName}${state.round ? ` (第 ${state.round + 1} 轮)` : ""}`,
  });
  appendFixLoopEvent(getUserDataPath, uid, ctx.projectId, ctx.taskId, {
    action: "verify_start",
    phase: FIX_LOOP_PHASE.VERIFYING,
    round: state.round,
    verifyAttemptId,
    scriptName: state.scriptName,
    message: `开始验证 ${state.scriptName}`,
    idempotencyKey: idemp.record.key,
  });
  const verify = await runVerification(
    getUserDataPath,
    uid,
    {
      projectId: ctx.projectId,
      taskId: ctx.taskId,
      scriptName: state.scriptName,
      userApproved: true,
    },
    { getDefaultProjectRoot }
  );
  state.lastVerifySummary = buildVerifySummary(verify);
  let diagnosis = null;
  if (!verify.ok && !verify.skipped) {
    diagnosis = buildDiagnosisFromVerify(verify, {
      scriptName: state.scriptName,
      recentChanges: state.lastAppliedPatchIds || [],
    });
    state.lastDiagnosis = diagnosis;
    state.lastErrorFingerprint = diagnosis.fingerprint;
  }
  appendFixLoopAttempt(state, {
    round: state.round,
    verifyAttemptId,
    phase: FIX_LOOP_PHASE.VERIFYING,
    diagnosis,
    appliedPatchIds: state.lastAppliedPatchIds || [],
    fingerprint: diagnosis?.fingerprint || null,
    result: verify.skipped ? "verify_skip" : verify.ok ? "verify_pass" : "verify_fail",
  });
  saveFixLoopState(getUserDataPath, uid, ctx.projectId, ctx.taskId, state);
  mergeCheckpoint(getUserDataPath, uid, ctx.projectId, ctx.taskId, {
    phase: verify.ok ? "VERIFY_PASS" : "VERIFY_FAIL",
    fixLoop: {
      round: state.round,
      phase: state.phase,
      verifyAttemptId,
      fingerprint: state.lastErrorFingerprint,
    },
    verify: {
      ok: Boolean(verify.ok),
      scriptName: state.scriptName,
      at: new Date().toISOString(),
    },
  });
  appendFixLoopEvent(getUserDataPath, uid, ctx.projectId, ctx.taskId, {
    action: verify.skipped ? "verify_skip" : verify.ok ? "verify_pass" : "verify_fail",
    phase: FIX_LOOP_PHASE.VERIFYING,
    round: state.round,
    verifyAttemptId,
    failureCategory: diagnosis?.failureCategory || null,
    message: verify.skipped
      ? state.lastVerifySummary.summary || "已跳过验证"
      : verify.ok
        ? "验证通过"
        : state.lastVerifySummary.summary,
  });
  try {
    const { emitAgentEvent, PHASE, STATUS } = require("./agentEventEmitter.js");
    emitAgentEvent(ctx, {
      phase: verify.skipped || verify.ok ? PHASE.COMPLETED : PHASE.VERIFYING,
      status: verify.skipped ? STATUS.skipped : verify.ok ? STATUS.success : STATUS.failed,
      title: "运行验证",
      summary: verify.skipped
        ? state.lastVerifySummary.summary || "已跳过验证"
        : verify.ok
          ? "验证通过"
          : state.lastVerifySummary.summary || "验证失败",
      stepKey: "run_verify",
      error: verify.ok || verify.skipped ? null : state.lastVerifySummary.summary || "验证失败",
    });
  } catch {
    /* optional */
  }
  if (!verify.ok && !verify.skipped) {
    try {
      const { recordVerifyFailureLesson } = require("./errorLessonService.js");
      recordVerifyFailureLesson(getUserDataPath, uid, {
        projectId: ctx.projectId,
        taskId: ctx.taskId,
        verify,
      });
    } catch {
      /* optional */
    }
  }
  return verify;
}

async function runAgentFixRound(getUserDataPath, uid, ctx, state, verify) {
  const diagnosis =
    state.lastDiagnosis ||
    buildDiagnosisFromVerify(verify, { scriptName: state.scriptName });
  state.lastDiagnosis = diagnosis;

  // VER-008: block repeating the same failed fingerprint with no new evidence
  if (
    isDuplicateFailedAttempt(state, diagnosis.fingerprint, state.lastStagedPatchIds) &&
    state.round > 1
  ) {
    state.phase = FIX_LOOP_PHASE.FAILED;
    state.active = false;
    state.remainingReport = [
      "检测到重复失败诊断/补丁指纹，已 BLOCKED，避免无效循环。",
      formatDiagnosisForPrompt(diagnosis),
    ].join("\n");
    saveFixLoopState(getUserDataPath, uid, ctx.projectId, ctx.taskId, state);
    appendFixLoopEvent(getUserDataPath, uid, ctx.projectId, ctx.taskId, {
      action: "fix_loop_duplicate_blocked",
      phase: FIX_LOOP_PHASE.FAILED,
      round: state.round,
      fingerprint: diagnosis.fingerprint,
      message: "重复失败补丁已阻断",
    });
    updateTask(getUserDataPath, uid, ctx.projectId, ctx.taskId, {
      status: TASK_STATUS.BLOCKED,
      currentStep: "重复失败诊断，已阻断自动修复",
    });
    return {
      ok: false,
      blocked: true,
      duplicate: true,
      rounds: state.round,
      verify,
      diagnosis,
      phase: FIX_LOOP_PHASE.FAILED,
      remainingReport: state.remainingReport,
    };
  }

  state.phase = FIX_LOOP_PHASE.AGENT_FIXING;
  state.updatedAt = Date.now();
  saveFixLoopState(getUserDataPath, uid, ctx.projectId, ctx.taskId, state);
  updateTask(getUserDataPath, uid, ctx.projectId, ctx.taskId, {
    status: TASK_STATUS.FIXING,
    currentStep: `构建失败，Agent 修复中 (${state.round}/${state.maxRounds})`,
  });
  try {
    const { emitAgentEvent, PHASE, STATUS } = require("./agentEventEmitter.js");
    emitAgentEvent(ctx, {
      phase: PHASE.FIXING,
      status: STATUS.running,
      title: "生成修复补丁",
      summary: `第 ${state.round}/${state.maxRounds} 轮修复 · ${diagnosis.failureCategory}`,
      stepKey: "fix_failure",
    });
  } catch {
    /* optional */
  }
  const fixMessage = [
    "构建/测试失败，请根据 Diagnosis 生成修复补丁（stage_patch），不要直接写入。",
    formatDiagnosisForPrompt(diagnosis),
    verify?.parsed?.summary || state.lastVerifySummary?.summary || "",
    ...(verify?.parsed?.issues || []).slice(0, 5).map((i) => `${i.file}:${i.line}`),
  ].join("\n");
  const agentCtx = {
    ...ctx,
    mode: "VERIFY_FIX",
    promptContext: ctx.promptContext,
  };
  await runProjectAgentLLM(agentCtx, { message: fixMessage, mode: "VERIFY_FIX" });
  const staged = listStagedPatches(getUserDataPath, uid, ctx.projectId, ctx.taskId, {
    status: PATCH_STATUS.STAGED,
  });
  state.lastStagedPatchIds = staged.map((p) => p.id);
  state.lastPatchIds = state.lastStagedPatchIds;
  state.lastErrorFingerprint = diagnosis.fingerprint;
  state.phase = FIX_LOOP_PHASE.WAITING_APPLY;
  state.updatedAt = Date.now();
  appendFixLoopAttempt(state, {
    round: state.round,
    verifyAttemptId: state.verifyAttemptId,
    phase: FIX_LOOP_PHASE.WAITING_APPLY,
    diagnosis,
    patchIds: state.lastStagedPatchIds,
    fingerprint: diagnosis.fingerprint,
    result: "patches_staged",
  });
  saveFixLoopState(getUserDataPath, uid, ctx.projectId, ctx.taskId, state);
  mergeCheckpoint(getUserDataPath, uid, ctx.projectId, ctx.taskId, {
    phase: "WAITING_APPLY",
    fixLoop: {
      round: state.round,
      phase: state.phase,
      stagedPatchIds: state.lastStagedPatchIds,
      diagnosisId: diagnosis.diagnosisId,
      failureCategory: diagnosis.failureCategory,
    },
  });
  updateTask(getUserDataPath, uid, ctx.projectId, ctx.taskId, {
    status: TASK_STATUS.WAITING_APPROVAL,
    currentStep: `第 ${state.round} 轮修复补丁待审阅`,
  });
  appendFixLoopEvent(getUserDataPath, uid, ctx.projectId, ctx.taskId, {
    action: "agent_fix_staged",
    phase: FIX_LOOP_PHASE.WAITING_APPLY,
    round: state.round,
    patchIds: state.lastStagedPatchIds,
    failureCategory: diagnosis.failureCategory,
    message: `已生成 ${state.lastStagedPatchIds.length} 个修复补丁，等待 Diff 审阅`,
  });
  return {
    ok: false,
    waitingApproval: true,
    round: state.round,
    verify,
    diagnosis,
    message: "已生成修复补丁，等待用户审阅接受",
    patchIds: state.lastStagedPatchIds,
  };
}

async function startFixLoop(
  getUserDataPath,
  userId,
  ctx,
  { scriptName = "build", getDefaultProjectRoot } = {}
) {
  const uid = resolveUserId(userId);
  const project = getProject(getUserDataPath, uid, ctx.projectId);
  const root = resolveProjectRoot(project, getDefaultProjectRoot);
  if (!root) {
    throw new Error("未配置项目代码目录");
  }
  if (!fixLoopV2Enabled()) {
    return runFixLoopLegacy(getUserDataPath, uid, ctx, { scriptName, getDefaultProjectRoot });
  }
  let state = getFixLoopState(getUserDataPath, uid, ctx.projectId, ctx.taskId);
  if (!state?.active) {
    state = createInitialFixLoopState({
      projectId: ctx.projectId,
      taskId: ctx.taskId,
      scriptName,
      agentRunId: ctx.agentRunId,
    });
    saveFixLoopState(getUserDataPath, uid, ctx.projectId, ctx.taskId, state);
    appendFixLoopEvent(getUserDataPath, uid, ctx.projectId, ctx.taskId, {
      action: "fix_loop_start",
      phase: FIX_LOOP_PHASE.VERIFYING,
      round: 0,
      scriptName,
      message: "fixLoop 已启动",
    });
  }
  return continueFixLoopVerify(getUserDataPath, uid, { ...ctx, root }, { getDefaultProjectRoot });
}

async function continueFixLoopVerify(getUserDataPath, userId, ctx, { getDefaultProjectRoot } = {}) {
  const uid = resolveUserId(userId);
  let state = getFixLoopState(getUserDataPath, uid, ctx.projectId, ctx.taskId);
  if (!state?.active) {
    return { ok: false, inactive: true, message: "无 active fixLoop" };
  }
  const verify = await runVerifyStep(getUserDataPath, uid, ctx, state, { getDefaultProjectRoot });
  if (verify.ok) {
    createGreenCheckpoint(getUserDataPath, uid, ctx.projectId, ctx.taskId, {
      phase: "GREEN",
      appliedPatchIds: state.lastAppliedPatchIds || [],
      verify,
      fixLoop: { round: state.round, completed: true },
      label: "fix_loop_pass",
    });
    clearFixLoopState(getUserDataPath, uid, ctx.projectId, ctx.taskId);
    const { tryMarkTaskCompleted } = require("./taskCompletionService.js");
    const marked = tryMarkTaskCompleted(getUserDataPath, uid, ctx.projectId, ctx.taskId, {
      verifyResult: verify,
      currentStep: verify.skipped
        ? verify.message || "已跳过验证（无 npm 脚本）"
        : "验证通过",
      getDefaultProjectRoot,
    });
    appendFixLoopEvent(getUserDataPath, uid, ctx.projectId, ctx.taskId, {
      action: verify.skipped ? "fix_loop_skipped" : "fix_loop_completed",
      phase: marked.completed ? FIX_LOOP_PHASE.COMPLETED : FIX_LOOP_PHASE.FAILED,
      round: state.round,
      message: marked.completed
        ? verify.skipped
          ? verify.message || "已跳过验证"
          : "fixLoop 验证通过"
        : `完成守卫未通过: ${marked.guard?.blockers?.[0]?.message || ""}`,
    });
    if (marked.completed) {
      try {
        const { markVerifiedForTask } = require("./error-lessons/lessonStatusUpdater.js");
        markVerifiedForTask(getUserDataPath, uid, {
          projectId: ctx.projectId,
          taskId: ctx.taskId,
          verifyCommand: state.scriptName,
          verifiedBy: verify.skipped ? "verify_skipped" : "fix_loop",
        });
      } catch {
        /* optional */
      }
    }
    return {
      ok: marked.completed,
      skipped: Boolean(verify.skipped),
      rounds: state.round + 1,
      verify,
      message: verify.message || null,
      phase: marked.completed ? FIX_LOOP_PHASE.COMPLETED : FIX_LOOP_PHASE.FAILED,
      completionGuard: marked.guard,
      blocked: !marked.completed,
    };
  }
  if (verify.skipped) {
    // BL-003: 跳过验证不得标记完成；守卫会返回 VERIFY_SKIPPED / BLOCKED
    clearFixLoopState(getUserDataPath, uid, ctx.projectId, ctx.taskId);
    const { tryMarkTaskCompleted } = require("./taskCompletionService.js");
    const marked = tryMarkTaskCompleted(getUserDataPath, uid, ctx.projectId, ctx.taskId, {
      verifyResult: { ...verify, skipped: true },
      currentStep: verify.message || "验证被跳过，未完成验收",
      getDefaultProjectRoot,
    });
    return {
      ok: false,
      skipped: true,
      message: verify.message || "验证被跳过，禁止标记完成",
      verify,
      phase: FIX_LOOP_PHASE.FAILED,
      completionGuard: marked.guard,
      blocked: true,
    };
  }
  state = getFixLoopState(getUserDataPath, uid, ctx.projectId, ctx.taskId);
  state.round += 1;
  saveFixLoopState(getUserDataPath, uid, ctx.projectId, ctx.taskId, state);
  if (state.round > state.maxRounds) {
    const remainingReport = [
      `已达最大修复轮次 ${state.maxRounds}。`,
      state.lastVerifySummary?.summary || verify?.parsed?.summary || "仍有验证错误",
      ...(verify?.parsed?.issues || []).slice(0, 8).map((i) => `- ${i.file}:${i.line} ${i.message || ""}`),
    ].join("\n");
    state.phase = FIX_LOOP_PHASE.FAILED;
    state.active = false;
    state.lastErrorFingerprint = state.lastVerifySummary?.summary?.slice(0, 120) || null;
    state.remainingReport = remainingReport;
    saveFixLoopState(getUserDataPath, uid, ctx.projectId, ctx.taskId, state);
    updateTask(getUserDataPath, uid, ctx.projectId, ctx.taskId, {
      status: TASK_STATUS.FAILED,
      currentStep: `${state.maxRounds} 轮修复后仍失败`,
    });
    appendFixLoopEvent(getUserDataPath, uid, ctx.projectId, ctx.taskId, {
      action: "fix_loop_failed",
      phase: FIX_LOOP_PHASE.FAILED,
      round: state.round,
      message: remainingReport.slice(0, 400),
    });
    try {
      const { writeMemory } = require("./contextMemoryService.js");
      const { buildTaskNamespace } = require("./namespace.js");
      writeMemory(getUserDataPath, uid, {
        namespace: buildTaskNamespace(ctx.projectId, ctx.taskId),
        scopeType: "task",
        scopeId: ctx.taskId,
        memoryType: "fix_loop_remaining",
        content: remainingReport,
        source: "FixLoop",
        importance: 8,
      });
    } catch {
      /* optional */
    }
    return {
      ok: false,
      failed: true,
      rounds: state.maxRounds,
      verify,
      phase: FIX_LOOP_PHASE.FAILED,
      remainingReport,
    };
  }
  return runAgentFixRound(getUserDataPath, uid, ctx, state, verify);
}

async function resumeFixLoopAfterApply(
  getUserDataPath,
  userId,
  ctx,
  { patchIds, appliedPatchIds, getDefaultProjectRoot } = {}
) {
  const uid = resolveUserId(userId);
  let state = getFixLoopState(getUserDataPath, uid, ctx.projectId, ctx.taskId);
  assertFixLoopResume(state, { patchIds, agentRunId: ctx.agentRunId });

  const applyKey = `apply:${(appliedPatchIds || patchIds || []).slice().sort().join(",") || "none"}:r${state.round}`;
  const claimed = claimIdempotencyKey(getUserDataPath, uid, {
    projectId: ctx.projectId,
    taskId: ctx.taskId,
    key: applyKey,
    action: "apply_patches",
  });
  if (claimed.duplicate) {
    // Already applied this set — continue verify without re-recording
    state.phase = FIX_LOOP_PHASE.VERIFYING;
    saveFixLoopState(getUserDataPath, uid, ctx.projectId, ctx.taskId, state);
    return continueFixLoopVerify(getUserDataPath, uid, ctx, { getDefaultProjectRoot });
  }

  state.phase = FIX_LOOP_PHASE.APPLYING;
  state.lastAppliedPatchIds = appliedPatchIds || patchIds || [];
  state.updatedAt = Date.now();

  // Capture backup IDs created around apply for VER-009 rollback
  let backupIds = [];
  try {
    const backups = listFileBackups(getUserDataPath, uid, ctx.projectId, ctx.taskId, { limit: 30 });
    backupIds = backups.slice(0, 20).map((b) => b.id);
  } catch {
    backupIds = [];
  }

  appendFixLoopAttempt(state, {
    round: state.round,
    verifyAttemptId: state.verifyAttemptId,
    phase: FIX_LOOP_PHASE.APPLYING,
    diagnosis: state.lastDiagnosis,
    patchIds: state.lastStagedPatchIds || [],
    appliedPatchIds: state.lastAppliedPatchIds,
    backupIds,
    fingerprint: state.lastErrorFingerprint,
    result: "applied",
  });
  saveFixLoopState(getUserDataPath, uid, ctx.projectId, ctx.taskId, state);
  mergeCheckpoint(getUserDataPath, uid, ctx.projectId, ctx.taskId, {
    phase: "APPLYING",
    appliedPatchIds: state.lastAppliedPatchIds,
    fixLoop: {
      round: state.round,
      phase: state.phase,
      appliedPatchIds: state.lastAppliedPatchIds,
      backupIds,
    },
  });
  appendFixLoopEvent(getUserDataPath, uid, ctx.projectId, ctx.taskId, {
    action: "apply_done",
    phase: FIX_LOOP_PHASE.APPLYING,
    round: state.round,
    patchIds: state.lastAppliedPatchIds,
    backupIds,
    message: "补丁已写入，继续验证",
  });
  state.phase = FIX_LOOP_PHASE.VERIFYING;
  saveFixLoopState(getUserDataPath, uid, ctx.projectId, ctx.taskId, state);
  return continueFixLoopVerify(getUserDataPath, uid, ctx, { getDefaultProjectRoot });
}

function cancelFixLoop(getUserDataPath, userId, projectId, taskId, reason = "用户取消") {
  const uid = resolveUserId(userId);
  const state = getFixLoopState(getUserDataPath, uid, projectId, taskId);
  if (!state?.active) {
    return null;
  }
  state.active = false;
  state.phase = FIX_LOOP_PHASE.CANCELED;
  state.updatedAt = Date.now();
  saveFixLoopState(getUserDataPath, uid, projectId, taskId, state);
  appendFixLoopEvent(getUserDataPath, uid, projectId, taskId, {
    action: "fix_loop_canceled",
    phase: FIX_LOOP_PHASE.CANCELED,
    round: state.round,
    message: reason,
  });
  updateTask(getUserDataPath, uid, projectId, taskId, {
    status: TASK_STATUS.CANCELED,
    currentStep: "fixLoop 已取消",
  });
  return state;
}

async function runFixLoopLegacy(getUserDataPath, uid, ctx, { scriptName, getDefaultProjectRoot }) {
  let round = 0;
  let lastVerify = null;
  while (round < MAX_FIX_ROUNDS) {
    updateTask(getUserDataPath, uid, ctx.projectId, ctx.taskId, {
      status: TASK_STATUS.TESTING,
      currentStep: `验证 ${scriptName}${round ? ` (第 ${round + 1} 轮)` : ""}`,
    });
    lastVerify = await runVerification(
      getUserDataPath,
      uid,
      {
        projectId: ctx.projectId,
        taskId: ctx.taskId,
        scriptName,
        userApproved: true,
      },
      { getDefaultProjectRoot }
    );
    if (lastVerify.ok) {
      const { tryMarkTaskCompleted } = require("./taskCompletionService.js");
      const marked = tryMarkTaskCompleted(getUserDataPath, uid, ctx.projectId, ctx.taskId, {
        verifyResult: lastVerify,
        currentStep: lastVerify.skipped
          ? lastVerify.message || "已跳过验证（无 npm 脚本）"
          : "验证通过",
        getDefaultProjectRoot,
      });
      return {
        ok: marked.completed,
        skipped: Boolean(lastVerify.skipped),
        rounds: round + 1,
        verify: lastVerify,
        message: lastVerify.message || null,
        completionGuard: marked.guard,
        blocked: !marked.completed,
      };
    }
    if (lastVerify.skipped) {
      const { tryMarkTaskCompleted } = require("./taskCompletionService.js");
      const marked = tryMarkTaskCompleted(getUserDataPath, uid, ctx.projectId, ctx.taskId, {
        verifyResult: { ...lastVerify, ok: true, skipped: true },
        currentStep: lastVerify.message || "已跳过验证（无 npm 脚本）",
        getDefaultProjectRoot,
      });
      return {
        ok: marked.completed,
        skipped: true,
        message: lastVerify.message,
        verify: lastVerify,
        completionGuard: marked.guard,
        blocked: !marked.completed,
      };
    }
    round += 1;
    if (round >= MAX_FIX_ROUNDS) {
      break;
    }
    updateTask(getUserDataPath, uid, ctx.projectId, ctx.taskId, {
      status: TASK_STATUS.FIXING,
      currentStep: `构建失败，Agent 修复中 (${round}/${MAX_FIX_ROUNDS})`,
    });
    const fixMessage = [
      "构建/测试失败，请根据错误信息生成修复补丁（stage_patch），不要直接写入。",
      lastVerify.parsed?.summary || "",
      ...(lastVerify.parsed?.issues || []).slice(0, 5).map((i) => `${i.file}:${i.line}`),
    ].join("\n");
    await runProjectAgentLLM(
      { ...ctx, mode: "VERIFY_FIX", promptContext: ctx.promptContext },
      { message: fixMessage, mode: "VERIFY_FIX" }
    );
    return {
      ok: false,
      waitingApproval: true,
      round,
      verify: lastVerify,
      message: "已生成修复补丁，等待用户审阅接受",
    };
  }
  updateTask(getUserDataPath, uid, ctx.projectId, ctx.taskId, {
    status: TASK_STATUS.FAILED,
    currentStep: `${MAX_FIX_ROUNDS} 轮修复后仍失败`,
  });
  return { ok: false, failed: true, rounds: MAX_FIX_ROUNDS, verify: lastVerify };
}

async function runFixLoop(getUserDataPath, userId, ctx, options) {
  return startFixLoop(getUserDataPath, userId, ctx, options);
}

module.exports = {
  MAX_FIX_ROUNDS,
  startFixLoop,
  continueFixLoopVerify,
  resumeFixLoopAfterApply,
  cancelFixLoop,
  runFixLoop,
};
