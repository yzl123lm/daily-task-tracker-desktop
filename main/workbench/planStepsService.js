const { getDb, nowIso, newId } = require("./db.js");
const { resolveUserId } = require("./projectService.js");

function normalizeSteps(plan, { criterionIds = [] } = {}) {
  const list = Array.isArray(plan) ? plan : [];
  return list.map((item, index) => {
    if (item && typeof item === "object") {
      return {
        id: item.id || `step_${index + 1}`,
        text: String(item.text || item.title || item.summary || "").trim(),
        status: item.status || "pending",
        dependencies: Array.isArray(item.dependencies) ? item.dependencies : [],
        expectedFiles: Array.isArray(item.expectedFiles) ? item.expectedFiles : [],
        inputs: Array.isArray(item.inputs) ? item.inputs : [],
        outputs: Array.isArray(item.outputs) ? item.outputs : [],
        tools: Array.isArray(item.tools) ? item.tools : [],
        risk: item.risk || "medium",
        rollback: item.rollback || "revert via file backup",
        verification: item.verification || "manual_or_verify",
        permissions: item.permissions || { network: "deny", secrets: [], write: true },
        criterionIds: Array.isArray(item.criterionIds) ? item.criterionIds : criterionIds.slice(0, 1),
        idempotencyKey: item.idempotencyKey || `plan_step_${index + 1}`,
      };
    }
    return {
      id: `step_${index + 1}`,
      text: String(item || "").trim(),
      status: "pending",
      dependencies: index > 0 ? [`step_${index}`] : [],
      expectedFiles: [],
      inputs: [],
      outputs: [],
      tools: [],
      risk: "medium",
      rollback: "revert via file backup",
      verification: "manual_or_verify",
      permissions: { network: "deny", secrets: [], write: true },
      criterionIds: criterionIds.slice(0, 1),
      idempotencyKey: `plan_step_${index + 1}`,
    };
  }).filter((s) => s.text);
}

function getPlanSteps(getUserDataPath, userId, projectId, taskId) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const row = db
    .prepare(
      `SELECT plan_steps_json FROM project_tasks
       WHERE id = ? AND project_id = ? AND user_id = ?`
    )
    .get(taskId, projectId, uid);
  if (!row?.plan_steps_json) return [];
  try {
    const parsed = JSON.parse(row.plan_steps_json);
    return Array.isArray(parsed?.steps) ? parsed.steps : Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function enrichStepsWithExpectedFiles(steps, { goalHint = "", affectedFiles = [] } = {}) {
  const goal = String(goalHint || "");
  const isGame = /贪吃蛇|snake|小游戏|\bgame\b/i.test(goal);
  const pool = [...new Set([...(affectedFiles || []), ...(isGame ? ["index.html", "style.css", "game.js"] : [])])];

  return (steps || []).map((step, index) => {
    if (step.expectedFiles?.length) {
      return step;
    }
    const t = String(step.text || "");
    const files = [];
    if (isGame) {
      if (/game\.js|\.js|逻辑|移动|食物|碰撞|得分|蛇|键盘|localStorage|重开|难度|玩法/i.test(t)) {
        files.push("game.js");
      }
      if (/html|主界面|画布|canvas|控制面板|入口|状态栏|遮罩|script/i.test(t)) {
        files.push("index.html");
      }
      if (/css|样式|布局|视觉|动画|自适应|响应/i.test(t)) {
        files.push("style.css");
      }
      if (/canvas|绘制|网格/i.test(t)) {
        if (!files.includes("game.js")) files.push("game.js");
        if (!files.includes("index.html")) files.push("index.html");
      }
    }
    if (!files.length && index === 0 && pool.length) {
      return { ...step, expectedFiles: pool.slice(0, 3) };
    }
    return files.length ? { ...step, expectedFiles: [...new Set(files)] } : step;
  });
}

function savePlanSteps(getUserDataPath, userId, projectId, taskId, plan, meta = {}) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const ts = nowIso();
  let steps = normalizeSteps(plan, { criterionIds: meta.criterionIds || [] });
  steps = enrichStepsWithExpectedFiles(steps, {
    goalHint: meta.goalHint || meta.message || "",
    affectedFiles: meta.affectedFiles || [],
  });
  // BL-010: reject cyclic DAGs unless explicitly skipped (legacy repair)
  if (!meta.skipDagValidation) {
    const { validatePlanDag } = require("./planExecutionService.js");
    const dag = validatePlanDag(steps);
    if (!dag.ok) {
      const err = new Error(dag.message);
      err.code = dag.code || "PLAN_DAG_INVALID";
      err.dag = dag;
      throw err;
    }
  }
  const payload = {
    planId: meta.planId || newId("plan"),
    specVersion: meta.specVersion || null,
    steps,
    updatedAt: ts,
  };
  db.prepare(
    `UPDATE project_tasks SET plan_steps_json = ?, updated_at = ?
     WHERE id = ? AND project_id = ? AND user_id = ?`
  ).run(JSON.stringify(payload), ts, taskId, projectId, uid);
  return payload;
}

function updatePlanStepStatus(getUserDataPath, userId, projectId, taskId, stepId, status) {
  const existing = getPlanSteps(getUserDataPath, userId, projectId, taskId);
  const steps = existing.map((s) => (s.id === stepId ? { ...s, status } : s));
  return savePlanSteps(getUserDataPath, userId, projectId, taskId, steps);
}

module.exports = {
  normalizeSteps,
  enrichStepsWithExpectedFiles,
  getPlanSteps,
  savePlanSteps,
  updatePlanStepStatus,
};
