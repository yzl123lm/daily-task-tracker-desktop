/**
 * BL-010 / REQ-006 / STATE-001: DAG plan validation + durable plan execution FSM.
 */
const { getPlanSteps, savePlanSteps, updatePlanStepStatus, normalizeSteps } = require("./planStepsService.js");
const { saveCheckpoint } = require("./taskCompletionService.js");
const { getDb, nowIso, newId } = require("./db.js");
const { resolveUserId } = require("./projectService.js");

const PLAN_STEP_STATUS = {
  PENDING: "pending",
  READY: "ready",
  RUNNING: "running",
  DONE: "done",
  FAILED: "failed",
  BLOCKED: "blocked",
  SKIPPED: "skipped",
};

function enrichDagFields(steps) {
  return (steps || []).map((s, index) => ({
    ...s,
    inputs: Array.isArray(s.inputs) ? s.inputs : [],
    outputs: Array.isArray(s.outputs) ? s.outputs : s.expectedFiles || [],
    permissions: s.permissions || { network: "deny", secrets: [], write: true },
    risk: s.risk || "medium",
    rollback: s.rollback || "revert via checkpoint",
    verification: s.verification || "manual_or_verify",
    dependencies: Array.isArray(s.dependencies)
      ? s.dependencies
      : index > 0
        ? [`step_${index}`]
        : [],
  }));
}

/**
 * Detect cycles via DFS. Returns { ok, cycles, order }.
 */
function validatePlanDag(stepsInput) {
  const steps = enrichDagFields(normalizeSteps(stepsInput));
  const byId = new Map(steps.map((s) => [s.id, s]));
  const missingDeps = [];
  for (const s of steps) {
    for (const d of s.dependencies || []) {
      if (!byId.has(d)) missingDeps.push({ stepId: s.id, missing: d });
    }
  }
  if (missingDeps.length) {
    return {
      ok: false,
      code: "PLAN_DAG_MISSING_DEP",
      message: `计划依赖缺失：${missingDeps.map((m) => `${m.stepId}→${m.missing}`).join(", ")}`,
      missingDeps,
      steps,
    };
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map(steps.map((s) => [s.id, WHITE]));
  const cycles = [];
  const order = [];

  function dfs(id, stack) {
    color.set(id, GRAY);
    stack.push(id);
    const node = byId.get(id);
    for (const d of node?.dependencies || []) {
      const c = color.get(d);
      if (c === GRAY) {
        const idx = stack.indexOf(d);
        cycles.push(stack.slice(idx).concat(d));
      } else if (c === WHITE) {
        dfs(d, stack);
      }
    }
    stack.pop();
    color.set(id, BLACK);
    order.push(id);
  }

  for (const s of steps) {
    if (color.get(s.id) === WHITE) dfs(s.id, []);
  }

  if (cycles.length) {
    return {
      ok: false,
      code: "PLAN_DAG_CYCLE",
      message: `计划存在循环依赖：${cycles[0].join(" → ")}`,
      cycles,
      steps,
    };
  }

  return { ok: true, order, steps, criticalPath: order.slice() };
}

function getReadySteps(steps) {
  const done = new Set(
    (steps || [])
      .filter((s) => s.status === PLAN_STEP_STATUS.DONE || s.status === PLAN_STEP_STATUS.SKIPPED)
      .map((s) => s.id)
  );
  return (steps || []).filter((s) => {
    if (s.status === PLAN_STEP_STATUS.DONE || s.status === PLAN_STEP_STATUS.SKIPPED) return false;
    if (s.status === PLAN_STEP_STATUS.FAILED || s.status === PLAN_STEP_STATUS.BLOCKED) return false;
    if (s.status === PLAN_STEP_STATUS.RUNNING) return false;
    return (s.dependencies || []).every((d) => done.has(d));
  });
}

function appendPlanEvent(getUserDataPath, userId, projectId, taskId, event) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const row = db
    .prepare(
      `SELECT checkpoint_json FROM project_tasks
       WHERE id = ? AND project_id = ? AND user_id = ?`
    )
    .get(taskId, projectId, uid);
  let checkpoint = {};
  try {
    checkpoint = row?.checkpoint_json ? JSON.parse(row.checkpoint_json) : {};
  } catch {
    checkpoint = {};
  }
  const events = Array.isArray(checkpoint.planEvents) ? checkpoint.planEvents : [];
  const seq = events.length + 1;
  const entry = {
    seq,
    id: newId("pe"),
    at: nowIso(),
    ...event,
  };
  events.push(entry);
  // keep last 200
  const trimmed = events.slice(-200);
  saveCheckpoint(getUserDataPath, uid, projectId, taskId, {
    ...checkpoint,
    planEvents: trimmed,
    currentStepId: event.stepId || checkpoint.currentStepId || null,
    planPhase: event.phase || checkpoint.planPhase || null,
  });
  return entry;
}

/**
 * Advance one ready step to running → done/failed, update durable checkpoint.
 */
function advancePlanStep(
  getUserDataPath,
  userId,
  projectId,
  taskId,
  { stepId, status, result, error, idempotencyKey } = {}
) {
  const steps = getPlanSteps(getUserDataPath, userId, projectId, taskId);
  const target = steps.find((s) => s.id === stepId);
  if (!target) {
    const err = new Error(`计划步骤不存在: ${stepId}`);
    err.code = "PLAN_STEP_NOT_FOUND";
    throw err;
  }

  const key = idempotencyKey || target.idempotencyKey || `plan_step:${stepId}:${status || "done"}`;
  try {
    const { claimIdempotencyKey } = require("./idempotencyService.js");
    const claimed = claimIdempotencyKey(getUserDataPath, userId, {
      projectId,
      taskId,
      key,
      action: "plan_step_advance",
      meta: { stepId, status },
    });
    if (claimed.duplicate && (target.status === "done" || target.status === "skipped")) {
      return {
        ok: true,
        duplicate: true,
        plan: { steps },
        ready: getReadySteps(steps),
        completedIds: steps
          .filter((s) => s.status === "done" || s.status === "skipped")
          .map((s) => s.id),
      };
    }
  } catch {
    /* non-fatal */
  }

  const nextStatus = status || PLAN_STEP_STATUS.DONE;
  const updated = updatePlanStepStatus(getUserDataPath, userId, projectId, taskId, stepId, nextStatus);
  const completedIds = (updated.steps || [])
    .filter((s) => s.status === PLAN_STEP_STATUS.DONE || s.status === PLAN_STEP_STATUS.SKIPPED)
    .map((s) => s.id);
  const failed = (updated.steps || []).find((s) => s.status === PLAN_STEP_STATUS.FAILED);

  appendPlanEvent(getUserDataPath, userId, projectId, taskId, {
    type: "plan.step.transition",
    phase: nextStatus === PLAN_STEP_STATUS.FAILED ? "STEP_FAILED" : "STEP_ADVANCED",
    stepId,
    from: target.status,
    to: nextStatus,
    result: result || null,
    error: error || null,
    idempotencyKey: key,
  });

  saveCheckpoint(getUserDataPath, userId, projectId, taskId, {
    phase: failed ? "PLAN_BLOCKED" : completedIds.length === updated.steps.length ? "PLAN_DONE" : "PLAN_RUNNING",
    currentStepId: stepId,
    completedIds,
    failedId: failed?.id || null,
    planId: updated.planId,
    plan: {
      planId: updated.planId,
      completedIds,
      currentStepId: stepId,
    },
  });

  return {
    ok: nextStatus !== PLAN_STEP_STATUS.FAILED,
    plan: updated,
    ready: getReadySteps(updated.steps || []),
    completedIds,
  };
}

/**
 * Mark next ready step running (or resume after crash by skipping already-done).
 */
function beginNextPlanStep(getUserDataPath, userId, projectId, taskId) {
  const steps = getPlanSteps(getUserDataPath, userId, projectId, taskId);
  const dag = validatePlanDag(steps);
  if (!dag.ok) {
    return { ok: false, blocked: true, reason: dag.message, code: dag.code };
  }
  const ready = getReadySteps(steps);
  if (!ready.length) {
    const allDone = steps.every(
      (s) => s.status === PLAN_STEP_STATUS.DONE || s.status === PLAN_STEP_STATUS.SKIPPED
    );
    return { ok: true, done: allDone, ready: [], message: allDone ? "计划已完成" : "无就绪步骤" };
  }
  const next = ready[0];
  updatePlanStepStatus(getUserDataPath, userId, projectId, taskId, next.id, PLAN_STEP_STATUS.RUNNING);
  appendPlanEvent(getUserDataPath, userId, projectId, taskId, {
    type: "plan.step.started",
    phase: "STEP_RUNNING",
    stepId: next.id,
  });
  return { ok: true, step: { ...next, status: PLAN_STEP_STATUS.RUNNING }, ready: ready.slice(1) };
}

function saveValidatedPlanSteps(getUserDataPath, userId, projectId, taskId, plan, meta = {}) {
  const dag = validatePlanDag(plan);
  if (!dag.ok) {
    const err = new Error(dag.message);
    err.code = dag.code;
    err.dag = dag;
    throw err;
  }
  const enriched = enrichDagFields(dag.steps);
  return savePlanSteps(getUserDataPath, userId, projectId, taskId, enriched, meta);
}

module.exports = {
  PLAN_STEP_STATUS,
  enrichDagFields,
  validatePlanDag,
  getReadySteps,
  appendPlanEvent,
  advancePlanStep,
  beginNextPlanStep,
  saveValidatedPlanSteps,
};
