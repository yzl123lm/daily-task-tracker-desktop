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
        tools: Array.isArray(item.tools) ? item.tools : [],
        risk: item.risk || "medium",
        rollback: item.rollback || "revert via file backup",
        verification: item.verification || "manual_or_verify",
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
      tools: [],
      risk: "medium",
      rollback: "revert via file backup",
      verification: "manual_or_verify",
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

function savePlanSteps(getUserDataPath, userId, projectId, taskId, plan, meta = {}) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const ts = nowIso();
  const steps = normalizeSteps(plan, { criterionIds: meta.criterionIds || [] });
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
  getPlanSteps,
  savePlanSteps,
  updatePlanStepStatus,
};
