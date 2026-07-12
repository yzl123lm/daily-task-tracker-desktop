/**
 * BL-014 / STATE-004: Crash / restart recovery from last consistent checkpoint + fixLoop.
 */
const { resolveUserId, getTask, updateTask } = require("./projectService.js");
const { getCheckpoint } = require("./checkpointService.js");
const { getFixLoopState, FIX_LOOP_PHASE } = require("./fixLoopStateService.js");
const { getPlanSteps } = require("./planStepsService.js");
const { getReadySteps, beginNextPlanStep } = require("./planExecutionService.js");
const { TASK_STATUS } = require("./taskStatus.js");

function recoverTaskState(getUserDataPath, userId, { projectId, taskId, releaseStaleRuns = true } = {}) {
  const uid = resolveUserId(userId);
  const task = getTask(getUserDataPath, uid, projectId, taskId);
  if (!task) {
    const err = new Error("任务不存在");
    err.code = "TASK_NOT_FOUND";
    throw err;
  }

  const checkpoint = getCheckpoint(getUserDataPath, uid, projectId, taskId);
  const fixLoop = getFixLoopState(getUserDataPath, uid, projectId, taskId);
  const planSteps = getPlanSteps(getUserDataPath, uid, projectId, taskId);
  const ready = getReadySteps(planSteps);

  let staleRunsReleased = 0;
  if (releaseStaleRuns) {
    try {
      const { releaseStaleRunsForTask, getOpenRunForTask } = require("./agentRunStore.js");
      const before = getOpenRunForTask(getUserDataPath, uid, projectId, taskId);
      releaseStaleRunsForTask(getUserDataPath, uid, projectId, taskId, {
        reason: "crash recovery",
      });
      const after = getOpenRunForTask(getUserDataPath, uid, projectId, taskId);
      staleRunsReleased = before && !after ? 1 : 0;
    } catch {
      /* optional */
    }
  }

  // Priority 1: active fix loop in resumable phases
  if (fixLoop?.active) {
    const phase = fixLoop.phase;
    if (phase === FIX_LOOP_PHASE.WAITING_APPLY) {
      return {
        ok: true,
        action: "resume_waiting_apply",
        message: "检测到待审阅修复补丁，可继续 Diff 审批后 resume",
        checkpoint,
        fixLoop,
        plan: { steps: planSteps, ready },
        staleRunsReleased,
      };
    }
    if (phase === FIX_LOOP_PHASE.VERIFYING || phase === FIX_LOOP_PHASE.APPLYING) {
      return {
        ok: true,
        action: "resume_fix_loop_verify",
        message: "检测到中断的验证/应用，可继续 Fix Loop 验证",
        checkpoint,
        fixLoop,
        plan: { steps: planSteps, ready },
        staleRunsReleased,
      };
    }
    if (phase === FIX_LOOP_PHASE.AGENT_FIXING) {
      return {
        ok: true,
        action: "resume_agent_fix",
        message: "Agent 修复中断，可从当前诊断重新生成补丁",
        checkpoint,
        fixLoop,
        plan: { steps: planSteps, ready },
        staleRunsReleased,
      };
    }
  }

  // Priority 2: plan mid-flight
  if (checkpoint?.phase === "PLAN_RUNNING" || ready.length) {
    const completed = (checkpoint?.completedIds || []).length;
    if (ready.length && completed < planSteps.length) {
      return {
        ok: true,
        action: "begin_next_plan_step",
        message: `计划可从下一步恢复（已完成 ${completed}/${planSteps.length}）`,
        checkpoint,
        fixLoop,
        plan: { steps: planSteps, ready },
        staleRunsReleased,
        nextStepId: ready[0]?.id || null,
      };
    }
  }

  // Priority 3: green checkpoint — nothing to do
  if (checkpoint?.lastGreen?.isGreen || checkpoint?.phase === "GREEN" || checkpoint?.phase === "PLAN_DONE") {
    return {
      ok: true,
      action: "none",
      message: "已有绿色 Checkpoint，无需恢复执行",
      checkpoint,
      fixLoop,
      plan: { steps: planSteps, ready },
      staleRunsReleased,
    };
  }

  // Stuck "running" task with no active run → mark recoverable blocked hint
  if (
    [TASK_STATUS.TESTING, TASK_STATUS.FIXING, TASK_STATUS.APPLYING, "RUNNING"].includes(task.status) &&
    !fixLoop?.active
  ) {
    updateTask(getUserDataPath, uid, projectId, taskId, {
      currentStep: "检测到中断，已释放陈旧运行；请恢复或重新验证",
    });
    return {
      ok: true,
      action: "blocked_needs_user",
      message: "任务状态显示进行中但无 active fixLoop，已释放陈旧 run；请手动继续验证或取消",
      checkpoint,
      fixLoop,
      plan: { steps: planSteps, ready },
      staleRunsReleased,
    };
  }

  return {
    ok: true,
    action: "none",
    message: "无需恢复",
    checkpoint,
    fixLoop,
    plan: { steps: planSteps, ready },
    staleRunsReleased,
  };
}

/**
 * Execute a safe recovery action that does not require user Diff approval.
 */
async function executeRecoveryAction(
  getUserDataPath,
  userId,
  { projectId, taskId, action, getDefaultProjectRoot } = {}
) {
  const uid = resolveUserId(userId);
  const recovery = recoverTaskState(getUserDataPath, uid, { projectId, taskId });
  const act = action || recovery.action;

  if (act === "begin_next_plan_step") {
    const started = beginNextPlanStep(getUserDataPath, uid, projectId, taskId);
    return { ok: true, recovery, executed: act, result: started };
  }

  if (act === "resume_fix_loop_verify") {
    const { continueFixLoopVerify } = require("./fixLoopController.js");
    const result = await continueFixLoopVerify(
      getUserDataPath,
      uid,
      { projectId, taskId },
      { getDefaultProjectRoot }
    );
    return { ok: true, recovery, executed: act, result };
  }

  return { ok: true, recovery, executed: "none", result: null, message: recovery.message };
}

module.exports = {
  recoverTaskState,
  executeRecoveryAction,
};
