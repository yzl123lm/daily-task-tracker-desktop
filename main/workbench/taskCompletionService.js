const { getDb, nowIso } = require("./db.js");
const { resolveUserId, updateTask } = require("./projectService.js");
const { TASK_STATUS } = require("./taskStatus.js");
const { evaluateCompletion } = require("./completionGuardService.js");
const {
  buildDeliveryManifest,
  saveDeliveryManifest,
} = require("./deliveryManifestService.js");

function tryMarkTaskCompleted(
  getUserDataPath,
  uid,
  projectId,
  taskId,
  { verifyResult, currentStep, getDefaultProjectRoot } = {}
) {
  const guard = evaluateCompletion(getUserDataPath, uid, {
    projectId,
    taskId,
    verifyResult,
    getDefaultProjectRoot,
  });
  if (!guard.ok) {
    updateTask(getUserDataPath, uid, projectId, taskId, {
      status: TASK_STATUS.BLOCKED,
      currentStep: `完成守卫未通过：${guard.blockers[0]?.message || "存在阻塞项"}`,
    });
    return { completed: false, guard };
  }
  const manifest = buildDeliveryManifest(getUserDataPath, uid, {
    projectId,
    taskId,
    verifyResult,
    getDefaultProjectRoot,
  });
  saveDeliveryManifest(getUserDataPath, uid, projectId, taskId, manifest);
  updateTask(getUserDataPath, uid, projectId, taskId, {
    status: TASK_STATUS.COMPLETED,
    currentStep: currentStep || "已完成（验收通过）",
  });
  return { completed: true, guard, manifest };
}

function saveCheckpoint(getUserDataPath, userId, projectId, taskId, checkpoint) {
  const db = getDb(getUserDataPath);
  const resolved = resolveUserId(userId);
  const ts = nowIso();
  db.prepare(
    `UPDATE project_tasks SET checkpoint_json = ?, updated_at = ?
     WHERE id = ? AND project_id = ? AND user_id = ?`
  ).run(JSON.stringify({ ...checkpoint, updatedAt: ts }), ts, taskId, projectId, resolved);
}

module.exports = {
  tryMarkTaskCompleted,
  saveCheckpoint,
};
