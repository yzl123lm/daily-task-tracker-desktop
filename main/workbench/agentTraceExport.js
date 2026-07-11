const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { redactSecrets } = require("./error-lessons/redactSecrets.js");
const { getAgentRun, getLatestRunForTask } = require("./agentRunStore.js");
const { getTaskSpec } = require("./taskSpecService.js");
const { getPlanSteps } = require("./planStepsService.js");
const { getDeliveryManifest } = require("./deliveryManifestService.js");
const { getFixLoopState } = require("./fixLoopStateService.js");
const { listToolOperations } = require("./toolPermissionService.js");
const { resolveUserId, getTask } = require("./projectService.js");
const { listTimelineEventsFromRun } = require("./agentEventEmitter.js");
const { evaluateCompletion } = require("./completionGuardService.js");

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

function sha256Hex(payload) {
  return crypto.createHash("sha256").update(payload, "utf8").digest("hex");
}

function collectTimeline(primaryRun) {
  if (!primaryRun) return [];
  try {
    return listTimelineEventsFromRun(primaryRun) || [];
  } catch {
    return [];
  }
}

function buildCompletenessChecklist(pkg) {
  const checks = [
    {
      id: "has_task",
      ok: Boolean(pkg.task?.id),
      message: "任务元数据",
    },
    {
      id: "has_spec_or_legacy",
      ok: Boolean(pkg.taskSpec) || pkg.completenessNotes?.includes("legacy"),
      message: "TaskSpec 或遗留路径说明",
    },
    {
      id: "has_run_or_tools",
      ok: Boolean(pkg.agentRun?.id) || (pkg.toolOperations || []).length > 0,
      message: "Agent Run 或工具审计",
    },
    {
      id: "has_plan_or_manifest",
      ok: (pkg.planSteps || []).length > 0 || Boolean(pkg.deliveryManifest),
      message: "计划步骤或交付清单",
    },
    {
      id: "redacted",
      ok: true,
      message: "敏感信息已脱敏",
    },
  ];
  return {
    ok: checks.every((c) => c.ok),
    checks,
  };
}

/**
 * BL-001 Evidence Package v2 — 可复现任务证据包（含哈希与完整性清单）
 */
function buildEvidencePackage(
  getUserDataPath,
  userId,
  { projectId, taskId, agentRunId, verifyResult, persist = false } = {}
) {
  const uid = resolveUserId(userId);
  const task = getTask(getUserDataPath, uid, projectId, taskId);
  const run = agentRunId
    ? getAgentRun(getUserDataPath, uid, projectId, taskId, agentRunId)
    : getLatestRunForTask(getUserDataPath, uid, projectId, taskId);
  const toolOps = listToolOperations(getUserDataPath, uid, projectId, taskId, { limit: 200 });
  const taskSpec = getTaskSpec(getUserDataPath, uid, projectId, taskId);
  const planSteps = getPlanSteps(getUserDataPath, uid, projectId, taskId);
  const deliveryManifest = getDeliveryManifest(getUserDataPath, uid, projectId, taskId);
  const fixLoop = getFixLoopState(getUserDataPath, uid, projectId, taskId);
  const timelineEvents = collectTimeline(run);
  const guard = evaluateCompletion(getUserDataPath, uid, {
    projectId,
    taskId,
    verifyResult: verifyResult || deliveryManifest?.verification || null,
  });

  const packageId = `evp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const body = {
    version: 2,
    kind: "evidence_package",
    packageId,
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
    taskSpec,
    planSteps,
    deliveryManifest,
    fixLoop,
    toolOperations: toolOps,
    timelineEvents,
    acceptanceEvidence: guard.acceptanceEvidence || [],
    completionGuard: {
      ok: guard.ok,
      blockers: guard.blockers || [],
      specVersion: guard.specVersion,
      checkedAt: guard.checkedAt,
    },
    completenessNotes: taskSpec ? [] : ["legacy"],
  };

  const redacted = deepRedact(body);
  const completeness = buildCompletenessChecklist(redacted);
  const contentHash = sha256Hex(JSON.stringify({ ...redacted, completeness }));
  const pkg = {
    ...redacted,
    completeness,
    integrity: {
      algorithm: "sha256",
      hash: contentHash,
      hashedAt: new Date().toISOString(),
    },
  };

  let savedPath = null;
  if (persist) {
    savedPath = writeEvidencePackageToDisk(getUserDataPath, pkg);
    pkg.savedPath = savedPath;
  }
  return pkg;
}

function writeEvidencePackageToDisk(getUserDataPath, pkg) {
  const root = path.join(
    getUserDataPath(),
    "evidence-packages",
    String(pkg.projectId || "unknown"),
    String(pkg.taskId || "unknown")
  );
  fs.mkdirSync(root, { recursive: true });
  const file = path.join(root, `${pkg.packageId || "package"}.json`);
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2), "utf8");
  return file;
}

/** @deprecated use buildEvidencePackage — kept for IPC/compat */
function exportAgentTrace(getUserDataPath, userId, opts = {}) {
  const pkg = buildEvidencePackage(getUserDataPath, userId, { ...opts, persist: Boolean(opts.persist) });
  // Compat shape for older consumers expecting version:1 fields
  return {
    ...pkg,
    // keep explicit version 2; tests may assert >= 2
  };
}

module.exports = {
  exportAgentTrace,
  buildEvidencePackage,
  writeEvidencePackageToDisk,
  deepRedact,
  sha256Hex,
};
