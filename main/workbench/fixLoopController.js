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
  appendFixLoopEvent,
  assertFixLoopResume,
} = require("./fixLoopStateService.js");

function buildVerifySummary(verify) {
  const parsed = verify?.parsed;
  const firstIssue = parsed?.issues?.[0];
  return {
    ok: Boolean(verify?.ok),
    exitCode: verify?.exitCode,
    errorType: parsed?.summary?.slice(0, 80) || "build_error",
    file: firstIssue?.file || null,
    line: firstIssue?.line || null,
    summary: parsed?.summary || verify?.stderr?.slice(0, 200) || "",
  };
}

async function runVerifyStep(getUserDataPath, uid, ctx, state, { getDefaultProjectRoot } = {}) {
  const verifyAttemptId = require("./db.js").newId("verify");
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
  saveFixLoopState(getUserDataPath, uid, ctx.projectId, ctx.taskId, state);
  appendFixLoopEvent(getUserDataPath, uid, ctx.projectId, ctx.taskId, {
    action: verify.ok ? "verify_pass" : "verify_fail",
    phase: FIX_LOOP_PHASE.VERIFYING,
    round: state.round,
    verifyAttemptId,
    message: verify.ok ? "验证通过" : state.lastVerifySummary.summary,
  });
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
  state.phase = FIX_LOOP_PHASE.AGENT_FIXING;
  state.updatedAt = Date.now();
  saveFixLoopState(getUserDataPath, uid, ctx.projectId, ctx.taskId, state);
  updateTask(getUserDataPath, uid, ctx.projectId, ctx.taskId, {
    status: TASK_STATUS.FIXING,
    currentStep: `构建失败，Agent 修复中 (${state.round}/${state.maxRounds})`,
  });
  const fixMessage = [
    "构建/测试失败，请根据错误信息生成修复补丁（stage_patch），不要直接写入。",
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
  state.phase = FIX_LOOP_PHASE.WAITING_APPLY;
  state.updatedAt = Date.now();
  saveFixLoopState(getUserDataPath, uid, ctx.projectId, ctx.taskId, state);
  updateTask(getUserDataPath, uid, ctx.projectId, ctx.taskId, {
    status: TASK_STATUS.WAITING_APPROVAL,
    currentStep: `第 ${state.round} 轮修复补丁待审阅`,
  });
  appendFixLoopEvent(getUserDataPath, uid, ctx.projectId, ctx.taskId, {
    action: "agent_fix_staged",
    phase: FIX_LOOP_PHASE.WAITING_APPLY,
    round: state.round,
    patchIds: state.lastStagedPatchIds,
    message: `已生成 ${state.lastStagedPatchIds.length} 个修复补丁，等待 Diff 审阅`,
  });
  return {
    ok: false,
    waitingApproval: true,
    round: state.round,
    verify,
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
    clearFixLoopState(getUserDataPath, uid, ctx.projectId, ctx.taskId);
    updateTask(getUserDataPath, uid, ctx.projectId, ctx.taskId, {
      status: TASK_STATUS.COMPLETED,
      currentStep: "验证通过",
    });
    appendFixLoopEvent(getUserDataPath, uid, ctx.projectId, ctx.taskId, {
      action: "fix_loop_completed",
      phase: FIX_LOOP_PHASE.COMPLETED,
      round: state.round,
      message: "fixLoop 验证通过",
    });
    try {
      const { recordFixSuccessLesson } = require("./errorLessonService.js");
      recordFixSuccessLesson(getUserDataPath, uid, {
        projectId: ctx.projectId,
        taskId: ctx.taskId,
        round: state.round + 1,
        scriptName: state.scriptName,
      });
    } catch {
      /* optional */
    }
    return { ok: true, rounds: state.round + 1, verify, phase: FIX_LOOP_PHASE.COMPLETED };
  }
  if (verify.skipped) {
    return { ok: false, skipped: true, message: verify.message, verify };
  }
  state = getFixLoopState(getUserDataPath, uid, ctx.projectId, ctx.taskId);
  state.round += 1;
  saveFixLoopState(getUserDataPath, uid, ctx.projectId, ctx.taskId, state);
  if (state.round > state.maxRounds) {
    state.phase = FIX_LOOP_PHASE.FAILED;
    state.active = false;
    saveFixLoopState(getUserDataPath, uid, ctx.projectId, ctx.taskId, state);
    updateTask(getUserDataPath, uid, ctx.projectId, ctx.taskId, {
      status: TASK_STATUS.FAILED,
      currentStep: `${state.maxRounds} 轮修复后仍失败`,
    });
    appendFixLoopEvent(getUserDataPath, uid, ctx.projectId, ctx.taskId, {
      action: "fix_loop_failed",
      phase: FIX_LOOP_PHASE.FAILED,
      round: state.round,
      message: "达到最大修复轮次",
    });
    return { ok: false, failed: true, rounds: state.maxRounds, verify, phase: FIX_LOOP_PHASE.FAILED };
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
  state.phase = FIX_LOOP_PHASE.APPLYING;
  state.lastAppliedPatchIds = appliedPatchIds || patchIds || [];
  state.updatedAt = Date.now();
  saveFixLoopState(getUserDataPath, uid, ctx.projectId, ctx.taskId, state);
  appendFixLoopEvent(getUserDataPath, uid, ctx.projectId, ctx.taskId, {
    action: "apply_done",
    phase: FIX_LOOP_PHASE.APPLYING,
    round: state.round,
    patchIds: state.lastAppliedPatchIds,
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
      updateTask(getUserDataPath, uid, ctx.projectId, ctx.taskId, {
        status: TASK_STATUS.COMPLETED,
        currentStep: "验证通过",
      });
      return { ok: true, rounds: round + 1, verify: lastVerify };
    }
    if (lastVerify.skipped) {
      return { ok: false, skipped: true, message: lastVerify.message, verify: lastVerify };
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
