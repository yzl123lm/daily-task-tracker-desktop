const { redactSecrets } = require("./error-lessons/redactSecrets.js");
const { getAgentRun, getLatestRunForTask } = require("./agentRunStore.js");
const { getTaskSpec } = require("./taskSpecService.js");
const { getPlanSteps } = require("./planStepsService.js");
const { getDeliveryManifest } = require("./deliveryManifestService.js");
const { getFixLoopState } = require("./fixLoopStateService.js");
const { listToolOperations } = require("./toolPermissionService.js");
const { resolveUserId, getTask } = require("./projectService.js");

function deepRedact(value) {
  if (value == null) return value;
  if (typeof value === "string") return redactSecrets(value);
  if (Array.isArray(value)) return value.map(deepRedact);
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = deepRedact(v);
    }
    return out;
  }
  return value;
}

function exportAgentTrace(getUserDataPath, userId, { projectId, taskId, agentRunId } = {}) {
  const uid = resolveUserId(userId);
  const task = getTask(getUserDataPath, uid, projectId, taskId);
  const run = agentRunId
    ? getAgentRun(getUserDataPath, uid, projectId, taskId, agentRunId)
    : getLatestRunForTask(getUserDataPath, uid, projectId, taskId);
  const toolOps = listToolOperations(getUserDataPath, uid, projectId, taskId, { limit: 200 });
  const bundle = {
    version: 1,
    exportedAt: new Date().toISOString(),
    projectId,
    taskId,
    task: task
      ? {
          id: task.id,
          title: task.title,
          status: task.status,
          currentStep: task.currentStep,
        }
      : null,
    agentRun: run
      ? {
          id: run.id,
          mode: run.mode,
          status: run.status,
          inputText: run.inputText,
          output: run.output,
          toolTrace: run.toolTrace,
          errorMessage: run.errorMessage,
          startedAt: run.startedAt,
          completedAt: run.completedAt,
        }
      : null,
    taskSpec: getTaskSpec(getUserDataPath, uid, projectId, taskId),
    planSteps: getPlanSteps(getUserDataPath, uid, projectId, taskId),
    deliveryManifest: getDeliveryManifest(getUserDataPath, uid, projectId, taskId),
    fixLoop: getFixLoopState(getUserDataPath, uid, projectId, taskId),
    toolOperations: toolOps,
  };
  return deepRedact(bundle);
}

module.exports = {
  exportAgentTrace,
  deepRedact,
};
