const { resolveUserId, updateTask } = require("./projectService.js");
const { TASK_STATUS } = require("./taskStatus.js");
const { evaluateCompletion, syncAcceptanceEvidenceFromVerify } = require("./completionGuardService.js");
const {
  buildDeliveryManifest,
  saveDeliveryManifest,
} = require("./deliveryManifestService.js");
const { buildEvidencePackage } = require("./agentTraceExport.js");

function tryMarkTaskCompleted(
  getUserDataPath,
  uid,
  projectId,
  taskId,
  { verifyResult, currentStep, getDefaultProjectRoot, persistEvidence = true } = {}
) {
  // BL-003: 先把真实验证证据写入 TaskSpec AC，再跑守卫
  if (verifyResult && verifyResult.ok && !verifyResult.skipped) {
    try {
      syncAcceptanceEvidenceFromVerify(getUserDataPath, uid, projectId, taskId, verifyResult);
    } catch {
      /* non-fatal */
    }
  }
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
  let evidencePackage = null;
  if (persistEvidence) {
    try {
      evidencePackage = buildEvidencePackage(getUserDataPath, uid, {
        projectId,
        taskId,
        verifyResult,
        persist: true,
      });
    } catch {
      evidencePackage = null;
    }
  }
  updateTask(getUserDataPath, uid, projectId, taskId, {
    status: TASK_STATUS.COMPLETED,
    currentStep: currentStep || "已完成（验收通过）",
  });
  return { completed: true, guard, manifest, evidencePackage };
}

function saveCheckpoint(getUserDataPath, userId, projectId, taskId, checkpoint) {
  const { mergeCheckpoint } = require("./checkpointService.js");
  return mergeCheckpoint(getUserDataPath, userId, projectId, taskId, checkpoint || {});
}

function getCheckpoint(getUserDataPath, userId, projectId, taskId) {
  const { getCheckpoint: getCkpt } = require("./checkpointService.js");
  return getCkpt(getUserDataPath, userId, projectId, taskId);
}

module.exports = {
  tryMarkTaskCompleted,
  saveCheckpoint,
  getCheckpoint,
};
